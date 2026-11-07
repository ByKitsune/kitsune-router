// API contract: joyccn/ByKitsuneV2 server/routes/v1.routes.ts and
// server/middleware/auth.middleware.ts (reviewed at 5471e5ccecedb165c55e0da59e2f905ad2e8ba19).
export default {
  id: "bykitsune",
  alias: "bykitsune",
  category: "apikey",
  priority: 0,
  authType: "apikey",
  authModes: ["apikey"],
  display: {
    name: "ByKitsune",
    icon: "verified",
    color: "#A63F23",
    textIcon: "BK",
    official: true,
    website: "https://bykitsune.com",
    notice: {
      text: "The official provider from the team behind Kitsune Router. Add your ByKitsune API key, then fetch the models available to your account.",
      apiKeyUrl: "https://bykitsune.com/dashboard?tab=keys",
    },
  },
  transport: {
    baseUrl: "https://api.bykitsune.com/v1/chat/completions",
    validateUrl: "https://api.bykitsune.com/v1/models",
    // V2 relays these controls to the selected channel. Keep explicit budgets,
    // disabled switches and visibility until the final provider is selected.
    quirks: { preserveReasoningControls: true },
  },
  // The deployment's authenticated catalog is authoritative. Do not advertise
  // seed models, prices or capabilities that may not be available to this key.
  models: [],
  modelsFetcher: { url: "https://api.bykitsune.com/v1/models", type: "openai" },
  passthroughModels: true,
};
