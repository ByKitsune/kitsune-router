// Quarantine only the historical gateway-bundled Google fallback samples.
// Retain hashes, never captured signed material that could be replayed.
// Hash decoded bytes so equivalent Base64 padding cannot evade quarantine.
export const LEGACY_THOUGHT_SIGNATURE_SHA256 = new Set([
  "378e6e72e1aafa38d77403b8b6fdf60c1156724424daa8cc28aa59ad6d056046",
  "65ef658c570a3db955c9265002c0196e89095e960f8967c7c9c2a44d9c31fcd3",
  "d57eec23cedf4dbb405b352e83797670c4ae6331a4a349dc91f0399fdbf5cd16",
]);

// Documented explicit migrated-history control, not a signature and never
// automatically injected by this gateway:
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures
export const GOOGLE_MIGRATED_HISTORY_MARKER = "skip_thought_signature_validator";
