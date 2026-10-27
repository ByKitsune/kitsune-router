import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const installer = readFileSync(new URL("../../install.sh", import.meta.url), "utf8");
const currentVersion = JSON.parse(readFileSync(new URL("../../cli/package.json", import.meta.url), "utf8")).version;
const configuration = installer.slice(installer.indexOf("# Configuration"), installer.indexOf("# Helpers"));
const functions = [...installer.matchAll(/^\w+\(\) \{[\s\S]*?^\}/gm)].map(([body]) => body).join("\n");
const bash = spawnSync("bash", ["--noprofile", "--norc", "-c", "command -v bash"], { encoding: "utf8" });
const bashPath = bash.status === 0 ? bash.stdout.trim() : "";
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

// Evaluate real parsing and function bodies only, never source/execute install.sh.
// Every external command, discovery result and filesystem/install seam is mocked.
// PATH has no real directories; absolute runtime paths are Bash functions too.
function runInstaller({
  systemNode = "v22.23.2",
  systemNpm = true,
  managedNode = "",
  managedNpm = true,
  bun = "",
  bunWorks = true,
  npmInstallWorks = true,
  npmWorks = true,
  npmSudoWorks = false,
  npmPrefixWorks = false,
  bunInstallWorks = true,
  managedInstallNode = "",
  sudo = false,
  sudoPasswordless = false,
  provisioner = "",
  provisionedNode = "v22.23.2",
  provisionedNpm = true,
  cliWorks = true,
  cliInLinks = true,
  staleCliDir = "",
  staleCliWorks = true,
  installDirEnv = "",
  args = [],
  action = "main",
} = {}) {
  const script = `
set -e
exec 3>&1
SYSTEM_NODE=${quote(systemNode)}
SYSTEM_NPM=${quote(systemNpm)}
MANAGED_NODE=${quote(managedNode)}
MANAGED_NPM=${quote(managedNpm)}
BUN_VERSION=${quote(bun)}
BUN_WORKS=${quote(bunWorks)}
NPM_INSTALL_WORKS=${quote(npmInstallWorks)}
NPM_WORKS=${quote(npmWorks)}
NPM_SUDO_WORKS=${quote(npmSudoWorks)}
NPM_PREFIX_WORKS=${quote(npmPrefixWorks)}
BUN_INSTALL_WORKS=${quote(bunInstallWorks)}
MANAGED_INSTALL_NODE=${quote(managedInstallNode)}
HAS_SUDO=${quote(sudo)}
SUDO_PASSWORDLESS=${quote(sudoPasswordless)}
PROVISIONER=${quote(provisioner)}
PROVISIONED_NODE=${quote(provisionedNode)}
PROVISIONED_NPM=${quote(provisionedNpm)}
CLI_WORKS=${quote(cliWorks)}
CLI_IN_LINKS=${quote(cliInLinks)}
STALE_CLI_DIR=${quote(staleCliDir)}
STALE_CLI_WORKS=${quote(staleCliWorks)}
MOCK_CWD=/mock/workspace
MOCK_SOURCE_DIRECTORY=""
MOCK_SOURCE_READY=false
${configuration}
${functions}
record() { printf 'CALL %s\\n' "$*" >&3; }
command_not_found_handle() { record "FORBIDDEN unmocked $*"; return 99; }
log_info() { printf 'INFO %s\\n' "$1"; }
log_success() { printf 'OK %s\\n' "$1"; }
log_warn() { printf 'WARN %s\\n' "$1"; }
log_error() { printf 'ERROR %s\\n' "$1"; }
log_step() { printf 'STEP %s\\n' "$1"; }

command() {
  if [ "$1" != "-v" ]; then record "FORBIDDEN command $*"; return 99; fi
  local name="$2" directory
  case "$name" in
    node|npm|bun|kitsune-router)
      local previous_ifs="$IFS"; IFS=:
      for directory in $PATH; do
        case "$directory/$name" in
          /mock/system/bin/node) [ -n "$SYSTEM_NODE" ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/old/bin/node) printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0 ;;
          /mock/home/.npm-global/bin/node) [ "$NPM_PREFIX_WORKS" = true ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/system/bin/npm) [ "$SYSTEM_NPM" = true ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/home/.kitsune-router/node/bin/node) [ -n "$MANAGED_NODE" ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/home/.kitsune-router/node/bin/npm) [ "$MANAGED_NPM" = true ] && [ -n "$MANAGED_NODE" ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/home/.bun/bin/bun) [ -n "$BUN_VERSION" ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/links/kitsune-router) [ "$CLI_IN_LINKS" = true ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
          /mock/system/bin/kitsune-router|/mock/home/.kitsune-router/node/bin/kitsune-router|/mock/home/.bun/bin/kitsune-router)
            [ "$directory" = "$STALE_CLI_DIR" ] && { printf '%s\\n' "$directory/$name"; IFS="$previous_ifs"; return 0; } ;;
        esac
      done
      IFS="$previous_ifs"; return 1 ;;
    sudo) [ "$HAS_SUDO" = true ] || return 1 ;;
    brew|apt-get|dnf|pacman) [ "$name" = "$PROVISIONER" ] || return 1 ;;
    curl|git) ;;
    *) return 1 ;;
  esac
  printf '/mock/tools/%s\\n' "$name"
}
[() {
  case "$1" in
    -x|-f|-d|-e|-L|-r|-w)
      case "$1:$2" in
        -x:/mock/home/.kitsune-router/node/bin/node) builtin [ -n "$MANAGED_NODE" ]; return ;;
        -x:/mock/home/.kitsune-router/node/bin/npm) builtin [ -n "$MANAGED_NODE" ] && builtin [ "$MANAGED_NPM" = true ]; return ;;
        -x:/mock/links/kitsune-router) builtin [ "$CLI_IN_LINKS" = true ]; return ;;
        -d:/mock/home/.kitsune-router/app|-d:/mock/source) builtin [ "$2" = "$MOCK_SOURCE_DIRECTORY" ]; return ;;
        -f:/mock/home/.kitsune-router/app/cli/cli.js|-f:/mock/source/cli/cli.js) builtin [ "$MOCK_SOURCE_READY" = true ]; return ;;
        *) return 1 ;;
      esac ;;
    *) builtin [ "$@" ;;
  esac
}
function /mock/system/bin/node() { printf '%s\\n' "$SYSTEM_NODE"; }
function /mock/old/bin/node() { printf 'v22.18.0\\n'; }
function /mock/home/.kitsune-router/node/bin/node() { printf '%s\\n' "$MANAGED_NODE"; }
mock_npm() {
  if [ "$2" = --version ]; then [ "$NPM_WORKS" = true ] || return 1; printf '10.9.4\\n'; return 0; fi
  record "npm:$1 node:$(command -v node || true) \${*:2}"
  if [ "$2" = config ] && [ "$NPM_PREFIX_WORKS" = true ]; then PREFIX_CONFIGURED=true; return 0; fi
  if [ "\${PREFIX_CONFIGURED:-false}" = true ] && [ "$NPM_PREFIX_WORKS" = true ]; then return 0; fi
  [ "$NPM_INSTALL_WORKS" = true ] || { [ "\${MOCK_SUDO:-false}" = true ] && [ "$NPM_SUDO_WORKS" = true ]; }
}
function /mock/system/bin/npm() { mock_npm system "$@"; }
function /mock/home/.kitsune-router/node/bin/npm() { mock_npm managed "$@"; }
function /mock/home/.bun/bin/bun() {
  if [ "$1" = --version ]; then
    [ "$BUN_WORKS" = true ] || return 1
    printf '%s\\n' "$BUN_VERSION"; return 0
  fi
  record "bun $*"
  if [ "$1" = /mock/links/kitsune-router ]; then [ "$CLI_WORKS" = true ] || return 1; printf '${currentVersion}\\n'; return 0; fi
  case "$1" in
    /mock/system/bin/kitsune-router|/mock/home/.kitsune-router/node/bin/kitsune-router|/mock/home/.bun/bin/kitsune-router)
      mock_stale_cli "$@"; return ;;
  esac
  [ "$BUN_INSTALL_WORKS" = true ]
}
mock_stale_cli() {
  record "stale-kitsune-router $*"
  [ "$STALE_CLI_WORKS" = true ] || return 1
  printf '0.8.0\\n'
}
function /mock/system/bin/kitsune-router() { mock_stale_cli /mock/system/bin/kitsune-router "$@"; }
function /mock/home/.kitsune-router/node/bin/kitsune-router() { mock_stale_cli /mock/home/.kitsune-router/node/bin/kitsune-router "$@"; }
function /mock/home/.bun/bin/kitsune-router() { mock_stale_cli /mock/home/.bun/bin/kitsune-router "$@"; }
function /mock/links/kitsune-router() {
  record "kitsune-router node:$(command -v node || true) $*"
  [ "$CLI_WORKS" = true ] || return 1
  printf '${currentVersion}\\n'
}
node() { local executable; executable=$(command -v node) || return 127; "$executable" "$@"; }
npm() { local executable; executable=$(command -v npm) || return 127; "$executable" "$@"; }
bun() { local executable; executable=$(command -v bun) || return 127; "$executable" "$@"; }
kitsune-router() { local executable; executable=$(command -v kitsune-router) || return 127; "$executable" "$@"; }
sudo() {
  record "sudo $*"
  if [ "$1" = -n ]; then [ "$SUDO_PASSWORDLESS" = true ] || return 1; shift; fi
  [ "$1" != -E ] || return 1
  local PATH="/mock/old/bin:/mock/links" MOCK_SUDO=true
  "$@"
}
env() {
  local PATH="$PATH"
  while [[ "$1" == *=* ]]; do case "$1" in PATH=*) PATH="\${1#PATH=}";; esac; shift; done
  "$@"
}
provision_node() {
  record "provision $*"
  SYSTEM_NODE="$PROVISIONED_NODE"; SYSTEM_NPM="$PROVISIONED_NPM"
}
brew() { provision_node brew "$@"; }
apt-get() { provision_node apt-get "$@"; }
dnf() { provision_node dnf "$@"; }
pacman() { provision_node pacman "$@"; }
curl() { record "curl $*"; return 1; }
git() {
  record "git $*"
  case "$1" in
    check-ref-format) [ "$2" = "refs/heads/$BRANCH" ] || return 1 ;;
    clone)
      if [ "$#" != 8 ] || [ "$2" != --depth ] || [ "$3" != 1 ] || [ "$4" != --branch ] || [ "$5" != "$BRANCH" ] || [ "$6" != -- ] || [ "$7" != "$REPO_URL" ] || [ "$8" != "$INSTALL_DIR" ]; then
        record "FORBIDDEN unexpected git clone arguments $*"; return 99
      fi
      [ "$MOCK_SOURCE_DIRECTORY" = "$INSTALL_DIR" ] || return 1
      MOCK_SOURCE_READY=true ;;
    *) record "FORBIDDEN unexpected git operation $*"; return 99 ;;
  esac
}
bash() { record "bash $*"; return 1; }
id() { printf '1000\\n'; }
mkdir() {
  record "mkdir $*"
  local directory
  for directory in "$@"; do
    case "$directory" in -*) continue;; esac
    if [ "$directory" = "$INSTALL_DIR" ]; then MOCK_SOURCE_DIRECTORY="$directory"; fi
  done
}
rm() { record "rm $*"; }
mv() { record "mv $*"; }
ln() { record "ln $*"; if [ "$3" = /mock/links/kitsune-router ]; then CLI_IN_LINKS=true; fi; }
chmod() { record "chmod $*"; }
tar() { record "tar $*"; }
cd() {
  record "cd $*"
  if [ "$1" = -- ]; then shift; fi
  [ "$1" = "$MOCK_SOURCE_DIRECTORY" ] || { record "FORBIDDEN cd outside prepared source $*"; return 99; }
  MOCK_CWD="$1"
}
pwd() { printf '%s\\n' "$MOCK_CWD"; }
get_link_dir() { printf '/mock/links\\n'; }
print_banner() { :; }
detect_os() {
  OS=linux; DISTRO=mock; ARCH=x86_64
  case "$PROVISIONER" in apt-get) DISTRO=debian;; dnf) DISTRO=fedora;; pacman) DISTRO=arch;; esac
}
ensure_curl() { :; }
check_network() { :; }
check_git() { :; }
check_build_tools() { record build-tools; }
ensure_path() { :; }
configure_managed_npm_prefix() { :; }
install_managed_node() {
  record managed-node-install
  [ -n "$MANAGED_INSTALL_NODE" ] || return 1
  MANAGED_NODE="$MANAGED_INSTALL_NODE"
  PATH="$KITSUNE_ROUTER_HOME/node/bin:$PATH"
}
${action}
`;
  const result = spawnSync(bashPath, ["--noprofile", "--norc", "-c", script, "mock-installer", ...args], {
    encoding: "utf8",
    timeout: 5000,
    env: {
      HOME: "/mock/home",
      PATH: "/mock/system/bin:/mock/home/.bun/bin:/mock/links",
      DATA_DIR: "/mock/home/.kitsune-router",
      NODE_ENV: "test",
      RUN_REAL: "0",
      RUN_E2E: "0",
      RUN_LIVE_TESTS: "0",
      MODEL_CATALOG_SYNC: "off",
      KITSUNE_ROUTER_INSTALL_DIR: installDirEnv,
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.stdout).not.toContain("FORBIDDEN");
  return { ...result, calls: result.stdout.split("\n").filter((line) => line.startsWith("CALL ")) };
}

describe.skipIf(!bashPath)("installer runtime selection (mock-only)", () => {
  it("installs the scoped CLI using a supported system Node/npm pair", () => {
    const result = runInstaller({ systemNode: "v22.19.0", args: ["--skip-deps"] });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL npm:system node:/mock/system/bin/node install -g @bykitsune/router --silent");
    expect(result.stdout).toContain("Kitsune Router successfully installed");
  });

  it("parses help without attempting dependency or package operations", () => {
    const result = runInstaller({ systemNode: "", systemNpm: false, args: ["--help"] });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: install.sh [OPTIONS]");
    expect(result.calls).toEqual([]);
  });

  it("blocks all package/build operations for Node 22.18 with --skip-deps", () => {
    const result = runInstaller({ systemNode: "v22.18.0", args: ["--skip-deps"] });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/ERROR .*22\.19\.0/);
    expect(result.calls).toEqual([]);
    expect(result.stdout).not.toMatch(/successfully installed|installation completed|Get Started/);
  });

  it("keeps a supported managed Node/npm pair ahead of stale link-directory runtimes", () => {
    const result = runInstaller({
      systemNode: "v22.18.0", managedNode: "v22.23.2", args: ["--skip-deps"],
      action: 'get_link_dir() { printf "/mock/system/bin\\n"; }; main',
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL npm:managed node:/mock/home/.kitsune-router/node/bin/node install -g @bykitsune/router --silent");
    expect(result.calls).not.toContain("CALL npm:system node:/mock/system/bin/node install -g @bykitsune/router --silent");
  });

  it("uses working Bun with --skip-deps instead of falling back to unsupported npm", () => {
    const result = runInstaller({ systemNode: "v22.18.0", bun: "1.3.0", args: ["--skip-deps"] });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL bun add -g @bykitsune/router");
    expect(result.calls.some((call) => call.startsWith("CALL npm:"))).toBe(false);
    expect(result.calls).not.toContain("CALL managed-node-install");
  });

  it("does not replace selected system Node with an outdated managed Node during verification", () => {
    const result = runInstaller({ managedNode: "v22.18.0", args: ["--skip-deps"] });
    expect(result.status).toBe(0);
    expect(result.calls.filter((call) => call.startsWith("CALL kitsune-router"))).toEqual([
      "CALL kitsune-router node:/mock/system/bin/node --version",
      "CALL kitsune-router node:/mock/system/bin/node --version",
    ]);
  });

  it("rejects an auto-installed managed Node that still misses the exact minimum", () => {
    const result = runInstaller({ systemNode: "v22.18.0", managedInstallNode: "v22.18.0" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/ERROR .*22\.19\.0/);
    expect(result.calls.some((call) => /npm:|bun (?:add|install)|build-tools|git|cd/.test(call))).toBe(false);
    expect(result.stdout).not.toMatch(/successfully installed|installation completed|Get Started/);
  });

  it("retains Bun selection when automatic Node provisioning fails in the default flow", () => {
    const result = runInstaller({ systemNode: "v22.18.0", bun: "1.3.0" });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL bun add -g @bykitsune/router");
    expect(result.calls.some((call) => call.startsWith("CALL npm:"))).toBe(false);
  });

  it("retains the selected system Node/npm pair throughout source fallback", () => {
    const result = runInstaller({
      managedNode: "v22.18.0", args: ["--skip-deps", "--dir", "/mock/source"],
      action: "install_via_npm() { return 1; }; main",
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL npm:system node:/mock/system/bin/node install --silent");
    expect(result.calls).toContain("CALL npm:system node:/mock/system/bin/node run build --silent");
    expect(result.calls.some((call) => call.startsWith("CALL npm:managed"))).toBe(false);
    expect(result.calls).toContain("CALL git clone --depth 1 --branch master -- https://github.com/ByKitsune/kitsune-router.git /mock/source");
    expect(result.calls.some((call) => /^CALL (?:rm|mv) /.test(call))).toBe(false);
  });

  it("resolves competing CLI versions through mock PATH", () => {
    const result = runInstaller({
      staleCliDir: "/mock/system/bin",
      action: 'kitsune-router --version; PATH="/mock/links:$PATH"; kitsune-router --version',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0.8.0");
    expect(result.stdout).toContain(currentVersion);
    expect(result.calls).toEqual([
      "CALL stale-kitsune-router /mock/system/bin/kitsune-router --version",
      "CALL kitsune-router node:/mock/system/bin/node --version",
    ]);
  });

  it("still verifies a global CLI when no source link exists", () => {
    const result = runInstaller({ cliInLinks: false, staleCliDir: "/mock/system/bin", args: ["--skip-deps"] });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Kitsune Router found: 0.8.0 (/mock/system/bin/kitsune-router)");
    expect(result.calls.filter((call) => call.startsWith("CALL stale-kitsune-router"))).toHaveLength(2);
    expect(result.calls.some((call) => call.startsWith("CALL ln "))).toBe(false);
  });

  it.each([
    ["system", "v22.23.2", "", "/mock/system/bin"],
    ["managed", "v22.18.0", "v22.23.2", "/mock/home/.kitsune-router/node/bin"],
  ])("verifies the fresh source CLI rather than the stale global in the selected %s Node bin", (_kind, systemNode, managedNode, staleCliDir) => {
    const result = runInstaller({
      systemNode, managedNode, staleCliDir, cliInLinks: false,
      args: ["--skip-deps", "--dir", "/mock/source"],
      action: "install_via_npm() { return 1; }; main",
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL ln -sf /mock/source/cli/cli.js /mock/links/kitsune-router");
    expect(result.calls.filter((call) => call.startsWith("CALL kitsune-router"))).toEqual([
      `CALL kitsune-router node:${staleCliDir}/node --version`,
      `CALL kitsune-router node:${staleCliDir}/node --version`,
    ]);
    expect(result.calls.some((call) => call.startsWith("CALL stale-kitsune-router"))).toBe(false);
    expect(result.stdout).toContain(`Kitsune Router found: ${currentVersion} (/mock/links/kitsune-router)`);
    expect(result.stdout).toContain(`Version: ${currentVersion}`);
    expect(result.stdout).not.toContain("0.8.0");
  });

  it("fails when the fresh source CLI cannot execute even though the competing stale global works", () => {
    const result = runInstaller({
      staleCliDir: "/mock/system/bin", cliWorks: false, cliInLinks: false,
      args: ["--skip-deps", "--dir", "/mock/source"],
      action: "install_via_npm() { return 1; }; main",
    });
    expect(result.status).toBe(1);
    expect(result.calls.filter((call) => call.startsWith("CALL kitsune-router"))).toEqual([
      "CALL kitsune-router node:/mock/system/bin/node --version",
      "CALL kitsune-router node:/mock/system/bin/node -v",
    ]);
    expect(result.calls.some((call) => call.startsWith("CALL stale-kitsune-router"))).toBe(false);
    expect(result.stdout).toContain("kitsune-router could not run with the selected node runtime");
    expect(result.stdout).not.toMatch(/successfully installed|installation completed|Get Started/);
  });

  it("fails a Bun-only source install without trying unsupported npm or claiming completion", () => {
    const result = runInstaller({
      systemNode: "v22.18.0", bun: "1.3.0", bunInstallWorks: false, args: ["--skip-deps"],
      action: "install_via_npm() { return 1; }; main",
    });
    expect(result.calls.some((call) => call.startsWith("CALL npm:"))).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toMatch(/successfully installed|installation completed|Get Started/);
  });

  it.each(["brew", "apt-get", "dnf", "pacman"])("selects the validated Node/npm pair installed by %s", (provisioner) => {
    const result = runInstaller({ systemNode: "v22.18.0", provisioner, sudo: provisioner === "apt-get" });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL npm:system node:/mock/system/bin/node install -g @bykitsune/router --silent");
    expect(result.calls).not.toContain("CALL managed-node-install");
  });

  it("keeps the selected Node/npm pair during sudo retries even with a stale sudo PATH", () => {
    const result = runInstaller({
      args: ["--skip-deps"], sudo: true, npmInstallWorks: false, npmSudoWorks: true,
      action: "IS_INTERACTIVE=true; main",
    });
    expect(result.status).toBe(0);
    const npmCalls = result.calls.filter((call) => call.startsWith("CALL npm:"));
    expect(npmCalls).toHaveLength(2);
    expect(npmCalls.every((call) => call.includes("node:/mock/system/bin/node"))).toBe(true);
    expect(result.stdout).toContain("Installed via sudo");
  });

  it("uses the selected Bun to verify the CLI instead of its unsupported Node shebang", () => {
    const result = runInstaller({ systemNode: "v22.18.0", bun: "1.3.0", args: ["--skip-deps"] });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL bun /mock/links/kitsune-router --version");
    expect(result.calls.some((call) => call.startsWith("CALL kitsune-router"))).toBe(false);
  });

  it("fails verification when the installed CLI cannot execute under the selected runtime", () => {
    const result = runInstaller({ args: ["--skip-deps"], cliWorks: false });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Kitsune Router installation failed");
    expect(result.stdout).not.toMatch(/successfully installed|installation completed|Get Started/);
  });

  it("retains the selected Node in user-prefix npm retries even if that prefix contains an old Node", () => {
    const result = runInstaller({ args: ["--skip-deps"], npmInstallWorks: false, npmPrefixWorks: true });
    expect(result.status).toBe(0);
    const npmCalls = result.calls.filter((call) => call.startsWith("CALL npm:"));
    expect(npmCalls).toHaveLength(3);
    expect(npmCalls.every((call) => call.includes("node:/mock/system/bin/node"))).toBe(true);
    expect(result.stdout).toContain("Installed via user-local prefix");
  });

  it("preserves the runtime pair in non-interactive passwordless sudo retries", () => {
    const result = runInstaller({
      args: ["--skip-deps"], sudo: true, sudoPasswordless: true, npmInstallWorks: false, npmSudoWorks: true,
    });
    expect(result.status).toBe(0);
    expect(result.calls.filter((call) => call.startsWith("CALL npm:"))).toEqual([
      "CALL npm:system node:/mock/system/bin/node install -g @bykitsune/router --silent",
      "CALL npm:system node:/mock/system/bin/node install -g @bykitsune/router",
    ]);
    expect(result.stdout).toContain("Installed via sudo -n");
  });

  it.each(["v18.20.0", "v20.20.0", "v22.0.0", "v22.18.9", "v22.19.0-rc.1", "invalid"])("blocks unsupported system Node %s before package operations", (systemNode) => {
    const result = runInstaller({ systemNode, args: ["--skip-deps"] });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.stdout).toMatch(/ERROR .*22\.19\.0/);
  });

  it("blocks a supported Node without a working npm when no Bun exists", () => {
    const result = runInstaller({ npmWorks: false, args: ["--skip-deps"] });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });

  it("does not select an unusable Bun executable", () => {
    const result = runInstaller({ systemNode: "v22.18.0", bun: "1.3.0", bunWorks: false, args: ["--skip-deps"] });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });

  it("blocks a missing runtime with --skip-deps", () => {
    const result = runInstaller({ systemNode: "", systemNpm: false, args: ["--skip-deps"] });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });

  it("selects a valid managed runtime installed by the automatic fallback", () => {
    const result = runInstaller({ systemNode: "v22.18.0", managedInstallNode: "v22.23.2" });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL npm:managed node:/mock/home/.kitsune-router/node/bin/node install -g @bykitsune/router --silent");
    expect(result.calls.some((call) => call.startsWith("CALL npm:system"))).toBe(false);
  });

  it("preserves --dir, --branch and --no-build in source fallback", () => {
    const result = runInstaller({
      args: ["--skip-deps", "--dir", "/mock/source", "--branch", "feature/runtime", "--no-build"],
      action: "install_via_npm() { return 1; }; main",
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL git check-ref-format refs/heads/feature/runtime");
    expect(result.calls).toContain("CALL git clone --depth 1 --branch feature/runtime -- https://github.com/ByKitsune/kitsune-router.git /mock/source");
    expect(result.calls).toContain("CALL cd -- /mock/source");
    expect(result.calls).toContain("CALL npm:system node:/mock/system/bin/node install --silent");
    expect(result.calls.some((call) => call.includes("run build"))).toBe(false);
  });

  it("keeps Bun throughout a successful source fallback", () => {
    const result = runInstaller({
      systemNode: "v22.18.0", bun: "1.3.0", args: ["--skip-deps"],
      action: "install_via_npm() { return 1; }; main",
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL bun install --production");
    expect(result.calls).toContain("CALL bun --bun run build --silent");
    expect(result.calls.some((call) => call.startsWith("CALL npm:"))).toBe(false);
  });

  it.each(["brew", "apt-get", "dnf", "pacman"])("does not accept Node from %s without npm", (provisioner) => {
    const result = runInstaller({
      systemNode: "v22.18.0", provisioner, provisionedNpm: false, sudo: provisioner === "apt-get",
    });
    expect(result.status).toBe(1);
    expect(result.calls.some((call) => /npm:|bun (?:add|install)|build-tools|git|cd/.test(call))).toBe(false);
    expect(result.stdout).not.toMatch(/successfully installed|installation completed|Get Started/);
  });

  it("respects the environment's explicit source install directory", () => {
    const result = runInstaller({
      args: ["--skip-deps"], installDirEnv: "/mock/source", action: "install_via_npm() { return 1; }; main",
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("CALL cd -- /mock/source");
  });

  it("rejects unknown CLI arguments without any dependency or install operations", () => {
    const result = runInstaller({ args: ["--not-an-option"] });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Unknown option: --not-an-option");
    expect(result.calls).toEqual([]);
  });
});

describe("CLI minimum engine alignment", () => {
  it("matches the published CLI and its lock metadata to the exact installer minimum", () => {
    const minimum = ["MAJOR", "MINOR", "PATCH"].map((part) => installer.match(new RegExp(`^MIN_NODE_${part}=(\\d+)$`, "m"))[1]).join(".");
    const pkg = JSON.parse(readFileSync(new URL("../../cli/package.json", import.meta.url), "utf8"));
    const lock = JSON.parse(readFileSync(new URL("../../cli/package-lock.json", import.meta.url), "utf8"));
    expect(minimum).toBe("22.19.0");
    expect(pkg.engines.node).toBe(`>=${minimum}`);
    expect(lock.packages[""].engines.node).toBe(pkg.engines.node);
  });
});
