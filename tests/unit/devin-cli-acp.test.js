import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const state = vi.hoisted(() => ({ script: null, mode: "reply", children: [] }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawn: (_bin, _args, options) => {
      // Run only the fixture, never Devin or its native filesystem/shell tools.
      const child = actual.spawn(process.execPath, [state.script, state.mode], {
        ...options,
        shell: false,
      });
      const closed = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
      state.children.push({ child, closed });
      return child;
    },
  };
});

const { default: DevinCliExecutor } = await import("open-sse/executors/devin-cli.js");

// A strict ACP v1 peer. It cannot execute tools: it only validates initialization
// and emits a fixed answer. Incompatible peers deliberately remain alive after
// stdin closes, so the executor must enforce its termination deadline.
const AGENT = `
import readline from "node:readline";
const mode = process.argv[2];
const rl = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
let initialized = false;
if (mode !== "reply") setInterval(() => {}, 1000);
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    const params = message.params;
    if (params?.protocolVersion !== 1 || !params.clientCapabilities ||
        typeof params.clientCapabilities !== "object" || Array.isArray(params.clientCapabilities) ||
        Object.hasOwn(params, "capabilities")) {
      send({ id: message.id, error: { code: -32602, message: "ACP v1 requires integer protocolVersion and clientCapabilities" } });
      return;
    }
    initialized = true;
    const version = mode === "incompatible" ? 2 : mode === "string-version" ? "1" : 1;
    send({ id: message.id, result: { protocolVersion: version, agentCapabilities: {}, authMethods: [] } });
  } else if (message.method === "session/new") {
    if (!initialized || mode === "incompatible" || mode === "string-version") {
      send({ id: message.id, error: { code: -32600, message: "Session started without a compatible protocol" } });
      return;
    }
    send({ id: message.id, result: { sessionId: "strict-acp-session" } });
  } else if (message.method === "session/prompt") {
    send({ method: "session/update", params: {
      sessionId: "strict-acp-session",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: mode === "cancel" ? "Waiting for cancellation" : "Modern ACP reply" } },
    } });
    if (mode === "reply") send({ method: "_cognition.ai/agent_stopped", params: { cause: "complete" } });
  }
});
`;

let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-acp-test-"));
  state.script = path.join(directory, "strict-agent.mjs");
  fs.writeFileSync(state.script, AGENT);
  state.mode = "reply";
  state.children = [];
});

afterEach(async () => {
  for (const { child, closed } of state.children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

async function execute(signal) {
  const executor = new DevinCliExecutor();
  const { response } = await executor.execute({
    model: "swe-1.6-fast",
    body: { messages: [{ role: "user", content: "Reply with plain text; do not use tools." }] },
    credentials: {},
    signal,
  });
  return response;
}

function parseEvents(text) {
  return text.split("\n").filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
}

async function expectExited() {
  const { child, closed } = state.children[0];
  await closed;
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
}

describe("Devin ACP initialization with a real strict peer", () => {
  it("negotiates ACP v1 and returns the complete answer", async () => {
    const text = await (await execute()).text();
    const events = parseEvents(text);
    expect(events.filter((event) => event.error)).toEqual([]);
    expect(events.flatMap((event) => event.choices || []).map((choice) => choice.delta.content || "").join(""))
      .toBe("Modern ACP reply");
    expect(events.at(-1).choices[0].finish_reason).toBe("stop");
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    await expectExited();
  });

  it.each(["incompatible", "string-version"])("rejects %s negotiation and terminates an uncooperative peer", async (mode) => {
    state.mode = mode;
    const text = await (await execute()).text();
    const events = parseEvents(text);
    expect(events).toEqual([{ error: {
      message: expect.stringMatching(/unsupported protocol version.*supports.*1/i),
      type: "devin_cli_error",
    } }]);
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    await expectExited();
  }, 10000);

  it("terminates a live ACP peer when the request is cancelled", async () => {
    state.mode = "cancel";
    const abortController = new AbortController();
    const reader = (await execute(abortController.signal)).body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("Waiting for cancellation")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    expect(text).toContain("Waiting for cancellation");
    abortController.abort();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    await expectExited();
  });
});
