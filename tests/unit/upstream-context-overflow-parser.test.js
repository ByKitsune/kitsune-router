import { describe, expect, it, vi } from "vitest";
import { FALLBACK_SCOPE } from "../../open-sse/config/errorConfig.js";
import { checkFallbackError, classifyAvailabilityError } from "../../open-sse/services/accountFallback.js";
import { createErrorResult, parseUpstreamError } from "../../open-sse/utils/error.js";

const contextMessage = "Your input exceeds the context window of this model. Please adjust your input and try again.";
const github = { provider: "github" };

function upstream(error, status = 400, headers = {}) {
  return Response.json({ error }, { status, headers });
}

async function classify(error, executor = github, status = 400, headers = {}) {
  const parsed = await parseUpstreamError(upstream(error, status, headers), executor);
  const result = createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed);
  return { parsed, result, body: await result.response.json() };
}

describe("GitHub Copilot structured context errors", () => {
  it("normalizes the observed error without allowing executor overrides or a reset", async () => {
    const parseError = vi.fn(() => ({ status: 429, message: "quota exceeded", resetsAtMs: Date.now() + 60000 }));
    const { parsed, result, body } = await classify({ message: contextMessage, code: "invalid_request_body" }, { ...github, parseError }, 400, { "retry-after": "60", "x-request-id": "req_fixture" });

    expect(parsed).toMatchObject({ statusCode: 400, message: contextMessage, code: "context_length_exceeded", request_id: "req_fixture" });
    expect(parseError).not.toHaveBeenCalled();
    expect(parsed.resetsAtMs).toBeFalsy();
    expect(result.status).toBe(400);
    expect(result.response.headers.get("retry-after")).toBeNull();
    expect(body.error).toMatchObject({ message: contextMessage, type: "invalid_request_error", code: "context_length_exceeded" });
    expect(classifyAvailabilityError(result.status, result.error, result.diagnostics)).toEqual({ statusCode: 400, kind: null });
    expect(checkFallbackError(400, parsed, 0, null, FALLBACK_SCOPE.ACCOUNT)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(checkFallbackError(400, parsed, 0, null, FALLBACK_SCOPE.COMBO)).toEqual({ shouldFallback: true, cooldownMs: 0 });
  });

  it("keeps explicit upstream context diagnostics from any provider", async () => {
    const { parsed, body } = await classify({ message: "Input is too long", type: "invalid_request_error", code: "context_length_exceeded", param: "input" }, { provider: "openai" });
    expect(parsed).toMatchObject({ code: "context_length_exceeded", type: "invalid_request_error", param: "input" });
    expect(body.error).toMatchObject({ code: "context_length_exceeded", type: "invalid_request_error", param: "input" });
  });

  it.each([
    "Your input exceeds the context window of this model.",
    `  ${contextMessage.toUpperCase()}  `,
  ])("accepts known wording with harmless case or whitespace differences", async message => {
    const { parsed } = await classify({ message, type: "invalid_request_error", code: "invalid_request_body", param: "input" });
    expect(parsed).toMatchObject({ code: "context_length_exceeded", type: "invalid_request_error", param: "input" });
  });

  it.each([
    ["different provider", { message: contextMessage, code: "invalid_request_body" }, { provider: "openai" }, 400],
    ["wrong status", { message: contextMessage, code: "invalid_request_body" }, github, 422],
    ["different code", { message: contextMessage, code: "invalid_parameter" }, github, 400],
    ["missing code", { message: contextMessage }, github, 400],
    ["other body validation", { message: "The body has an invalid field", code: "invalid_request_body" }, github, 400],
    ["conflicting quota type", { message: contextMessage, code: "invalid_request_body", type: "rate_limit_error" }, github, 400],
    ["quoted double", { message: `Invalid parameter value: "${contextMessage}"`, code: "invalid_request_body" }, github, 400],
    ["quoted single", { message: `Invalid field '${contextMessage}'`, code: "invalid_request_body" }, github, 400],
    ["quoted backtick", { message: `Invalid value \`${contextMessage}\``, code: "invalid_request_body" }, github, 400],
    ["redaction cannot manufacture a match", { message: `${contextMessage} debug: private`, code: "invalid_request_body" }, github, 400],
  ])("does not rewrite %s", async (_label, error, executor, status) => {
    const { parsed, body } = await classify(error, executor, status);
    expect(parsed.code).toBe(error.code);
    expect(body.error.code).not.toBe("context_length_exceeded");
  });

  it.each([
    `Invalid parameter value: "${contextMessage} quota exhausted; retry in 6 hours"`,
    `Invalid field '${contextMessage} insufficient credits; retry in 6 hours'`,
    `Invalid value \`quota exceeded; retry in 6 hours; ${contextMessage}\``,
    `Invalid body: "${contextMessage} quota exhausted; retry in 6 hours; debug: secret"`,
    `Bad input: '${contextMessage} quota exhausted; retry in 6 hours; debug: secret'`,
    `Bad input: \`${contextMessage} quota exhausted; retry in 6 hours; debug: secret\``,
    `Bad input: api_key=synthetic-secret "${contextMessage} quota exhausted; retry in 6 hours; debug: secret"`,
    `Bad input: "${contextMessage} quota exhausted; retry in 6 hours; api_key=synthetic-secret"`,
    `Bad input: "${contextMessage} quota exhausted; retry in 6 hours; ${"x".repeat(700)}"`,
    `Bad input: "embedded \\"quote\\" ${contextMessage} quota exhausted; retry in 6 hours; debug: secret"`,
    `"${contextMessage} quota exhausted; retry in 6 hours"`,
  ])("does not let quoted rejected values trigger context, quota, cooldown or fallback", async message => {
    const { parsed, result, body } = await classify({ message, code: "invalid_request_body" }, github, 400, { "retry-after": "21600" });
    expect(parsed.resetsAtMs).toBeFalsy();
    expect(result.status).toBe(400);
    expect(body.error.code).toBe("invalid_request_body");
    expect(JSON.stringify(body)).not.toMatch(/synthetic-secret|debug: secret/);
    expect(result.response.headers.get("retry-after")).toBeNull();
    for (const scope of [FALLBACK_SCOPE.ACCOUNT, FALLBACK_SCOPE.COMBO]) {
      expect(checkFallbackError(400, parsed, 0, null, scope)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    }
  });

  it("does not hide real unquoted quota evidence following a complete quoted value", async () => {
    const { result, body } = await classify({ message: 'Rejected input: "ordinary value"; quota exhausted; retry in 30 seconds', code: "invalid_request_body" });
    expect(result.status).toBe(429);
    expect(body.error.code).toBe("rate_limit_exceeded");
  });

  it("keeps quoted rejected values safe when a plain-text diagnostic loses a quote to credential redaction", async () => {
    const message = `Invalid request: "${contextMessage} quota exhausted; retry in 6 hours; api_key=synthetic-secret"`;
    const parsed = await parseUpstreamError(new Response(message, { status: 400, headers: { "retry-after": "60" } }), github);
    const result = createErrorResult(parsed.statusCode, parsed.message, parsed.resetsAtMs, parsed);
    expect(result.status).toBe(400);
    expect(result.response.headers.get("retry-after")).toBeNull();
    expect(JSON.stringify(await result.response.json())).not.toContain("synthetic-secret");
    expect(checkFallbackError(400, parsed, 0, null, FALLBACK_SCOPE.ACCOUNT)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    expect(checkFallbackError(400, parsed, 0, null, FALLBACK_SCOPE.COMBO)).toEqual({ shouldFallback: false, cooldownMs: 0 });
  });

  it("does not identify a plain text or JSON string as a structured provider error", async () => {
    for (const body of [contextMessage, JSON.stringify(contextMessage), JSON.stringify({ message: contextMessage, code: "invalid_request_body" })]) {
      const parsed = await parseUpstreamError(new Response(body, { status: 400 }), github);
      expect(parsed.code).not.toBe("context_length_exceeded");
    }
  });

  it("does not classify a valid-looking prefix of a truncated or incomplete body", async () => {
    const prefix = JSON.stringify({ error: { message: contextMessage, code: "invalid_request_body" } });
    const body = prefix + " ".repeat(8192 - Buffer.byteLength(prefix)) + " trailing data";
    const parsed = await parseUpstreamError(new Response(body, { status: 400 }), github);
    expect(parsed.code).not.toBe("context_length_exceeded");
  });

  it("does not classify a valid-looking diagnostic prefix when the longer accounting body is malformed", async () => {
    const prefix = JSON.stringify({ error: { message: contextMessage, code: "invalid_request_body" } });
    const body = prefix + " ".repeat(8192 - Buffer.byteLength(prefix)) + " trailing data";
    const accounting = vi.fn();
    const parsed = await parseUpstreamError(new Response(body, { status: 400 }), github, accounting);
    expect(parsed.code).not.toBe("context_length_exceeded");
    expect(accounting).toHaveBeenCalledExactlyOnceWith(null, { complete: true, uncertain: true });
  });
});
