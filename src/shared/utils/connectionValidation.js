// Keep credential probes on the same configured connection route as saved use.
export function buildConnectionValidationPayload({ provider, apiKey, proxyPoolId, providerSpecificData }) {
  return {
    provider,
    apiKey,
    proxyPoolId: proxyPoolId === "__none__" ? null : proxyPoolId,
    ...(providerSpecificData ? { providerSpecificData } : {}),
  };
}
