import { describe, expect, it, vi } from "vitest";
import { buildErrorBody, createErrorResult, errorResponse, parseUpstreamError, unavailableResponse, writeStreamError } from "../../open-sse/utils/error.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { handleComboChat } from "../../open-sse/services/combo.js";
import { sanitizeErrorResponse } from "../../src/sse/utils/requestCorrelation.js";
import { sanitizeClientError } from "../../open-sse/utils/clientErrors.js";

const safeId = /^[A-Za-z0-9._:-]{1,128}$/;
const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

function expectContract(error) {
  expect(error).toMatchObject({ message: expect.any(String), type: expect.any(String), code: expect.any(String), request_id: expect.stringMatching(safeId) });
  for (const field of ["message", "type", "code", "request_id"]) expect(error[field].length).toBeGreaterThan(0);
  expect(error).not.toHaveProperty("debug");
  expect(error).not.toHaveProperty("stack");
}

async function combo(failures) {
  const handleSingleModel = vi.fn();
  for (const failure of failures) handleSingleModel.mockResolvedValueOnce(failure);
  const response = await handleComboChat({ body: { messages: [] }, models: failures.map((_, index) => `fixture/model-${index}`), comboName: "public-error-contract", comboStrategy: "fallback", autoSwitch: false, handleSingleModel, log });
  return { response, handleSingleModel };
}

describe("uniform public inference error bodies", () => {
  it.each([400, 401, 404, 429, 503])("includes safe correlation and a string code for HTTP %i without upstream diagnostics", async status => {
    const response = errorResponse(status);
    const { error } = await response.json();
    expectContract(error);
    expect(response.headers.get("x-request-id")).toBe(error.request_id);
  });

  it.each([400, 401, 404, 429, 503])("normalizes string, numeric and missing diagnostic shapes on HTTP %i", async status => {
    for (const payload of [{ error: "The request could not be completed" }, { error: { message: "Invalid request", code: status } }, { error: {} }, { message: "Invalid request", code: null }, null]) {
      const response = await sanitizeErrorResponse(Response.json(payload, { status }), "req_public_fixture");
      const { error } = await response.json();
      expectContract(error);
      expect(error.request_id).toBe("req_public_fixture");
      expect(response.headers.get("x-request-id")).toBe(error.request_id);
      if (typeof payload?.error === "string") expect(error.message).toBe(payload.error);
      if (typeof payload?.error?.code === "number") expect(error.code).toBe(String(status));
    }
  });

  it("does not trust malformed correlation IDs or diagnostic objects", async () => {
    const response = await sanitizeErrorResponse(Response.json({ error: { message: "Bad request", type: { debug: "private" }, code: {}, request_id: "Bearer private-token", param: "/root/private/settings.json" } }, { status: 400 }), "req_bad\r\nX-Private: injected");
    const { error } = await response.json();
    expectContract(error);
    expect(error.type).toBe("invalid_request_error");
    expect(error.code).toBe("bad_request");
    expect(error).not.toHaveProperty("param");
    expect(response.headers.get("x-request-id")).toBe(error.request_id);
    expect(JSON.stringify(error)).not.toMatch(/private|injected|root/);
  });

  it("keeps precise local parameter and minimum-budget guidance", () => {
    const message = "Thinking budget 32 is below the minimum 1024; increase max_tokens or reduce reasoning effort.";
    const { error } = buildErrorBody(400, message, { type: "invalid_request_error", code: "invalid_thinking_budget", param: "thinking.budget_tokens" });
    expectContract(error);
    expect(error).toMatchObject({ message, code: "invalid_thinking_budget", param: "thinking.budget_tokens" });
  });

  it("redacts credentials, private paths and debugging payloads without hiding the actionable parameter", async () => {
    const upstream = Response.json({ error: { message: "Invalid temperature: must be <= 2; api_key=synthetic-private-key; account private@example.test; path /root/private/config.json; C:\\Users\\private\\settings.json; debug: hidden-payload", type: "invalid_request_error", code: "invalid_parameter", param: "temperature", debug: { token: "other-private-token" } } }, { status: 400 });
    const parsed = await parseUpstreamError(upstream);
    const response = await sanitizeErrorResponse(createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed).response);
    const { error } = await response.json();
    expectContract(error);
    expect(error.message).toContain("temperature");
    expect(error.message).toContain("<= 2");
    expect(JSON.stringify(error)).not.toMatch(/synthetic-private-key|private@example|root\/private|Users|hidden-payload|other-private-token/);
  });

  it("retains useful constraints even when an upstream names an internal provider", () => {
    const error = sanitizeClientError({ message: "Anthropic rejected temperature: it must be <= 1", code: "invalid_parameter", param: "temperature" }, { status: 400 });
    expectContract(error);
    expect(error.message).toContain("temperature");
    expect(error.message).toContain("<= 1");
    expect(error.message).not.toMatch(/anthropic/i);
  });

  it.each([
    'reasoning_effort must be low, medium or high\nFile "/sgl-workspace/sglang/python/entrypoints/http_server.py", line 1354, in handle_request\nPOST /v1/chat/completions private-debug-payload',
    'reasoning_effort must be low, medium or high    File "/custom-runtime/app/server.py", line 42, in handle_request private-debug-payload',
    'reasoning_effort must be low, medium or high\nTraceback (most recent call last):\n  File "/custom-runtime/app/server.py", line 42, in handle_request\nprivate-debug-payload',
    `reasoning_effort must be low, medium or high\n  File "/custom-runtime/owner's-app/server.py", line 42, in handle_request\nprivate-debug-payload`,
    `reasoning_effort must be low, medium or high    File "/custom-runtime/owner's-app/server.py", line 42, in handle_request private-debug-payload`,
    `reasoning_effort must be low, medium or high\n  File '/custom-runtime/app/server.py', line 42, in handle_request\nprivate-debug-payload`,
    'reasoning_effort must be low, medium or high\n  File "/custom-runtime/server.py", line 42\n    private_debug_payload =\nSyntaxError: invalid syntax',
    'reasoning_effort must be low, medium or high\r\n  File "server.py", line 42\r\n    private_debug_payload =\r\nSyntaxError: invalid syntax',
  ])("removes Python traceback frames while retaining validation guidance", async message => {
    const parsed = await parseUpstreamError(Response.json({ error: {
      message, type: "invalid_request_error", code: "invalid_parameter", param: "reasoning_effort",
    } }, { status: 400 }));
    const response = await sanitizeErrorResponse(createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed).response, "req_trace_fixture");
    const { error } = await response.json();
    expectContract(error);
    expect(error.message).toBe("reasoning_effort must be low, medium or high");
    expect(error.param).toBe("reasoning_effort");
    expect(error.code).toBe("invalid_parameter");
    expect(error.request_id).toBe(response.headers.get("x-request-id"));
    expect(JSON.stringify(error)).not.toMatch(/sgl-workspace|custom-runtime|server\.py|1354|handle_request|private[-_]debug[-_]payload|Traceback|SyntaxError/);
    expect(parsed.resetsAtMs).toBeFalsy();

    const chunks = [];
    await writeStreamError({ write: async bytes => chunks.push(bytes) }, 400, message);
    const frame = Buffer.concat(chunks).toString("utf8").trim();
    const streamed = JSON.parse(frame.slice("data: ".length));
    expectContract(streamed.error);
    expect(streamed.error.message).toBe("reasoning_effort must be low, medium or high");
  });

  it.each([
    'file_name must end in ".pdf"; maximum 1354 lines.',
    'Invalid input file "batch.jsonl", line 42, in field "messages": expected an array.',
    'File "batch.jsonl", line 42, in record 3 must contain messages as an array.',
    'Invalid input:\nFile "batch.jsonl", line 42, in field "messages": expected an array.',
    'File "batch.jsonl", line 42\nmust contain messages as an array.',
    'File "validator.py", line 42, in field "messages": expected an array.',
  ])("does not confuse ordinary file and line-count guidance with a traceback: %s", message => {
    expect(buildErrorBody(400, message, { code: "invalid_parameter", param: "file_name" }).error)
      .toMatchObject({ message: message.replaceAll("\n", " "), code: "invalid_parameter", param: "file_name" });
  });

  it.each([
    "Invalid API key: opaque-credential-value; account id: tenant-identifier",
    "Invalid API key provided: opaque-credential-value; access token=opaque-access-value; refresh token: opaque-refresh-value",
    "Invalid temperature: must be <= 2; client secret: opaque-client-value; connection id: private-connection; project id=private-project",
    "Invalid request; API   key is opaque-credential-value; account   id=tenant-identifier; access token: opaque-access-value",
  ])("redacts whitespace-separated credential and account labels: %s", async message => {
    for (const upstream of [new Response(message, { status: 400 }), Response.json({ error: { message } }, { status: 400 })]) {
      const parsed = await parseUpstreamError(upstream);
      const result = createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed);
      const { error } = await result.response.json();
      expectContract(error);
      expect(JSON.stringify(error)).not.toMatch(/opaque-(?:credential|access|refresh|client)-value|tenant-identifier|private-connection|private-project/);
      if (message.includes("temperature")) {
        expect(error.message).toContain("temperature");
        expect(error.message).toContain("<= 2");
      }
    }
  });

  it("extracts bounded actionable plain-text errors, not HTML or arbitrary debug blobs", async () => {
    const parsed = await parseUpstreamError(new Response("Invalid request: max_tokens must be at least 1", { status: 400 }));
    expect(parsed.message).toBe("Invalid request: max_tokens must be at least 1");
    for (const body of ["<html><body>private gateway trace</body></html>", "x".repeat(8192), "Traceback: /root/private.py Bearer secret"]) {
      const rejected = await parseUpstreamError(new Response(body, { status: 400 }));
      expect(rejected.message).toBe("Bad request");
    }
  });

  it("normalizes unavailable responses and omits malformed reset dates", async () => {
    for (const reset of ["soon", "30", "", null]) {
      const response = unavailableResponse(503, "Temporarily unavailable", reset, "");
      expectContract((await response.json()).error);
      expect(response.headers.get("retry-after")).toBeNull();
    }
  });
});

describe("evidence-scoped quota and model errors", () => {
  it.each([
    [400, "You have insufficient credits to make this request", {}, 503],
    [400, "Quota exhausted. Try again in 60 seconds", {}, 429],
    [403, "Your usage limit for your plan has been reached", {}, 429],
    [404, "Quota exceeded for this account; retry in 60 seconds", {}, 429],
    [400, "Request rejected", { code: "usage_limit_reached" }, 429],
    [503, "The service is temporarily at capacity", {}, 503],
    [400, "max_tokens exceeds this model's output capacity", {}, 400],
    [404, "Unknown model", { code: "model_not_found" }, 404],
    [410, "The requested model has been retired", { code: "model_retired" }, 410],
  ])("classifies HTTP %i %s as %i only with matching evidence", async (status, message, diagnostics, expected) => {
    const result = createErrorResult(status, message, undefined, diagnostics);
    expect(result.status).toBe(expected);
    expect(result.response.status).toBe(expected);
    expectContract((await result.response.json()).error);
    if (/retry|try again/i.test(message)) expect(Number(result.response.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
    else expect(result.response.headers.get("retry-after")).toBeNull();
  });

  it("uses a genuine reset for quota but not an unrelated request/model failure", () => {
    const reset = Date.now() + 60000;
    const quota = createErrorResult(400, "Quota exhausted", reset);
    expect(quota.status).toBe(429);
    expect(Number(quota.response.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
    for (const [status, message] of [[400, "messages must be an array; retry in 60 seconds"], [404, "Unknown model; retry in 60 seconds"], [410, "Model has been retired"]]) {
      const response = createErrorResult(status, message, reset).response;
      expect(response.status).toBe(status);
      expect(response.headers.get("retry-after")).toBeNull();
      expect(checkFallbackError(status, message).cooldownMs).toBe(0);
    }
  });

  it("does not turn an unrelated Retry-After header into quota or lock a healthy request", () => {
    const response = new Response("{}", { status: 400, headers: { "retry-after": "60" } });
    expect(checkFallbackError(400, "messages must be an array", 0, response)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(checkFallbackError(404, "Unknown model", 0, response).cooldownMs).toBe(0);
  });

  it.each([
    "Invalid role 'rate_limit retry in 6 hours'",
    "Invalid parameter: rate limit exceeded; retry in 6 hours",
    "Unsupported parameter 'usage_limit_reached'; retry in 6 hours",
    "Invalid value for role: quota exhausted; retry in 6 hours",
    "Expected one of system, user, assistant; received 'quota exhausted retry in 6 hours'",
  ])("never promotes echoed request validation to an account fault: %s", async message => {
    const upstream = Response.json({ error: { message, type: "invalid_request_error", code: "invalid_parameter" } }, { status: 400, headers: { "retry-after": "21600" } });
    const parsed = await parseUpstreamError(upstream);
    const result = createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed);
    expect(result.status).toBe(400);
    expect(result.response.headers.get("retry-after")).toBeNull();
    expect(parsed.resetsAtMs).toBeFalsy();
    for (const scope of ["account", "combo"]) {
      expect(checkFallbackError(400, { message, code: "invalid_parameter", type: "invalid_request_error" }, 0, upstream, scope)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    }
    const attempted = await combo([result.response, errorResponse(503, "Temporarily unavailable")]);
    expect(attempted.response.status).toBe(400);
    expect(attempted.response.headers.get("retry-after")).toBeNull();
    expect(attempted.handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it.each([{ code: "usage_limit_reached" }, { code: "rate_limit_exceeded" }, { type: "rate_limit_error" }, { type: "RESOURCE_EXHAUSTED" }])("preserves exact typed quota evidence without mining arbitrary message tokens: %j", async diagnostics => {
    const upstream = Response.json({ error: { message: "Request rejected", ...diagnostics } }, { status: 400, headers: { "retry-after": "21600" } });
    const parsed = await parseUpstreamError(upstream);
    const result = createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed);
    expect(result.status).toBe(429);
    expect(Number(result.response.headers.get("retry-after"))).toBeGreaterThanOrEqual(21599);
    expect(checkFallbackError(400, { message: "Request rejected", ...diagnostics }, 0, upstream).shouldFallback).toBe(true);
  });

  it("recognizes an explicit RESOURCE_EXHAUSTED type on a numeric upstream 404", async () => {
    const upstream = Response.json({ error: { code: 404, status: "RESOURCE_EXHAUSTED", message: "Request rejected" } }, { status: 404, headers: { "retry-after": "120" } });
    const parsed = await parseUpstreamError(upstream);
    const result = createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed);
    expect(result.status).toBe(429);
    expect(Number(result.response.headers.get("retry-after"))).toBeGreaterThanOrEqual(119);
  });

  it("does not treat bare quota-code substrings as quota evidence", () => {
    for (const message of ["Rejected value rate_limit", "Field contains usage_limit_reached", "Unknown enum rate_limit_error", "Quota field is invalid"]) {
      const result = createErrorResult(400, message);
      expect(result.status).toBe(400);
      expect(result.response.headers.get("retry-after")).toBeNull();
      expect(checkFallbackError(400, message)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    }
  });

  it("preserves the latest error status and body together instead of combining first status with last body", async () => {
    const { response } = await combo([errorResponse(429, "Rate limit exceeded"), errorResponse(404, "Unknown model", { code: "model_not_found" })]);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("model_not_found");
  });

  it("keeps Retry-After headers through exhausted combo members without requiring a private JSON date", async () => {
    const { response, handleSingleModel } = await combo([errorResponse(429, "Quota exceeded", {}, 90), errorResponse(503, "Temporarily unavailable", {}, 120)]);
    expect(response.status).toBe(503);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(89);
    expect(Number(response.headers.get("retry-after"))).toBeLessThanOrEqual(90);
    expectContract((await response.json()).error);
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("keeps a true unknown-model 404 even after every combo member fails", async () => {
    const { response } = await combo([errorResponse(404, "Unknown model", { code: "model_not_found" }), errorResponse(404, "No such model", { code: "model_not_found" })]);
    expect(response.status).toBe(404);
    expectContract((await response.json()).error);
    expect(response.headers.get("retry-after")).toBeNull();
  });
});
