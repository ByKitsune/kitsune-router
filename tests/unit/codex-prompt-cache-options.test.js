import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { stripUnsupportedParams } from "../../open-sse/translator/concerns/paramSupport.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const model = "gpt-6.1-sol";
const request = options => ({
  model,
  instructions: "Retain the caller's cache policy",
  input: [{ role: "user", content: "Continue" }],
  ...(options === undefined ? {} : { prompt_cache_options: options }),
});

describe("GPT-6.2 Codex wire contract", () => {
  it.each([["gpt-6.2-astra", "xhigh"], ["gpt-6.2-sol", "max"]])("preserves Chat cache control, tools and explicit %s effort", async (model, effort) => {
    const body = {
      model,
      messages: [{ role: "user", content: "Continue" }],
      reasoning_effort: effort,
      temperature: 0.6, top_p: 0.9, logprobs: true, top_logprobs: 2,
      prompt_cache_options: { ttl: "12h" },
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} }, strict: true } }],
      parallel_tool_calls: true,
    };
    const translated = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, model, body, true, null, "codex");
    await new CodexExecutor().execute({ model, body: translated, stream: true, credentials: auth(model) });
    const sent = JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({
      model,
      reasoning: { effort },
      prompt_cache_options: { ttl: "12h" },
      parallel_tool_calls: true,
      tools: [{ type: "function", name: "lookup", strict: true }],
    });
    for (const field of ["temperature", "top_p", "logprobs", "top_logprobs", "reasoning_effort"]) {
      expect(sent).not.toHaveProperty(field);
    }
    expect(body.reasoning_effort).toBe(effort);
  });

  it.each(["gpt-6.2-astra", "gpt-6.2-sol"])("defaults %s to Codex low and preserves native reasoning updates", async model => {
    const input = [
      { type: "configuration_update", reasoning: { effort: "max" } },
      { type: "message", role: "user", content: [{ type: "input_text", text: "Continue" }] },
    ];
    const body = { model, input, include: ["message.output_text.logprobs"] };
    await new CodexExecutor().execute({ model, body, stream: true, credentials: auth(model) });
    const sent = JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
    expect(sent.input).toEqual(input);
    expect(sent.reasoning).toEqual({ effort: "low" });
    expect(sent.include).toEqual(["reasoning.encrypted_content"]);
  });
});

describe.each(["openai", "opencode-zen"])("GPT-6.2 %s Responses wire contract", provider => {
  const model = "gpt-6.2-sol";

  it("preserves modern prompt caching and valid effort after removing unsupported parameters", () => {
    const body = {
      model, messages: [{ role: "user", content: "Continue" }],
      reasoning_effort: "max", prompt_cache_options: { ttl: "30m" }, temperature: 0.5, top_p: 0.9,
    };
    const sent = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, model, body, true, null, provider);
    stripUnsupportedParams(provider, model, sent);
    expect(sent).toMatchObject({ reasoning: { effort: "max" }, prompt_cache_options: { ttl: "30m" } });
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("top_p");
  });

  it.each(["none", "minimal", "ultra"])("rejects %s as a raw inference effort", effort => {
    expect(() => translateRequest(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, model, {
      model, input: "Continue", reasoning: { effort },
    }, true, null, provider)).toThrow(/reasoning effort low, medium, high, xhigh, max/i);
  });
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
