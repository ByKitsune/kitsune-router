import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const model = "gpt-6.1-terra";
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousAdapter, listeners, repo;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "kitsune-terra-pricing-"));
  previousAdapter = global._dbAdapter;
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  delete global._dbAdapter;
  vi.resetModules();
  repo = await import("../../src/lib/db/repos/pricingRepo.js");
});

afterEach(async () => {
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  if (previousAdapter === undefined) delete global._dbAdapter;
  else global._dbAdapter = previousAdapter;
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("Terra usage-pricing repository", () => {
  it("resolves an effort suffix to the API quote while keeping Codex pricing unknown", async () => {
    const apiBase = await repo.getPricingForModel("openai", model);
    const apiSuffix = await repo.getPricingForModel("openai", `${model}(high)`);
    expect(apiSuffix).toEqual(apiBase);
    expect(apiSuffix.service_tiers.fast).toMatchObject({ input: 2, cached: 0.1, output: 10, cache_write_30m: 2.5, cache_write_12h: 5 });
    const codexBase = await repo.getPricingForModel("codex", model);
    const codexSuffix = await repo.getPricingForModel("codex", `${model}(high)`);
    expect(codexSuffix).toEqual(codexBase);
    expect(codexSuffix).toMatchObject({ input: null, cached: null, output: null, reasoning: null });
    expect(codexSuffix.service_tiers).toBeUndefined();
  });
});
