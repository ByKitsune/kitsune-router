// P05 regression gate — internal routing detail must never reach a client.
//
// The owner's rule: a ByKitsune user always sees the real model name with no
// prefix, and never learns which provider, account, channel or routing prefix
// served (or refused) the request.
//
// The concrete leak that motivated this gate:
//   {"error":{"message":"No active credentials for provider: openai",
//             "code":"model_not_found"}}
// The same phrasing existed in the image, video, search, tts, stt, embeddings,
// fetch and Gemini-native handlers.
//
// The contract has two halves, both asserted here:
//   - the client message is neutral and still actionable;
//   - the operator log keeps the specific reason (checked in the handler tests
//     and by the fact that handlers log before responding).
import { describe, expect, it } from "vitest";
import { publicMessage, leaksInternalDetail, safeClientMessage } from "../../src/shared/utils/clientErrors.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

describe("publicMessage", () => {
  it("never names a provider, account or routing prefix", () => {
    for (const key of ["no_credentials", "all_accounts_unavailable", "provider_unsupported_modality", "model_disabled", "upstream_rejected", "upstream_failed", "internal"]) {
      const msg = publicMessage(key);
      expect(msg, key).not.toMatch(/provider:/i);
      expect(msg, key).not.toMatch(/\b(?:cx|ag|gcli|do|ort|thbr)\//);
      expect(msg, key).not.toMatch(/codex|antigravity|kiro|gemini|openai|anthropic/i);
    }
  });

  it("stays actionable (tells the caller what to do)", () => {
    expect(publicMessage("no_credentials")).toMatch(/not available/i);
    expect(publicMessage("all_accounts_unavailable")).toMatch(/try again/i);
    expect(publicMessage("provider_unsupported_modality")).toMatch(/does not support/i);
  });

  it("falls back to a neutral message for an unknown key", () => {
    expect(publicMessage("nonsense")).toBe(publicMessage("internal"));
  });
});

describe("leaksInternalDetail", () => {
  it("flags the exact production leak", () => {
    expect(leaksInternalDetail("No active credentials for provider: openai")).toBe(true);
  });

  it("flags routing prefixes", () => {
    expect(leaksInternalDetail("cx/gpt-6-luna failed")).toBe(true);
    expect(leaksInternalDetail("ag/claude-sonnet-4-6 unavailable")).toBe(true);
  });

  it("flags known provider ids when supplied", () => {
    expect(leaksInternalDetail("codex rejected the request", ["codex"])).toBe(true);
  });

  it("does not flag neutral wording", () => {
    expect(leaksInternalDetail("The upstream provider rejected this request.")).toBe(false);
    expect(leaksInternalDetail("The requested model is not available right now.")).toBe(false);
    expect(leaksInternalDetail("")).toBe(false);
    expect(leaksInternalDetail(null)).toBe(false);
  });
});

describe("safeClientMessage", () => {
  it("replaces a leaking upstream message with the neutral fallback", () => {
    const out = safeClientMessage("No active credentials for provider: openai");
    expect(out).not.toMatch(/provider:/i);
    expect(out).toBe(publicMessage("upstream_failed"));
  });

  it("keeps a harmless upstream message intact", () => {
    expect(safeClientMessage("Invalid request: temperature must be <= 2")).toBe("Invalid request: temperature must be <= 2");
  });

  it("uses the neutral fallback for empty input", () => {
    expect(safeClientMessage("")).toBe(publicMessage("upstream_failed"));
    expect(safeClientMessage(null)).toBe(publicMessage("upstream_failed"));
  });
});

describe("no client-facing handler names an internal provider", () => {
  // Scope: the externally reachable client paths — the /v1 SSE handlers plus
  // the Gemini-native route. Dashboard routes (/api/translator/*,
  // /api/providers/*) are operator-only and may name providers; and an
  // "Unknown provider: <input>" validation message echoes the CALLER's own
  // argument, which reveals nothing about internal routing, so it is allowed.
  const CLIENT_PATH_FILES = [
    "src/sse/handlers/chat.js",
    "src/sse/handlers/imageGeneration.js",
    "src/sse/handlers/videoGeneration.js",
    "src/sse/handlers/embeddings.js",
    "src/sse/handlers/tts.js",
    "src/sse/handlers/stt.js",
    "src/sse/handlers/search.js",
    "src/sse/handlers/fetch.js",
    "src/app/api/v1beta/models/[...path]/route.js",
  ];

  it("has no remaining 'provider: <id>' string in a client response", () => {
    const offenders = [];
    for (const rel of CLIENT_PATH_FILES) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      for (const line of text.split("\n")) {
        const isClientFacing = /errorResponse\(|unavailableResponse\(|Response\.json\(|NextResponse\.json\(/.test(line);
        if (!isClientFacing) continue;
        // "Unknown provider: <caller input>" is validation of the caller's own
        // argument and is intentionally allowed.
        if (/Unknown provider:/.test(line)) continue;
        if (/provider:\s*\$\{|provider:\s*[a-z0-9_-]+/i.test(line)) {
          offenders.push(`${rel}: ${line.trim().slice(0, 110)}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps routing prefixes out of client responses", () => {
    const offenders = [];
    for (const rel of CLIENT_PATH_FILES) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      for (const line of text.split("\n")) {
        const isClientFacing = /errorResponse\(|unavailableResponse\(|Response\.json\(|NextResponse\.json\(/.test(line);
        if (isClientFacing && /\b(?:cx|ag|gcli|do|ort|thbr)\//.test(line)) {
          offenders.push(`${rel}: ${line.trim().slice(0, 110)}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
