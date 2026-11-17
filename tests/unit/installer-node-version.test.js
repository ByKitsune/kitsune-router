import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const installer = readFileSync(new URL("../../install.sh", import.meta.url), "utf8");
const constants = installer.match(/^MIN_NODE_(?:MAJOR|MINOR|PATCH)=\d+$/gm)?.join("\n") || "";
const check = installer.match(/^(?:version_at_least|node_satisfies)\(\) \{[\s\S]*?^\}/gm)?.join("\n");
const hasBash = spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;

// Evaluate only the pure version predicate, never the installer/main or host
// package operations. Windows without bash retains the JS engine gates.
describe.skipIf(!hasBash)("installer Node runtime requirement", () => {
  it.each(["v18.20.0", "v20.20.0", "v22.18.0", "v22.0.0", "invalid", "v22"]) (
    "rejects runtimes below the Undici 8 minimum: %s", (version) => {
      expect(check).toBeTruthy();
      const result = spawnSync("bash", ["-c", `${constants}\n${check}\nnode_satisfies "$1"`, "version-test", version]);
      expect(result.status).toBe(1);
    },
  );
  it.each(["v22.19.0", "v22.23.2", "v24.19.0", "v26.7.0"]) (
    "accepts supported modern runtimes: %s", (version) => {
      const result = spawnSync("bash", ["-c", `${constants}\n${check}\nnode_satisfies "$1"`, "version-test", version]);
      expect(result.status).toBe(0);
    },
  );
});
