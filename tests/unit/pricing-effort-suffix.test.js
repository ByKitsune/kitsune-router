// 9router #4635: usage rows keep the effort-annotated model id
// ("gpt-6.1-sol(xhigh)"). getPricingForModel resolved that id verbatim —
// missing the base model's exact entry and falling through to a broader glob
// or to null ($0). The variant must price at its base model's rate, with
// override precedence: exact annotated id > base id > static tables.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let dataDir;
let previousDataDir;
let previousAdapter;
let previousListeners;
let pricingRepo;
let constPricing;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousAdapter = Object.getOwnPropertyDescriptor(global, "_dbAdapter");
  previousListeners = new Map(
    shutdownEvents.map((event) => [event, process.rawListeners(event)])
  );
  dataDir = await mkdtemp(join(tmpdir(), "zenrouter-pricing-suffix-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  delete global._dbAdapter;
  pricingRepo = await import("@/lib/db/repos/pricingRepo.js");
  constPricing = await import("open-sse/providers/pricing.js");
});

afterEach(async () => {
  try {
    await global._dbAdapter?.instance?.close();
  } finally {
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    if (previousAdapter) Object.defineProperty(global, "_dbAdapter", previousAdapter);
    else delete global._dbAdapter;
    vi.resetModules();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

describe("pricingRepo effort-suffix resolution (#4635)", () => {
  it("prices an annotated codex model at its base model rate", async () => {
    const base = await pricingRepo.getPricingForModel("codex", "gpt-6.1-sol");
    const annotated = await pricingRepo.getPricingForModel("codex", "gpt-6.1-sol(xhigh)");
    expect(annotated).not.toBeNull();
    expect(annotated).toEqual(base);
  });

  it("an annotated id does not fall through to a broader glob", async () => {
    // gpt-5.6-sol(xhigh) must price at the exact gpt-5.6-sol entry, not the
    // broader gpt-5.6 family rate.
    const base = await pricingRepo.getPricingForModel("codex", "gpt-5.6-sol");
    const annotated = await pricingRepo.getPricingForModel("codex", "gpt-5.6-sol(xhigh)");
    expect(annotated).toEqual(base);
    expect(annotated.input).toBe(base.input);
  });

  it("a user override on the base id applies to the annotated id", async () => {
    const override = { input: 9.99, output: 99.99 };
    await pricingRepo.updatePricing({ codex: { "gpt-6.1-sol": override } });
    expect(await pricingRepo.getPricingForModel("codex", "gpt-6.1-sol(xhigh)")).toMatchObject(override);
  });

  it("a user override on the exact annotated id wins over the base override", async () => {
    const exactOverride = { input: 1.11, output: 11.11 };
    await pricingRepo.updatePricing({
      codex: { "gpt-6-sol": { input: 8.88, output: 88.88 }, "gpt-6-sol(max)": exactOverride },
    });
    expect(await pricingRepo.getPricingForModel("codex", "gpt-6-sol(max)")).toMatchObject(exactOverride);
  });

  it("an un-annotated id resolves identically to the constants table", async () => {
    for (const model of ["gpt-5.6-sol", "gpt-6-luna"]) {
      expect(await pricingRepo.getPricingForModel("codex", model))
        .toEqual(constPricing.getPricingForModel("codex", model));
    }
  });

  it("an annotated id whose base has no entry still resolves (not null)", async () => {
    // The suffix strip must not turn a resolvable family match into null.
    const resolved = await pricingRepo.getPricingForModel("codex", "gpt-6-luna(max)");
    expect(resolved).not.toBeNull();
  });
});
