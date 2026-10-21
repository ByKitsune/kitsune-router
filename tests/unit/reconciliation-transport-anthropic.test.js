import { describe, expect, it } from "vitest";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { allowsClaudeManualInterleaving } from "../../open-sse/translator/concerns/thinking.js";

const models = [undefined, "claude-haiku-5-5", "claude-sonnet-4-6", "claude-opus-5-5"];
const interleaved = "interleaved-thinking-2025-05-14";
const codeIdentity = "claude-code-20250219";
const clientBeta = "context-management-2025-06-27";

describe.each([true, false])("native Anthropic API-key product (stream=%s)", stream => {
  it.each(models)("does not mislabel %s as Claude Code while retaining API auth and interleaved thinking", model => {
    const executor = new DefaultExecutor("anthropic");
    const headers = new Headers(executor.buildHeaders({ apiKey: "fixture-api-key" }, stream, undefined, model));
    const flags = headers.get("anthropic-beta").split(",");
    expect(flags).not.toContain(codeIdentity);
    expect(flags).toContain(interleaved);
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("x-api-key")).toBe("fixture-api-key");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("accept")).toBe(stream ? "text/event-stream" : null);
    expect(headers.has("x-app")).toBe(false);
    expect(headers.has("anthropic-dangerous-direct-browser-access")).toBe(false);
  });
});

describe("Anthropic product identity boundaries", () => {
  it("keeps Zen's existing policy of not merging explicit client betas into the native API-key product", () => {
    const headers = new Headers(new DefaultExecutor("anthropic").buildHeaders({
      apiKey: "fixture-api-key",
      rawHeaders: new Headers({ "anthropic-beta": `${clientBeta},${codeIdentity}`, authorization: "Bearer client-fixture" }),
    }, false, undefined, "claude-sonnet-4-6"));
    expect(headers.get("anthropic-beta").split(",")).not.toContain(clientBeta);
    expect(headers.get("anthropic-beta").split(",")).not.toContain(codeIdentity);
    expect(headers.get("x-api-key")).toBe("fixture-api-key");
    expect(headers.has("authorization")).toBe(false);
  });

  it("keeps the retained native interleaved beta effective for supported tool turns without changing their caps", () => {
    const body = { max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 2048 },
      tools: [{ name: "fixture", input_schema: { type: "object", properties: {} } }] };
    const headers = new DefaultExecutor("anthropic").buildHeaders({ apiKey: "fixture" }, false, undefined, "claude-sonnet-4-6", body);
    expect(allowsClaudeManualInterleaving(body, "claude-sonnet-4-6", headers)).toBe(true);
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
    expect(body.max_tokens).toBe(4096);
  });

  it("retains Claude OAuth identity, Bearer auth, and its explicit-client-beta allowlist", () => {
    const headers = new Headers(new DefaultExecutor("claude").buildHeaders({
      accessToken: "fixture-oauth", rawHeaders: { "anthropic-beta": clientBeta },
    }, true, undefined, "claude-sonnet-4-6"));
    expect(headers.get("anthropic-beta").split(",")).toEqual(expect.arrayContaining([
      codeIdentity, "oauth-2025-04-20", interleaved, clientBeta,
    ]));
    expect(headers.get("authorization")).toBe("Bearer fixture-oauth");
    expect(headers.has("x-api-key")).toBe(false);
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("still removes first-party identity at non-Anthropic compatible hosts", () => {
    const executor = new DefaultExecutor("anthropic-compatible-fixture");
    executor.config = { ...executor.config, headers: { "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": `${codeIdentity},${interleaved}`, "X-App": "cli", "Anthropic-Dangerous-Direct-Browser-Access": "true" } };
    const headers = new Headers(executor.buildHeaders({ apiKey: "fixture", providerSpecificData: { baseUrl: "https://anthropic.invalid/v1" } }, true));
    expect(headers.get("anthropic-beta").split(",")).not.toContain(codeIdentity);
    expect(headers.get("anthropic-beta").split(",")).toContain(interleaved);
    expect(headers.has("x-app")).toBe(false);
    expect(headers.has("anthropic-dangerous-direct-browser-access")).toBe(false);
    expect(headers.get("x-api-key")).toBe("fixture");
  });
});
