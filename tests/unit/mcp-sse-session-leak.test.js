import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = { sessions: new Map(), nextSid: 0 };

vi.mock("@/lib/mcp/stdioSseBridge", () => ({
  findPlugin: (name) => (name === "known" ? { name, command: "node", args: [] } : null),
  registerSession: (name, sendFn) => {
    const sid = `sid-${bridge.nextSid++}`;
    bridge.sessions.set(sid, { name, sendFn });
    return sid;
  },
  unregisterSession: (name, sid) => { bridge.sessions.delete(sid); },
}));

vi.mock("@/dashboardGuard", () => ({
  hasValidCliToken: async () => true,
}));

beforeEach(() => { bridge.sessions.clear(); bridge.nextSid = 0; });
afterEach(() => { bridge.sessions.clear(); });

describe("mcp sse session leak fix (#3527)", () => {
  it("unregisters session when client request aborts", async () => {
    const { GET } = await import("@/app/api/mcp/[plugin]/sse/route.js");
    const controller = new AbortController();

    const request = {
      signal: controller.signal,
      headers: new Headers({ "x-kitsune-router-cli-token": "dummy" }),
    };

    const response = await GET(request, { params: Promise.resolve({ plugin: "known" }) });
    expect(response.status).toBe(200);
    expect(bridge.sessions.size).toBe(1);

    controller.abort();
    expect(bridge.sessions.size).toBe(0);
  });
});
