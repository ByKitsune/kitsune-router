// Explicit publisher retirements of previously registered Copilot fallback IDs.
// This ledger preserves historical-reference verification; it is not a runtime
// denylist and does not override fresh account catalogs or operator choices.
export const COPILOT_CATALOG_RETIREMENT_SOURCE = Object.freeze({
  url: "https://github.com/github/docs/blob/6167b6d08e8548a411a2ab1e0f3627fe6f89aaec/data/tables/copilot/model-deprecation-history.yml",
  sha256: "76219aa8ca29aa24c1fd761c0ff96a645e8a6b7a440c1b35e54abc8ab3c7b5b9",
  reviewedDate: "2026-10-31",
});

export const COPILOT_RETIRED_FALLBACK_MODELS = Object.freeze([
  ["gpt-5.5", "2026-10-19"],
  ["gpt-5.4", "2026-10-19"],
  ["gpt-5.4-mini", "2026-10-19"],
  ["gpt-5-mini", "2026-10-19"],
  ["claude-opus-4.7", "2026-10-02"],
  ["gemini-3.6-flash", "2026-10-02"],
  ["gemini-3.7-flash", "2026-10-19"],
  ["oswe-vscode-prime", "2026-09-01"],
].map(([id, retirementDate]) => Object.freeze({ provider: "github", id, retirementDate })));
