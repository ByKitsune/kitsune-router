import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const readSource = (relativePath) =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("CLI Tools API key resolution (#4399)", () => {
  it("CodexToolCard prefers real dashboard key over placeholder sk_kitsunerouter", async () => {
    const cardSource = await readSource("../../src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js");
    // The stored draft and its effective selection are now separate; the
    // render/event regression suite also exercises this placeholder fallback.
    expect(cardSource).toContain('apiKeyDraft !== "sk_kitsunerouter"');
    expect(cardSource).toContain("apiKeys?.length > 0 ? apiKeys[0].key");
  });

  it("ApiKeySelect initializes parent state with first active key", async () => {
    const selectSource = await readSource("../../src/app/(dashboard)/dashboard/cli-tools/components/ApiKeySelect.js");
    expect(selectSource).toContain("onChange(apiKeys[0].key)");
  });

  it("server-side codex-settings route resolves active key when key is empty or placeholder", async () => {
    const routeSource = await readSource("../../src/app/api/cli-tools/codex-settings/route.js");
    expect(routeSource).toContain('apiKey === "sk_kitsunerouter"');
    expect(routeSource).toContain("@/lib/db/repos/apiKeysRepo.js");
    expect(routeSource).toContain("keys?.filter(k => k.isActive)");
  });

  it("server-side copilot-settings route resolves active key when key is empty or placeholder", async () => {
    const routeSource = await readSource("../../src/app/api/cli-tools/copilot-settings/route.js");
    expect(routeSource).toContain('keyToUse === "sk_kitsunerouter"');
    expect(routeSource).toContain("@/lib/db/repos/apiKeysRepo.js");
  });
});
