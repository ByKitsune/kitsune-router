// Account-identity redaction — PII must never reach a log sink.
//
// Production journald carried 589 lines containing 27 unique account email
// addresses (`ACC:hi.vylra@gmail.com`, `[AUTH] hi.vylra@gmail.com locked …`).
// Email is PII, journald is root-readable, logs are shipped to monitoring and
// backups, and retention is long.
//
// These tests assert both halves of the contract:
//   - identities are not recoverable from the log line
//   - distinct accounts remain distinguishable, so debugging still works
import { describe, expect, it } from "vitest";
import {
  redactAccount,
  safeAccountLabel,
  redactEmailsInText,
  looksLikeEmail,
} from "../../src/shared/utils/accountRedaction.js";

describe("redactAccount", () => {
  it("never returns the input identity", () => {
    const email = "hi.vylra@gmail.com";
    const out = redactAccount(email);
    expect(out).not.toContain("vylra");
    expect(out).not.toContain("@");
    expect(out).not.toContain("gmail");
  });

  it("is stable for the same identity (grep-able across log lines)", () => {
    expect(redactAccount("a@b.com")).toBe(redactAccount("a@b.com"));
  });

  it("differs between identities (accounts stay distinguishable)", () => {
    expect(redactAccount("a@b.com")).not.toBe(redactAccount("c@d.com"));
  });

  it("produces a short hex token", () => {
    expect(redactAccount("a@b.com")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles empty/missing input without throwing", () => {
    expect(redactAccount(null)).toBe("unknown");
    expect(redactAccount(undefined)).toBe("unknown");
    expect(redactAccount("")).toBe("unknown");
    expect(redactAccount("   ")).toBe("unknown");
  });
});

describe("looksLikeEmail", () => {
  it("recognises emails", () => {
    expect(looksLikeEmail("hi.vylra@gmail.com")).toBe(true);
    expect(looksLikeEmail("aesramadhn@icloud.com")).toBe(true);
  });

  it("does not flag operator-authored labels", () => {
    expect(looksLikeEmail("Work account")).toBe(false);
    expect(looksLikeEmail("Personal")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("safeAccountLabel", () => {
  it("redacts an email address", () => {
    const label = safeAccountLabel({ email: "hi.vylra@gmail.com" });
    expect(label).not.toContain("vylra");
    expect(label).toMatch(/^acc_[0-9a-f]{8}$/);
  });

  it("redacts an email used as the connection name", () => {
    const label = safeAccountLabel({ name: "hi.vylra@gmail.com", email: "hi.vylra@gmail.com" });
    expect(label).not.toContain("vylra");
  });

  it("keeps a human-authored display name (not PII, better for debugging)", () => {
    expect(safeAccountLabel({ displayName: "Work account", email: "x@y.com" })).toBe("Work account");
  });

  it("falls back to a hashed connection id when no label exists", () => {
    const label = safeAccountLabel({ id: "conn-1234" });
    expect(label).toMatch(/^acc_[0-9a-f]{8}$/);
    expect(label).not.toContain("conn-1234");
  });

  it("keeps distinct connections distinguishable", () => {
    const a = safeAccountLabel({ id: "conn-1" });
    const b = safeAccountLabel({ id: "conn-2" });
    expect(a).not.toBe(b);
  });

  it("survives null/garbage input", () => {
    expect(safeAccountLabel(null)).toBe("unknown");
    expect(safeAccountLabel(undefined)).toBe("unknown");
    expect(safeAccountLabel("string")).toBe("unknown");
    expect(safeAccountLabel({})).toBe("unknown");
  });
});

describe("redactEmailsInText", () => {
  it("redacts an email embedded in an upstream error message", () => {
    const out = redactEmailsInText("Encountered invalidated oauth token for user hi.vylra@gmail.com, failing request");
    expect(out).not.toContain("vylra");
    expect(out).toContain("invalidated oauth token");
  });

  it("redacts every address in a multi-address line", () => {
    const out = redactEmailsInText("a@b.com and c@d.com both failed");
    expect(out).not.toContain("a@b.com");
    expect(out).not.toContain("c@d.com");
  });

  it("leaves text without emails untouched", () => {
    expect(redactEmailsInText("rate limit exceeded")).toBe("rate limit exceeded");
  });

  it("passes through non-strings", () => {
    expect(redactEmailsInText(null)).toBe(null);
    expect(redactEmailsInText(undefined)).toBe(undefined);
  });
});
