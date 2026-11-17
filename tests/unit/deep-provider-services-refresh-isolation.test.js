import { afterEach, describe, expect, it, vi } from "vitest";
import { withCredentialRefreshLock } from "../../open-sse/services/oauthCredentialManager.js";
import { dedupRefresh, getRefreshProxyKey } from "../../open-sse/services/tokenRefresh/dedup.js";

let sequence = 0;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
afterEach(() => vi.restoreAllMocks());

describe("credential refresh identity is bound to the actual proof", () => {
  it.each([
    ["email", { email: "same@example.invalid", refreshToken: "first-proof" }, { email: "same@example.invalid", refreshToken: "second-proof" }],
    ["name", { name: "shared-name", refreshToken: "first-proof" }, { name: "shared-name", refreshToken: "second-proof" }],
    ["token suffix", { refreshToken: "first-prefix-0123456789abcdef" }, { refreshToken: "second-prefix-0123456789abcdef" }],
    ["anonymous objects", {}, {}],
  ])("does not share one account's result because of a matching %s", async (_name, first, second) => {
    const gate = deferred();
    const provider = `fixture-isolation-${++sequence}`;
    const firstGrant = vi.fn(async () => { await gate.promise; return { accessToken: "account-one" }; });
    const secondGrant = vi.fn(async () => { await gate.promise; return { accessToken: "account-two" }; });
    const pending = [
      withCredentialRefreshLock(provider, first, firstGrant),
      withCredentialRefreshLock(provider, second, secondGrant),
    ];
    gate.resolve();
    expect(await Promise.all(pending)).toEqual([{ accessToken: "account-one" }, { accessToken: "account-two" }]);
    expect(firstGrant).toHaveBeenCalledTimes(1);
    expect(secondGrant).toHaveBeenCalledTimes(1);
  });

  it("still coalesces the same connection across concurrent refresh subscribers", async () => {
    const gate = deferred();
    const grant = vi.fn(async () => { await gate.promise; return { accessToken: "same-connection" }; });
    const provider = `fixture-connection-${++sequence}`;
    const first = withCredentialRefreshLock(provider, { id: "stable-id", refreshToken: "proof-one" }, grant);
    const second = withCredentialRefreshLock(provider, { id: "stable-id", refreshToken: "proof-one" }, grant);
    gate.resolve();
    expect(await Promise.all([first, second])).toEqual([{ accessToken: "same-connection" }, { accessToken: "same-connection" }]);
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("coalesces equal complete proofs without trusting a cosmetic account name", async () => {
    const gate = deferred();
    const grant = vi.fn(async () => { await gate.promise; return { accessToken: "same-proof" }; });
    const provider = `fixture-proof-${++sequence}`;
    const first = withCredentialRefreshLock(provider, { name: "first label", refreshToken: "same-full-proof" }, grant);
    const second = withCredentialRefreshLock(provider, { name: "second label", refreshToken: "same-full-proof" }, grant);
    gate.resolve();
    await Promise.all([first, second]);
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("bounds pending connection locks without evicting a live rotating grant", async () => {
    const gate = deferred();
    const grant = vi.fn(async () => { await gate.promise; return { accessToken: "acquired" }; });
    const provider = `fixture-capacity-${++sequence}`;
    const active = Array.from({ length: 500 }, (_, id) => withCredentialRefreshLock(provider, { id: `account-${id}` }, grant));
    const overflow = withCredentialRefreshLock(provider, { id: "overflow" }, grant).catch(error => error);
    const joined = withCredentialRefreshLock(provider, { id: "account-0" }, grant);
    gate.resolve();
    await Promise.all([...active, joined]);
    expect(await overflow).toMatchObject({ code: "CREDENTIAL_REFRESH_CAPACITY_EXCEEDED" });
    expect(grant).toHaveBeenCalledTimes(500);
    expect(await withCredentialRefreshLock(provider, { id: "overflow" }, grant)).toEqual({ accessToken: "acquired" });
  });
});

describe("refresh and catalog coalescing retains selected proxy pools", () => {
  it("distinguishes direct, different pools and legacy pool aliases", () => {
    const direct = getRefreshProxyKey(null);
    const selected = getRefreshProxyKey({ proxyPoolId: "selected-pool" });
    expect(selected).not.toBe(direct);
    expect(selected).not.toBe(getRefreshProxyKey({ proxyPoolId: "other-pool" }));
    expect(selected).toBe(getRefreshProxyKey({ connectionProxyPoolId: "selected-pool" }));
    expect(getRefreshProxyKey({ proxyPoolId: "__none__", connectionProxyPoolId: "stale-pool" })).toBe(direct);
  });

  it("never supplies a token acquired through a different selected pool", async () => {
    const provider = `fixture-pool-${++sequence}`;
    const token = `same-proof-${sequence}`;
    const first = vi.fn(async () => ({ accessToken: "pool-one" }));
    const second = vi.fn(async () => ({ accessToken: "pool-two" }));
    expect(await dedupRefresh(provider, token, first, null, { proxyPoolId: "first" })).toEqual({ accessToken: "pool-one" });
    expect(await dedupRefresh(provider, token, second, null, { proxyPoolId: "second" })).toEqual({ accessToken: "pool-two" });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
