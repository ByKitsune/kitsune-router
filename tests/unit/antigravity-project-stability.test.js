import { describe, it, expect, vi, afterEach } from "vitest";
import { AntigravityExecutor, resolveAntigravityProjectId } from "../../open-sse/executors/antigravity.js";
import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";

const nativeBody = () => ({ project: "untrusted-caller-project", model: "gemini-2.5-flash", request: { contents: [{ role: "user", parts: [{ text: "hi" }] }] } });

afterEach(() => vi.unstubAllGlobals());

describe("Cloud Code account-bound project identity", () => {
  it("uses only the actual account project and never generates an account binding", () => {
    expect(resolveAntigravityProjectId({ projectId: "real-gcp-project-9" })).toBe("real-gcp-project-9");
    for (const credentials of [undefined, {}, { connectionId: "known" }, { email: "account@example.invalid" }, { projectId: "" }, { projectId: " invalid " }, { projectId: 42 }]) {
      expect(resolveAntigravityProjectId(credentials)).toBeUndefined();
    }
  });

  it.each([AntigravityExecutor, GeminiCLIExecutor])("%s overrides the caller project with the current account binding", Executor => {
    const executor = new Executor();
    const input = nativeBody();
    const before = structuredClone(input);
    const first = executor.transformRequest("gemini-2.5-flash", input, false, { projectId: "actual-account-project" });
    const second = executor.transformRequest("gemini-2.5-flash", input, false, { projectId: "other-account-project" });
    expect(first.project).toBe("actual-account-project");
    expect(second.project).toBe("other-account-project");
    expect(input).toEqual(before);
  });

  it("pure translation leaves missing binding absent without a placeholder", () => {
    const translated = openaiToAntigravityRequest("gemini-2.5-flash", { messages: [{ role: "user", content: "hello" }] }, false, { connectionId: "known" });
    expect(translated.project).toBeUndefined();
    expect(JSON.parse(JSON.stringify(translated))).not.toHaveProperty("project");
  });

  it.each([AntigravityExecutor, GeminiCLIExecutor])("%s rejects unprovisioned accounts before transport", async Executor => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(new Executor().execute({ model: "gemini-2.5-flash", body: nativeBody(), stream: false, credentials: { accessToken: "synthetic-token" } }))
      .rejects.toMatchObject({ code: "provider_project_required", param: "project" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([AntigravityExecutor, GeminiCLIExecutor])("%s preserves cancellation before project validation", async Executor => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    controller.abort(reason);
    await expect(new Executor().execute({ model: "gemini-2.5-flash", body: nativeBody(), credentials: {}, signal: controller.signal })).rejects.toBe(reason);
  });
});
