import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ connection: null, fetch: vi.fn(), refreshKiro: vi.fn(), persist: vi.fn() }));
vi.mock("@/models", () => ({ getProviderConnectionById: async () => io.connection }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: async () => ({ strictProxy: true, vercelRelayUrl: "https://synthetic-relay.invalid" }),
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("open-sse/services/tokenRefresh.js", () => ({ refreshKiroToken: io.refreshKiro }));
vi.mock("@/sse/services/tokenRefresh", () => ({
  refreshGoogleToken: vi.fn(), refreshCodexToken: vi.fn(), updateProviderCredentials: io.persist,
}));

import { GET } from "@/app/api/providers/[id]/models/route.js";
import { clearProviderLiveModelsCache } from "@/shared/utils/providerLiveModels.js";
import { clearCursorModelCache } from "open-sse/services/cursorModels.js";
import { clearKiroModelCache } from "open-sse/services/kiroModels.js";
import { clearQoderCatalog } from "open-sse/services/qoderModels.js";
import { clearKimchiCatalog } from "open-sse/services/kimchiModels.js";

const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const clear = () => {
  clearProviderLiveModelsCache(); clearCursorModelCache(); clearKiroModelCache(); clearQoderCatalog(); clearKimchiCatalog();
};

beforeEach(() => {
  clear();
  vi.clearAllMocks();
  io.fetch.mockImplementation(async () => Response.json({ models: [{ modelId: "synthetic-kiro-model" }] }));
  io.refreshKiro.mockResolvedValue({ accessToken: "synthetic-fresh-token", refreshToken: "synthetic-fresh-refresh" });
  io.persist.mockResolvedValue(undefined);
});
afterEach(() => { clear(); vi.restoreAllMocks(); });

function select(provider, id = "synthetic-connection") {
  io.connection = {
    id, provider, accessToken: "synthetic-access-token", refreshToken: "synthetic-refresh-token",
    ...(provider === "claude" || provider === "kimchi" ? { apiKey: "synthetic-api-key" } : {}),
    providerSpecificData: { userId: "synthetic-user", machineId: "synthetic-machine" },
  };
  return io.connection;
}

const dispatch = signal => GET({ nextUrl: new URL("http://localhost/api/providers/synthetic-connection/models"), signal }, {
  params: Promise.resolve({ id: io.connection.id }),
});

describe("dashboard model lookup preserves the real request cancellation boundary", () => {
  it.each(["cursor", "kiro", "qoder", "claude", "kimchi"])("does not dispatch an already cancelled %s lookup", async provider => {
    select(provider);
    const controller = new AbortController();
    controller.abort(new Error("synthetic-caller-stopped"));
    const response = await dispatch(controller.signal);
    expect(io.fetch).not.toHaveBeenCalled();
    expect(io.refreshKiro).not.toHaveBeenCalled();
    expect(io.persist).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
  });

  it.each(["cursor", "kiro", "qoder", "claude"])("cancels a stalled %s body when the dashboard request disconnects", async provider => {
    select(provider);
    let source, headersArrived;
    const arrived = new Promise(resolve => { headersArrived = resolve; });
    const cancel = vi.fn();
    io.fetch.mockImplementationOnce(async () => {
      const response = new Response(new ReadableStream({ start(controller) { source = controller; }, cancel }));
      headersArrived();
      return response;
    });
    const controller = new AbortController();
    const pending = dispatch(controller.signal);
    await arrived;
    await flush();
    controller.abort(new Error("synthetic-caller-stopped-during-body"));
    try {
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1), { timeout: 150 });
      expect((await pending).status).toBe(500);
      expect(io.fetch).toHaveBeenCalledTimes(1);
      expect(io.persist).not.toHaveBeenCalled();
    } finally {
      try { source.close(); } catch { /* the request already cancelled the source */ }
      await pending;
    }
  });

  it("does not persist a Kiro refresh completed after the dashboard caller cancelled", async () => {
    select("kiro");
    const controller = new AbortController();
    io.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    io.refreshKiro.mockImplementationOnce(async () => {
      controller.abort(new Error("synthetic-cancel-during-refresh"));
      return { accessToken: "synthetic-fresh-token", refreshToken: "synthetic-fresh-refresh" };
    });
    expect((await dispatch(controller.signal)).status).toBe(500);
    expect(io.persist).not.toHaveBeenCalled();
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not mutate the selected Kiro connection or retry after cancellation during an existing credential commit", async () => {
    const connection = select("kiro");
    const controller = new AbortController();
    io.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    io.persist.mockImplementationOnce(async () => { controller.abort(new Error("synthetic-cancel-during-commit")); });
    expect((await dispatch(controller.signal)).status).toBe(500);
    expect(io.persist).toHaveBeenCalledTimes(1);
    expect(connection.accessToken).toBe("synthetic-access-token");
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it("passes the selected Kiro connection identity into catalog cache scoping", async () => {
    select("kiro", "synthetic-first-connection");
    await dispatch();
    select("kiro", "synthetic-second-connection");
    await dispatch();
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("dashboard model lookup keeps native directional limits", () => {
  it("preserves Kiro input/output limits without turning them into a combined context", async () => {
    select("kiro");
    io.fetch.mockResolvedValueOnce(Response.json({ models: [{
      modelId: "native-directional-model", tokenLimits: { maxInputTokens: 123456, maxOutputTokens: 7890 },
    }] }));
    const response = await dispatch();
    expect(response.status).toBe(200);
    const { models } = await response.json();
    expect(models).toHaveLength(4);
    for (const model of models) {
      expect(model).toMatchObject({ maxInputTokens: 123456, maxOutputTokens: 7890,
        capabilities: { maxInput: 123456, maxOutput: 7890 } });
      expect(model).not.toHaveProperty("contextLength");
    }
  });

  it.each([true, false])("preserves Qoder directional limits and absence (declared=%s)", async declared => {
    select("qoder");
    io.fetch.mockResolvedValueOnce(Response.json({ chat: [{ key: "native-directional-model", enable: true,
      ...(declared ? { max_input_tokens: 123456, max_output_tokens: 7890 } : {}),
    }] }));
    const response = await dispatch();
    expect(response.status).toBe(200);
    const { models } = await response.json();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("qoder/native-directional-model");
    expect(models[0]).not.toHaveProperty("contextLength");
    if (declared) expect(models[0]).toMatchObject({ maxInputTokens: 123456, maxOutputTokens: 7890 });
    else {
      expect(models[0]).not.toHaveProperty("maxInputTokens");
      expect(models[0]).not.toHaveProperty("maxOutputTokens");
    }
  });
});
