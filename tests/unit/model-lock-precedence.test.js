import { describe, expect, it } from "vitest";
import {
  MODEL_LOCK_ALL,
  getEarliestModelLockUntil,
  getModelLockKey,
  getModelLockUntil,
  isModelLockActive,
} from "../../open-sse/services/accountFallback.js";

const MODEL = "claude-fable-5";
const past = () => new Date(Date.now() - 60_000).toISOString();
const future = () => new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

describe("isModelLockActive precedence", () => {
  it("does not let an expired per-model lock mask an active account-wide lock", () => {
    const connection = {
      [getModelLockKey(MODEL)]: past(),
      [MODEL_LOCK_ALL]: future(),
    };

    expect(isModelLockActive(connection, MODEL)).toBe(true);
    expect(isModelLockActive(connection, "some-other-model")).toBe(true);
    expect(getEarliestModelLockUntil(connection)).not.toBeNull();
  });

  it("keeps an active per-model lock", () => {
    const connection = { [getModelLockKey(MODEL)]: future() };
    expect(isModelLockActive(connection, MODEL)).toBe(true);
    expect(isModelLockActive(connection, "other")).toBe(false);
  });

  it("releases a connection once both locks have expired", () => {
    const connection = {
      [getModelLockKey(MODEL)]: past(),
      [MODEL_LOCK_ALL]: past(),
    };
    expect(isModelLockActive(connection, MODEL)).toBe(false);
    expect(isModelLockActive(connection, "other")).toBe(false);
  });

  it("treats an unparseable timestamp as no lock rather than a permanent one", () => {
    const connection = { [getModelLockKey(MODEL)]: "not-a-date" };
    expect(isModelLockActive(connection, MODEL)).toBe(false);
  });

  it("returns false when the connection carries no lock at all", () => {
    expect(isModelLockActive({}, MODEL)).toBe(false);
  });

  it("uses the latest applicable lock but not unrelated model deadlines", () => {
    const until = new Date(Date.now() + 120_000).toISOString();
    const connection = { [MODEL_LOCK_ALL]: until, [getModelLockKey(MODEL)]: new Date(Date.now() + 60_000).toISOString(), modelLock_other: new Date(Date.now() + 1000).toISOString() };
    expect(getModelLockUntil(connection, MODEL)).toBe(until);
  });

  it("shares a real lock across exact upstream aliases without merging thinking tiers", () => {
    const connection = { provider: "antigravity", "modelLock_gemini-3.8-flash": future() };
    expect(isModelLockActive(connection, "gemini-3.8-flash-medium")).toBe(true);
    expect(isModelLockActive(connection, "gemini-3.8-flash-medium(medium)")).toBe(true);
    expect(isModelLockActive(connection, "gemini-3.8-flash-high")).toBe(false);
  });

  it("does not merge Codex review and normal quota families despite an identical wire model", () => {
    const connection = { provider: "codex", "modelLock_gpt-6.1-sol-review": future() };
    expect(isModelLockActive(connection, "gpt-6.1-sol-review")).toBe(true);
    expect(isModelLockActive(connection, "gpt-6.1-sol")).toBe(false);
  });
});
