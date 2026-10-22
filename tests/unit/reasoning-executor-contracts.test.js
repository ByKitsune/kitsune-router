import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";
import { KiroExecutor } from "../../open-sse/executors/kiro.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { clearKiroSessionReplayStore } from "../../open-sse/utils/kiroSessionReplay.js";

let server;
let origin;
let requests;
let reply;

const messages = () => [{ role: "user", content: "Reply briefly." }];
const googleContents = () => [{ role: "user", parts: [{ text: "Reply briefly." }] }];
const credentials = () => ({
  accessToken: "offline-reasoning-token",
  connectionId: "offline-reasoning-contract",
  projectId: "offline-reasoning-project",
  providerSpecificData: {},
});

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const received = { path: request.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
    requests.push(received);
    const result = reply?.(received, requests.length) || {
      status: 422,
      body: { error: { message: "Offline serialization fixture; no inference performed." } },
    };
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  requests = [];
  reply = null;
  clearKiroSessionReplayStore();
});

// Redirect only configured endpoints. Translation, provider-specific transforms,
// JSON serialization, proxy-aware fetch and the receiving HTTP socket stay real.
function localExecutor(executor) {
  const base = `${origin}/${executor.provider}`;
  executor.config = {
    ...executor.config,
    baseUrl: `${base}/chat/completions`,
    baseUrls: [`${base}/dispatch`],
    responsesUrl: `${base}/responses`,
    messagesUrl: `${base}/v1/messages`,
    retry: { 429: 0, 500: 0, 502: 0, 503: 0, 504: 0 },
  };
  return executor;
}

async function dispatch(executor, model, body, auth = credentials()) {
  const result = await executor.execute({ model, body, credentials: auth, stream: false });
  await result.response.arrayBuffer();
  return requests.map(request => request.body);
}

async function translatedDispatch(executor, source, target, model, body) {
  const auth = credentials();
  const translated = translateRequest(source, target, model, structuredClone(body), false, auth, executor.provider);
  return dispatch(executor, model, translated, auth);
}

function kiroText(body) {
  return [
    ...(body.conversationState.history || []).map(turn => turn.userInputMessage?.content || ""),
    body.conversationState.currentMessage.userInputMessage.content,
  ].join("\n");
}

describe("Codex final reasoning serialization", () => {
  it("preserves an explicit null summary instead of opting the native client into summaries", async () => {
    const [sent] = await dispatch(localExecutor(new CodexExecutor()), "gpt-5.4", {
      model: "gpt-5.4", input: "Reply briefly.", reasoning: { effort: "low", summary: null },
    });
    expect(sent.reasoning).toEqual({ effort: "low", summary: null });
  });

  it.each([
    [{ thinking: false, reasoning: { summary: null } }, { effort: "none", summary: null }],
    [{ reasoning: "high" }, { effort: "high", summary: "auto" }],
    [{ budget_tokens: 8192, reasoning: { summary: null } }, { effort: "medium", summary: null }],
  ])("normalizes native API aliases %j without resetting native metadata", async (controls, expected) => {
    const [sent] = await dispatch(localExecutor(new CodexExecutor()), "gpt-5.4", {
      model: "gpt-5.4", input: "Reply briefly.", ...controls,
    });
    expect(sent.reasoning).toEqual(expected);
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("budget_tokens");
  });

  it("fills effort alongside summary-only native metadata on both configured retry attempts", async () => {
    const executor = localExecutor(new CodexExecutor());
    executor.config.retry[503] = { attempts: 1, delayMs: 0 };
    reply = (_request, attempt) => attempt === 1
      ? { status: 503, body: { error: { message: "Offline transient fixture." } } }
      : null;

    const sent = await dispatch(executor, "gpt-5.4", {
      model: "gpt-5.4", input: "Reply briefly.",
      reasoning_effort: "high", reasoning: { summary: "detailed" },
    });
    expect(sent).toHaveLength(2);
    for (const body of sent) {
      expect(body.reasoning).toEqual({ effort: "high", summary: "detailed" });
      expect(body).not.toHaveProperty("reasoning_effort");
    }
  });
});

describe("Antigravity compatibility thinking remains request-local across retries", () => {
  it("serializes the same numeric thinking intent after a configured transient retry", async () => {
    const executor = localExecutor(new AntigravityExecutor());
    executor.config.retry[503] = { attempts: 1, delayMs: 0 };
    reply = (_request, attempt) => attempt === 1
      ? { status: 503, body: { error: { message: "Offline transient fixture." } } }
      : null;
    const sent = await dispatch(executor, "gemini-2.5-flash", {
      model: "gemini-2.5-flash", userAgent: "antigravity",
      thinking: { type: "enabled", budget_tokens: 4096 },
      request: { contents: googleContents(), generationConfig: { maxOutputTokens: 6000 } },
    });
    expect(sent).toHaveLength(2);
    for (const body of sent) {
      expect(body.request.generationConfig).toMatchObject({
        maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      });
      expect(body).not.toHaveProperty("thinking");
    }
  });
});

describe.each([
  [FORMATS.GEMINI_CLI, GeminiCLIExecutor],
  [FORMATS.ANTIGRAVITY, AntigravityExecutor],
])("Native %s compatibility controls", (provider, Executor) => {
  it("normalizes native Google boolean off before final serialization", async () => {
    const [sent] = await dispatch(localExecutor(new Executor()), "gemini-2.5-flash", {
      model: "gemini-2.5-flash", userAgent: provider, thinking: false,
      request: { contents: googleContents(), generationConfig: { maxOutputTokens: 6000 } },
    });
    expect(sent.request.generationConfig).toMatchObject({
      maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
    });
    expect(sent).not.toHaveProperty("thinking");
  });

  it("normalizes native Google numeric aliases without losing independent visibility or cap", async () => {
    const [sent] = await dispatch(localExecutor(new Executor()), "gemini-2.5-flash", {
      model: "gemini-2.5-flash", userAgent: provider, budget_tokens: 4096,
      request: { contents: googleContents(), generationConfig: {
        maxOutputTokens: 6000, temperature: 0.25, thinkingConfig: { includeThoughts: false },
      } },
    });
    expect(sent.request.generationConfig).toEqual({
      maxOutputTokens: 6000, temperature: 0.25,
      thinkingConfig: { thinkingBudget: 4096, includeThoughts: false },
    });
    expect(sent).not.toHaveProperty("budget_tokens");
  });
});

describe("Antigravity Claude reasoning uses the actual Google wire", () => {
  it.each([
    [{ thinking: { type: "enabled", budget_tokens: 1024 } }, { thinkingBudget: 1024, includeThoughts: true }],
    [{ reasoning_effort: "none" }, { thinkingBudget: 0, includeThoughts: false }],
  ])("serializes supported translated thinking %j inside generationConfig", async (control, thinkingConfig) => {
    const [sent] = await translatedDispatch(localExecutor(new AntigravityExecutor()), FORMATS.OPENAI, FORMATS.ANTIGRAVITY, "claude-sonnet-4-6", {
      messages: messages(), ...control, max_completion_tokens: 6000,
    });
    expect(sent.request.generationConfig).toMatchObject({ maxOutputTokens: 6000, thinkingConfig });
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("output_config");
  });
});

describe("Copilot supported disabled intent reaches the actual Chat wire", () => {
  it.each([
    [FORMATS.OPENAI, { messages: messages(), reasoning_effort: "none", max_completion_tokens: 2048 }],
    [FORMATS.OPENAI_RESPONSES, { input: "Reply briefly.", reasoning: { effort: "none" }, max_output_tokens: 2048 }],
    [FORMATS.CLAUDE, { messages: messages(), thinking: { type: "disabled" }, max_tokens: 2048 }],
    [FORMATS.GEMINI, { contents: googleContents(), generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }],
  ])("does not replace %s explicit none with the GPT default", async (source, body) => {
    const [sent] = await translatedDispatch(localExecutor(new GithubExecutor()), source, FORMATS.OPENAI, "gpt-5.4", body);
    expect(sent.reasoning_effort).toBe("none");
    expect(sent.max_completion_tokens).toBe(2048);
    expect(sent).not.toHaveProperty("thinking");
  });

  it("retains native reasoning summary metadata when switching from Chat to Responses", async () => {
    reply = (_request, attempt) => attempt === 1 ? {
      status: 400,
      body: { error: { message: "Model is not accessible via the /chat/completions endpoint" } },
    } : null;
    const sent = await dispatch(localExecutor(new GithubExecutor()), "gpt-5.4", {
      model: "gpt-5.4", messages: messages(), max_completion_tokens: 2048,
      reasoning_effort: "high", reasoning: { summary: "detailed" },
    });
    expect(sent).toHaveLength(2);
    expect(requests.map(request => request.path)).toEqual([
      "/github/chat/completions", "/github/responses",
    ]);
    expect(sent[1].reasoning).toEqual({ effort: "high", summary: "detailed" });
    expect(sent[1].max_output_tokens).toBe(2048);
    expect(sent[1]).not.toHaveProperty("reasoning_effort");
  });
});

describe("Kiro documented native controls survive final KAS serialization", () => {
  // https://kiro.dev/docs/models/effort/ documents native GPT none/max and
  // Claude disabled/between_tools plus summarized/omitted independently of effort.
  it.each([
    [FORMATS.OPENAI, { reasoning_effort: "none" }, "none"],
    [FORMATS.OPENAI, { thinking: false }, "none"],
    [FORMATS.OPENAI, { reasoning: "high" }, "high"],
    [FORMATS.OPENAI_RESPONSES, { reasoning: { effort: "off" } }, "none"],
    [FORMATS.CLAUDE, { thinking: { type: "disabled" } }, "none"],
    [FORMATS.OPENAI_RESPONSES, { reasoning: { effort: "max" } }, "max"],
  ])("maps %s %j to native GPT effort %s instead of silently choosing upstream high", async (source, controls, effort) => {
    const body = source === FORMATS.OPENAI_RESPONSES
      ? { input: "Reply briefly.", max_output_tokens: 2048, ...controls }
      : { messages: messages(), max_tokens: 2048, ...controls };
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), source, FORMATS.KIRO, "gpt-5.6-sol", body);
    expect(sent.additionalModelRequestFields).toEqual({ reasoning: { effort } });
    expect(sent.inferenceConfig.maxTokens).toBe(2048);
    expect(kiroText(sent)).not.toContain("<thinking_mode>");
    expect(sent).not.toHaveProperty("reasoning");
    expect(sent).not.toHaveProperty("thinking");
  });

  it("sends native Claude disabled without inventing adaptive thinking or prompt activation", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-4.6", {
      messages: messages(), max_tokens: 2048, thinking: { type: "disabled" },
    });
    expect(sent.additionalModelRequestFields).toEqual({ thinking: { type: "disabled" } });
    expect(sent.inferenceConfig.maxTokens).toBe(2048);
    expect(kiroText(sent)).not.toContain("<thinking_mode>");
  });

  it("keeps Claude disabled independent of the explicit native effort", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-4.6", {
      messages: messages(), max_tokens: 2048,
      thinking: { type: "disabled" }, output_config: { effort: "high" },
    });
    expect(sent.additionalModelRequestFields).toEqual({
      thinking: { type: "disabled" }, output_config: { effort: "high" },
    });
    expect(kiroText(sent)).not.toContain("<thinking_mode>");
  });

  it("keeps native Claude visibility when no effort override was requested", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-4.6", {
      messages: messages(), max_tokens: 2048, thinking: { type: "adaptive", display: "omitted" },
    });
    expect(sent.additionalModelRequestFields).toEqual({ thinking: { type: "adaptive", display: "omitted" } });
    expect(sent.inferenceConfig.maxTokens).toBe(2048);
  });

  it("keeps a numeric prompt budget separate from native Claude output visibility", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-4.6", {
      messages: messages(), max_tokens: 6000,
      thinking: { type: "enabled", budget_tokens: 4096, display: "omitted" },
    });
    expect(sent.additionalModelRequestFields).toEqual({ thinking: { type: "adaptive", display: "omitted" } });
    expect(kiroText(sent)).toContain("<max_thinking_length>4096</max_thinking_length>");
    expect(sent.inferenceConfig.maxTokens).toBe(6000);
  });

  it("retains native omitted visibility while honoring the route suffix effort", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-4.6(low)", {
      messages: messages(), max_tokens: 2048,
      thinking: { type: "adaptive", display: "omitted" }, output_config: { effort: "high" },
    });
    expect(sent.additionalModelRequestFields).toEqual({
      thinking: { type: "adaptive", display: "omitted" }, output_config: { effort: "low" },
    });
    expect(sent.inferenceConfig.maxTokens).toBe(2048);
  });

  it("retains Sonnet 5.5 native between-tools mode rather than activating unrestricted adaptive thinking", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.CLAUDE, FORMATS.KIRO, "claude-sonnet-5.5", {
      messages: messages(), max_tokens: 2048,
      thinking: { type: "between_tools" }, output_config: { effort: "low" },
    });
    expect(sent.additionalModelRequestFields).toEqual({
      thinking: { type: "between_tools" }, output_config: { effort: "low" },
    });
    expect(kiroText(sent)).not.toContain("<thinking_mode>");
  });

  it.each([
    [FORMATS.GEMINI, { contents: googleContents(), generationConfig: { maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 4096, includeThoughts: false } } }],
    [FORMATS.ANTIGRAVITY, { userAgent: "antigravity", request: { contents: googleContents(), generationConfig: { maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 4096, includeThoughts: false } } } }],
    [FORMATS.OPENAI_RESPONSES, { input: "Reply briefly.", max_output_tokens: 6000, reasoning: { max_tokens: 4096, exclude: true } }],
  ])("keeps the exact numeric budget from the %s envelope across its OpenAI pivot", async (source, body) => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), source, FORMATS.KIRO, "claude-sonnet-4.5", body);
    expect(kiroText(sent)).toContain("<max_thinking_length>4096</max_thinking_length>");
    expect(sent.inferenceConfig.maxTokens).toBe(6000);
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("thinkingConfig");
  });

  it("maps a native Google level to Kiro effort without exposing hidden thoughts", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.GEMINI, FORMATS.KIRO, "claude-sonnet-4.6", {
      contents: googleContents(),
      generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low", includeThoughts: false } },
    });
    expect(sent.additionalModelRequestFields).toEqual({
      thinking: { type: "adaptive", display: "omitted" }, output_config: { effort: "low" },
    });
    expect(sent.inferenceConfig.maxTokens).toBe(2048);
  });

  it("does not let a synthetic thinking alias re-enable a Google caller's explicit zero", async () => {
    const [sent] = await translatedDispatch(localExecutor(new KiroExecutor()), FORMATS.GEMINI, FORMATS.KIRO, "claude-sonnet-4.5-thinking", {
      contents: googleContents(), generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(kiroText(sent)).not.toContain("<thinking_mode>");
    expect(sent.inferenceConfig.maxTokens).toBe(2048);
  });
});
