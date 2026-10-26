import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
let originalDataDir;
let originalGlobals;
let originalListeners;
let originalEmit;
let tempDir;

async function setupDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-model-routing-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();

  const { createProviderNode } = await import("@/models/index.js");
  const { getModelInfo } = await import("@/sse/services/model.js");

  return { createProviderNode, getModelInfo };
}

describe("model routing", () => {
  beforeEach(() => {
    originalDataDir = process.env.DATA_DIR;
    originalGlobals = new Map(fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
    originalListeners = new Map(["beforeExit", "SIGINT", "SIGTERM"].map((event) => [event, process.rawListeners(event)]));
    originalEmit = process.emit;
    tempDir = undefined;
    for (const key of fixtureGlobals) delete global[key];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    try {
      const state = global._dbAdapter;
      const adapter = state?.instance ?? (state?.initPromise ? await state.initPromise : null);
      await adapter?.close();
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    } finally {
      for (const timer of Object.values(global._pendingTimers ?? {})) clearTimeout(timer);
      for (const timer of Object.values(global._statsEmitTimers ?? {})) clearTimeout(timer);
      for (const [event, listeners] of originalListeners) {
        for (const listener of process.rawListeners(event)) {
          if (!listeners.includes(listener)) process.removeListener(event, listener);
        }
      }
      process.emit = originalEmit;
      for (const [key, descriptor] of originalGlobals) {
        if (descriptor) Object.defineProperty(global, key, descriptor);
        else delete global[key];
      }
      if (originalDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = originalDataDir;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it("keeps built-in provider aliases ahead of compatible node prefixes", async () => {
    const ctx = await setupDb();

    await ctx.createProviderNode({
      id: "openai-compatible-chat-test",
      type: "openai-compatible",
      name: "Compatible CF Collision",
      prefix: "cf",
      apiType: "chat",
      baseUrl: "https://compatible.test/v1",
    });

    await expect(ctx.getModelInfo("cf/@cf/black-forest-labs/flux-2-klein-9b"))
      .resolves.toEqual({
        provider: "cloudflare-ai",
        model: "@cf/black-forest-labs/flux-2-klein-9b",
      });
  });

  it("still routes non-reserved compatible node prefixes", async () => {
    const ctx = await setupDb();

    await ctx.createProviderNode({
      id: "openai-compatible-chat-test",
      type: "openai-compatible",
      name: "Compatible OCT",
      prefix: "oct",
      apiType: "chat",
      baseUrl: "https://compatible.test/v1",
    });

    await expect(ctx.getModelInfo("oct/gpt-image-1"))
      .resolves.toEqual({
        provider: "openai-compatible-chat-test",
        model: "gpt-image-1",
      });
  });
});
