import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ paths: [], failFirst: false }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: async (url) => {
    fixture.paths.push(new URL(url).pathname);
    if (fixture.failFirst && fixture.paths.length === 1) return new Response("synthetic retry", { status: 502 });
    return Response.json({ object: "response.compaction", output: [{ type: "compaction", encrypted_content: "synthetic" }] });
  },
}));
import { CodexExecutor } from "../../open-sse/executors/codex.js";

function options(compact) {
  return { model: "gpt-6.1-sol", stream: false,
    body: { model: "gpt-6.1-sol", input: "fixture", ...(compact ? { _compact: true } : {}) },
    credentials: { accessToken: "synthetic-compact-token" },
  };
}

describe("Codex compact endpoint belongs to its current logical request", () => {
  it("routes a first compact request to /compact and the following ordinary request to /responses", async () => {
    fixture.paths = []; fixture.failFirst = false;
    const executor = new CodexExecutor();
    await executor.execute(options(true));
    await executor.execute(options(false));
    expect(fixture.paths).toEqual(["/backend-api/codex/responses/compact", "/backend-api/codex/responses"]);
  });

  it("does not leak compact routing between concurrently started attempts", async () => {
    fixture.paths = []; fixture.failFirst = false;
    const executor = new CodexExecutor();
    await Promise.all([executor.execute(options(true)), executor.execute(options(false)), executor.execute(options(true))]);
    expect(fixture.paths).toEqual(["/backend-api/codex/responses/compact", "/backend-api/codex/responses", "/backend-api/codex/responses/compact"]);
  });

  it("retains compact identity after request transformation and a retry", async () => {
    fixture.paths = []; fixture.failFirst = true;
    const executor = new CodexExecutor();
    executor.config = { ...executor.config, retry: { 502: { attempts: 1, delayMs: 1 } } };
    await executor.execute(options(true));
    expect(fixture.paths).toEqual(["/backend-api/codex/responses/compact", "/backend-api/codex/responses/compact"]);
  });

  it("does not consume the app-owned compact marker needed by a later credential retry", async () => {
    fixture.paths = []; fixture.failFirst = false;
    const executor = new CodexExecutor();
    const input = options(true);
    const original = structuredClone(input.body);
    await executor.execute(input);
    await executor.execute(input);
    expect(JSON.stringify(input.body) === JSON.stringify(original)).toBe(true);
    expect(fixture.paths).toEqual(["/backend-api/codex/responses/compact", "/backend-api/codex/responses/compact"]);
  });
});
