import { createHash } from "node:crypto";
import { DATA_FILE } from "@/lib/db/paths.js";
import { getDbImportGeneration } from "@/lib/db/helpers/importGeneration.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { getModelLockIdentity } from "open-sse/services/accountFallback.js";
import { stripThinkingSuffix } from "open-sse/translator/concerns/thinkingUnified.js";

const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const codexDatabaseScope = digest(DATA_FILE);

export function codexCredentialIdentity(connection) {
  const stored = connection?._connection || connection || {};
  const value = field => connection?.[field] !== undefined ? connection[field] : stored[field];
  const specific = connection?.providerSpecificData || stored.providerSpecificData || {};
  return digest([value("authType"), value("apiKey"), value("accessToken"), value("refreshToken"), value("idToken"),
    specific.workspaceId, specific.chatgptAccountId, specific.accountId]);
}

/** Private attempt context. Keep the selection generation across all refresh awaits. */
export function captureCodexEntitlementContext(provider, credentials, signal = null, previous = null) {
  if (resolveProviderId(provider) !== "codex" || !credentials) return null;
  const stored = credentials._connection || credentials;
  if (stored.provider && resolveProviderId(stored.provider) !== "codex") return null;
  const scope = previous || credentials._codexEntitlementScope;
  return Object.freeze({
    database: scope?.database ?? codexDatabaseScope,
    generation: scope?.generation ?? getDbImportGeneration(),
    connectionId: credentials.connectionId || stored.id,
    identity: codexCredentialIdentity(credentials),
    importRevision: credentials._writeFence?.importRevision ?? null,
    signal,
  });
}

export function codexEntitlementKey(connection, model, scope) {
  return digest([scope.database, scope.generation, connection.id || connection.connectionId,
    codexCredentialIdentity(connection), getModelLockIdentity("codex", stripThinkingSuffix(model))]);
}

export function codexContextMatches(context, connection) {
  return context && !context.signal?.aborted && connection && context.database === codexDatabaseScope
    && context.generation === getDbImportGeneration() && context.connectionId === connection.id
    && resolveProviderId(connection.provider) === "codex" && context.identity === codexCredentialIdentity(connection)
    && context.importRevision === (connection._writeFence?.importRevision ?? null);
}
