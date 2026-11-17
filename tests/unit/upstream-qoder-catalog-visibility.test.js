import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));

let catalog;
beforeEach(async () => {
  vi.resetModules();
  io.fetch.mockReset();
  catalog = await import("../../open-sse/services/qoderModels.js");
});

const credentials = provider => ({
  provider, accessToken: `synthetic-${provider}-token`,
  providerSpecificData: { userId: `synthetic-${provider}-user` },
});

describe("Qoder provider-returned model visibility", () => {
  it.each(["qoder", "qoder-cn"])("retains UI-disabled executable entries and exact upstream names for %s", async provider => {
    const row = { key: "qmodel_latest", display_name: "Qwen4-Max-Preview", enable: false,
      max_input_tokens: "2048", max_output_tokens: 512, is_reasoning: true,
      native_config: { opaque: "unchanged" } };
    io.fetch.mockResolvedValue(Response.json({ chat: [
      { key: "visible", display_name: "Visible model", enable: true }, row,
    ] }));
    const auth = credentials(provider);
    const result = await catalog.resolveQoderModels(auth);
    expect(result.models).toEqual([
      expect.objectContaining({ id: "visible", name: "Visible model" }),
      expect.objectContaining({ id: "qmodel_latest", name: "Qwen4-Max-Preview",
        maxInputTokens: 2048, maxOutputTokens: 512, isReasoning: true, isVL: false }),
    ]);
    expect(await catalog.getQoderModelConfig(auth, row.key)).toEqual(row);
    expect(io.fetch).toHaveBeenCalledOnce();
  });

  it("refreshes an existing model's upstream name without retaining caller mutation", async () => {
    const row = { key: "qmodel_latest", enable: false, max_input_tokens: null };
    io.fetch.mockResolvedValueOnce(Response.json({ chat: [{ ...row, display_name: "Prior display" }] }))
      .mockResolvedValueOnce(Response.json({ chat: [{ ...row, display_name: "Current display" }] }));
    const auth = credentials("qoder");
    const first = await catalog.resolveQoderModels(auth);
    expect(first.models[0]?.name).toBe("Prior display");
    first.models[0].name = "Caller-local name";
    const current = await catalog.resolveQoderModels(auth, { forceRefresh: true });
    expect(current.models[0]).toMatchObject({ id: row.key, name: "Current display" });
    expect(current.models[0]).not.toHaveProperty("maxInputTokens");
    expect(current.models[0]).not.toHaveProperty("contextWindow");
    expect((await catalog.resolveQoderModels(auth)).models[0].name).toBe("Current display");
  });
});
