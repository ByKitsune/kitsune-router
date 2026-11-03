import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ initializeApp: vi.fn(async () => {}) }));
vi.mock("../../src/shared/services/initializeApp.js", () => ({ default: fixture.initializeApp }));

let previousBootstrapped;
beforeEach(() => {
  previousBootstrapped = Object.getOwnPropertyDescriptor(globalThis, "__appBootstrapped");
  delete globalThis.__appBootstrapped;
  fixture.initializeApp.mockClear();
  vi.resetModules();
});
afterEach(() => {
  if (previousBootstrapped) Object.defineProperty(globalThis, "__appBootstrapped", previousBootstrapped);
  else delete globalThis.__appBootstrapped;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("server bootstrap warning boundary", () => {
  it("leaves native process warning functions intact during build imports", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const emit = process.emit;
    const emitWarning = process.emitWarning;
    await import("../../src/shared/services/bootstrap.js");
    expect(process.emit).toBe(emit);
    expect(process.emitWarning).toBe(emitWarning);
    expect(fixture.initializeApp).not.toHaveBeenCalled();
  });

  it("still initializes the server once across repeated imports without intercepting warnings", async () => {
    vi.stubEnv("NEXT_PHASE", "");
    const emit = process.emit;
    const emitWarning = process.emitWarning;
    await import("../../src/shared/services/bootstrap.js");
    vi.resetModules();
    await import("../../src/shared/services/bootstrap.js");
    expect(fixture.initializeApp).toHaveBeenCalledTimes(1);
    expect(process.emit).toBe(emit);
    expect(process.emitWarning).toBe(emitWarning);
  });
});
