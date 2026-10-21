import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// External transport is the only double: use real admission, alias resolution,
// translators and executors, and inspect the payload the executor would send.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { getModelUpstreamId, getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "../../open-sse/config/providerModels.js";
import { parseModel } from "../../open-sse/services/model.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { buildAgentRunFrame } from "../../open-sse/executors/cursor.js";
import { openaiToCommandCodeRequest } from "../../open-sse/translator/request/openai-to-commandcode.js";
import { openaiToKiroRequest } from "../../open-sse/translator/request/openai-to-kiro.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => new Response("", { status: 200 }));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected non-fixture network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

function select(publicId) {
  const { provider, model } = parseModel(publicId);
  const entry = getModelsByProviderId(provider).find(row => row.id === model);
  expect(entry, `registered public route ${publicId}`).toBeDefined();
  // chatCore resolves secondary public aliases (bb/cmc) to the registry's
  // canonical model-table alias before applying per-model wire mappings.
  return { provider, model: getModelUpstreamId(PROVIDER_ID_TO_ALIAS[provider] || provider, entry.id) };
}

// Independent protobuf reader, not the production decoder: catch a wire ID
// written into the wrong field or rewritten to an unrelated vendor alias.
function fields(bytes) {
  let offset = 0;
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    do {
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    } while (offset < bytes.length);
    throw new Error("Truncated fixture varint");
  };
  const result = new Map();
  while (offset < bytes.length) {
    const tag = readVarint();
    const wire = tag & 7;
    if (wire === 0) result.set(tag >> 3, readVarint());
    else if (wire === 2) {
      const length = readVarint();
      result.set(tag >> 3, bytes.subarray(offset, offset + length));
      offset += length;
    } else throw new Error(`Unexpected fixture wire type ${wire}`);
  }
  return result;
}

describe("refreshed OAuth/IDE catalog through native request serialization", () => {
  it.each([
    ["cl/anthropic/claude-sonnet-5.5", "https://api.cline.bot/api/v1/chat/completions", "anthropic/claude-sonnet-5.5"],
    ["kc/openai/gpt-6.1-sol", "https://api.kilo.ai/api/openrouter/chat/completions", "openai/gpt-6.1-sol"],
    ["cbcn/kimi-k3-2", "https://copilot.tencent.com/v2/chat/completions", "kimi-k3-2"],
    ["cbai/deepseek-v4.1-flash-sg", "https://www.codebuddy.ai/v2/chat/completions", "deepseek-v4.1-flash-sg"],
    ["bb/gemini-3.5-flash", "https://api.blackbox.ai/v1/chat/completions", "blackboxai/google/gemini-3.5-flash"],
    ["bzl/deepseek-v4.1-flash-1017", "https://bazaarlink.ai/api/v1/chat/completions", "deepseek-v4.1-flash-1017"],
    ["af/claude-sonnet-5.5", "https://api.airforce/v1/chat/completions", "claude-sonnet-5.5"],
    ["llm7/DeepSeek-V4.1-Flash", "https://api.llm7.io/v1/chat/completions", "DeepSeek-V4.1-Flash"],
  ])("sends %s's literal model without losing caller controls", async (publicId, url, wire) => {
    const selected = select(publicId);
    const body = { model: selected.model, messages: [{ role: "user", content: "fixture" }], max_tokens: 37, stream: false };
    await new DefaultExecutor(selected.provider).execute({
      ...selected, body, stream: false, credentials: { accessToken: "fixture-oauth", providerSpecificData: { orgId: "fixture-org" } },
    });
    const [actualUrl, request] = proxyAwareFetch.mock.calls.at(-1);
    expect(actualUrl).toBe(url);
    expect(JSON.parse(request.body)).toMatchObject({ model: wire, max_tokens: 37, messages: [{ role: "user", content: "fixture" }] });
    expect(new Headers(request.headers).get("authorization")).toBe("Bearer fixture-oauth");
    if (selected.provider === "kilocode") expect(new Headers(request.headers).get("x-kilocode-organizationid")).toBe("fixture-org");
  });

  it.each(["cu/claude-sonnet-5-5", "cu/composer-2.5", "cu/gpt-5.6-sol", "cu/grok-4.7"])("serializes %s in native AgentService RequestedModel, not an old 4.x/5.2 slug", publicId => {
    const selected = select(publicId);
    const frame = buildAgentRunFrame([{ role: "user", content: "fixture" }], selected.model);
    const clientMessage = fields(frame.subarray(5));
    const run = fields(clientMessage.get(1));
    const requested = fields(run.get(9));
    expect(new TextDecoder().decode(requested.get(1))).toBe(publicId.slice(3));
    expect(requested.get(7)).toBe(1);
  });

  it("preserves CommandCode's case-sensitive namespace and explicit output cap in the existing NDJSON adapter", async () => {
    const selected = select("cmc/Qwen/Qwen3.8-Max-Prime");
    const request = openaiToCommandCodeRequest(selected.model, {
      messages: [{ role: "system", content: "fixture-system" }, { role: "user", content: "fixture-user" }],
      max_completion_tokens: 37,
      tools: [{ type: "function", function: { name: "lookup", description: "fixture-tool", parameters: { type: "object", properties: {} } } }],
    }, true);
    await new CommandCodeExecutor().execute({ ...selected, body: request, stream: true, credentials: { apiKey: "user_fixture" } });
    const [url, options] = proxyAwareFetch.mock.calls.at(-1);
    expect(url).toBe("https://api.commandcode.ai/alpha/generate");
    expect(JSON.parse(options.body).params).toMatchObject({
      model: "Qwen/Qwen3.8-Max-Prime", max_tokens: 37, system: "fixture-system",
      tools: [{ name: "lookup", description: "fixture-tool", input_schema: { type: "object", properties: {} } }],
      messages: [{ role: "user", content: [{ type: "text", text: "fixture-user" }] }],
    });
  });

  it("keeps Kiro's IDE wire ID and removes only synthetic flags after the GPT context refresh", () => {
    const selected = select("kr/gpt-5.6-sol-thinking-agentic");
    const request = openaiToKiroRequest(selected.model, { messages: [{ role: "user", content: "fixture" }], reasoning_effort: "high", max_tokens: 37 }, true, {});
    expect(request.conversationState.currentMessage.userInputMessage.modelId).toBe("gpt-5.6-sol");
    expect(request.additionalModelRequestFields).toEqual({ reasoning: { effort: "high" } });
    expect(request.inferenceConfig.maxTokens).toBe(37);
    expect(JSON.stringify(request)).not.toContain('"modelId":"gpt-5.6-sol-thinking-agentic"');
  });
});
