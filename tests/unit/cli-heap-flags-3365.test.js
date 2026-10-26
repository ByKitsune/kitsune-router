import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveHeapFlags, DEFAULT_MAX_OLD_SPACE_MB } = require("../../cli/hooks/nodeFlags.js");
const defaultFlag = `--max-old-space-size=${DEFAULT_MAX_OLD_SPACE_MB}`;

describe("resolveHeapFlags (#3365)", () => {
  let warning;

  beforeEach(() => { warning = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => warning.mockRestore());

  it("keeps the 6144 MB default when unset", () => {
    expect(resolveHeapFlags({})).toEqual([defaultFlag]);
  });

  it("honors an explicit cap and zero disables the injected flag", () => {
    expect(resolveHeapFlags({ KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE: "384" })).toEqual(["--max-old-space-size=384"]);
    expect(resolveHeapFlags({ KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE: "0" })).toEqual([]);
    expect(resolveHeapFlags({ NINEROUTER_MAX_OLD_SPACE_SIZE: "384" })).toEqual(["--max-old-space-size=384"]);
    expect(resolveHeapFlags({ NINEROUTER_MAX_OLD_SPACE_SIZE: "0" })).toEqual([]);
  });

  it("does not override an existing NODE_OPTIONS heap flag", () => {
    expect(resolveHeapFlags({ NODE_OPTIONS: "--max-old-space-size=384" })).toEqual([]);
    expect(resolveHeapFlags({ NODE_OPTIONS: "--max_old_space_size=384" })).toEqual([]);
  });

  it("falls back to the default for invalid values", () => {
    expect(resolveHeapFlags({ KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE: "not-a-number" })).toEqual([defaultFlag]);
    expect(warning).toHaveBeenCalledOnce();
  });
});