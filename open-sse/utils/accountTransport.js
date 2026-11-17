import { setTimeout as delay } from "node:timers/promises";
import { proxyAwareFetch } from "./proxyFetch.js";
import { ACCOUNT_REDIRECT_STATUSES } from "../config/accountTransport.js";

function discardResponse(response) {
  try { void Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch { /* Already owned or closed. */ }
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
      return proxyAwareFetch(url, { ...init, redirect: "manual", ...(combined ? { signal: combined } : {}) }, policy).then(response => {
        if (combined?.aborted) {
          discardResponse(response);
          combined.throwIfAborted();
        }
        if (ACCOUNT_REDIRECT_STATUSES.includes(response.status)) {
          discardResponse(response);
          throw Object.assign(new Error("[ProxyFetch] Account request redirect refused; configure the canonical API endpoint"), {
            code: "ACCOUNT_REDIRECT_REFUSED",
          });
        }
        return response;
      });
    },
    async sleep(milliseconds) {
      signal?.throwIfAborted();
      await delay(milliseconds, undefined, { signal: signal || undefined });
      signal?.throwIfAborted();
    },
  });
}
