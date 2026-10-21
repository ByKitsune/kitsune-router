/**
 * Project ID Service - Fetch and cache real Project IDs from Google Cloud Code API
 *
 *
 * Instead of generating random project IDs (e.g. "useful-spark-a1b2c"),
 * this service fetches the real Project ID bound to the authenticated user's account.
 * This significantly reduces the risk of being flagged by Google's anti-abuse systems.
 */

import { CLOUD_CODE_API, LOAD_CODE_ASSIST_HEADERS, ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS, LOAD_CODE_ASSIST_METADATA } from "../config/appConstants.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { createRefreshOperation, getRefreshProxyKey, waitForRefresh } from "./tokenRefresh/dedup.js";
import { FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// ─── Cache ────────────────────────────────────────────────────────────────────
// [connectionId, provider, credential digest, proxy policy] -> { connectionId, projectId: string, fetchedAt: number }
const projectIdCache = new Map();

/** How long a cached project ID is considered fresh (1 hour). */
const CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Pending-fetch deduplication ─────────────────────────────────────────────
// Same cache identity -> shared operation plus connectionId and startedAt.
const pendingFetches = new Map();

/** Abort and evict a pending fetch that has been running longer than this (2 min). */
const PENDING_TTL_MS = 2 * 60 * 1000;

// ─── Periodic cleanup ────────────────────────────────────────────────────────
/** How often the background sweep runs (10 min). */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let _cleanupTimer = null;

/** Run one sweep immediately: evict stale cache entries and abort orphaned pending fetches. */
export function cleanupNow() {
    const now = Date.now();

    for (const [id, entry] of projectIdCache) {
        if (!entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
            projectIdCache.delete(id);
        }
    }

    for (const [id, item] of pendingFetches) {
        if (!item || typeof item.startedAt !== "number") {
            pendingFetches.delete(id);
            continue;
        }
        if (now - item.startedAt > PENDING_TTL_MS) {
            try { item.controller.abort(); } catch (_) { /* ignore */ }
            pendingFetches.delete(id);
        }
    }
}

/** Start the periodic background cleanup (idempotent). Called automatically on module load. */
export function startCacheCleanup() {
    if (_cleanupTimer) return;
    _cleanupTimer = setInterval(() => {
        try { cleanupNow(); } catch (e) {
            console.warn("[ProjectId] cleanup sweep error:", e?.message ?? e);
        }
    }, CLEANUP_INTERVAL_MS);
    // Unref so the timer doesn't prevent Node from exiting when it is otherwise idle
    _cleanupTimer?.unref?.();
}

/** Stop the periodic background cleanup (e.g. during graceful shutdown). */
export function stopCacheCleanup() {
    if (!_cleanupTimer) return;
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
}

// Start automatically when the module is first imported
startCacheCleanup();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the Project ID for a connection, with caching.
 * Returns null on failure (callers should fall back to random generation).
 *
 * @param {string} connectionId - The connection identifier for cache keying
 * @param {string} accessToken  - Valid OAuth access token
 * @param {string} provider     - Provider ID (antigravity or gemini-cli)
 * @param {object|null} proxyOptions - Proxy configuration for outbound requests
 * @param {AbortSignal|null} signal - Cancels only this caller's subscription
 * @returns {Promise<string|null>} Real project ID or null
 */
export async function getProjectIdForConnection(connectionId, accessToken, provider = "gemini-cli", proxyOptions = null, signal = null) {
    signal?.throwIfAborted();
    if (!connectionId || !accessToken) return null;

    const credential = createHash("sha256").update(accessToken).digest("hex");
    const key = JSON.stringify([connectionId, provider, credential, getRefreshProxyKey(proxyOptions)]);

    // Return cached value if still fresh
    const cached = projectIdCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.projectId;
    }

    // A cancelled waiter cannot abort a live subscriber sharing this identity.
    const pending = pendingFetches.get(key);
    if (pending && !pending.controller.signal.aborted) return waitForRefresh(pending, signal);

    const operation = createRefreshOperation(async sharedSignal => {
        // Enforce the orphan cap directly, not only during the ten-minute sweep.
        const requestSignal = AbortSignal.any([sharedSignal, AbortSignal.timeout(PENDING_TTL_MS)]);
        try {
            const projectId = await fetchProjectId(accessToken, requestSignal, provider, proxyOptions);
            if (requestSignal.aborted || pendingFetches.get(key) !== operation) return null;
            if (projectId) {
                projectIdCache.set(key, { connectionId, projectId, fetchedAt: Date.now() });
                return projectId;
            }
            console.warn("[ProjectId] could not fetch projectId for connection", connectionId.slice(0, 8));
            return null;
        } catch (error) {
            if (!sharedSignal.aborted) console.warn(`[ProjectId] Error fetching project ID: ${error.message}`);
            return null;
        }
    });

    Object.assign(operation, { connectionId, startedAt: Date.now() });
    pendingFetches.set(key, operation);
    const cleanup = () => { if (pendingFetches.get(key) === operation) pendingFetches.delete(key); };
    operation.promise.then(cleanup, cleanup);
    return waitForRefresh(operation, signal);
}

/**
 * Invalidate every cached project ID and abort pending requests for a connection.
 * Call this when a connection's credentials are fully revoked or refreshed.
 */
export function invalidateProjectId(connectionId) {
    removeConnection(connectionId);
}

/**
 * Fully remove a connection: abort any in-flight fetch and delete its cached project ID.
 * Wire this into your connection close / disconnect lifecycle events to prevent memory leaks.
 *
 * @param {string} connectionId
 */
export function removeConnection(connectionId) {
    if (!connectionId) return;
    for (const [key, entry] of projectIdCache) {
        if (entry.connectionId === connectionId) projectIdCache.delete(key);
    }
    for (const [key, pending] of pendingFetches) {
        if (pending.connectionId !== connectionId) continue;
        pendingFetches.delete(key);
        try { pending.controller.abort(); } catch (_) { /* ignore */ }
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch project ID via loadCodeAssist endpoint.
 * Falls back to onboardUser when loadCodeAssist returns no project.
 *
 * @param {string}      accessToken
 * @param {AbortSignal} signal
 * @param {string}      provider
 * @param {object|null} proxyOptions
 * @returns {Promise<string|null>}
 */
async function fetchProjectId(accessToken, signal, provider, proxyOptions = null) {
    signal.throwIfAborted();
    const endpoints = CLOUD_CODE_API[provider] || CLOUD_CODE_API["gemini-cli"];
    const headers = provider === "antigravity" ? ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS : LOAD_CODE_ASSIST_HEADERS;
    const response = await proxyAwareFetch(endpoints.loadCodeAssist, {
        method: "POST",
        headers: { ...headers, "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA }),
        // This deadline includes the JSON/error body, not just response headers.
        signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_CONNECT_TIMEOUT_MS)])
    }, proxyOptions);

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`loadCodeAssist failed: HTTP ${response.status} ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    signal.throwIfAborted();
    const projectId = extractProjectId(data);
    if (projectId) return projectId;

    // Determine the tier to use for onboarding
    let tierID = "legacy-tier";
    if (Array.isArray(data.allowedTiers)) {
        for (const tier of data.allowedTiers) {
            if (tier && typeof tier === "object" && tier.isDefault === true) {
                if (tier.id && typeof tier.id === "string" && tier.id.trim()) {
                    tierID = tier.id.trim();
                    break;
                }
            }
        }
    }

    return onboardUser(accessToken, tierID, signal, endpoints, provider, proxyOptions);
}

/**
 * Fetch project ID via onboardUser endpoint (polls until done).
 *
 * @param {string}      accessToken
 * @param {string}      tierID
 * @param {AbortSignal} externalSignal  – propagated from the connection's AbortController
 * @param {object}      endpoints
 * @param {string}      provider
 * @param {object|null} proxyOptions
 * @returns {Promise<string|null>}
 */
async function onboardUser(accessToken, tierID, externalSignal, endpoints, provider, proxyOptions = null) {
    externalSignal.throwIfAborted();
    console.log(`[ProjectId] Onboarding user with tier: ${tierID}`);

    const reqBody = { tierId: tierID, metadata: LOAD_CODE_ASSIST_METADATA };
    const headers = provider === "antigravity" ? ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS : LOAD_CODE_ASSIST_HEADERS;
    const MAX_ATTEMPTS = 5;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // Bail out immediately if the connection was removed
        externalSignal.throwIfAborted();

        // Per-attempt timeout controller; forwards external abort as well
        const localCtrl = new AbortController();
        const timeoutId = setTimeout(() => localCtrl.abort(), Math.min(30_000, FETCH_CONNECT_TIMEOUT_MS));
        const requestSignal = AbortSignal.any([externalSignal, localCtrl.signal]);

        try {
            const response = await proxyAwareFetch(endpoints.onboardUser, {
                method: "POST",
                headers: { ...headers, "Authorization": `Bearer ${accessToken}` },
                body: JSON.stringify(reqBody),
                signal: requestSignal
            }, proxyOptions);

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(`onboardUser HTTP ${response.status}: ${errorText.slice(0, 200)}`);
            }

            const data = await response.json();
            clearTimeout(timeoutId);
            externalSignal.throwIfAborted();

            if (data.done === true) {
                const projectId = extractProjectIdFromOnboard(data);
                if (projectId) {
                    console.log(`[ProjectId] Successfully onboarded, project ID: ${projectId}`);
                    return projectId;
                }
                // Server indicated onboarding is done, but no project ID was provisioned (e.g. personal account without a default GCP project).
                // Do not retry 5 times pointlessly; return null so the system falls back to synthetic project IDs immediately.
                console.log(`[ProjectId] Onboarding done (no project ID assigned by server)`);
                return null;
            }

            // Server not done yet – wait and retry
            console.log(`[ProjectId] Onboard attempt ${attempt}/${MAX_ATTEMPTS}: not done yet, waiting...`);
            await delay(2000, undefined, { signal: externalSignal });

        } catch (error) {
            clearTimeout(timeoutId);
            externalSignal.throwIfAborted();
            if (localCtrl.signal.aborted) {
                console.warn(`[ProjectId] onboardUser attempt ${attempt} aborted (timeout or connection removed)`);
                continue;
            }
            if (attempt === MAX_ATTEMPTS) {
                console.warn(`[ProjectId] onboardUser failed after ${MAX_ATTEMPTS} attempts: ${error.message}`);
                return null;
            }
            // Continue to next attempt instead of throwing (which would skip remaining retries)
            console.warn(`[ProjectId] onboardUser attempt ${attempt} failed: ${error.message}, retrying...`);
            await delay(2000, undefined, { signal: externalSignal });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    return null;
}

/**
 * Extract project ID from loadCodeAssist response.
 */
function extractProjectId(data) {
    if (!data) return null;

    if (typeof data.cloudaicompanionProject === "string") {
        const id = data.cloudaicompanionProject.trim();
        if (id) return id;
    }

    if (data.cloudaicompanionProject && typeof data.cloudaicompanionProject === "object") {
        const id = data.cloudaicompanionProject.id;
        if (typeof id === "string" && id.trim()) return id.trim();
    }

    return null;
}

/**
 * Extract project ID from onboardUser response.
 */
function extractProjectIdFromOnboard(data) {
    if (!data?.response) return null;

    const project = data.response.cloudaicompanionProject;

    if (typeof project === "string") {
        const id = project.trim();
        if (id) return id;
    }

    if (project && typeof project === "object") {
        const id = project.id;
        if (typeof id === "string" && id.trim()) return id.trim();
    }

    return null;
}
