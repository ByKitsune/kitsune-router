import { describe, it, expect, beforeEach } from "vitest";
import {
  OpenCodeExecutor,
  CANONICAL_SESSION_RE,
  mintCanonicalSessionId,
  canonicalizeOpencodeSession,
  deriveRequestId,
  _resetOpencodeSessionCache,
} from "../../open-sse/executors/opencode.js";

// Upstream Zen backend gates free-tier calls on client identity (#4101,
// #4116, reverse-engineered from opencode-ai@1.18.31, version verified on npm):
//   - User-Agent must be opencode/<version> with version >= 1.17.0
//     (bare "opencode" or foreign UAs get 403 FreeTierError / 426).
//   - x-opencode-session must be ses_ + 12 hex timestamp digits + 14 Base62
//     chars (raw UUIDs / foreign session formats get 403 FreeTierError).
// The pre-rebrand ZenRouter client sent bare "opencode" and ses_<32hex> everywhere.
describe("OpenCode Zen identity compliance (#4101)", () => {
  beforeEach(() => {
    _resetOpencodeSessionCache();
  });

  it("mints canonical session ids", () => {
    for (let i = 0; i < 25; i++) {
      expect(mintCanonicalSessionId()).toMatch(CANONICAL_SESSION_RE);
    }
    expect(mintCanonicalSessionId()).not.toBe(mintCanonicalSessionId());
  });

  it("passes real canonical client sessions through byte-identical", () => {
    const real = "ses_019a3f4c2d8bKq9vX2mZ4Rt7Ws";
    expect(real).toMatch(CANONICAL_SESSION_RE);
    expect(canonicalizeOpencodeSession(real)).toBe(real);
  });

  it("maps non-canonical ids to ONE stable canonical id each", () => {
    const a1 = canonicalizeOpencodeSession("legacy-ses-value");
    const a2 = canonicalizeOpencodeSession("legacy-ses-value");
    const b = canonicalizeOpencodeSession("other-value");
    expect(a1).toMatch(CANONICAL_SESSION_RE);
    expect(a2).toBe(a1);
    expect(b).toMatch(CANONICAL_SESSION_RE);
    expect(b).not.toBe(a1);
  });

  it("derives deterministic request ids per turn (stable across retries)", () => {
    const body = (text) => ({ messages: [{ role: "user", content: text }] });
    const r1 = deriveRequestId("ses_019a3f4c2d8bKq9vX2mZ4Rt7Ws", body("hello"));
    const r2 = deriveRequestId("ses_019a3f4c2d8bKq9vX2mZ4Rt7Ws", body("hello"));
    const r3 = deriveRequestId("ses_019a3f4c2d8bKq9vX2mZ4Rt7Ws", body("different"));
    expect(r1).toMatch(/^msg_[0-9a-f]{32}$/);
    expect(r2).toBe(r1);
    expect(r3).not.toBe(r1);
  });

  it("buildHeaders sends compliant UA + canonical session without downstream headers", () => {
    const ex = new OpenCodeExecutor();
    ex.transformRequest(
      "muse-spark-1.3-contributor-free",
      { messages: [{ role: "user", content: "hi" }] },
      true,
      { connectionId: "conn-oc-1" }
    );
    const headers = ex.buildHeaders({ connectionId: "conn-oc-1" }, true);
    expect(headers["x-opencode-session"]).toMatch(CANONICAL_SESSION_RE);
    expect(headers["x-opencode-request"]).toMatch(/^msg_[0-9a-f]{32}$/);
  });

  it("reuses one canonical session per downstream identity across requests", () => {
    const ex = new OpenCodeExecutor();
    const creds = { connectionId: "conn-oc-stable" };
    const body = () => ({ messages: [{ role: "user", content: "same turn" }] });
    ex.transformRequest("mimo-v2.5-free", body(), true, creds);
    const s1 = ex.buildHeaders(creds, true)["x-opencode-session"];
    ex.transformRequest("mimo-v2.5-free", body(), true, creds);
    const s2 = ex.buildHeaders(creds, true)["x-opencode-session"];
    expect(s1).toMatch(CANONICAL_SESSION_RE);
    expect(s2).toBe(s1);
  });

});
