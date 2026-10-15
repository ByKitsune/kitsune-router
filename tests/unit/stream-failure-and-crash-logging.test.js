// P10-B / P10-C regression gate — mid-stream failover and unhandled-failure logging.
//
// P10-B: `markAccountUnavailable` was called ONLY on the pre-stream error path
// (src/sse/handlers/chat.js). Once an upstream returned 200 + SSE, a failure
// inside the stream body (Codex `response.failed`, quota exhausted
// mid-generation) was merely recorded. The account therefore stayed "healthy"
// and kept being selected: every request returned 200 with truncated content
// and no failover ever happened — an outage that status-based monitoring
// cannot see, because everything looks like 200.
//
// P10-C: `catch {}` in src/sse/handlers/chat.js and
// src/app/api/v1/responses/route.js swallowed every unexpected exception. The
// client still received a `serverRequestId`, but nothing in the server log
// contained that id, so the correlation it was meant to enable did not exist.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";

const ROOT = new URL("../..", import.meta.url).pathname;

function makeComplete(overrides = {}) {
  const onStreamFailed = vi.fn();
  const callbacks = buildOnStreamComplete({
    provider: "codex",
    model: "gpt-6-luna",
    connectionId: "conn-1",
    apiKey: "sk-test",
    requestStartTime: Date.now(),
    body: {},
    stream: true,
    finalBody: null,
    translatedBody: null,
    clientRawRequest: null,
    pxpipe: null,
    reqTag: "T",
    log: null,
    onStreamFailed,
    ...overrides,
  });
  return { ...callbacks, onStreamFailed };
}

describe("mid-stream failure marks the account unavailable (P10-B)", () => {
  it("invokes onStreamFailed when the stream body reports failure", () => {
    const { onStreamComplete, onStreamFailed } = makeComplete();
    onStreamComplete(
      { content: "partial", thinking: "" },
      { prompt_tokens: 10, completion_tokens: 5 },
      Date.now(),
      { failed: true, error: "quota exhausted mid-generation" },
    );

    expect(onStreamFailed).toHaveBeenCalledTimes(1);
    const arg = onStreamFailed.mock.calls[0][0];
    expect(arg.error).toBe("quota exhausted mid-generation");
    expect(arg.status).toBe(502);
  });

  it("does not mark the account on a successful stream", () => {
    const { onStreamComplete, onStreamFailed } = makeComplete();
    onStreamComplete(
      { content: "all good", thinking: "" },
      { prompt_tokens: 10, completion_tokens: 5 },
      Date.now(),
      { failed: false },
    );

    expect(onStreamFailed).not.toHaveBeenCalled();
  });

  it("supplies a fallback error message when the upstream gives none", () => {
    const { onStreamComplete, onStreamFailed } = makeComplete();
    onStreamComplete({ content: "x" }, null, Date.now(), { failed: true });

    expect(onStreamFailed).toHaveBeenCalledTimes(1);
    expect(onStreamFailed.mock.calls[0][0].error).toBe("upstream stream failed");
  });

  it("still claims persistence once (no double accounting)", () => {
    const { onStreamComplete, onStreamFailed } = makeComplete();
    onStreamComplete({ content: "x" }, null, Date.now(), { failed: true, error: "boom" });
    onStreamComplete({ content: "x" }, null, Date.now(), { failed: true, error: "boom again" });

    expect(onStreamFailed).toHaveBeenCalledTimes(1);
  });

  it("never throws out of the completion callback when the handler fails", () => {
    // Accounting must not break the response path.
    const onStreamFailed = vi.fn(() => { throw new Error("handler exploded"); });
    const { onStreamComplete } = makeComplete({ onStreamFailed });
    expect(() => onStreamComplete({ content: "x" }, null, Date.now(), { failed: true })).not.toThrow();
  });

  it("tolerates a missing onStreamFailed callback", () => {
    const callbacks = buildOnStreamComplete({
      provider: "codex", model: "m", connectionId: "c", apiKey: "k",
      requestStartTime: Date.now(), body: {}, stream: true,
      finalBody: null, translatedBody: null, clientRawRequest: null,
      pxpipe: null, reqTag: "T", log: null,
    });
    expect(() => callbacks.onStreamComplete({ content: "x" }, null, Date.now(), { failed: true })).not.toThrow();
  });
});

describe("a client disconnect is not an account fault (P10-B)", () => {
  it("keeps abort and completion mutually exclusive", () => {
    // onStreamAborted claims persistence first, so a disconnect can never reach
    // the failed-stream branch and mark the account.
    const { onStreamComplete, onStreamAborted, onStreamFailed } = makeComplete();
    onStreamAborted({ content: "partial", usage: null, ttftAt: null }, "client_aborted");
    onStreamComplete({ content: "partial" }, null, Date.now(), { failed: true, error: "should not count" });

    expect(onStreamFailed).not.toHaveBeenCalled();
  });

  it("documents that the abort path claims persistence before completion", () => {
    const source = readFileSync(join(ROOT, "open-sse/handlers/chatCore/streamingHandler.js"), "utf8");
    const abortIndex = source.indexOf("const onStreamAborted = (snapshot, reason) =>");
    expect(abortIndex).toBeGreaterThan(-1);
    // The abort handler must guard on persistenceClaimed.
    const abortBody = source.slice(abortIndex, abortIndex + 200);
    expect(abortBody).toMatch(/persistenceClaimed/);
  });
});

describe("unexpected failures are logged with the client's request id (P10-C)", () => {
  const FILES = [
    ["src/sse/handlers/chat.js", "Chat request failed"],
    ["src/app/api/v1/responses/route.js", "Responses request failed"],
  ];

  it.each(FILES)("%s logs the failure instead of swallowing it", (rel, genericMessage) => {
    const source = readFileSync(join(ROOT, rel), "utf8");
    // The generic message must still be returned...
    expect(source).toContain(genericMessage);
    // ...but the catch must bind the error and log it with the request id.
    expect(source).not.toMatch(/\}\s*catch\s*\{\s*\n\s*return correlateResponse/);
    expect(source).toMatch(/catch \(error\)/);
    expect(source).toMatch(/serverRequestId\}\] unhandled failure/);
    expect(source).toMatch(/error\?\.stack/);
  });

  it("uses the always-on logger so log level cannot hide a crash", () => {
    // log.error() is gated by LOG_LEVEL; errorLine() is documented as
    // "always printed regardless of LOG_LEVEL".
    for (const [rel] of FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(source, rel).toMatch(/errorLine/);
    }
  });

  it("does not log prompt or response content in the crash path", () => {
    for (const [rel] of FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      const idx = source.indexOf("unhandled failure");
      expect(idx, rel).toBeGreaterThan(-1);
      // Only identity fields are interpolated in that line.
      const line = source.slice(idx, source.indexOf("\n", idx));
      expect(line, rel).not.toMatch(/body\.|prompt|messages|content/i);
    }
  });
});
