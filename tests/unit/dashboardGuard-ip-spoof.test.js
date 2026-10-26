import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalRequest } from "../../src/dashboardGuard.js";

beforeEach(() => {
  // Peer-token must match what custom-server.js stamps at boot.
  vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fingerprint");
  vi.stubEnv("NINEROUTER_PEER_TOKEN", undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("isLocalRequest — IP spoofing defense (#3496)", () => {
  it("rejects dev-mode Host spoofing when peer headers are absent", () => {
    const headers = new Headers();
    headers.set("host", "localhost:20128");
    headers.set("origin", "http://localhost:20128");
    expect(isLocalRequest({ headers })).toBe(false);
  });

  it("trusts peer token + loopback IP stamped by custom-server", () => {
    const headers = new Headers();
    headers.set("x-kitsune-router-real-ip", "127.0.0.1");
    headers.set("x-kitsune-router-peer-token", "fingerprint");
    headers.set("origin", "http://localhost:20128");
    expect(isLocalRequest({ headers })).toBe(true);
  });

  it("rejects even with peer token when real IP is non-loopback", () => {
    const headers = new Headers();
    headers.set("x-kitsune-router-real-ip", "8.8.8.8");
    headers.set("x-kitsune-router-peer-token", "fingerprint");
    expect(isLocalRequest({ headers })).toBe(false);
  });
});
