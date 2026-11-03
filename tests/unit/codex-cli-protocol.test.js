import { describe, expect, it } from "vitest";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import codex from "../../open-sse/providers/registry/codex.js";
import { CODEX_CLI_VERSION } from "../../open-sse/config/clientVersions.js";

describe("Codex CLI protocol and registry alignment", () => {
  it("builds compliant headers with session-id, version, and originator", () => {
    const ex = new CodexExecutor();
    const headers = ex.buildHeaders({
      connectionId: "conn_1",
      providerSpecificData: { chatgptAccountId: "acct_456" },
    }, true, null, null, { prompt_cache_key: "ses_test_123" });

    expect(headers["session-id"]).toBe("ses_test_123");
    expect(headers["version"]).toBe(CODEX_CLI_VERSION);
    expect(headers["originator"]).toBe("codex_cli_rs");
    expect(headers["ChatGPT-Account-ID"]).toBe("acct_456");
  });

  it("includes flagship GPT-6 models in Codex registry", () => {
    const ids = codex.models.map((m) => m.id);
    expect(ids).toContain("gpt-6-astra");
    expect(ids).toContain("gpt-6.1-sol");
    expect(ids).toContain("gpt-6-sol");
    expect(ids).toContain("gpt-6-luna");
    expect(ids).toContain("gpt-image-2");
  });

  it("supports full reasoning effort options including minimal, xhigh, max, and ultra", () => {
    expect(codex.thinkingConfig.options).toEqual(
      expect.arrayContaining(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
    );
  });
});
