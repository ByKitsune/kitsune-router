import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

vi.mock("@/lib/localDb", () => ({ getApiKeys: async () => [{ key: "synthetic-key", isActive: true }] }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => "synthetic-cli-token" }));
import { POST } from "../../src/app/api/models/test/route.js";

let server;
let received = [];
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("PORT", String(server.address().port));
});
beforeEach(() => { received = []; });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  vi.unstubAllEnvs();
});

const request = body => new Request("http://localhost/api/models/test", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("model test request processing controls", () => {
  it.each(["auto", "default", "fast", "priority", "ultrafast"])("sends an explicit %s tier through the internal gateway", async serviceTier => {
    const response = await POST(request({ model: "codex/gpt-6.1-sol(high)", service_tier: serviceTier }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ path: "/api/v1/chat/completions", body: {
      model: "codex/gpt-6.1-sol(high)", service_tier: serviceTier,
    } });
  });

  it("does not enable paid processing when no tier is selected", async () => {
    await POST(request({ model: "openai/gpt-6.1-sol" }));
    expect(received[0].body).not.toHaveProperty("service_tier");
  });

  it.each(["turbo", "high", 1, {}, null])("rejects invalid tier %j before dispatch", async value => {
    const response = await POST(request({ model: "codex/gpt-6.1-sol", service_tier: value }));
    expect(response.status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it("does not silently discard processing selection on a non-chat probe", async () => {
    const response = await POST(request({ model: "openai/text-embedding-3-small", kind: "embedding", service_tier: "ultrafast" }));
    expect(response.status).toBe(400);
    expect(received).toHaveLength(0);
  });
});
