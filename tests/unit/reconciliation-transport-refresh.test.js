import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const transport = vi.hoisted(() => ({ nativeFetch: globalThis.fetch }));
vi.hoisted(() => {
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") return Promise.reject(new Error("fixture forbids direct egress"));
    return transport.nativeFetch(url, options);
  };
});

import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { refreshWithRetry } from "../../open-sse/services/tokenRefresh.js";

const servers = [];
afterAll(() => { globalThis.fetch = transport.nativeFetch; });
async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

describe("reactive credential refresh transport", () => {
  it("does not invoke a refresh when the caller is already cancelled", async () => {
    const caller = new AbortController();
    const reason = new Error("caller left");
    caller.abort(reason);
    let attempts = 0;
    const pending = refreshWithRetry(async () => { attempts++; return { accessToken: "unexpected" }; }, 3, null, caller.signal);
    await expect(pending).rejects.toBe(reason);
    expect(attempts).toBe(0);
  });

  it("interrupts refresh backoff without making another attempt", async () => {
    const caller = new AbortController();
    const reason = new Error("caller left during backoff");
    let attempts = 0;
    const pending = refreshWithRetry(async () => {
      attempts++;
      setTimeout(() => caller.abort(reason), 10);
      return null;
    }, 3, null, caller.signal);
    const outcome = await Promise.race([
      pending.then(() => "continued", error => error),
      new Promise(resolve => setTimeout(() => resolve("did not cancel promptly"), 250)),
    ]);
    expect(outcome).toBe(reason);
    expect(attempts).toBe(1);
    await pending.catch(() => {});
  });

  it("cancels a generic OAuth refresh socket with an ordinary Error reason", async () => {
    let requestSeen;
    const started = new Promise(resolve => { requestSeen = resolve; });
    const relay = await listen((_req, _res) => { requestSeen(); });
    const executor = new DefaultExecutor("claude");
    const caller = new AbortController();
    const reason = new Error("caller left during refresh");
    const pending = executor.refreshCredentials({ refreshToken: "fixture" }, null,
      { strictProxy: true, vercelRelayUrl: relay }, caller.signal);
    await started;
    caller.abort(reason);
    const outcome = await Promise.race([
      pending.then(value => value, error => error),
      new Promise(resolve => setTimeout(() => resolve("refresh kept running"), 250)),
    ]);
    expect(outcome).toBe(reason);
  });

  it("refreshes Codex credentials through the resolved account relay and preserves rotation metadata", async () => {
    const requests = [];
    const relay = await listen(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push({ target: req.headers["x-relay-target"], path: req.headers["x-relay-path"], body: JSON.parse(body) });
      res.setHeader("Content-Type", "application/json");
      res.end('{"access_token":"fresh-fixture","refresh_token":"rotated-fixture","expires_in":3600}');
    });
    const credentials = await new CodexExecutor().refreshCredentials({ connectionId: "fixture-relay",
      refreshToken: "refresh-fixture", idToken: "prior-fixture" }, null,
    { strictProxy: true, vercelRelayUrl: relay });
    expect(credentials).toMatchObject({ accessToken: "fresh-fixture", refreshToken: "rotated-fixture", idToken: "prior-fixture" });
    expect(credentials.lastRefreshAt).toBeTruthy();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ target: "https://auth.openai.com", path: "/oauth/token",
      body: { refresh_token: "refresh-fixture" } });
  });
});
