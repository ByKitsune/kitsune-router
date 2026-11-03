import { describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/config/thoughtSignatures.js", async importOriginal => {
  const actual = await importOriginal();
  const { createHash } = await import("node:crypto");
  // Four synthetic bytes, never a captured provider signature.
  const fixtureDigest = createHash("sha256").update(Buffer.from([0x00, 0x7f, 0x80, 0xff])).digest("hex");
  return { ...actual, LEGACY_THOUGHT_SIGNATURE_SHA256: new Set([...actual.LEGACY_THOUGHT_SIGNATURE_SHA256, fixtureDigest]) };
});

import {
  buildToolCallId,
  isLegacyThoughtSignature,
  isValidBase64,
  splitToolCallId,
  validateThoughtSignature,
} from "../../open-sse/translator/concerns/thoughtSignature.js";
import { GOOGLE_MIGRATED_HISTORY_MARKER } from "../../open-sse/config/thoughtSignatures.js";

const syntheticBytes = Buffer.from([0x00, 0x7f, 0x80, 0xff]);
const padded = syntheticBytes.toString("base64");
const unpadded = padded.replace(/=+$/, "");

describe("Google retired-signature byte quarantine", () => {
  it.each([padded, unpadded])("rejects equivalent padded/unpadded bytes at validation: %s", signature => {
    expect(isValidBase64(signature)).toBe(true);
    expect(Buffer.from(signature, "base64")).toEqual(syntheticBytes);
    expect(isLegacyThoughtSignature(signature)).toBe(true);
    expect(() => validateThoughtSignature(signature)).toThrowError(expect.objectContaining({ code: "invalid_thought_signature" }));
  });

  it.each([padded, unpadded])("cannot recover quarantined bytes through tool IDs or a request-local map: %s", signature => {
    const id = buildToolCallId("lookup", 0, signature, "synthetic-call");
    expect(() => splitToolCallId(id, null, { strict: true })).toThrowError(expect.objectContaining({ code: "invalid_thought_signature" }));
    expect(splitToolCallId(id).thoughtSignature).toBe("");
    expect(splitToolCallId("synthetic-call", new Map([["synthetic-call", signature]])).thoughtSignature).toBe("");
  });

  it("preserves other synthetic opaque values exactly, including permitted padding", () => {
    const original = Buffer.from([0x00, 0x7f, 0x80, 0xfe]).toString("base64");
    for (const signature of [original, original.replace(/=+$/, "")]) {
      expect(isLegacyThoughtSignature(signature)).toBe(false);
      expect(validateThoughtSignature(signature)).toBe(signature);
    }
  });

  it.each(["AH*A/w==", "AH+A/w=", "A", null, 42])("leaves malformed signature rejection to validation: %s", value => {
    expect(() => validateThoughtSignature(value)).toThrowError(expect.objectContaining({ code: "invalid_thought_signature" }));
  });

  it("preserves the caller's explicit documented migration marker", () => {
    expect(validateThoughtSignature(GOOGLE_MIGRATED_HISTORY_MARKER)).toBe(GOOGLE_MIGRATED_HISTORY_MARKER);
  });
});
