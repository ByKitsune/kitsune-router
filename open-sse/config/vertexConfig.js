export const VERTEX_CONFIG = {
  origin: "https://aiplatform.googleapis.com",
  apiVersion: "v1",
  publisherPath: "publishers/google/models",
  partnerPath: "endpoints/openapi/chat/completions",
  defaultLocation: "global",
  oauthDefaultLocation: "us-central1",
  generateAction: "generateContent",
  streamAction: "streamGenerateContent",
  projectProbeModel: "__probe__",
  projectProbeTimeoutMs: 10_000,
  projectProbeMaxBytes: 16 * 1024,
  projectCacheTtlMs: 5 * 60 * 1000,
  projectCacheMaxEntries: 256,
  // Cloud project IDs or numeric project numbers, never resource paths/URLs.
  projectPattern: /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{1,20})$/,
  locationPattern: /^[a-z][a-z0-9-]{0,62}$/,
  modelPattern: /^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,255}$/,
};
