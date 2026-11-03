import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

setCatalogSource(null);

describe("Antigravity protocol and capability alignment", () => {
  it("caps Claude models on Antigravity to Google's bridge limits (250k ctx, 64k out, no pdf)", () => {
    for (const model of ["claude-sonnet-4-6", "claude-opus-4-6-thinking"]) {
      const caps = getCapabilitiesForModel("antigravity", model);
      expect(caps).toMatchObject({
        contextWindow: 250000,
        maxOutput: 64000,
        pdf: false,
        vision: true,
      });
    }
  });

  it("reports gemini-3-flash on Antigravity as a thinking-capable model", () => {
    const caps = getCapabilitiesForModel("antigravity", "gemini-3-flash");
    expect(caps.reasoning).toBe(true);
  });

  it("places functionResponse under role: 'user' for Gemini models on Antigravity", () => {
    const ex = new AntigravityExecutor();
    const req = {
      request: {
        contents: [
          {
            role: "user",
            parts: [{ functionResponse: { name: "get_weather", response: { result: "sunny" } } }],
          },
        ],
      },
    };
    const transformed = ex.transformRequest("gemini-3.8-flash-high", req, false, {});
    const parts = transformed.request.contents[0];
    expect(parts.role).toBe("user");
  });

  it("ensures a request ending with a model turn receives a trailing user turn", () => {
    const ex = new AntigravityExecutor();
    const req = {
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
          {
            role: "model",
            parts: [{ text: "Hi there" }],
          },
        ],
      },
    };
    const transformed = ex.transformRequest("gemini-3.8-flash-high", req, false, {});
    const contents = transformed.request.contents;
    expect(contents.at(-1).role).toBe("user");
    expect(contents.at(-1).parts[0].text).toBe("Continue.");
  });

  it("places functionResponse under role: 'user' for Claude models on Antigravity", () => {
    const ex = new AntigravityExecutor();
    const req = {
      request: {
        contents: [
          {
            role: "user",
            parts: [{ functionResponse: { name: "get_weather", response: { result: "sunny" } } }],
          },
        ],
      },
    };
    const transformed = ex.transformRequest("claude-sonnet-4-6", req, false, {});
    const parts = transformed.request.contents[0];
    expect(parts.role).toBe("user");
  });

  it("preserves Google's literal skip_thought_signature_validator sentinel untouched", () => {
    const ex = new AntigravityExecutor();
    const req = {
      request: {
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "bash",
                  args: { command: "ls" },
                  thoughtSignature: "skip_thought_signature_validator",
                },
              },
            ],
          },
        ],
      },
    };
    const transformed = ex.transformRequest("gemini-3.8-flash-high", req, false, {});
    const part = transformed.request.contents[0].parts[0];
    expect(part.thoughtSignature).toBe("skip_thought_signature_validator");
    expect(part.functionCall.thoughtSignature).toBeUndefined();
  });
});
