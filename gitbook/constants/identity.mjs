// Public identity snapshot of branding/identity.mjs. The docs application has an
// isolated Turbopack root, so it cannot import modules from its parent project.
// tests/docs-rebrand.test.mjs checks against the canonical public identity.
export const DOCS_IDENTITY = Object.freeze({
  name: "Kitsune Router",
  organization: "ByKitsune",
  tagline: "Your models. Your routes.",
  description: "A provider-neutral AI gateway",
  summary: "Connect your tools to the AI providers you choose, with local credentials, routing controls and usage visibility.",
  sponsorUrl: "https://bykitsune.com/",
  repository: "https://github.com/ByKitsune/kitsune-router",
});
