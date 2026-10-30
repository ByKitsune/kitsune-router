import { describe, it, expect, vi, afterEach } from "vitest";

const fixture = vi.hoisted(() => ({ settings: {} }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => fixture.settings, updateSettings: vi.fn() }));
vi.mock("@/lib/network/outboundProxy", () => ({ applyOutboundProxyEnv: vi.fn() }));
vi.mock("open-sse/services/combo.js", () => ({ resetComboRotation: vi.fn() }));
vi.mock("@/lib/db/repos/requestDetailsRepo.js", () => ({
  resolveObservabilityEnabled: () => false,
  resolveObservabilityState: () => ({ enabled: false, source: "settings" }),
}));

import { GET } from "../../src/app/api/settings/route.js";

afterEach(() => { vi.unstubAllEnvs(); });

describe("rebranded setup reports effective password state", () => {
  it("does not call an operator's explicit initial password a public default", async () => {
    fixture.settings = { requireLogin: true };
    vi.stubEnv("INITIAL_PASSWORD", "synthetic-private-initial-password");
    const result = await (await GET()).json();
    expect(result.hasPassword).toBe(false);
    expect(result.usesDefaultPassword).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-initial-password");
  });

  it("still warns when no custom password or real initial password exists", async () => {
    fixture.settings = {};
    vi.stubEnv("INITIAL_PASSWORD", "");
    expect((await (await GET()).json()).usesDefaultPassword).toBe(true);
  });

  it("treats a persisted hash as configured and never returns it", async () => {
    fixture.settings = { password: "synthetic-secret-hash", oidcClientSecret: "synthetic-oidc-secret", mitmSudoEncrypted: "synthetic-ciphertext" };
    vi.stubEnv("INITIAL_PASSWORD", "");
    const result = await (await GET()).json();
    expect(result.hasPassword).toBe(true);
    expect(result.usesDefaultPassword).toBe(false);
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("oidcClientSecret");
    expect(result).not.toHaveProperty("mitmSudoEncrypted");
  });
});
