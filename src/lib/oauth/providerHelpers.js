import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { createHash } from "node:crypto";
import { createRefreshOperation, getRefreshProxyKey, waitForRefresh } from "open-sse/services/tokenRefresh/dedup.js";
import { FETCH_CONNECT_TIMEOUT_MS } from "open-sse/config/runtimeConfig.js";

const BASE64_BLOCK_SIZE = 4;

function validateXaiOAuthEndpoint(rawUrl, field) {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error(`xai discovery ${field} is empty`);
  let parsed;
  try { parsed = new URL(value); } catch (err) {
    throw new Error(`xai discovery ${field} is invalid: ${err.message}`);
  }
  if (parsed.protocol !== "https:") throw new Error(`xai discovery ${field} must use https: ${value}`);
  const host = parsed.hostname.toLowerCase().trim();
  if (host !== "x.ai" && !host.endsWith(".x.ai")) {
    throw new Error(`xai discovery ${field} host ${host} is not on x.ai`);
  }
  return value;
}

function decodeXaiIdTokenEmail(idToken) {
  if (!idToken || typeof idToken !== "string") return undefined;
  const parts = idToken.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = (BASE64_BLOCK_SIZE - (base64.length % BASE64_BLOCK_SIZE)) % BASE64_BLOCK_SIZE;
    const json = Buffer.from(base64 + "=".repeat(padding), "base64").toString("utf8");
    const payload = JSON.parse(json);
    return payload.email || payload.preferred_username || payload.sub || undefined;
  } catch {
    return undefined;
  }
}

function decodeJwtPayload(jwt) {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const missingPadding = (BASE64_BLOCK_SIZE - (base64.length % BASE64_BLOCK_SIZE)) % BASE64_BLOCK_SIZE;
    const padded = base64 + "=".repeat(missingPadding);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function extractEmailFromAccessToken(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return undefined;
  return payload.email || payload.preferred_username || payload.sub || undefined;
}

const pendingKiroProfiles = new Map();

export async function fetchKiroProfileArn(accessToken, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  if (!accessToken) return null;
  const key = JSON.stringify([createHash("sha256").update(accessToken).digest("hex"), getRefreshProxyKey(proxyOptions)]);
  const pending = pendingKiroProfiles.get(key);
  if (pending && !pending.controller.signal.aborted) return waitForRefresh(pending, signal);

  const operation = createRefreshOperation(async sharedSignal => {
    const requestSignal = AbortSignal.any([sharedSignal, AbortSignal.timeout(FETCH_CONNECT_TIMEOUT_MS)]);
    try {
      const response = await proxyAwareFetch("https://codewhisperer.us-east-1.amazonaws.com/ListAvailableProfiles", {
        method: "POST", signal: requestSignal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ maxResults: 10 }),
      }, proxyOptions);
      if (!response.ok) return null;
      const data = await response.json();
      sharedSignal.throwIfAborted();
      return data.profiles?.find((p) => p.arn?.trim())?.arn?.trim() || null;
    } catch {
      sharedSignal.throwIfAborted();
      return null;
    }
  });
  pendingKiroProfiles.set(key, operation);
  const cleanup = () => { if (pendingKiroProfiles.get(key) === operation) pendingKiroProfiles.delete(key); };
  operation.promise.then(cleanup, cleanup);
  return waitForRefresh(operation, signal);
}

export function extractCodexAccountInfo(idToken) {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return {};
  const chatgpt = payload["https://api.openai.com/auth"] || {};
  return {
    email: payload.email,
    chatgptAccountId: chatgpt.chatgpt_account_id || payload.account_id,
    chatgptPlanType: chatgpt.chatgpt_plan_type || payload.plan_type,
  };
}

export {
  BASE64_BLOCK_SIZE,
  validateXaiOAuthEndpoint,
  decodeXaiIdTokenEmail,
  decodeJwtPayload,
  extractEmailFromAccessToken,
};
