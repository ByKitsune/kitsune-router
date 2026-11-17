import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const model = "gpt-6.1-sol";
const request = options => ({
  model,
  instructions: "Retain the caller's cache policy",
  input: [{ role: "user", content: "Continue" }],
  ...(options === undefined ? {} : { prompt_cache_options: options }),
});
const auth = id => ({ connectionId: `cache-policy-${id}`, accessToken: "synthetic-cache-token" });

beforeEach(() => {
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockImplementation(async () => Response.json({ id: "resp_cache_fixture" }));
});

describe("Codex caller-owned prompt cache options", () => {
  it.each(["30m", "12h"])("preserves the documented %s TTL on the outbound request", async ttl => {
    const body = request({ ttl });
    const original = structuredClone(body);
    Object.freeze(body.prompt_cache_options);
    Object.freeze(body);

    await new CodexExecutor().execute({ model, body, stream: true, credentials: auth(ttl) });

    const sent = JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
    expect(sent.prompt_cache_options).toEqual({ ttl });
    expect(body).toEqual(original);
  });

  it("does not select a cache lifetime when the caller did not request one", async () => {
    await new CodexExecutor().execute({ model, body: request(), stream: true, credentials: auth("default") });
    expect(JSON.parse(proxyAwareFetch.mock.calls[0][1].body)).not.toHaveProperty("prompt_cache_options");
  });

  it.each([
    null, "12h", [], {}, { ttl: 30 }, { ttl: "24h" }, { ttl: "12H" },
    { ttl: "30m", unverified: true },
  ])("rejects unsupported explicit cache options before dispatch: %j", async options => {
    const body = request(options);
    const original = structuredClone(body);
    await expect(new CodexExecutor().execute({ model, body, stream: true, credentials: auth("invalid") }))
      .rejects.toMatchObject({ code: "unsupported_parameter", param: "prompt_cache_options" });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
    expect(body).toEqual(original);
  });

  it("keeps concurrent request TTLs and omission independent on a reused executor", async () => {
    const executor = new CodexExecutor();
    const bodies = [request({ ttl: "12h" }), request(), request({ ttl: "30m" })];
    const originals = structuredClone(bodies);
    await Promise.all(bodies.map((body, index) => executor.execute({
      model, body, stream: true, credentials: auth(index),
    })));
    const sent = proxyAwareFetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(sent.map(body => body.prompt_cache_options)).toEqual([{ ttl: "12h" }, undefined, { ttl: "30m" }]);
    expect(bodies).toEqual(originals);
  });
});
