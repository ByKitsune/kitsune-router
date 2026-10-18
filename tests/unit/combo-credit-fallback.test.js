// 9router #4715/#4713: a combo member running out of credits (upstream may
// report it as HTTP 400 "insufficient credits") must fall through to the next
// combo member instead of failing the whole request. An ordinary bad request
// must still stop the combo (the request itself is broken).
import { describe, expect, it, vi } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";

describe("combo credit fallback (#4715)", () => {
  it.each([
    ["You have insufficient credits to make this request.", true],
    ["Bad request", false],
  ])("routes a 400 response correctly: %s", async (message, shouldContinue) => {
    const body = { messages: [{ role: "user", content: "Hello" }] };
    const models = ["cmc/deepseek/deepseek-v4-pro", "mistral/mistral-medium-latest"];
    const expectedStatus = shouldContinue ? 200 : 400;
    // Snapshot the payloads BEFORE the handler: combo.js consumes/clones the
    // returned Response bodies while classifying errors.
    const failurePayload = { error: { message } };
    const successPayload = { choices: [{ message: { content: "Hello" } }] };
    const handleSingleModel = vi.fn()
      .mockResolvedValueOnce(Response.json(failurePayload, { status: 400 }))
      .mockResolvedValueOnce(Response.json(successPayload));

    const response = await handleComboChat({
      body, models, handleSingleModel,
      log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
      comboName: "credit-fallback", comboStrategy: "fallback",
    });

    expect(response.status).toBe(expectedStatus);
    const payload = await response.clone().json().catch(() => null);
    expect(payload).toEqual(shouldContinue ? successPayload : failurePayload);
    expect(handleSingleModel.mock.calls.map((c) => c[1])).toEqual(
      shouldContinue ? models : models.slice(0, 1)
    );
  });
});

describe("model-dependent request failures in a combo", () => {
  it.each([
    { message: "maximum context length exceeded" },
    { message: "The input token count exceeds the maximum number of tokens allowed 1048576." },
    { message: "Input cannot fit this destination", code: "context_length_exceeded" },
    { message: "This destination cannot accept temperature", code: "unsupported_parameter", param: "temperature" },
  ])("advances without rewriting the request for $message", async (error) => {
    const attempted = [];
    const body = { messages: [{ role: "user", content: "Keep the complete history" }], temperature: 0.7 };
    const response = await handleComboChat({
      body,
      models: ["first/small", "second/capable"],
      comboName: "request-scope-fixture",
      comboStrategy: "fallback",
      autoSwitch: false,
      log: { info() {}, warn() {}, debug() {} },
      handleSingleModel: async (request, model) => {
        attempted.push({ model, temperature: request.temperature, messages: request.messages });
        return model === "first/small"
          ? Response.json({ error }, { status: 400 })
          : Response.json({ choices: [{ message: { role: "assistant", content: "Served by the capable destination" }, finish_reason: "stop" }] });
      },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).choices[0].message.content).toBe("Served by the capable destination");
    expect(attempted).toEqual([
      { model: "first/small", temperature: 0.7, messages: [{ role: "user", content: "Keep the complete history" }] },
      { model: "second/capable", temperature: 0.7, messages: [{ role: "user", content: "Keep the complete history" }] },
    ]);
  });

  it.each([
    { status: 400, error: { message: "messages must be an array", code: "invalid_request_error" } },
    { status: 413, error: { message: "Payload too large" } },
    { status: 499, error: { message: "Client disconnected", code: "unsupported_parameter", param: "temperature" } },
    { status: 400, error: { message: "client_aborted: maximum context length exceeded", code: "context_length_exceeded" } },
  ])("stops on a genuine client failure or cancellation: $status $error.message", async ({ status, error }) => {
    const attempted = [];
    const response = await handleComboChat({
      body: { messages: [] },
      models: ["first/small", "second/capable"],
      comboName: "client-error-fixture",
      autoSwitch: false,
      log: { info() {}, warn() {}, debug() {} },
      handleSingleModel: async (_body, model) => {
        attempted.push(model);
        return Response.json({ error }, { status });
      },
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(attempted).toEqual(["first/small"]);
  });
});
