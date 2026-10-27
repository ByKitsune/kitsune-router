// Public identity only. Never put account credentials or runtime configuration
// in this module: it is also imported into client-side application bundles.
export const BRAND = Object.freeze({
  name: "Kitsune Router",
  organization: "ByKitsune",
  tagline: "Your models. Your routes.",
  description: "A provider-neutral AI gateway",
  summary: "Connect your tools to the AI providers you choose, with local credentials, routing controls and usage visibility.",
  sponsorUrl: "https://bykitsune.com/",
  repository: "https://github.com/ByKitsune/kitsune-router",
  docsUrl: "https://github.com/ByKitsune/kitsune-router#readme",
  npmPackage: "@bykitsune/router",
  binary: "kitsune-router",
  container: "ghcr.io/bykitsune/kitsune-router",
  supportEmail: "esa@bykitsune.com",
});
