import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => network.fetch(...args) }));
beforeEach(() => { network.fetch.mockReset(); });

const canary = "synthetic-private-refresh-canary-0123456789";
function logger() {
  const records = [];
  return { records, log: Object.fromEntries(["error", "warn", "info", "debug"].map(level =>
    [level, (...args) => { records.push([level, ...args]); }])) };
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve("still pending"), 300); })]);
  } finally { clearTimeout(timer); }
}

describe("executor OAuth diagnostics do not expose upstream credential-bearing strings", () => {
  it.each([401, 403, 429])("keeps Copilot HTTP%i diagnostics without logging the response body", async status => {
    const { records, log } = logger();
    network.fetch.mockResolvedValue(Response.json({ error: "invalid_grant", access_token: canary, refresh_token: canary }, { status }));
    expect(await new GithubExecutor().refreshCopilotToken("synthetic-token", log)).toBeNull();
    expect(JSON.stringify(records)).toContain(String(status));
    expect(JSON.stringify(records)).not.toContain(canary);
  });

  it.each(["copilot", "github"])("logs only a fixed error type for %s parse/network exceptions", async provider => {
    const { records, log } = logger();
    network.fetch.mockRejectedValue(new SyntaxError(`Invalid JSON access_token=${canary}`));
    const executor = new GithubExecutor();
    const result = provider === "copilot"
      ? await executor.refreshCopilotToken("synthetic-token", log)
      : await executor.refreshGitHubToken("synthetic-refresh", log);
    expect(result).toBeNull();
    expect(JSON.stringify(records)).toContain("SyntaxError");
    expect(JSON.stringify(records)).not.toContain(canary);
  });

  it.each(["claude", "iflow", "kiro"])("keeps %s generic refresh exceptions out of logs", async provider => {
    const { records, log } = logger();
    network.fetch.mockRejectedValue(new TypeError(`Request failed https://token.invalid/?refresh_token=${canary}`));
    const result = await new DefaultExecutor(provider).refreshCredentials({ refreshToken: "synthetic-refresh" }, log);
    expect(result).toBeNull();
    expect(network.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(records)).toContain("TypeError");
    expect(JSON.stringify(records)).not.toContain(canary);
  });

  it("retains successful Copilot credentials and expiry exactly", async () => {
    const { records, log } = logger();
    network.fetch.mockResolvedValue(Response.json({ token: canary, expires_at: 2000000001 }));
    expect(await new GithubExecutor().refreshCopilotToken("synthetic-token", log))
      .toEqual({ token: canary, expiresAt: 2000000001 });
    expect(JSON.stringify(records)).not.toContain(canary);
  });
});

describe("discarded refresh responses release their body without awaiting hostile cleanup", () => {
  it("does not wait for a Copilot error body's bytes or cancellation acknowledgment", async () => {
    let source;
    let acknowledge;
    const waiting = new Promise(resolve => { acknowledge = resolve; });
    const cancel = vi.fn(() => waiting);
    network.fetch.mockResolvedValue(new Response(new ReadableStream({
      start(controller) { source = controller; controller.enqueue(new TextEncoder().encode(`{"refresh_token":"${canary}"}`)); },
      cancel,
    }), { status: 401 }));
    const { records, log } = logger();
    const outcome = new GithubExecutor().refreshCopilotToken("synthetic-token", log);
    try {
      expect(await bounded(outcome)).toBeNull();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(records)).not.toContain(canary);
    } finally {
      try { source.close(); } catch { /* Already cancelled. */ }
      acknowledge();
      await outcome;
    }
  });

  it.each(["json", "form", "github"])("discards a rejected %s grant response even though no payload is needed", async kind => {
    const cancel = vi.fn();
    network.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 400 }));
    const executor = new DefaultExecutor("claude");
    const result = kind === "json"
      ? await executor.refreshWithJSON("https://token.invalid", { refresh_token: "synthetic-refresh" })
      : kind === "form"
        ? await executor.refreshWithForm("https://token.invalid", { refresh_token: "synthetic-refresh" })
        : await new GithubExecutor().refreshGitHubToken("synthetic-refresh");
    expect(result).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("preserves caller abort as terminal without another refresh request", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic refresh caller cancelled");
    caller.abort(reason);
    const result = await new GithubExecutor().refreshCredentials({ accessToken: "synthetic-token", refreshToken: "synthetic-refresh" },
      logger().log, null, caller.signal).catch(error => error);
    expect(result).toBe(reason);
    expect(network.fetch).not.toHaveBeenCalled();
  });
});
