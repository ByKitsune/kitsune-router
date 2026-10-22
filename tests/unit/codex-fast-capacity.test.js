import { describe, expect, it } from "vitest";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

function streamFromText(text) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe("Codex fast tier and capacity handling", () => {
  it("keeps supported reasoning independent from the selected fast tier", () => {
    const body = new CodexExecutor().transformRequest("gpt-6-astra", {
      model: "gpt-6-astra", input: "hi", reasoning_effort: "max", service_tier: "fast",
    }, true, {});
    expect(body.service_tier).toBe("priority");
    expect(body.reasoning.effort).toBe("max");
  });

  it("uses ChatGPT workspace header fallback", () => {
    const executor = new CodexExecutor();
    const headers = executor.buildHeaders({
      accessToken: "token",
      connectionId: "conn_1",
      providerSpecificData: { chatgptAccountId: "acct_1" },
    });

    expect(headers["ChatGPT-Account-ID"]).toBe("acct_1");
  });

  it("classifies 200-SSE model capacity as account fallback", async () => {
    const executor = new CodexExecutor();
    const response = new Response(streamFromText([
      "event: error",
      'data: {"error":{"message":"Selected model is at capacity. Please try a different model."}}',
      "",
    ].join("\n")), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const peek = await executor._peekSseTransientError(response);
    expect(peek.accountFallback).toBe(true);
    expect(peek.message).toBe("Selected model is at capacity. Please try a different model.");
  });

  it("reassembles normal SSE after peeking", async () => {
    const executor = new CodexExecutor();
    const text = [
      "event: response.output_text.delta",
      'data: {"type":"response.output_text.delta","delta":"OK"}',
      "",
    ].join("\n");
    const response = new Response(streamFromText(text), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const peek = await executor._peekSseTransientError(response);
    expect(peek.matched).toBeNull();
    await expect(new Response(peek.replacementBody).text()).resolves.toBe(text);
  });
});

describe("Codex reasoning normalization", () => {
  it.each([
    ["gpt-5.6-sol", "max", "max"],
    ["gpt-5.6-terra", "max", "max"],
    ["gpt-5.6-luna", "max", "max"],
  ])("normalizes %s effort %s to %s", (model, effort, expected) => {
    const body = new CodexExecutor().transformRequest(model, {
      model,
      input: "hi",
      reasoning: { effort },
    }, true, {});

    expect(body.reasoning.effort).toBe(expected);
  });

  it.each(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-6.1-sol", "gpt-6-luna", "gpt-5.6-luna"])("rejects unsupported %s Ultra instead of remapping it", model => {
    expect(() => new CodexExecutor().transformRequest(model, { model, input: "hi", reasoning: { effort: "ultra" } }, true, {}))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning.effort" }));
  });

  it("resolves review models before applying the reasoning matrix", () => {
    const body = new CodexExecutor().transformRequest("gpt-5.6-luna-review", {
      model: "gpt-5.6-luna-review",
      input: "hi",
      reasoning_effort: "max",
    }, true, {});

    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning.effort).toBe("max");
  });
});
