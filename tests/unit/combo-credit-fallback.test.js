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
