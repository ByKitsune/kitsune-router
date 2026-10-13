// Model-picker provider filtering (9router #4681).
//
// The picker builds its provider groups from the raw /api/providers payload,
// which includes every stored connection. Two mismatches with the router made
// the picker offer models the runtime refuses to serve:
//
//  1. a provider whose connections are ALL disabled (isActive === false) was
//     still listed with its full model list, so a saved combo member 404s at
//     dispatch ("No active credentials for provider: X");
//  2. the no-auth shortcut listed every FREE_PROVIDERS entry with `noAuth`,
//     including entries the registry marks `hidden`.
//
// Kept as pure functions (no React) so both the modal and its tests share the
// exact same logic.

/**
 * Connections the router can actually serve from.
 * `isActive !== false` rather than truthiness: payloads may omit the flag for
 * synthetic entries (noAuth virtual connections), and only an explicit
 * `false` means disabled. A stale `testStatus` is deliberately NOT a filter —
 * the router retries and refreshes tokens before dispatch, so an errored
 * connection can still serve, while a disabled one never can.
 *
 * @param {Array<object>} connections
 * @returns {Array<object>}
 */
export function filterEnabledConnections(connections) {
  if (!Array.isArray(connections)) return [];
  return connections.filter((c) => c && c.isActive !== false);
}

/**
 * No-auth provider ids the picker may offer: registry entries flagged
 * `hidden` are excluded, matching getProvidersByKind().
 *
 * @param {string[]} noAuthIds
 * @param {Record<string, { hidden?: boolean }>} providers
 * @returns {string[]}
 */
export function visibleNoAuthProviderIds(noAuthIds, providers) {
  if (!Array.isArray(noAuthIds)) return [];
  return noAuthIds.filter((id) => !providers?.[id]?.hidden);
}
