import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: network.fetch }));
import { refreshVertexToken } from "../../open-sse/services/tokenRefresh.js";

let firstKey;
let secondKey;
let sequence = 0;
beforeAll(async () => {
  firstKey = await exportPKCS8((await generateKeyPair("RS256", { extractable: true })).privateKey);
  secondKey = await exportPKCS8((await generateKeyPair("RS256", { extractable: true })).privateKey);
});
beforeEach(() => { network.fetch.mockReset(); });
const account = () => ({ type: "service_account", client_email: `synthetic-${++sequence}@example.invalid`, project_id: "synthetic-project", private_key: firstKey });
const logger = () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn() });

describe("Vertex token minting binds cache entries to service-account proof", () => {
  it("does not reuse a token after service-account key rotation", async () => {
    const current = account();
    network.fetch.mockResolvedValueOnce(Response.json({ access_token: "before-rotation", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ access_token: "after-rotation", expires_in: 3600 }));
    expect((await refreshVertexToken(current)).accessToken).toBe("before-rotation");
    expect((await refreshVertexToken({ ...current, private_key: secondKey })).accessToken).toBe("after-rotation");
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not return a cached token when the supplied signing proof is unusable", async () => {
    const current = account();
    network.fetch.mockResolvedValue(Response.json({ access_token: "valid-proof-token", expires_in: 3600 }));
    await refreshVertexToken(current);
    expect(await refreshVertexToken({ ...current, private_key: "invalid-signing-key" })).toBeNull();
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("still reuses an unexpired token for an identical account/key/policy", async () => {
    const current = account();
    network.fetch.mockResolvedValue(Response.json({ access_token: "same-proof-token", expires_in: 3600 }));
    expect((await refreshVertexToken(current)).accessToken).toBe("same-proof-token");
    expect((await refreshVertexToken({ ...current })).accessToken).toBe("same-proof-token");
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not accept a success body that contains no access token", async () => {
    network.fetch.mockResolvedValue(Response.json({ expires_in: 3600 }));
    expect(await refreshVertexToken(account())).toBeNull();
  });

  it("refuses to follow a token-endpoint redirect", async () => {
    network.fetch.mockResolvedValue(Response.json({ access_token: "same-proof-token", expires_in: 3600 }));
    await refreshVertexToken(account());
    expect(network.fetch.mock.calls[0][1].redirect).toBe("error");
  });

  it.each(["upstream", "transport"])("keeps %s credential-bearing diagnostics out of logs", async kind => {
    const secret = "synthetic-private-grant-echo";
    if (kind === "upstream") network.fetch.mockResolvedValue(Response.json({ error: "invalid_grant", error_description: secret, access_token: secret }, { status: 400 }));
    else network.fetch.mockRejectedValue(new Error(secret));
    const log = logger();
    expect(await refreshVertexToken(account(), log)).toBeNull();
    expect(log.error).toHaveBeenCalled();
    expect(JSON.stringify(Object.values(log).flatMap(method => method.mock.calls))).not.toContain(secret);
  });
});
