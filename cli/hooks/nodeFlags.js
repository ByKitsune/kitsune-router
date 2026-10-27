const DEFAULT_MAX_OLD_SPACE_MB = 6144;
const HEAP_FLAG_PATTERN = /(^|\s)--max[-_]old[-_]space[-_]size(=|\s|$)/;
const CGROUP_MAX_UNLIMITED = 9223372036854772000n; // "max" in cgroup v2 ~ 9e18

function readCgroupMemoryLimitMb() {
  try {
    const fs = require("fs");
    // cgroup v2: /sys/fs/cgroup/memory.max
    for (const p of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
      try {
        if (!fs.existsSync(p)) continue;
        const raw = fs.readFileSync(p, "utf8").trim();
        if (!raw || raw === "max") continue;
        const bytes = BigInt(raw);
        if (bytes <= 0n || bytes >= CGROUP_MAX_UNLIMITED) continue;
        const mb = Number(bytes / 1024n / 1024n);
        if (Number.isFinite(mb) && mb > 0) return mb;
      } catch {}
    }
  } catch {}
  return null;
}

function getDefaultHeapMb() {
  // Respect cgroup limit (Docker --memory, systemd MemoryMax, k8s) — use 75% of limit
  // to leave room for non-heap RSS, clamped to 256..6144. Fixes #3365 OOM-loop.
  const cgroupMb = readCgroupMemoryLimitMb();
  if (cgroupMb !== null) {
    const capped = Math.floor(cgroupMb * 0.75);
    if (capped < DEFAULT_MAX_OLD_SPACE_MB) {
      return Math.max(256, Math.min(capped, DEFAULT_MAX_OLD_SPACE_MB));
    }
  }
  // Fallback: if system has <4GB, scale down (e.g. 1.6GB host → ~1200MB heap)
  try {
    const os = require("os");
    const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
    if (totalMb > 0 && totalMb < 4096) {
      const scaled = Math.floor(totalMb * 0.75);
      if (scaled < DEFAULT_MAX_OLD_SPACE_MB) return Math.max(256, scaled);
    }
  } catch {}
  return DEFAULT_MAX_OLD_SPACE_MB;
}

function resolveHeapFlags(env = process.env) {
  // NINEROUTER_* is a migration-only alias; new configurations use KITSUNE_ROUTER_*.
  const varName = env.KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE !== undefined
    ? "KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE"
    : env.NINEROUTER_MAX_OLD_SPACE_SIZE !== undefined
      ? "NINEROUTER_MAX_OLD_SPACE_SIZE"
      : null;

  if (varName) {
    const explicit = String(env[varName] ?? "").trim();
    if (explicit === "0") return [];
    const megabytes = Number(explicit);
    if (Number.isInteger(megabytes) && megabytes > 0) {
      return [`--max-old-space-size=${megabytes}`];
    }
    console.warn(
      `[kitsune-router] ignoring ${varName}="${explicit}": expected a positive integer (MB) or 0`,
    );
  }

  if (HEAP_FLAG_PATTERN.test(String(env.NODE_OPTIONS ?? ""))) return [];
  return [`--max-old-space-size=${getDefaultHeapMb()}`];
}

module.exports = { resolveHeapFlags, DEFAULT_MAX_OLD_SPACE_MB };
