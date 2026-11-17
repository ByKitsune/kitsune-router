import { setTimeout as delay } from "node:timers/promises";
import { proxyAwareFetch } from "./proxyFetch.js";
import { ACCOUNT_REDIRECT_STATUSES } from "../config/accountTransport.js";

export function discardAccountResponse(response) {
  try { void Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch { /* Already owned or closed. */ }
}

// Executors that already received a resolved account policy must retain its
// exact identity. Share the request/response safety boundary without rebuilding
// that policy or accidentally selecting another account during a retry.
export function fetchWithAccountPolicy(url, init = {}, policy = null) {
  const signal = init.signal;
  signal?.throwIfAborted();
  return proxyAwareFetch(url, { ...init, redirect: "manual" }, policy).then(response => {
    if (signal?.aborted) {
      discardAccountResponse(response);
      signal.throwIfAborted();
    }
    if (ACCOUNT_REDIRECT_STATUSES.includes(response.status)) {
      discardAccountResponse(response);
      throw Object.assign(new Error("[ProxyFetch] Account request redirect refused; configure the canonical API endpoint"), {
        code: "ACCOUNT_REDIRECT_REFUSED",
      });
    }
    return response;
  });
}

export function getAccountRoutingPolicy(credentials, proxyOptions = null) {
  const source = proxyOptions ?? credentials?.providerSpecificData ?? {};
  const proxyPoolId = source.proxyPoolId ?? source.connectionProxyPoolId;
  return Object.freeze({
    connectionProxyEnabled: (source.connectionProxyEnabled ?? source.enabled) === true,
    connectionProxyUrl: source.connectionProxyUrl ?? source.url,
    connectionNoProxy: source.connectionNoProxy ?? source.noProxy,
    proxyPoolId: proxyPoolId === "__none__" ? null : proxyPoolId,
    strictProxy: source.strictProxy === true,
    vercelRelayUrl: source.vercelRelayUrl,
  });
}

export function hasAccountProxyPolicy(policy) {
  return !!(policy?.connectionProxyEnabled || policy?.proxyPoolId
    || policy?.strictProxy || policy?.vercelRelayUrl);
}

export function isAccountRoutingFailure(error) {
  return typeof error?.message === "string" && error.message.startsWith("[ProxyFetch]");
}

export function createAccountTransport(credentials, { signal = null, proxyOptions = null } = {}) {
  const policy = getAccountRoutingPolicy(credentials, proxyOptions);
  return Object.freeze({
    proxyOptions: policy,
    signal,
    fetch(url, init = {}) {
      signal?.throwIfAborted();
      const combined = signal && init.signal && signal !== init.signal
        ? AbortSignal.any([signal, init.signal]) : signal || init.signal;
      combined?.throwIfAborted();
      return fetchWithAccountPolicy(url, { ...init, ...(combined ? { signal: combined } : {}) }, policy);
    },
    async sleep(milliseconds) {
      signal?.throwIfAborted();
      await delay(milliseconds, undefined, { signal: signal || undefined });
      signal?.throwIfAborted();
    },
  });
}
