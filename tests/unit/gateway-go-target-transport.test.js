// Offline routing matrix for opencode-go models.
//
// Drives the REAL handleChatCore guard + targetFormat resolution (open-sse/handlers/chatCore.js:86-94)
// end-to-end; only the executor's HTTP response is mocked. The assertion target is
// credentials.runtimeTransport — the exact field DefaultExecutor.buildUrl/buildHeaders read
// (open-sse/executors/default.js:106,150) to pick the endpoint and auth scheme — so a wrong
// guard decision shows up as the wrong baseUrl here, same as it would on the wire.
//
// Cells:
//   - deepseek × {openai, claude, openai-responses} × {bare, (max)} — the endpoint matrix
//     under dispute in #3278/#3332. Bare and suffixed cells must resolve identically.
//   - glm/kimi (chat-only) + (max) — regression cells: with the thinking suffix, the guard
//     is bypassed on master (suffix isn't stripped before the registry lookup) and these get
//     routed to /messages, which the upstream does not serve for them.
//   - minimax + (max) + claude — suffix must NOT block a genuinely declared format.
import { describe, it, expect, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({
    noAuth: true,
    execute: executeMock,
  }),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(),
    logConvertedResponse: vi.fn(),
    logError: vi.fn(),
  }),
}));

vi.mock("../../open-sse/utils/stream.js", () => ({
  COLORS: { red: "", reset: "" },
  createPassthroughStreamWithLogger: vi.fn(() => new TransformStream()),
}));

vi.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));

// image.js imports Agent from "undici" (not installed in some dev envs); the
// prefetch path is irrelevant to routing assertions.
vi.mock("../../open-sse/translator/concerns/image.js", () => ({
  encodeDataUri: (mimeType, base64) => `data:${mimeType};base64,${base64}`,
  parseDataUri: (url) => {
    const m = /^data:([^;]+);base64,(.*)$/.exec(url);
    return m ? { mimeType: m[1], base64: m[2] } : null;
  },
  fetchImageAsBase64: async () => null,
}));

const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");

import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels.js";

const pending = [
  ["grok-4.7", "openai-responses", "responses"],
  ["gpt-6-luna", "openai-responses", "responses"],
  ["qwen3.8-max", "claude", "messages"],
  ["qwen3.8-flash", "claude", "messages"],
];
describe("researched Go additions dispatch to documented endpoint", () => {
  for (const [id, target, path] of pending) for (const source of [target, "openai"]) {
    it(`${id} from ${source} builds /${path} with the real executor`, async () => {
      expect(PROVIDER_MODELS["opencode-go"]).toEqual(expect.arrayContaining([expect.objectContaining({ id, targetFormat: target, supportedFormats: [target] })]));
      let captured;
      executeMock.mockImplementationOnce(async args => {
        const ex = new DefaultExecutor("opencode-go");
        captured = {
          url: ex.buildUrl(args.model, false, 0, args.credentials),
          headers: ex.buildHeaders(args.credentials, false),
          body: args.body,
        };
        return { response: new Response(JSON.stringify({ error: { message: "offline transport captured" } }), { status: 400, headers: { "content-type": "application/json" } }), ...captured, transformedBody: args.body };
      });
      const body = source === "openai-responses"
        ? { model: id, input: "hi", stream: false }
        : { model: id, messages: [{ role: "user", content: "hi" }], max_tokens: 16, stream: false };
      await handleChatCore({ body, modelInfo: { provider: "opencode-go", model: id },
        credentials: { apiKey: "offline-fixture", providerSpecificData: {} },
        connectionId: "gateway-pending-offline", sourceFormatOverride: source,
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      });
      expect(captured.url).toBe(`https://opencode.ai/zen/go/v1/${path}`);
      if (target === "claude") expect(captured.headers["x-api-key"]).toBe("offline-fixture");
      else expect(captured.headers.Authorization).toBe("Bearer offline-fixture");
      expect(captured.body).toHaveProperty(target === "claude" ? "messages" : "input");
    });
  }
});

describe("native OpenAI Pro endpoint declaration", () => {
  it("translates GPT-5 Pro Chat Completions input onto the Responses-only endpoint", async () => {
    // https://developers.openai.com/api/docs/models/gpt-5-pro.md
    let captured;
    executeMock.mockImplementationOnce(async args => {
      const executor = new DefaultExecutor("openai");
      captured = { url: executor.buildUrl(args.model, false, 0, args.credentials), body: args.body };
      return {
        response: new Response(JSON.stringify({ error: { message: "offline transport captured" } }), { status: 400, headers: { "content-type": "application/json" } }),
        transformedBody: args.body,
      };
    });
    await handleChatCore({
      body: { model: "gpt-5-pro", messages: [{ role: "user", content: "hi" }], max_tokens: 16, stream: false },
      modelInfo: { provider: "openai", model: "gpt-5-pro" },
      credentials: { apiKey: "offline-fixture", providerSpecificData: {} },
      connectionId: "openai-pro-offline", sourceFormatOverride: "openai",
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(captured.url).toBe("https://api.openai.com/v1/responses");
    expect(captured.body).toHaveProperty("input");
    expect(captured.body).not.toHaveProperty("messages");
  });
});
