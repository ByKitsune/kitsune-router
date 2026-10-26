import { describe, it, expect } from "vitest";
import {
  isValidBase64,
  buildToolCallId,
  splitToolCallId,
  clearSignatureCache,
  cacheSignature,
} from "../../open-sse/translator/concerns/thoughtSignature.js";
import { openaiToGeminiRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { DEFAULT_THINKING_AG_SIGNATURE } from "../../open-sse/config/defaultThinkingSignature.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

describe("Thought signature validation & truncation resilience", () => {
  it("identifies invalid base64 strings, including the truncated 25-char error string", () => {
    // Exact truncated signature from the log that triggered Google API 400:
    // "Invalid value at 'request.contents[191].parts[0].thought_signature' (TYPE_BYTES), Base64 decoding failed for \"EmIKYAERTTIPsMumWW2CIAWzb\""
    const brokenSig = "EmIKYAERTTIPsMumWW2CIAWzb";
    expect(isValidBase64(brokenSig)).toBe(false);

    // Empty or non-string
    expect(isValidBase64("")).toBe(false);
    expect(isValidBase64(null)).toBe(false);
    expect(isValidBase64(undefined)).toBe(false);

    // Invalid characters
    expect(isValidBase64("abc!def")).toBe(false);
    expect(isValidBase64("abc=def")).toBe(false);

    // Valid signatures
    expect(isValidBase64(DEFAULT_THINKING_AG_SIGNATURE)).toBe(true);
    expect(isValidBase64("AAAA")).toBe(true);
    expect(isValidBase64("AAA=")).toBe(true);
    expect(isValidBase64("AA==")).toBe(true);
  });

  it("builds tool call ID and preserves signature through full round-trip", () => {
    const sig = DEFAULT_THINKING_AG_SIGNATURE;
    const id = buildToolCallId("read_file", 0, sig);
    const split = splitToolCallId(id);

    expect(split.rawId).toContain("read_file");
    expect(split.thoughtSignature).toBe(sig);
  });

  it("recovers the full truncated signature only from its explicit request-local map", () => {
    const sig = DEFAULT_THINKING_AG_SIGNATURE;
    const signatures = new Map();
    const fullId = buildToolCallId("read_file", 0, sig, "call_request_one", signatures);
    const truncatedId = fullId.slice(0, 60);
    expect(truncatedId.length).toBe(60);
    expect(splitToolCallId(truncatedId, signatures)).toEqual({ rawId: "call_request_one", thoughtSignature: sig });
    expect(splitToolCallId(truncatedId, new Map()).thoughtSignature).not.toBe(sig);
    expect(splitToolCallId(truncatedId).thoughtSignature).not.toBe(sig);
  });

  it("recovers truncation inside the delimiter without crossing request maps", () => {
    const sig = DEFAULT_THINKING_AG_SIGNATURE;
    const signatures = new Map();
    const fullId = buildToolCallId("read_file", 0, sig, "call_request_one", signatures);
    const delimIdx = fullId.indexOf("_TSIG_");
    const cutDelim = fullId.slice(0, delimIdx + 3);
    expect(splitToolCallId(cutDelim, signatures)).toEqual({ rawId: "call_request_one", thoughtSignature: sig });
    expect(splitToolCallId(cutDelim, new Map()).thoughtSignature).toBe("");
    expect(splitToolCallId(cutDelim).thoughtSignature).toBe("");
  });

  it("safely falls back to an empty signature after clearing its request-local map", () => {
    const signatures = new Map();
    const fullId = buildToolCallId("read_file", 0, DEFAULT_THINKING_AG_SIGNATURE, "call_request_one", signatures);
    const truncatedId = fullId.slice(0, fullId.indexOf("_TSIG_") + 3);
    clearSignatureCache(signatures);
    expect(signatures.size).toBe(0);
    expect(splitToolCallId(truncatedId, signatures).thoughtSignature).toBe("");
  });

  it("isolates identical raw IDs between tenants and never implicitly caches a raw ID", () => {
    const first = new Map();
    const second = new Map();
    const firstSignature = Buffer.from("first tenant opaque signature").toString("base64");
    const secondSignature = Buffer.from("second tenant opaque signature").toString("base64");
    const firstId = buildToolCallId("lookup", 0, firstSignature, "call_1", first);
    buildToolCallId("lookup", 0, secondSignature, "call_1", second);
    cacheSignature("call_1", firstSignature);
    expect(splitToolCallId("call_1_TS", first).thoughtSignature).toBe(firstSignature);
    expect(splitToolCallId("call_1_TS", second).thoughtSignature).toBe(secondSignature);
    expect(splitToolCallId("call_1_TS").thoughtSignature).toBe("");
    expect(splitToolCallId("call_1").thoughtSignature).toBe("");
    expect(splitToolCallId(firstId).thoughtSignature).toBe(firstSignature);
    clearSignatureCache(first);
    expect(splitToolCallId("call_1_TS", first).thoughtSignature).toBe("");
    expect(splitToolCallId("call_1_TS", second).thoughtSignature).toBe(secondSignature);
  });

  it("openaiToGeminiRequest replaces invalid or truncated thought signature with default", () => {
    const brokenSig = "EmIKYAERTTIPsMumWW2CIAWzb";
    const body = {
      model: "gemini-3.8-flash-high",
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call-123_TSIG_${Buffer.from(brokenSig, "utf8").toString("base64url")}`,
              type: "function",
              function: { name: "test_tool", arguments: "{}" },
            },
          ],
        },
      ],
    };

    clearSignatureCache();
    const geminiReq = openaiToGeminiRequest("gemini-3.8-flash-high", body, false);
    const modelTurn = geminiReq.contents.find((c) => c.role === "model");
    const funcPart = modelTurn.parts.find((p) => p.functionCall);

    expect(funcPart.thoughtSignature).toBe(DEFAULT_THINKING_AG_SIGNATURE);
    expect(isValidBase64(funcPart.thoughtSignature)).toBe(true);
  });

  it("AntigravityExecutor replaces invalid thought signatures on any part", () => {
    const brokenSig = "EmIKYAERTTIPsMumWW2CIAWzb";
    const executor = new AntigravityExecutor();
    const body = {
      request: {
        contents: [
          {
            role: "model",
            parts: [
              {
                thoughtSignature: brokenSig,
                functionCall: { name: "test_tool", args: {} },
              },
            ],
          },
        ],
      },
    };

    const transformed = executor.transformRequest("gemini-3.8-flash-high", body, false, {});
    const parts = transformed.request.contents[0].parts;
    const funcPart = parts.find((p) => p.functionCall);

    expect(funcPart.thoughtSignature).toBe(DEFAULT_THINKING_AG_SIGNATURE);
    expect(isValidBase64(funcPart.thoughtSignature)).toBe(true);
  });

  it("checkFallbackError does not trigger account fallback or lock on standard 400/422", () => {
    const error400 = checkFallbackError(400, "Invalid value at request.contents[191].parts[0].thought_signature (TYPE_BYTES)");
    expect(error400.shouldFallback).toBe(false);
    expect(error400.cooldownMs).toBe(0);

    const error422 = checkFallbackError(422, "Unprocessable Entity: schema validation failed");
    expect(error422.shouldFallback).toBe(false);
    expect(error422.cooldownMs).toBe(0);

    // However, if 400 carries an account/balance error text, it STILL falls back
    const balanceError = checkFallbackError(400, "error: balance_zero");
    expect(balanceError.shouldFallback).toBe(true);
    expect(balanceError.cooldownMs).toBe(15 * 60 * 1000);
  });
});
