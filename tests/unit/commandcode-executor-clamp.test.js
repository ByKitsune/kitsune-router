// 9router #4691: CommandCode's /alpha/generate upstream schema rejects
// max_tokens above 200000. The translator clamps translated bodies; bodies
// already in CommandCode shape (skipping the translator) get a defensive
// clamp in CommandCodeExecutor.transformRequest.
import { describe, expect, it } from "vitest";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { COMMANDCODE_MAX_OUTPUT_TOKENS } from "../../open-sse/config/runtimeConfig.js";

describe("CommandCodeExecutor defensive max_tokens clamp (#4691)", () => {
  it("clamps an oversized already-CommandCode body", () => {
    const executor = new CommandCodeExecutor();
    const body = { params: { model: "x", messages: [], max_tokens: 384000 } };
    executor.transformRequest("x", body, true, {});
    expect(body.params.max_tokens).toBe(COMMANDCODE_MAX_OUTPUT_TOKENS);
    expect(body.stream).toBe(true);
  });

  it("leaves in-limit values untouched", () => {
    const executor = new CommandCodeExecutor();
    const body = { params: { model: "x", messages: [], max_tokens: 8192 } };
    executor.transformRequest("x", body, true, {});
    expect(body.params.max_tokens).toBe(8192);
  });

  it("does not fabricate max_tokens when absent", () => {
    const executor = new CommandCodeExecutor();
    const body = { params: { model: "x", messages: [] } };
    executor.transformRequest("x", body, true, {});
    expect(body.params.max_tokens).toBeUndefined();
  });

  it("ignores bodies without params", () => {
    const executor = new CommandCodeExecutor();
    const body = { model: "x" };
    const out = executor.transformRequest("x", body, true, {});
    expect(out).toBe(body);
    expect(out.stream).toBe(true);
  });
});
