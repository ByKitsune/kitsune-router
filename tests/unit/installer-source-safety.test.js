import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const installer = fs.readFileSync(new URL("../../install.sh", import.meta.url), "utf8");
const configuration = installer.slice(installer.indexOf("# Configuration"), installer.indexOf("# Helpers"));
// log_info's aligned, single-line definition is outside the multiline function
// extractor. Preserve its diagnostic text without requiring banner colors.
const functions = [...installer.matchAll(/^\w+\(\) \{[\s\S]*?^\}/gm)].map(([body]) => body).join("\n")
  + '\nlog_info() { printf \'INFO %s\\n\' "$1"; }\n';
const discovery = spawnSync("bash", ["--noprofile", "--norc", "-c", "command -v bash"], {
  encoding: "utf8", env: { PATH: process.env.PATH },
});
const bash = discovery.status === 0 ? discovery.stdout.trim() : "";
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function sandbox() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-router-installer-safety-"));
  directories.push(directory);
  const home = path.join(directory, "home");
  const hooks = path.join(directory, "empty-hooks");
  fs.mkdirSync(home);
  fs.mkdirSync(hooks);
  return {
    directory, home,
    env: {
      PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
      DATA_DIR: path.join(home, ".kitsune-router"), NODE_ENV: "test",
      RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0",
      MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1", KITSUNE_ROUTER_DISABLE_MITM: "1",
      KITSUNE_ROUTER_MIGRATION: "skip", NEXT_TELEMETRY_DISABLED: "1",
      // Git must never read an operator's configuration, hooks, credentials or
      // network transport. Every fetch/clone below uses our local bare remote.
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "file", GIT_CONFIG_COUNT: "3",
      GIT_CONFIG_KEY_0: "protocol.allow", GIT_CONFIG_VALUE_0: "never",
      GIT_CONFIG_KEY_1: "protocol.file.allow", GIT_CONFIG_VALUE_1: "always",
      GIT_CONFIG_KEY_2: "core.hooksPath", GIT_CONFIG_VALUE_2: hooks,
    },
  };
}

function git(f, cwd, ...args) {
  const result = spawnSync("git", args, { cwd, env: f.env, encoding: "utf8", timeout: 5000 });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout.trim();
}

function commit(f, cwd, message) {
  git(f, cwd, "add", ".");
  git(f, cwd, "-c", "user.name=Synthetic installer fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "--quiet", "-m", message);
  return git(f, cwd, "rev-parse", "HEAD");
}

function sourceFixture({ clone = true } = {}) {
  const f = sandbox();
  f.remote = path.join(f.directory, "remote.git");
  f.seed = path.join(f.directory, "seed");
  f.checkout = path.join(f.directory, "source checkout");
  f.log = path.join(f.directory, "git-calls");
  fs.writeFileSync(f.log, "");
  git(f, f.directory, "init", "--quiet", "--bare", "--initial-branch=master", f.remote);
  git(f, f.directory, "init", "--quiet", "--initial-branch=master", f.seed);
  fs.writeFileSync(path.join(f.seed, "tracked.txt"), "original tracked bytes\n");
  fs.writeFileSync(path.join(f.seed, ".gitignore"), "operator-ignored.txt\n");
  f.initial = commit(f, f.seed, "initial synthetic source");
  f.remoteUrl = pathToFileURL(f.remote).href;
  git(f, f.seed, "remote", "add", "origin", f.remoteUrl);
  git(f, f.seed, "push", "--quiet", "origin", "master");
  if (clone) git(f, f.directory, "clone", "--quiet", "--branch", "master", "--", f.remoteUrl, f.checkout);
  return f;
}

function advanceRemote(f) {
  fs.writeFileSync(path.join(f.seed, "upstream.txt"), "new upstream bytes\n");
  const head = commit(f, f.seed, "advance local remote");
  git(f, f.seed, "push", "--quiet", "origin", "master");
  return head;
}

function calls(file) {
  const result = [];
  for (const item of fs.readFileSync(file, "utf8").split("\0")) {
    if (item === "__CALL__") result.push([]);
    else if (item) result.at(-1).push(item);
  }
  return result;
}

function prepare(f, { branch = "master", directory = f.checkout } = {}) {
  const result = spawnSync(bash, ["--noprofile", "--norc", "-c", `
set -e
${configuration}
${functions}
git() {
  printf '%s\\0' '__CALL__' "$@" >> "$FIXTURE_GIT_LOG"
  command git "$@"
}
REPO_URL=${quote(f.remoteUrl)}
INSTALL_DIR=${quote(directory)}
BRANCH=${quote(branch)}
prepare_source_checkout
`], { cwd: f.directory, env: { ...f.env, FIXTURE_GIT_LOG: f.log }, encoding: "utf8", timeout: 5000 });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.stderr).not.toContain("command not found");
  const commands = calls(f.log);
  // Refusal is not safe if it first resets, cleans, stashes, or switches away
  // from the operator's checkout. Inspect commands, not just exit status.
  expect(commands.filter(args => args.some(arg => ["reset", "clean", "stash", "checkout", "switch"].includes(arg)))).toEqual([]);
  return { ...result, commands, output: result.stdout + result.stderr };
}

function head(f) { return git(f, f.checkout, "rev-parse", "HEAD"); }
function status(f) { return git(f, f.checkout, "status", "--porcelain=v1", "--untracked-files=all"); }

describe.skipIf(!bash)("installer source checkout safety through real disposable Git repositories", () => {
  it("clones the requested branch into an empty directory using only a local bare remote", () => {
    const f = sourceFixture({ clone: false });
    const result = prepare(f);
    expect(result.status, result.output).toBe(0);
    expect(head(f)).toBe(f.initial);
    expect(status(f)).toBe("");
    expect(result.commands).toContainEqual(["clone", "--depth", "1", "--branch", "master", "--", f.remoteUrl, f.checkout]);
  });

  it.each(["tracked", "untracked"])("refuses %s operator changes before fetching and retains their exact bytes", kind => {
    const f = sourceFixture();
    advanceRemote(f);
    const file = path.join(f.checkout, kind === "tracked" ? "tracked.txt" : "operator-untracked.txt");
    const bytes = Buffer.from(`operator ${kind} work\n`);
    fs.writeFileSync(file, bytes);
    const beforeStatus = status(f);
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("tracked changes or untracked files");
    expect(head(f)).toBe(f.initial);
    expect(status(f)).toBe(beforeStatus);
    expect(fs.readFileSync(file)).toEqual(bytes);
    expect(result.commands.some(args => args.includes("fetch") || args.includes("merge"))).toBe(false);
  });

  it("refuses a nonempty non-Git directory without deleting, cloning over, or changing its files", () => {
    const f = sourceFixture({ clone: false });
    fs.mkdirSync(f.checkout);
    const file = path.join(f.checkout, "operator-state");
    fs.writeFileSync(file, "retained operator state");
    const inode = fs.statSync(file).ino;
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("Non-Git install directory is not empty");
    expect(fs.readdirSync(f.checkout)).toEqual(["operator-state"]);
    expect(fs.readFileSync(file, "utf8")).toBe("retained operator state");
    expect(fs.statSync(file).ino).toBe(inode);
    expect(result.commands.some(args => args[0] === "clone")).toBe(false);
  });

  it("retains local commits and tracked bytes when the requested remote branch has diverged", () => {
    const f = sourceFixture();
    fs.writeFileSync(path.join(f.checkout, "local.txt"), "unpublished local commit\n");
    const localHead = commit(f, f.checkout, "operator local commit");
    const remoteHead = advanceRemote(f);
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("not a fast-forward");
    expect(head(f)).toBe(localHead);
    expect(status(f)).toBe("");
    expect(fs.readFileSync(path.join(f.checkout, "local.txt"), "utf8")).toBe("unpublished local commit\n");
    expect(result.commands).toContainEqual(["-C", f.checkout, "merge-base", "--is-ancestor", localHead, remoteHead]);
    expect(result.commands.some(args => args.includes("merge"))).toBe(false);
  });

  it("refuses a detached checkout without switching branches or updating its HEAD", () => {
    const f = sourceFixture();
    git(f, f.checkout, "checkout", "--quiet", "--detach", "HEAD");
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("Detached checkout");
    expect(head(f)).toBe(f.initial);
    expect(fs.readFileSync(path.join(f.checkout, ".git", "HEAD"), "utf8").trim()).toBe(f.initial);
    expect(result.commands.some(args => args.includes("fetch"))).toBe(false);
  });

  it("refuses a different checked-out branch without switching it or fetching another branch", () => {
    const f = sourceFixture();
    git(f, f.checkout, "checkout", "--quiet", "-b", "operator-work");
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("Checkout is on operator-work, not master");
    expect(git(f, f.checkout, "symbolic-ref", "--short", "HEAD")).toBe("operator-work");
    expect(head(f)).toBe(f.initial);
    expect(result.commands.some(args => args.includes("fetch"))).toBe(false);
  });

  it("does not retry a missing requested branch against the default branch or clean up the failed clone", () => {
    const f = sourceFixture({ clone: false });
    const result = prepare(f, { branch: "missing-branch" });
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("no default-branch retry or directory cleanup attempted");
    expect(result.commands.filter(args => args[0] === "clone")).toEqual([
      ["clone", "--depth", "1", "--branch", "missing-branch", "--", f.remoteUrl, f.checkout],
    ]);
    expect(git(f, f.seed, "rev-parse", "HEAD")).toBe(f.initial);
  });

  it("fast-forwards a clean checkout to the fetched commit without an automatic stash or ignored-file overwrite", () => {
    const f = sourceFixture();
    const upstream = advanceRemote(f);
    const result = prepare(f);
    expect(result.status, result.output).toBe(0);
    expect(head(f)).toBe(upstream);
    expect(status(f)).toBe("");
    expect(git(f, f.checkout, "symbolic-ref", "--short", "HEAD")).toBe("master");
    expect(fs.readFileSync(path.join(f.checkout, "upstream.txt"), "utf8")).toBe("new upstream bytes\n");
    expect(result.commands).toContainEqual(["-C", f.checkout, "-c", "merge.autoStash=false", "merge", "--ff-only", "--no-edit", "--no-overwrite-ignore", upstream]);
  });

  it("retains an ignored operator file when a fast-forward would otherwise overwrite it", () => {
    const f = sourceFixture();
    const file = path.join(f.checkout, "operator-ignored.txt");
    fs.writeFileSync(file, "operator ignored bytes\n");
    fs.writeFileSync(path.join(f.seed, "operator-ignored.txt"), "upstream tracked replacement\n");
    git(f, f.seed, "add", "--force", "operator-ignored.txt");
    commit(f, f.seed, "track formerly ignored name");
    git(f, f.seed, "push", "--quiet", "origin", "master");
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("Fast-forward update refused");
    expect(head(f)).toBe(f.initial);
    expect(fs.readFileSync(file, "utf8")).toBe("operator ignored bytes\n");
    expect(status(f)).toBe("");
  });

  it("refuses an unfinished Git operation before fetching or merging", () => {
    const f = sourceFixture();
    const marker = path.join(f.checkout, ".git", "CHERRY_PICK_HEAD");
    fs.writeFileSync(marker, f.initial + "\n");
    const result = prepare(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("unfinished Git operation");
    expect(fs.readFileSync(marker, "utf8")).toBe(f.initial + "\n");
    expect(head(f)).toBe(f.initial);
    expect(result.commands.some(args => args.includes("fetch") || args.includes("merge"))).toBe(false);
  });
});

function managedFixture(mode = "valid") {
  const f = sandbox();
  f.managedHome = path.join(f.home, ".kitsune-router");
  f.downloads = path.join(f.directory, "downloads");
  f.log = path.join(f.directory, "stage-calls");
  fs.mkdirSync(path.join(f.managedHome, "node"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(f.downloads);
  fs.writeFileSync(path.join(f.managedHome, "node", "operator-state"), "existing runtime retained\n");
  fs.writeFileSync(f.log, "");
  const archive = "node-v22.23.2-linux-x64.tar.xz";
  const bytes = Buffer.from("synthetic Node download; tar is isolated by the fixture\n");
  fs.writeFileSync(path.join(f.downloads, archive), bytes);
  const hash = mode === "checksum" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex");
  fs.writeFileSync(path.join(f.downloads, "SHASUMS256.txt"), `${hash}  ${archive}\n`);
  fs.writeFileSync(path.join(f.downloads, "members"), mode === "traversal"
    ? "node-v22.23.2-linux-x64/../escaped\n"
    : "node-v22.23.2-linux-x64/\nnode-v22.23.2-linux-x64/bin/node\n");
  for (const [name, version] of [["node", "v22.23.2"], ["npm", "10.9.4"]]) {
    fs.writeFileSync(path.join(f.downloads, name), `#!/bin/sh\n[ "$1" = "--version" ] || exit 99\nprintf '%s\\n' '${name}:--version' >> "$FIXTURE_STAGE_LOG"\nprintf '%s\\n' '${version}'\n`, { mode: 0o700 });
  }
  return f;
}

function stage(f) {
  const result = spawnSync(bash, ["--noprofile", "--norc", "-c", `
set -e
${configuration}
${functions}
KITSUNE_ROUTER_HOME=${quote(f.managedHome)}
curl() {
  [ "$#" = 4 ] && [ "$1" = -fsSL ] && [ "$3" = -o ] || return 99
  local file="\${2##*/}"
  case "$2" in https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt|https://nodejs.org/dist/latest-v22.x/node-v22.23.2-linux-x64.tar.xz) ;; *) return 99 ;; esac
  printf 'download:%s\\n' "$file" >> "$FIXTURE_STAGE_LOG"
  command cp -- "$FIXTURE_DOWNLOADS/$file" "$4"
}
tar() {
  printf 'tar:%s\\n' "$*" >> "$FIXTURE_STAGE_LOG"
  if [ "$1" = -tf ]; then command cat -- "$FIXTURE_DOWNLOADS/members"; return; fi
  [ "$1" = -xf ] && [ "$3" = -C ] && [ "$5" = --no-same-owner ] || return 99
  local candidate="$4/node-v22.23.2-linux-x64"
  command mkdir -p -- "$candidate/bin"
  command cp -- "$FIXTURE_DOWNLOADS/node" "$candidate/bin/node"
  command cp -- "$FIXTURE_DOWNLOADS/npm" "$candidate/bin/npm"
  command chmod 700 "$candidate/bin/node" "$candidate/bin/npm"
}
activate_managed_node() {
  case "$1" in "$KITSUNE_ROUTER_HOME"/.node-stage.????????/unpack/node-v22.23.2-linux-x64) ;; *) return 99 ;; esac
  printf 'activate:%s\\n' "$1" >> "$FIXTURE_STAGE_LOG"
}
stage_managed_node linux x64
`], {
    cwd: f.directory, env: { ...f.env, FIXTURE_DOWNLOADS: f.downloads, FIXTURE_STAGE_LOG: f.log },
    encoding: "utf8", timeout: 5000,
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.stderr).not.toContain("command not found");
  expect(fs.readFileSync(path.join(f.managedHome, "node", "operator-state"), "utf8")).toBe("existing runtime retained\n");
  return { ...result, output: result.stdout + result.stderr, log: fs.readFileSync(f.log, "utf8") };
}

describe.skipIf(!bash)("managed Node checksum and private staging boundaries", () => {
  it("refuses cleanup of the active runtime, arbitrary directories, and a symlink masquerading as a private stage", () => {
    const f = managedFixture();
    const unrelated = path.join(f.directory, "unrelated");
    fs.mkdirSync(unrelated);
    fs.writeFileSync(path.join(unrelated, "operator-file"), "retained outside stage\n");
    const link = path.join(f.managedHome, ".node-stage.ABCDEFGH");
    fs.symlinkSync(unrelated, link, "dir");
    for (const directory of [path.join(f.managedHome, "node"), unrelated, link]) {
      const result = spawnSync(bash, ["--noprofile", "--norc", "-c", `
set -e
${configuration}
${functions}
KITSUNE_ROUTER_HOME=${quote(f.managedHome)}
cleanup_managed_node_stage ${quote(directory)}
`], { cwd: f.directory, env: f.env, encoding: "utf8", timeout: 5000 });
      expect(result.error, result.stderr).toBeUndefined();
      expect(result.stderr).not.toContain("command not found");
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
    }
    expect(fs.readFileSync(path.join(f.managedHome, "node", "operator-state"), "utf8")).toBe("existing runtime retained\n");
    expect(fs.readFileSync(path.join(unrelated, "operator-file"), "utf8")).toBe("retained outside stage\n");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("rejects a mismatching checksum before archive inspection, extraction, or candidate execution", () => {
    const f = managedFixture("checksum");
    const result = stage(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("checksum mismatch");
    expect(result.log).not.toMatch(/tar:|node:|npm:|activate:/);
    expect(fs.readdirSync(f.managedHome)).toEqual(["node"]);
  });

  it("rejects archive traversal after checksum verification but before extracting or executing it", () => {
    const f = managedFixture("traversal");
    const result = stage(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("Unsafe Node archive traversal");
    expect(result.log).toContain("tar:-tf ");
    expect(result.log).not.toMatch(/tar:-xf|node:|npm:|activate:/);
    expect(fs.readdirSync(f.managedHome)).toEqual(["node"]);
    expect(fs.existsSync(path.join(f.managedHome, "escaped"))).toBe(false);
  });

  it("retains an existing installer lock and performs no download or cleanup of another invocation", () => {
    const f = managedFixture();
    const lock = path.join(f.managedHome, ".node-install.lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "operator-review"), "do not delete\n");
    const result = stage(f);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain("setup is locked");
    expect(result.log).toBe("");
    expect(fs.readFileSync(path.join(lock, "operator-review"), "utf8")).toBe("do not delete\n");
  });

  it("verifies archive bytes and both runtime versions before the isolated activation boundary, then removes only its own stage", () => {
    const f = managedFixture();
    const result = stage(f);
    expect(result.status, result.output).toBe(0);
    expect(result.log).toContain("download:SHASUMS256.txt\n");
    expect(result.log).toContain("download:node-v22.23.2-linux-x64.tar.xz\n");
    expect(result.log).toContain("tar:-tf ");
    expect(result.log).toContain("tar:-xf ");
    expect(result.log).toContain("node:--version\n");
    expect(result.log).toContain("npm:--version\n");
    expect(result.log.indexOf("activate:")).toBeGreaterThan(result.log.indexOf("npm:--version"));
    expect(fs.readdirSync(f.managedHome)).toEqual(["node"]);
  });
});
