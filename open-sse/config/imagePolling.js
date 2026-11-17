// Exact provider-owned API origins, verified from the official clients/guides:
// github.com/black-forest-labs/skills/blob/master/skills/bfl-api/references/endpoints.md
// github.com/fal-ai/fal-js/blob/main/libs/client/src/queue.ts
// Additional regional origins require verification before credentials are sent.
export const IMAGE_POLLING_ORIGINS = Object.freeze({
  "black-forest-labs": Object.freeze(["https://api.bfl.ai", "https://api.eu.bfl.ai", "https://api.us.bfl.ai"]),
  "fal-ai": Object.freeze(["https://queue.fal.run"]),
});
