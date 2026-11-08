import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ rows: [], generation: 0, revision: "import-0", getRow: vi.fn(), update: vi.fn(), getSettings: vi.fn() }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async ({ provider, isActive } = {}) => fixture.rows.filter(row => (!provider || row.provider === provider) && (!isActive || row.isActive)).map(row => structuredClone(row)),
  getProviderConnectionById: fixture.getRow,
  updateProviderConnection: fixture.update,
  getSettings: fixture.getSettings,
  validateApiKey: async () => false, getProxyPools: async () => [],
}));
vi.mock("@/lib/db/helpers/importGeneration.js", () => ({ getDbImportGeneration: () => fixture.generation }));
vi.mock("@/lib/db/paths.js", () => ({ DATA_FILE: "/synthetic/codex-hints/data.sqlite" }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}), pickProxyPoolId: vi.fn() }));
vi.mock("@/sse/utils/logger.js", () => ({ debug() {}, info() {}, warn() {}, error() {} }));
vi.mock("../../src/sse/services/antigravityQuota.js", () => ({ getAntigravityModelQuota: () => null, getAntigravityQuotaCache: () => null }));

import { captureCodexEntitlementContext, clearAccountError, clearCodexEntitlementDenials, getProviderCredentials, markAccountUnavailable } from "../../src/sse/services/auth.js";
import { CACHE_LIMITS } from "../../open-sse/utils/boundedCache.js";
import { CODEX_ENTITLEMENT_DENIAL_MS } from "../../open-sse/config/errorConfig.js";

const MODEL = "gpt-6-astra";
const cache = () => globalThis[Symbol.for("kitsunerouter.codex-entitlement-denials.v2")];
const denial = model => `The '${model}' model is not supported when using Codex with a ChatGPT account.`;
const row = id => ({ id, provider: "codex", authType: "oauth", accessToken: `synthetic-access-${id}`, refreshToken: `synthetic-refresh-${id}`, idToken: `synthetic-id-${id}`, apiKey: `synthetic-key-${id}`, isActive: true, providerSpecificData: { chatgptAccountId: id } });
function snapshot(connection = fixture.rows[0]) {
  const value = structuredClone(connection);
  Object.defineProperty(value, "_writeFence", { value: { importRevision: fixture.revision } });
  return value;
}
function context(connection = fixture.rows[0], signal) {
  return captureCodexEntitlementContext("codex", snapshot(connection), signal);
}
async function remember(model = MODEL, evidence = denial(model), options = {}) {
  const selected = options.context ?? context();
  return markAccountUnavailable(fixture.rows[0].id, options.status ?? 400, evidence, options.provider ?? "codex", model, null, selected);
}
const choose = (model = MODEL, excluded = new Set(), options) => getProviderCredentials("codex", excluded, model, options);

beforeEach(() => {
  vi.clearAllMocks();
  fixture.rows = [row("a"), row("b")];
  fixture.generation = 0;
  fixture.revision = "import-0";
  fixture.getRow.mockImplementation(async id => fixture.rows.find(value => value.id === id) ? snapshot(fixture.rows.find(value => value.id === id)) : null);
  fixture.update.mockResolvedValue(null);
  fixture.getSettings.mockResolvedValue({ quotaAwareSelection: false, fallbackStrategy: "fill-first" });
  clearCodexEntitlementDenials();
});
afterEach(() => { clearCodexEntitlementDenials(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Codex entitlement hint evidence and bounded scope", () => {
  it.each([
    ["canonical message", denial(MODEL)],
    ["core status prefix", { statusCode: 400, message: `[400]: ${denial(MODEL)}` }],
    ["JSON error envelope", JSON.stringify({ error: { message: denial(MODEL) } })],
    ["detail envelope", { detail: denial(MODEL) }],
  ])("recognizes only matching canonical evidence: %s", async (_name, evidence) => {
    expect(await remember(MODEL, evidence)).toEqual({ shouldFallback: true, cooldownMs: 0, entitlementDenial: true });
    expect(cache().size).toBe(1);
    expect((await choose()).connectionId).toBe("b");
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong model", denial("gpt-6-luna"), {}],
    ["quoted input", `Unknown model; received ${JSON.stringify(denial(MODEL))}`, {}],
    ["unrelated diagnostic", `Request rejected. ${denial(MODEL)}`, {}],
    ["extra trailing diagnostic", `${denial(MODEL)} Unsupported parameter.`, {}],
    ["mismatched status wrapper", `[503]: ${denial(MODEL)}`, {}],
    ["validation code", { message: denial(MODEL), code: "unsupported_parameter" }, {}],
    ["quota code", { message: denial(MODEL), code: "rate_limit_exceeded" }, {}],
    ["quota type", { message: denial(MODEL), type: "quota_error" }, {}],
    ["billing code", { message: denial(MODEL), code: "insufficient_credits" }, {}],
    ["billing type", { message: denial(MODEL), type: "billing_error" }, {}],
    ["unauthorized", denial(MODEL), { status: 401 }],
    ["forbidden", denial(MODEL), { status: 403 }],
    ["service unavailable", denial(MODEL), { status: 503 }],
    ["other provider", denial(MODEL), { provider: "openai" }],
  ])("does not learn a hint from %s", async (_name, evidence, options) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await remember(MODEL, evidence, options)).not.toHaveProperty("entitlementDenial");
    expect(cache().size).toBe(0);
  });

  it.each(["rate_limit_exceeded", "insufficient_credits"])("keeps direct structured %s failures unavailable without an entitlement hint", async code => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const decision = await remember(MODEL, { message: denial(MODEL), code });
    expect(decision.shouldFallback).toBe(true);
    expect(decision.cooldownMs).toBeGreaterThan(0);
    expect(decision).not.toHaveProperty("entitlementDenial");
    expect(cache().size).toBe(0);
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.update.mock.calls[0][1].errorCode).toBe(400);
    expect(diagnostic).toHaveBeenCalledWith(`❌ codex [400]: ${`${denial(MODEL)} (${code})`.slice(0, 100)}`);
  });

  it("shares the actual wire model across parenthesized efforts but keeps review quota distinct", async () => {
    await remember(`${MODEL}(low)`, denial(MODEL));
    expect((await choose(`${MODEL}(high)`)).connectionId).toBe("b");
    expect((await choose(MODEL)).connectionId).toBe("b");
    expect((await choose(`${MODEL}-review`)).connectionId).toBe("a");
    // The legacy executor -high alias has no authoritative registry binding.
    // A safe missed hint must never incorrectly exclude another wire model.
    expect((await choose(`${MODEL}-high`)).connectionId).toBe("a");
  });

  it("expires at the exact TTL boundary and bounds retained keys without credential or body material", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.now();
    await remember();
    vi.setSystemTime(now + CODEX_ENTITLEMENT_DENIAL_MS - 1);
    expect((await choose()).connectionId).toBe("b");
    vi.setSystemTime(now + CODEX_ENTITLEMENT_DENIAL_MS);
    expect((await choose()).connectionId).toBe("a");
    expect(cache().size).toBe(0);
    await remember("synthetic-model-0");
    const oldest = cache().keys().next().value;
    for (let i = 1; i <= CACHE_LIMITS.codexEntitlementDenials; i++) await remember(`synthetic-model-${i}`);
    expect(cache().size).toBe(CACHE_LIMITS.codexEntitlementDenials);
    expect(cache().has(oldest)).toBe(false);
    for (const [key, entry] of cache()) {
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.keys(entry).sort()).toEqual(["expiresAt", "importRevision"]);
    }
    const retained = JSON.stringify([...cache()]);
    for (const secret of Object.values(fixture.rows[0]).filter(value => typeof value === "string" && value.startsWith("synthetic-"))) expect(retained).not.toContain(secret);
    expect(retained).not.toContain("not supported");
    await remember("x".repeat(100_000), denial("x".repeat(100_000)));
    expect([...cache().keys()].every(key => key.length === 64)).toBe(true);
  });

  it.each(["apiKey", "accessToken", "refreshToken", "idToken", "chatgptAccountId", "workspaceId", "accountId"])("invalidates credential/account replacement: %s", async field => {
    await remember();
    if (field.endsWith("Id")) fixture.rows[0].providerSpecificData[field] = "synthetic-replacement";
    else fixture.rows[0][field] = "synthetic-replacement";
    expect((await choose()).connectionId).toBe("a");
  });

  it("keeps hints useful across runtime scheduling changes and treats preferred pins as soft", async () => {
    await remember();
    Object.assign(fixture.rows[0], { updatedAt: "later", lastUsedAt: "later", consecutiveUseCount: 123 });
    expect((await choose(MODEL, new Set(), { preferredConnectionId: "a" })).connectionId).toBe("b");
    expect((await choose(MODEL, new Set(["b"]), { preferredConnectionId: "a" })).connectionId).toBe("a");
    fixture.rows[0].isActive = false;
    expect(await choose(MODEL, new Set(["b"]))).toBeNull();
  });

  it("requires attempt context, and cancellation/import changes after a row read cannot publish or delete hints", async () => {
    expect(await markAccountUnavailable("a", 400, denial(MODEL), "codex", MODEL)).toEqual({ shouldFallback: true, cooldownMs: 0, entitlementDenial: true });
    expect(cache().size).toBe(0);
    const old = context();
    fixture.generation++;
    const refreshed = captureCodexEntitlementContext("codex", snapshot(), null, old);
    expect(refreshed.generation).toBe(old.generation);
    await remember(MODEL, denial(MODEL), { context: refreshed });
    expect(cache().size).toBe(0);
    const selected = context();
    fixture.getRow.mockImplementationOnce(async () => { const value = snapshot(); fixture.generation++; return value; });
    await remember(MODEL, denial(MODEL), { context: selected });
    expect(cache().size).toBe(0);
    await remember();
    const controller = new AbortController();
    const successContext = context(fixture.rows[0], controller.signal);
    fixture.getRow.mockImplementationOnce(async () => { const value = snapshot(); controller.abort(); return value; });
    await clearAccountError("a", fixture.rows[0], MODEL, successContext);
    expect(cache().size).toBe(1);
    fixture.revision = "import-from-another-worker";
    expect((await choose()).connectionId).toBe("a");
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("preserves a newly published import-revision hint while an older lookup awaits its row", async () => {
    await remember();
    fixture.revision = "import-from-another-worker";
    const newContext = context();
    let publication;
    fixture.getSettings.mockImplementationOnce(async () => {
      publication = remember(MODEL, denial(MODEL), { context: newContext });
      return { quotaAwareSelection: false, fallbackStrategy: "fill-first" };
    });
    await choose();
    await publication;
    expect([...cache().values()].map(entry => entry.importRevision)).toEqual([fixture.revision]);
    expect((await choose()).connectionId).toBe("b");
  });

  it("does not delete another import revision's hint when a success row snapshot is older", async () => {
    const oldSnapshot = snapshot();
    const oldContext = context();
    await remember();
    fixture.revision = "import-from-another-worker";
    await remember();
    fixture.getRow.mockResolvedValueOnce(oldSnapshot);
    await clearAccountError("a", oldSnapshot, MODEL, oldContext);
    expect([...cache().values()].map(entry => entry.importRevision)).toEqual([fixture.revision]);
    expect((await choose()).connectionId).toBe("b");
    expect(fixture.update).not.toHaveBeenCalled();
  });
});
