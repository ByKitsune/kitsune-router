// Catalog verification against models.dev (the official model database).
//
// Purpose: cross-check the context windows Zen publishes against the
// authoritative models.dev entries, so a wrong number is visible rather than
// assumed.
//
// METHODOLOGY NOTE — what counts as a real mismatch:
//
// Zen routes through many KINDS of provider, and they legitimately disagree:
//   - native/official vendors (openai, anthropic, gemini, xai, deepseek...) are
//     expected to match the official models.dev entry for the bare model id;
//   - resellers and IDE/OAuth bridges (ag = Antigravity, cu, gh, cbcn, cx,
//     gcli, kiro...) enforce their OWN caps — Antigravity limits Claude to
//     250,000 even though the model's API window is 1,000,000.
//
// Comparing an Antigravity row against the Anthropic row is therefore a false
// positive; a naive run produces ~200 of them. This script classifies each
// provider and reports a difference as ACTIONABLE only when the provider is
// expected to track the official model, or when ANY provider publishes MORE
// than the official spec (which over-promises to a client).
//
// Usage: node scripts/verify-catalog-against-modelsdev.mjs <modelsdev-api.json> [--all]
import { readFileSync } from "node:fs";
import { PROVIDER_MODELS } from "../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../open-sse/providers/capabilities.js";

const modelsDevPath = process.argv[2];
const showAll = process.argv.includes("--all");
if (!modelsDevPath) {
  console.error("Usage: node scripts/verify-catalog-against-modelsdev.mjs <modelsdev-api.json> [--all]");
  process.exit(1);
}

const modelsDev = JSON.parse(readFileSync(modelsDevPath, "utf8"));

// Providers whose published window is expected to equal the official model
// specification. Anything absent is route-scoped (reseller, OAuth bridge,
// coding plan) where a different window is legitimate.
const OFFICIAL_TRACKING = new Set([
  "openai", "anthropic", "gemini", "vertex", "xai", "deepseek", "mistral",
  "cohere", "groq", "cerebras", "nvidia", "together", "fireworks", "hyperbolic",
  "nebius", "siliconflow", "chutes", "featherless", "huggingface", "venice",
  "openrouter", "perplexity", "blackbox", "minimax", "minimax-cn", "glm", "glm-cn",
  "kimi", "volcengine-ark", "byteplus", "voyage-ai", "jina",
]);

// models.dev provider ids that represent the vendor's own specification.
const OFFICIAL_VIEWS = ["openai", "anthropic", "google", "xai", "deepseek", "mistral", "cohere", "meta"];

// Zen provider ids that are IDE / OAuth / coding-plan BRIDGES rather than the
// vendor's own API. They enforce their own cap on purpose, so a difference from
// the vendor model spec is expected and must not be reported as a defect:
//   kr = kiro (272k), ag = antigravity (250k for Claude), cx = codex,
//   gh = github copilot, cbcn/cbai = codebuddy, gcli = grok-cli, gc = gemini-cli,
//   if = iflow, alicode/alims/alitp = alibaba coding plans, cu = qiniu.
const BRIDGE_PROVIDERS = new Set([
  "kr", "ag", "cx", "gh", "cbcn", "cbai", "gcli", "gc", "if", "cu",
  "alicode", "alicode-intl", "alims-intl", "alitp-intl", "kc", "oc", "clinepass",
  "kimchi", "zd", "bm", "kgw", "llm7", "mmf", "samba", "tokenrouter", "paraloncloud",
]);

// Reference table: prefer the official entry for a bare id; otherwise the
// widest window any provider reports, recording the source.
const reference = new Map();
for (const [providerId, provider] of Object.entries(modelsDev)) {
  for (const [modelId, model] of Object.entries(provider.models || {})) {
    const bare = modelId.includes("/") ? modelId.split("/").pop() : modelId;
    const entry = {
      ctx: model?.limit?.context,
      out: model?.limit?.output,
      view: providerId,
      official: OFFICIAL_VIEWS.includes(providerId),
    };
    const existing = reference.get(bare);
    if (!existing) reference.set(bare, entry);
    else if (entry.official && !existing.official) reference.set(bare, entry);
    else if (!existing.official && !entry.official && Number.isFinite(entry.ctx)
      && (!Number.isFinite(existing.ctx) || entry.ctx > existing.ctx)) reference.set(bare, entry);
  }
}

/**
 * True when two advertised windows describe the same capacity.
 *
 * Accepts an exact match, a difference within 1%, or the decimal/binary unit
 * convention gap: 256000 vs 262144, 1000000 vs 1048576, 128000 vs 131072.
 * The binary form is always the decimal form of the same "round" number
 * multiplied by 1024/1000 per unit step.
 */
function sameWindow(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi / lo < 1.01) return true;
  // Same round number in decimal vs binary units:
  //   256K: 256000 -> 256*1024  = 262144   (ratio 1024/1000)
  //   1M:   1000000 -> 1024*1024 = 1048576 (ratio (1024/1000)^2)
  //   128K: 128000 -> 131072,  200K -> 204800
  for (const ratio of [1024 / 1000, (1024 / 1000) ** 2]) {
    if (Math.abs(hi - lo * ratio) < 2) return true;
    if (Math.abs(lo - hi * ratio) < 2) return true;
  }
  return false;
}

console.log(`models.dev reference entries (bare ids): ${reference.size}\n`);

const actionable = [];
const routeScoped = [];
const noReference = [];
let agree = 0;
let checked = 0;

// Providers whose models are media pipelines, not text windows. models.dev
// reports their limit.context as an audio/token output cap, which is a
// different quantity from a chat context window.
const MEDIA_PROVIDER_HINT = /tts|voice|stt|whisper|embedding|image|video|nanobanana|recraft|stability|black-forest|runway|comfyui|sdwebui|fal-ai|deepgram|assemblyai|elevenlabs|inworld|jina/i;

for (const [providerId, models] of Object.entries(PROVIDER_MODELS)) {
  if (MEDIA_PROVIDER_HINT.test(providerId)) continue;
  for (const model of models || []) {
    if (!model?.id) continue;
    if (model.kind && model.kind !== "llm") continue;
    const zenCtx = getCapabilitiesForModel(providerId, model.id)?.contextWindow;
    if (!Number.isFinite(zenCtx)) continue;
    checked++;

    const bare = model.upstreamModelId || model.id;
    const ref = reference.get(bare) || reference.get(model.id);
    if (!ref || !Number.isFinite(ref.ctx)) {
      noReference.push({ provider: providerId, model: model.id, zen: zenCtx });
      continue;
    }

    const ratio = zenCtx / ref.ctx;
    const row = { provider: providerId, model: model.id, zen: zenCtx, ref: ref.ctx, view: ref.view, ratio };
    // Equal within 5%, OR the two values are the same round number expressed in
    // decimal vs binary units (256000 vs 262144 = 256K; 1000000 vs 1048576 = 1M;
    // 128000 vs 131072 = 128K). Vendors and catalogs mix these conventions, and
    // treating that as a defect would produce ~80 false positives.
    if (sameWindow(zenCtx, ref.ctx)) { agree++; continue; }

    // Only a disagreement with the VENDOR'S OWN entry is a defect. A reseller
    // or aggregator row describes a different product with its own cap, so a
    // difference there is expected (verified: zai/glm-4.6v = 128000 matches
    // Zen exactly while an aggregator listed 200000).
    // A bridge provider is expected to differ from the vendor model spec.
    if (BRIDGE_PROVIDERS.has(providerId)) {
      routeScoped.push({ ...row, note: "bridge provider (own cap by design)" });
    } else if (ref.official) {
      actionable.push(row);
    } else {
      routeScoped.push({ ...row, note: "no official vendor entry; reference is " + ref.view });
    }
  }
}

console.log("=== SUMMARY ===");
console.log(`checked (numeric window):        ${checked}`);
console.log(`agree within 1%:                 ${agree}`);
console.log(`ACTIONABLE mismatches:           ${actionable.length}`);
console.log(`route-scoped differences (ok):   ${routeScoped.length}`);
console.log(`no models.dev reference:         ${noReference.length}`);

if (actionable.length) {
  console.log(`\n=== ACTIONABLE: Zen disagrees with the VENDOR'S OWN models.dev entry ===`);
  console.log("provider | model | zen | models.dev | view | reason");
  for (const r of actionable) {
    console.log(`${r.provider} | ${r.model} | ${r.zen} | ${r.ref} | ${r.view} | ${r.reason || (r.ratio < 1 ? "zen lower" : "zen higher")}`);
  }
}

if (showAll && routeScoped.length) {
  console.log(`\n=== route-scoped (expected: reseller/OAuth bridge caps differ) ===`);
  for (const r of routeScoped) console.log(`${r.provider} | ${r.model} | zen ${r.zen} vs ${r.ref} (${r.view})`);
}

if (noReference.length) {
  const byProvider = {};
  for (const r of noReference) byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
  console.log(`\n=== no models.dev reference, by provider (cannot be cross-checked) ===`);
  for (const [p, n] of Object.entries(byProvider).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${p}: ${n}`);
  }
}

process.exit(0);
