import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: network.fetch }));

let getClaudeUsage;
beforeEach(async () => {
  vi.resetModules();
  network.fetch.mockReset();
  ({ getClaudeUsage } = await import("../../open-sse/services/usage/claude.js"));
});
afterEach(() => vi.restoreAllMocks());

const quota = used => Response.json({ five_hour: { utilization: used, resets_at: "2026-11-18T00:00:00Z" } });

describe("Claude quota failures recover without force or process restart", () => {
  it("removes a completed failed read so the next normal poll can recover", async () => {
    network.fetch.mockRejectedValueOnce(new Error("temporary quota outage"))
      .mockResolvedValueOnce(quota(13));
    expect(await getClaudeUsage("same-proof")).toMatchObject({ message: expect.any(String) });
    const recovered = await getClaudeUsage("same-proof");
    expect(recovered.quotas["session (5h)"].used).toBe(13);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not let an old forced read overwrite a newer forced quota result", async () => {
    let finishOld;
    network.fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(quota(35));
    const old = getClaudeUsage("same-proof", null, { force: true });
    const recent = await getClaudeUsage("same-proof", null, { force: true });
    finishOld(quota(90));
    await old;
    expect(recent.quotas["session (5h)"].used).toBe(35);
    expect((await getClaudeUsage("same-proof")).quotas["session (5h)"].used).toBe(35);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("isolates concurrent quota reads by the chosen transport policy", async () => {
    const firstPolicy = { proxyPoolId: "first-pool", vercelRelayUrl: "https://relay-one.invalid" };
    const secondPolicy = { proxyPoolId: "second-pool", vercelRelayUrl: "https://relay-two.invalid" };
    network.fetch.mockImplementation(async (_url, _init, policy) => quota(policy === firstPolicy ? 10 : 20));
    const [first, second] = await Promise.all([
      getClaudeUsage("same-proof", firstPolicy), getClaudeUsage("same-proof", secondPolicy),
    ]);
    expect(first.quotas["session (5h)"].used).toBe(10);
    expect(second.quotas["session (5h)"].used).toBe(20);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("still joins concurrent normal polls and caches successful quota data", async () => {
    network.fetch.mockResolvedValue(quota(22));
    const [first, second] = await Promise.all([getClaudeUsage("same-proof"), getClaudeUsage("same-proof")]);
    expect(first).toEqual(second);
    expect((await getClaudeUsage("same-proof")).quotas["session (5h)"].used).toBe(22);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });
});
