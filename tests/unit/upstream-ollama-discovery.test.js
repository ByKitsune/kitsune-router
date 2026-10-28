import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ connections: [], customModels: [], aliases: {} }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => db.connections,
  getCombos: async () => [], getCustomModels: async () => db.customModels,
  getModelAliases: async () => db.aliases, getProviderNodes: async () => [],
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));

const { buildModelsList } = await import("../../src/app/api/v1/models/route.js");
const { GET } = await import("../../src/app/api/v1/models/[...model]/route.js");

const ours = (rows) => rows.filter((row) => row.owned_by === "ollama-local").map((row) => row.id);
const kind = async (name) => {
  const response = await GET(new Request(`http://localhost/v1/models/${name}`), { params: Promise.resolve({ model: [name] }) });
  expect(response.status).toBe(200);
  return (await response.json()).data;
};

beforeEach(() => {
  db.connections = [{ provider: "ollama-local", id: "fixture", isActive: true, providerSpecificData: {} }];
  db.customModels = [];
  db.aliases = {};
  vi.stubGlobal("fetch", () => { throw new Error("Network is not used by discovery tests"); });
});
afterEach(() => vi.unstubAllGlobals());

describe("Ollama kind-aware discovery", () => {
  it("advertises Phonon as TTS, never as chat", async () => {
    expect(ours(await kind("tts"))).toContain("ollama-local/phonon");
    expect(ours(await buildModelsList(["llm"]))).not.toContain("ollama-local/phonon");
  });

  it("honors an enabled-model whitelist across kinds", async () => {
    db.connections[0].providerSpecificData.enabledModels = ["phonon:en", "nomic-embed-text", "llama3"];
    expect(ours(await kind("tts"))).toEqual(["ollama-local/phonon:en"]);
    expect(ours(await kind("embedding"))).toEqual(["ollama-local/nomic-embed-text"]);
    expect(ours(await buildModelsList(["llm"]))).toEqual(["ollama-local/llama3"]);
  });

  it("retains an operator-declared custom embedding kind without inferring installation", async () => {
    db.customModels = [{ providerAlias: "ollama-local", id: "private/vector-model", type: "embedding" }];
    expect(ours(await kind("embedding"))).toContain("ollama-local/private/vector-model");
    expect(ours(await buildModelsList(["llm"]))).not.toContain("ollama-local/private/vector-model");
    // Arbitrary installed Ollama tags are not discovered by this static route.
    expect(ours(await kind("embedding"))).not.toContain("ollama-local/nomic-embed-text");
  });

  it("does not advertise Phonon for a disabled or absent connection", async () => {
    db.connections[0].isActive = false;
    expect(ours(await kind("tts"))).toEqual([]);
    db.connections = [];
    expect(ours(await kind("tts"))).toEqual([]);
  });
});
