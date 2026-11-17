import { beforeEach, describe, expect, it, vi } from "vitest";
import { MimoFreeExecutor, __test__ } from "../../open-sse/executors/mimo-free.js";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => network.fetch(...args) }));

beforeEach(() => { network.fetch.mockReset(); __test__.resetJwtCache(); });
function jwt(label = "first") {
  return `synthetic.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, label })).toString("base64url")}.synthetic`;
}
function execute(signal) {
  return new MimoFreeExecutor().execute({ model: "mimo-fixture", body: { messages: [{ role: "user", content: "A short reply." }] },
    stream: false, credentials: {}, signal });
}

describe("bootstrap and one existing auth retry retain the caller's cancellation", () => {
  it("never starts bootstrap for a caller that already left", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic caller already left");
    caller.abort(reason);
    network.fetch.mockResolvedValue(Response.json({ jwt: jwt() }));
    expect(await execute(caller.signal).catch(error => error)).toBe(reason);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("passes the caller signal to the bootstrap request", async () => {
    const caller = new AbortController();
    network.fetch.mockResolvedValueOnce(Response.json({ jwt: jwt() })).mockResolvedValueOnce(Response.json({ choices: [] }));
    const result = await execute(caller.signal);
    expect(result.response.status).toBe(200);
    expect(network.fetch.mock.calls[0][1].signal).toBe(caller.signal);
    expect(network.fetch.mock.calls[1][1].signal).toBe(caller.signal);
  });

  it("does not cache a bootstrap response that arrives after caller cancellation", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic caller left during bootstrap");
    const late = Response.json({ jwt: jwt("cancelled") });
    const parse = vi.spyOn(late, "json");
    network.fetch.mockImplementationOnce(async () => { caller.abort(reason); return late; });
    expect(await execute(caller.signal).catch(error => error)).toBe(reason);
    expect(parse).not.toHaveBeenCalled();
    const subsequent = jwt("subsequent");
    network.fetch.mockResolvedValueOnce(Response.json({ jwt: subsequent }));
    expect(await __test__.bootstrapJwt()).toBe(subsequent);
    expect(network.fetch.mock.calls.map(call => call[0])).toEqual([__test__.BOOTSTRAP_URL, __test__.BOOTSTRAP_URL]);
  });

  it("releases an auth-rejected body before the one fresh bootstrap request", async () => {
    const cancel = vi.fn();
    const rejected = new Response(new ReadableStream({ cancel }), { status: 401 });
    network.fetch.mockResolvedValueOnce(Response.json({ jwt: jwt("expired") }))
      .mockResolvedValueOnce(rejected)
      .mockImplementationOnce(async () => {
        expect(cancel).toHaveBeenCalledTimes(1);
        return Response.json({ jwt: jwt("fresh") });
      })
      .mockResolvedValueOnce(Response.json({ choices: [] }));
    const caller = new AbortController();
    expect((await execute(caller.signal)).response.status).toBe(200);
    expect(network.fetch).toHaveBeenCalledTimes(4);
    expect(network.fetch.mock.calls[2][1].signal).toBe(caller.signal);
    expect(network.fetch.mock.calls[3][1].signal).toBe(caller.signal);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("never re-bootstraps or resends after cancellation at an auth failure", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic caller left after auth failure");
    network.fetch.mockResolvedValueOnce(Response.json({ jwt: jwt() }))
      .mockImplementationOnce(async () => { caller.abort(reason); return Response.json({ error: "expired" }, { status: 401 }); });
    expect(await execute(caller.signal).catch(error => error)).toBe(reason);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("discards a failed bootstrap response body without creating a chat request", async () => {
    const cancel = vi.fn();
    network.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 503 }));
    const failure = await execute().catch(error => error);
    expect(failure.message).toBe("MiMo bootstrap failed: 503");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(network.fetch.mock.calls.map(call => call[0])).toEqual([__test__.BOOTSTRAP_URL]);
  });
});
