#!/usr/bin/env bash
set -e

# ==============================================================================
# Kitsune Router by ByKitsune — Your models. Your routes.
# https://github.com/ByKitsune/kitsune-router
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ByKitsune/kitsune-router/master/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ByKitsune/kitsune-router/master/install.sh | bash -s -- --dir ~/.kitsune-router/app --branch master
#
# Options:
#   --dir PATH      Custom install directory (default: ~/.kitsune-router/app for source fallback)
#   --branch NAME   Git branch to clone (default: master)
#   --help          Show help
#   --no-build      Skip npm build step when using source fallback
#   --skip-deps     Skip system dependency auto-install
#
# Features (inspired by hermes-agent zero-config):
#   - Auto-detects OS/arch, handles Linux/macOS/WSL/Termux
#   - Auto-installs missing deps: git, curl, Node.js (>=22.19.0), build tools
#   - Managed Node fallback (downloads official tarball to ~/.kitsune-router/node if system Node is too old)
#   - Non-interactive safe (curl | bash), handles sudo gracefully
#   - Re-runs fast-forward clean source checkouts; never discard local work
#   - Managed Node upgrades retain recognized prior installs for manual recovery
# ==============================================================================

# Guard against env leakage (like hermes)
if [ -n "${PYTHONPATH:-}" ]; then unset PYTHONPATH; fi
if [ -n "${NODE_PATH:-}" ] && [[ "$NODE_PATH" == *".hermes"* ]]; then unset NODE_PATH; fi

# Colors
BOLD="\033[1m"
GREEN="\033[38;2;85;219;156m"
BLUE="\033[38;2;75;114;164m"
CYAN="\033[38;2;77;162;255m"
CORAL="\033[38;2;232;93;63m"
YELLOW="\033[38;2;255;215;49m"
GRAY="\033[38;2;148;163;184m"
RED="\033[38;2;248;113;113m"
RESET="\033[0m"

# Configuration
REPO_URL="https://github.com/ByKitsune/kitsune-router.git"
KITSUNE_ROUTER_HOME="${KITSUNE_ROUTER_HOME:-$HOME/.kitsune-router}"
INSTALL_DIR=""
INSTALL_DIR_EXPLICIT=false
BRANCH="master"
SKIP_BUILD=false
SKIP_DEPS=false
NODE_VERSION="22"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=19
MIN_NODE_PATCH=0
RUNTIME=""
NODE_CMD=""
NPM_CMD=""
BUN_CMD=""
SOURCE_CLI_CMD=""

if [ -n "${KITSUNE_ROUTER_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$KITSUNE_ROUTER_INSTALL_DIR"
  INSTALL_DIR_EXPLICIT=true
fi

# Detect non-interactive (curl | bash)
if [ -t 0 ]; then IS_INTERACTIVE=true; else IS_INTERACTIVE=false; fi

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; INSTALL_DIR_EXPLICIT=true; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --no-build) SKIP_BUILD=true; shift ;;
    --skip-deps) SKIP_DEPS=true; shift ;;
    -h|--help)
      echo "Kitsune Router Installer"
      echo ""
      echo "Usage: install.sh [OPTIONS]"
      echo "  --dir PATH     Install directory for source fallback (default: ~/.kitsune-router/app)"
      echo "  --branch NAME  Git branch (default: master)"
      echo "  --no-build     Skip build step"
      echo "  --skip-deps    Skip system dependency auto-install"
      echo "  -h, --help     Show help"
      exit 0
      ;;
    *) echo -e "${YELLOW}Unknown option: $1${RESET}"; exit 1 ;;
  esac
done

# Helpers
log_info()    { echo -e "${CYAN}→${RESET} $1"; }
log_success() { echo -e "${GREEN}✓${RESET} $1"; }
log_warn()    { echo -e "${YELLOW}⚠${RESET} $1"; }
log_error()   { echo -e "${RED}✗${RESET} $1"; }
log_step()    { echo -e "${BLUE}▸${RESET} ${BOLD}$1${RESET}"; }

prompt_yes_no() {
  local q="$1" def="${2:-yes}" ans="" suffix="[Y/n]"
  case "$def" in [nN]*) suffix="[y/N]";; esac
  if [ "$IS_INTERACTIVE" = true ]; then
    read -r -p "$q $suffix " ans || ans=""
  elif [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf "%s %s " "$q" "$suffix" > /dev/tty
    IFS= read -r ans < /dev/tty || ans=""
  else
    ans=""
  fi
  ans="${ans#"${ans%%[![:space:]]*}"}"; ans="${ans%"${ans##*[![:space:]]}"}"
  if [ -z "$ans" ]; then case "$def" in [yY]*) return 0;; *) return 1;; esac; fi
  case "$ans" in [yY]|[yY][eE][sS]) return 0;; *) return 1;; esac
}

is_termux() { [ -n "${TERMUX_VERSION:-}" ] || [[ "${PREFIX:-}" == *"com.termux/files/usr"* ]]; }
is_wsl() { grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; }

# Resolve install layout
resolve_install_layout() {
  if [ "$INSTALL_DIR_EXPLICIT" = true ]; then
    log_info "Install dir: $INSTALL_DIR (explicit)"
    return 0
  fi
  INSTALL_DIR="$KITSUNE_ROUTER_HOME/app"
}

get_link_dir() {
  if is_termux && [ -n "${PREFIX:-}" ]; then echo "$PREFIX/bin"
  elif [ "$(id -u 2>/dev/null || echo 1000)" -eq 0 ] && [ -d "/usr/local/bin" ]; then echo "/usr/local/bin"
  else echo "$HOME/.local/bin"
  fi
}

# Banner
print_banner() {
  echo ""
  echo -e "${CORAL}${BOLD} Kitsune Router${RESET} ${GRAY}by ByKitsune${RESET}"
  echo -e "${BOLD} Your models. Your routes.${RESET}"
  echo -e "${GRAY} A provider-neutral AI gateway${RESET}"
  echo -e "${GRAY} https://github.com/ByKitsune/kitsune-router${RESET}"
  echo ""
}

# OS detection
detect_os() {
  local uname_s
  uname_s="$(uname -s)"
  case "$uname_s" in
    Linux*)
      if is_termux; then OS="android"; DISTRO="termux"
      else
        OS="linux"
        if [ -f /etc/os-release ]; then . /etc/os-release; DISTRO="$ID"; DISTRO_VERSION="${VERSION_ID:-}"; else DISTRO="unknown"; fi
      fi
      ;;
    Darwin*) OS="macos"; DISTRO="macos" ;;
    CYGWIN*|MINGW*|MSYS*) OS="windows"; DISTRO="windows" ;;
    *) OS="unknown"; DISTRO="unknown" ;;
  esac
  ARCH="$(uname -m)"
  case "$ARCH" in x86_64) ARCH_NICE="x64";; aarch64|arm64) ARCH_NICE="arm64";; armv7l) ARCH_NICE="armv7l";; *) ARCH_NICE="$ARCH";; esac
  log_success "Detected: ${OS}/${DISTRO} (${ARCH})"
  if [ "$OS" = "windows" ]; then
    log_warn "Native Windows detected — WSL2 or Docker is strongly recommended."
    log_info "  WSL: wsl --install"
    log_info "  Docker: docker run -p 20128:20128 -v kitsune-router-data:/app/data ghcr.io/bykitsune/kitsune-router:latest"
  fi
  if is_wsl; then log_info "WSL detected — using Linux flow"; fi
}

# Network check
check_network() {
  if ! command -v curl >/dev/null 2>&1; then return 0; fi
  log_info "Checking connectivity..."
  local ok=true
  for url in "https://registry.npmjs.org/" "https://github.com/" "https://nodejs.org/dist/"; do
    if ! curl -fsSI --max-time 8 "$url" >/dev/null 2>&1; then
      log_warn "Cannot reach $url"; ok=false
    fi
  done
  if [ "$ok" = true ]; then log_success "Network OK"; else log_warn "Some hosts unreachable — install may fail, check proxy/DNS"; fi
}

# Check curl
ensure_curl() {
  if command -v curl >/dev/null 2>&1; then return 0; fi
  log_warn "curl not found — required for downloads"
  if [ "$SKIP_DEPS" = true ]; then log_error "curl missing and --skip-deps set"; exit 1; fi
  local sudo_cmd=""; [ "$(id -u 2>/dev/null || echo 1000)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo_cmd="sudo"
  case "$DISTRO" in
    ubuntu|debian) $sudo_cmd apt-get update -qq && $sudo_cmd apt-get install -y -qq curl || true ;;
    fedora) $sudo_cmd dnf install -y curl || true ;;
    arch) $sudo_cmd pacman -S --noconfirm curl || true ;;
    termux) pkg install -y curl || true ;;
    macos) command -v brew >/dev/null 2>&1 && brew install curl || true ;;
  esac
  command -v curl >/dev/null 2>&1 || { log_error "curl still missing — install manually"; exit 1; }
  log_success "curl installed"
}

# Git
attempt_install_git() {
  log_info "Attempting to install git..."
  local sudo_cmd=""; [ "$(id -u 2>/dev/null || echo 1000)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo_cmd="sudo"
  case "$OS" in
    macos)
      if command -v brew >/dev/null 2>&1; then brew install git >/dev/null 2>&1 || true; command -v git >/dev/null 2>&1 && return 0; fi
      if command -v xcode-select >/dev/null 2>&1; then
        log_info "Requesting Xcode Command Line Tools (provides git)..."
        xcode-select --install >/dev/null 2>&1 || true
        local waited=0; while [ $waited -lt 300 ]; do command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1 && return 0; sleep 5; waited=$((waited+5)); done
      fi
      return 1
      ;;
    linux|android)
      case "$DISTRO" in
        ubuntu|debian) $sudo_cmd env DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true; $sudo_cmd apt-get install -y -qq git >/dev/null 2>&1 || true ;;
        fedora) $sudo_cmd dnf install -y git >/dev/null 2>&1 || true ;;
        arch) $sudo_cmd pacman -S --noconfirm git >/dev/null 2>&1 || true ;;
        termux) pkg install -y git >/dev/null 2>&1 || true ;;
        *) return 1 ;;
      esac
      command -v git >/dev/null 2>&1 && return 0; return 1
      ;;
    *) return 1 ;;
  esac
}

check_git() {
  log_step "Checking git"
  if command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1; then log_success "git $(git --version | awk '{print $3}') found"; return 0; fi
  log_warn "git not found"
  if [ "$SKIP_DEPS" = true ]; then log_error "git required for source fallback"; return 1; fi
  if attempt_install_git; then log_success "git $(git --version | awk '{print $3}') installed"; return 0; fi
  log_warn "Could not auto-install git"
  case "$OS" in
    linux) case "$DISTRO" in ubuntu|debian) log_info "  sudo apt install git";; fedora) log_info "  sudo dnf install git";; arch) log_info "  sudo pacman -S git";; esac ;;
    macos) log_info "  xcode-select --install  # or brew install git" ;;
    android) log_info "  pkg install git" ;;
  esac
  return 1
}

# Node helpers
node_satisfies() {
  local ver="${1#v}"
  [[ "$ver" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || return 1
  local major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"
  if [ "$major" -gt "$MIN_NODE_MAJOR" ]; then return 0; fi
  [ "$major" -eq "$MIN_NODE_MAJOR" ] || return 1
  if [ "$minor" -gt "$MIN_NODE_MINOR" ]; then return 0; fi
  [ "$minor" -eq "$MIN_NODE_MINOR" ] && [ "$patch" -ge "$MIN_NODE_PATCH" ]
}

select_node_runtime() {
  local node_cmd="$1" npm_cmd="$2" ver
  [ -n "$node_cmd" ] && [ -n "$npm_cmd" ] || return 1
  ver=$("$node_cmd" --version 2>/dev/null) || return 1
  node_satisfies "$ver" || return 1
  PATH="${node_cmd%/*}:$PATH" "$npm_cmd" --version >/dev/null 2>&1 || return 1
  RUNTIME="node"
  NODE_CMD="$node_cmd"
  NPM_CMD="$npm_cmd"
  export PATH="${NODE_CMD%/*}:$PATH"
}

select_bun_runtime() {
  local bun_cmd
  bun_cmd=$(command -v bun) || return 1
  "$bun_cmd" --version >/dev/null 2>&1 || return 1
  RUNTIME="bun"
  BUN_CMD="$bun_cmd"
  NODE_CMD=""
  NPM_CMD=""
}

managed_node_is_owned() {
  local directory="$1" marker_owner marker_home actual_home
  [ -d "$directory" ] && [ ! -L "$directory" ] && [ -O "$directory" ] || return 1
  local marker="$directory/.kitsune-router-managed-node"
  [ -f "$marker" ] && [ ! -L "$marker" ] && [ -O "$marker" ] || return 1
  { IFS= read -r marker_owner && IFS= read -r marker_home; } < "$marker" || return 1
  actual_home=$(cd -- "$directory/.." && pwd -P) || return 1
  [ "$marker_owner" = "kitsune-router-managed-node-v1" ] && [ "$marker_home" = "$actual_home" ] || return 1
  [ -f "$directory/bin/node" ] && [ ! -L "$directory/bin/node" ] && [ -x "$directory/bin/node" ] && [ -f "$directory/lib/node_modules/npm/package.json" ]
}

configure_managed_npm_prefix() {
  # An override may point at a user-maintained Node tree. Do not claim it or
  # rewrite its npm configuration just because bin/npm happens to exist.
  managed_node_is_owned "$KITSUNE_ROUTER_HOME/node" || return 0
  local directory="$KITSUNE_ROUTER_HOME/node/etc" config="$KITSUNE_ROUTER_HOME/node/etc/npmrc"
  if [ -L "$config" ] || { [ -e "$config" ] && [ ! -f "$config" ]; }; then
    log_error "Refusing unsafe managed npm configuration: $config"
    return 1
  fi
  if [ -f "$config" ]; then return 0; fi
  if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; }; then
    log_error "Refusing unsafe managed npm configuration directory: $directory"
    return 1
  fi
  local link_dir; link_dir="$(get_link_dir)"
  mkdir -p -- "$directory" || return 1
  (umask 077; set -C; printf 'prefix=%s\n' "$(dirname "$link_dir")" > "$config") || return 1
}

cleanup_managed_node_stage() {
  local stage="$1"
  # Only the private mktemp directory from this invocation can be removed.
  case "$stage" in "$KITSUNE_ROUTER_HOME"/.node-stage.*) ;; *) return 1 ;; esac
  [ "${stage%/*}" = "$KITSUNE_ROUTER_HOME" ] || return 1
  [[ "${stage##*/}" =~ ^\.node-stage\.[A-Za-z0-9]{8}$ ]] || return 1
  [ -d "$stage" ] && [ ! -L "$stage" ] && [ -O "$stage" ] || return 1
  rm -rf -- "$stage"
}

activate_managed_node() {
  local candidate="$1"
  # The checksum-verified new Node performs exact rename operations, not mv's
  # directory-nesting behavior. Existing installs are retained, never deleted.
  "$candidate/bin/node" - "$KITSUNE_ROUTER_HOME" "$candidate" <<'KITSUNE_MANAGED_NODE'
    const fs = require("node:fs");
    const path = require("node:path");
    const [home, candidate] = process.argv.slice(2);
    const target = path.join(home, "node");
    const marker = ".kitsune-router-managed-node";
    const expectedMarker = `kitsune-router-managed-node-v1\n${home}\n`;
    const exists = (file) => {
      try { return fs.lstatSync(file); } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    };
    const privateDirectory = (directory) => {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o022)) {
        throw new Error(`Refusing unowned or writable managed directory: ${directory}`);
      }
    };
    const regularFile = (file) => {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid()) {
        throw new Error(`Refusing unsafe managed file: ${file}`);
      }
    };
    const nodeLayout = (directory) => {
      privateDirectory(directory);
      for (const relative of ["bin", "lib", "lib/node_modules", "lib/node_modules/npm"]) {
        privateDirectory(path.join(directory, relative));
      }
      regularFile(path.join(directory, "bin/node"));
      regularFile(path.join(directory, "lib/node_modules/npm/package.json"));
      const npm = fs.realpathSync(path.join(directory, "bin/npm"));
      if (!npm.startsWith(path.join(directory, "lib/node_modules/npm") + path.sep)) {
        throw new Error("Managed npm executable points outside its installation");
      }
    };
    const stage = path.dirname(path.dirname(candidate));
    let backup;
    let movedPrevious = false;
    try {
      privateDirectory(home);
      if (fs.realpathSync(home) !== home || path.dirname(stage) !== home || !/^\.node-stage\.[A-Za-z0-9]{8}$/.test(path.basename(stage)) || path.basename(path.dirname(candidate)) !== "unpack") {
        throw new Error("Invalid managed Node staging location");
      }
      nodeLayout(candidate);
      const stageStat = fs.lstatSync(stage);
      privateDirectory(stage);
      privateDirectory(path.dirname(candidate));
      if (stageStat.mode & 0o077) throw new Error("Node staging directory is not private");
      const previous = exists(target);
      if (previous) {
        nodeLayout(target);
        regularFile(path.join(target, marker));
        const markerStat = fs.statSync(path.join(target, marker));
        if ((markerStat.mode & 0o022) || fs.readFileSync(path.join(target, marker), "utf8") !== expectedMarker) {
          throw new Error("Existing Node installation is not owned by this installer");
        }
        const npmConfig = path.join(target, "etc/npmrc");
        if (exists(npmConfig)) {
          privateDirectory(path.join(target, "etc"));
          regularFile(npmConfig);
          fs.mkdirSync(path.join(candidate, "etc"), { recursive: true, mode: 0o700 });
          fs.copyFileSync(npmConfig, path.join(candidate, "etc/npmrc"), fs.constants.COPYFILE_EXCL);
          fs.chmodSync(path.join(candidate, "etc/npmrc"), 0o600);
        }
      }
      fs.writeFileSync(path.join(candidate, marker), expectedMarker, { flag: "wx", mode: 0o600 });
      const current = exists(target);
      if (Boolean(current) !== Boolean(previous) || (current && (current.dev !== previous.dev || current.ino !== previous.ino))) {
        throw new Error("Managed Node destination changed during validation; no replacement attempted");
      }
      if (previous) {
        backup = path.join(fs.mkdtempSync(path.join(home, ".node-previous-")), "node");
        fs.renameSync(target, backup);
        movedPrevious = true;
        console.log(`Previous managed Node retained at ${backup}`);
      }
      if (exists(target)) throw new Error("Managed Node destination appeared concurrently; retained prior installation is untouched");
      fs.renameSync(candidate, target);
    } catch (error) {
      if (movedPrevious && !exists(target)) {
        try { fs.renameSync(backup, target); } catch (rollback) {
          console.error(`Restore the retained Node at ${backup}: ${rollback.message}`);
        }
      }
      console.error(`Managed Node activation stopped: ${error.message}`);
      process.exitCode = 1;
    }
KITSUNE_MANAGED_NODE
}

stage_managed_node() {
  local node_os="$1" node_arch="$2"
  (
    umask 077
    local lock="$KITSUNE_ROUTER_HOME/.node-install.lock" stage=""
    if ! mkdir -- "$lock"; then
      log_error "Managed Node setup is locked; review $lock before retrying"
      exit 1
    fi
    trap 'if [ -n "$stage" ]; then cleanup_managed_node_stage "$stage" || true; fi; rmdir -- "$lock" 2>/dev/null || true' EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    stage=$(mktemp -d "$KITSUNE_ROUTER_HOME/.node-stage.XXXXXXXX") || { log_error "Cannot create private Node staging directory"; exit 1; }
    local index_url="https://nodejs.org/dist/latest-v${NODE_VERSION}.x/"
    if ! curl -fsSL "${index_url}SHASUMS256.txt" -o "$stage/SHASUMS256.txt"; then
      log_error "Cannot download official Node checksums"
      exit 1
    fi
    local tarball="" checksum="" digest archive extra
    local pattern="^node-v${NODE_VERSION}\\.[0-9]+\\.[0-9]+-${node_os}-${node_arch}\\.tar\\.(xz|gz)$"
    while read -r digest archive extra; do
      if [[ "$digest" =~ ^[a-f0-9]{64}$ ]] && [[ "$archive" =~ $pattern ]] && [ -z "$extra" ]; then
        tarball="$archive"; checksum="$digest"
        if [[ "$archive" == *.tar.xz ]]; then break; fi
      fi
    done < "$stage/SHASUMS256.txt"
    [ -n "$tarball" ] || { log_error "No matching Node archive in official checksums"; exit 1; }
    log_info "Downloading and verifying $tarball..."
    curl -fsSL "${index_url}${tarball}" -o "$stage/$tarball" || { log_error "Node download failed"; exit 1; }
    local actual
    if command -v sha256sum >/dev/null 2>&1; then
      actual=$(sha256sum "$stage/$tarball") || exit 1
    elif command -v shasum >/dev/null 2>&1; then
      actual=$(shasum -a 256 "$stage/$tarball") || exit 1
    else
      log_error "sha256sum or shasum is required to verify managed Node"
      exit 1
    fi
    [ "${actual%% *}" = "$checksum" ] || { log_error "Node archive checksum mismatch; current installation retained"; exit 1; }
    local archive_root="${tarball%.tar.*}" member
    tar -tf "$stage/$tarball" > "$stage/members" || { log_error "Cannot inspect Node archive"; exit 1; }
    while IFS= read -r member; do
      case "$member" in "$archive_root"|"$archive_root/"*) ;; *) log_error "Unsafe Node archive path"; exit 1 ;; esac
      case "/$member/" in */../*) log_error "Unsafe Node archive traversal"; exit 1 ;; esac
    done < "$stage/members"
    mkdir -- "$stage/unpack" || exit 1
    tar -xf "$stage/$tarball" -C "$stage/unpack" --no-same-owner || { log_error "Node archive extraction failed"; exit 1; }
    local candidate="$stage/unpack/$archive_root" version expected_version
    [ -d "$candidate" ] && [ ! -L "$candidate" ] && [ -f "$candidate/bin/node" ] && [ ! -L "$candidate/bin/node" ] || { log_error "Invalid Node archive layout"; exit 1; }
    version=$("$candidate/bin/node" --version) || exit 1
    expected_version="${archive_root#node-}"
    expected_version="${expected_version%-${node_os}-${node_arch}}"
    [ "$version" = "$expected_version" ] || { log_error "Node archive version mismatch"; exit 1; }
    node_satisfies "$version" || { log_error "Downloaded Node does not meet the runtime minimum"; exit 1; }
    PATH="$candidate/bin:$PATH" "$candidate/bin/npm" --version >/dev/null || { log_error "Downloaded npm cannot run"; exit 1; }
    activate_managed_node "$candidate" || exit 1
  )
}

link_managed_node_commands() {
  local link_dir="$1" name destination
  mkdir -p -- "$link_dir" || return 1
  for name in node npm npx; do
    destination="$link_dir/$name"
    if [ -e "$destination" ] || [ -L "$destination" ]; then
      log_info "Keeping existing command at $destination; managed Node will use its own PATH"
      continue
    fi
    ln -s -- "$KITSUNE_ROUTER_HOME/node/bin/$name" "$destination" || return 1
  done
}

install_managed_node() {
  if [ "$DISTRO" = "termux" ]; then
    log_info "Installing Node.js via pkg (Termux)..."
    pkg install -y nodejs >/dev/null 2>&1 && log_success "Node $(node --version 2>/dev/null) via pkg" && return 0
    log_warn "pkg install nodejs failed"; return 1
  fi
  local node_os node_arch
  case "$OS" in linux) node_os="linux";; macos) node_os="darwin";; *) log_warn "Unsupported OS for managed Node"; return 1;; esac
  case "$ARCH" in x86_64) node_arch="x64";; arm64|aarch64) node_arch="arm64";; armv7l) node_arch="armv7l";; *) log_warn "Unsupported arch $ARCH for Node"; return 1;; esac

  case "$KITSUNE_ROUTER_HOME" in /*) ;; *) log_error "Managed Node home must be absolute"; return 1 ;; esac
  if [ -L "$KITSUNE_ROUTER_HOME" ] || { [ -e "$KITSUNE_ROUTER_HOME" ] && [ ! -d "$KITSUNE_ROUTER_HOME" ]; }; then
    log_error "Refusing symbolic-link or non-directory managed Node home: $KITSUNE_ROUTER_HOME"
    return 1
  fi
  mkdir -p -- "$KITSUNE_ROUTER_HOME" || return 1
  KITSUNE_ROUTER_HOME=$(cd -- "$KITSUNE_ROUTER_HOME" && pwd -P) || return 1
  case "$KITSUNE_ROUTER_HOME" in /|"$HOME"|*$'\n'*|*$'\r'*) log_error "Unsafe managed Node home"; return 1 ;; esac
  [ -O "$KITSUNE_ROUTER_HOME" ] || { log_error "Managed Node home is not owned by the current user"; return 1; }
  local writable_home
  writable_home=$(find "$KITSUNE_ROUTER_HOME" -prune \( -perm -020 -o -perm -002 \) -print) || { log_error "Cannot inspect managed Node home permissions"; return 1; }
  [ -z "$writable_home" ] || { log_error "Managed Node home is group/world writable; no replacement attempted"; return 1; }
  if [ -e "$KITSUNE_ROUTER_HOME/node" ] || [ -L "$KITSUNE_ROUTER_HOME/node" ]; then
    if ! managed_node_is_owned "$KITSUNE_ROUTER_HOME/node"; then
      log_error "Existing $KITSUNE_ROUTER_HOME/node is unrecognized or user-managed; no files removed. Choose another KITSUNE_ROUTER_HOME or move it manually."
      return 1
    fi
  fi
  stage_managed_node "$node_os" "$node_arch" || return 1
  configure_managed_npm_prefix || return 1
  local link_dir; link_dir="$(get_link_dir)"
  link_managed_node_commands "$link_dir" || return 1
  export PATH="$KITSUNE_ROUTER_HOME/node/bin:$link_dir:$PATH"
  log_success "Managed Node $("$KITSUNE_ROUTER_HOME/node/bin/node" --version) installed to $KITSUNE_ROUTER_HOME/node"
  return 0
}

check_node() {
  log_step "Checking Node.js (>=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.${MIN_NODE_PATCH}) / Bun"
  configure_managed_npm_prefix || return 1

  # Prefer existing system node if good
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    local ver; ver=$(node --version 2>/dev/null || echo "v0")
    if select_node_runtime "$(command -v node)" "$(command -v npm)"; then
      log_success "Node $ver found ($NODE_CMD) — npm $("$NPM_CMD" --version 2>/dev/null)"
      return 0
    fi
    log_warn "Node $ver too old (need >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.${MIN_NODE_PATCH})"
  elif command -v node >/dev/null 2>&1 && ! command -v npm >/dev/null 2>&1; then
    log_warn "node found but npm missing — broken install"
  fi

  # Check managed node
  if [ -x "$KITSUNE_ROUTER_HOME/node/bin/node" ] && [ -x "$KITSUNE_ROUTER_HOME/node/bin/npm" ]; then
    local mver; mver=$("$KITSUNE_ROUTER_HOME/node/bin/node" --version 2>/dev/null || echo "v0")
    if select_node_runtime "$KITSUNE_ROUTER_HOME/node/bin/node" "$KITSUNE_ROUTER_HOME/node/bin/npm"; then
      log_success "Managed Node $mver found ($KITSUNE_ROUTER_HOME/node) "
      return 0
    fi
  fi

  # Check Bun as alternative (can run kitsune-router but npm needed for global install)
  if command -v bun >/dev/null 2>&1; then
    log_info "Bun $(bun --version 2>/dev/null) found — can run Kitsune Router, but Node is preferred for npm global"
    # Still try to get Node for npm global path; Bun can be fallback
  fi

  if [ "$SKIP_DEPS" = true ]; then
    if select_bun_runtime; then log_info "Using Bun (--skip-deps)"; return 0; fi
    log_warn "No supported Node/npm or working Bun found and --skip-deps set"
    return 1
  fi

  log_info "Installing Node.js v${NODE_VERSION}..."

  # Try package managers first (faster, integrates with OS)
  local sudo_cmd=""; [ "$(id -u 2>/dev/null || echo 1000)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo_cmd="sudo"

  if command -v brew >/dev/null 2>&1; then
    log_info "Trying brew install node@${NODE_VERSION}..."
    if brew install node@${NODE_VERSION} >/dev/null 2>&1 || brew install node >/dev/null 2>&1; then
      if select_node_runtime "$(command -v node || true)" "$(command -v npm || true)"; then log_success "Node $("$NODE_CMD" --version) via brew"; return 0; fi
    fi
  fi

  case "$DISTRO" in
    ubuntu|debian)
      if command -v apt-get >/dev/null 2>&1; then
        log_info "Trying apt NodeSource..."
        if [ -n "$sudo_cmd" ] || [ "$(id -u)" -eq 0 ]; then
          curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | $sudo_cmd -E bash - >/dev/null 2>&1 || true
          $sudo_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null 2>&1 || true
          if select_node_runtime "$(command -v node || true)" "$(command -v npm || true)"; then log_success "Node $("$NODE_CMD" --version) via apt"; return 0; fi
        fi
      fi
      ;;
    fedora)
      if command -v dnf >/dev/null 2>&1; then
        $sudo_cmd dnf install -y nodejs npm >/dev/null 2>&1 || true
        if select_node_runtime "$(command -v node || true)" "$(command -v npm || true)"; then log_success "Node $("$NODE_CMD" --version) via dnf"; return 0; fi
      fi
      ;;
    arch)
      if command -v pacman >/dev/null 2>&1; then
        $sudo_cmd pacman -S --noconfirm nodejs npm >/dev/null 2>&1 || true
        if select_node_runtime "$(command -v node || true)" "$(command -v npm || true)"; then log_success "Node $("$NODE_CMD" --version) via pacman"; return 0; fi
      fi
      ;;
  esac

  # Fallback: managed tarball
  if install_managed_node && select_node_runtime "$(command -v node || true)" "$(command -v npm || true)"; then return 0; fi

  # Ultimate fallback: Bun
  if select_bun_runtime; then
    log_warn "Node install failed, but Bun is available — will use Bun"
    return 0
  fi
  log_info "Trying Bun as runtime fallback..."
  if curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    if select_bun_runtime; then log_success "Bun $("$BUN_CMD" --version) installed"; return 0; fi
  fi

  log_error "Failed to install Node.js or Bun. Install Node >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.${MIN_NODE_PATCH} manually: https://nodejs.org/"
  return 1
}

check_build_tools() {
  log_step "Checking build tools (for better-sqlite3 — optional, sql.js fallback exists)"
  local missing=()
  if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then missing+=("python3"); fi
  if ! command -v make >/dev/null 2>&1 && ! command -v gmake >/dev/null 2>&1; then missing+=("make"); fi
  if ! command -v g++ >/dev/null 2>&1 && ! command -v clang++ >/dev/null 2>&1; then missing+=("g++"); fi
  if [ ${#missing[@]} -eq 0 ]; then log_success "Build tools OK"; return 0; fi
  log_warn "Missing: ${missing[*]} (only needed if you want better-sqlite3; otherwise sql.js fallback works)"
  if [ "$SKIP_DEPS" = true ]; then return 0; fi
  local sudo_cmd=""; [ "$(id -u 2>/dev/null || echo 1000)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo_cmd="sudo"
  log_info "Attempting to install build tools..."
  case "$DISTRO" in
    ubuntu|debian) $sudo_cmd env DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true; $sudo_cmd apt-get install -y -qq build-essential python3 >/dev/null 2>&1 || true ;;
    fedora) $sudo_cmd dnf install -y gcc-c++ make python3 >/dev/null 2>&1 || true ;;
    arch) $sudo_cmd pacman -S --noconfirm base-devel python >/dev/null 2>&1 || true ;;
    termux) pkg install -y clang make python pkg-config libffi openssl >/dev/null 2>&1 || true ;;
    macos) 
      if command -v xcode-select >/dev/null 2>&1; then
        log_info "macOS: ensure Xcode CLI tools are installed (xcode-select --install) for native builds"
      fi
      ;;
  esac
  # Re-check silently, don't fail hard
  if command -v g++ >/dev/null 2>&1 || command -v clang++ >/dev/null 2>&1; then log_success "Build tools now available"; else log_warn "Build tools still missing — will use sql.js fallback"; fi
}

# Install kitsune-router via npm
install_via_npm() {
  log_step "Installing Kitsune Router CLI via npm"
  local npm_cmd="$NPM_CMD"
  if [ "$RUNTIME" = "node" ]; then
    export PATH="${NODE_CMD%/*}:$PATH"
  elif [ "$RUNTIME" = "bun" ]; then
    log_info "Using selected Bun runtime..."
    if "$BUN_CMD" add -g @bykitsune/router >/dev/null 2>&1; then log_success "Installed via bun"; return 0; else log_warn "bun add -g failed"; return 1; fi
  else
    log_warn "npm/bun not available"; return 1
  fi

  log_info "Running: $npm_cmd install -g @bykitsune/router"
  if "$npm_cmd" install -g @bykitsune/router --silent >/dev/null 2>&1; then
    log_success "Installed kitsune-router via npm"
    return 0
  fi
  log_warn "npm install without sudo failed (likely EACCES), retrying with sudo..."

  if command -v sudo >/dev/null 2>&1; then
    # Check if sudo is available and we can prompt
    if [ "$IS_INTERACTIVE" = true ] || [ -r /dev/tty ]; then
      if sudo env "PATH=${NODE_CMD%/*}:$PATH" "$npm_cmd" install -g @bykitsune/router; then log_success "Installed via sudo"; return 0; fi
    else
      # Non-interactive: try passwordless sudo
      if sudo -n true 2>/dev/null && sudo -n env "PATH=${NODE_CMD%/*}:$PATH" "$npm_cmd" install -g @bykitsune/router >/dev/null 2>&1; then log_success "Installed via sudo -n"; return 0; fi
      log_warn "No terminal for sudo prompt and passwordless sudo not available"
    fi
  else
    log_warn "sudo not available to fix EACCES"
  fi

  # Try configuring npm prefix to user dir as last resort before source fallback
  log_info "Trying user-local npm prefix fallback..."
  mkdir -p "$HOME/.npm-global"
  if "$npm_cmd" config set prefix "$HOME/.npm-global" >/dev/null 2>&1; then
    local link_dir; link_dir="$(get_link_dir)"; mkdir -p "$link_dir"
    # Ensure PATH includes npm-global/bin
    export PATH="${NODE_CMD%/*}:$HOME/.npm-global/bin:$PATH"
    if "$npm_cmd" install -g @bykitsune/router >/dev/null 2>&1; then
      # Ensure link exists in expected bin dir
      if [ -f "$HOME/.npm-global/bin/kitsune-router" ] && [ ! -f "$link_dir/kitsune-router" ]; then ln -sf "$HOME/.npm-global/bin/kitsune-router" "$link_dir/kitsune-router" || true; fi
      log_success "Installed via user-local prefix $HOME/.npm-global"
      log_warn "Add to PATH: export PATH=\"\$HOME/.npm-global/bin:\$PATH\" (add to ~/.bashrc / ~/.zshrc)"
      return 0
    fi
  fi

  return 1
}

directory_is_empty() {
  [ -d "$1" ] && [ ! -L "$1" ] || return 1
  local entry
  for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    if [ -e "$entry" ] || [ -L "$entry" ]; then return 1; fi
  done
  return 0
}

source_checkout_is_clean() {
  local status marker marker_path
  if ! status=$(git -C "$INSTALL_DIR" status --porcelain=v1 --untracked-files=all --ignore-submodules=none); then
    log_error "Cannot inspect checkout state at $INSTALL_DIR; no update attempted"
    return 1
  fi
  if [ -n "$status" ]; then
    log_error "Checkout has tracked changes or untracked files: $INSTALL_DIR. Preserve them before updating."
    return 1
  fi
  for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-apply rebase-merge sequencer; do
    marker_path=$(git -C "$INSTALL_DIR" rev-parse --git-path "$marker") || return 1
    case "$marker_path" in /*) ;; *) marker_path="$INSTALL_DIR/$marker_path" ;; esac
    if [ -e "$marker_path" ] || [ -L "$marker_path" ]; then
      log_error "Checkout has an unfinished Git operation ($marker); resolve it before updating"
      return 1
    fi
  done
  return 0
}

prepare_source_checkout() {
  if ! command -v git >/dev/null 2>&1; then
    log_error "git is required for source install but not found"
    return 1
  fi
  if [ -z "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ] || { [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR" ]; }; then
    log_error "Install directory must be a real directory, not an empty path, file or symbolic link: $INSTALL_DIR"
    return 1
  fi
  case "$BRANCH" in ""|-*) log_error "Invalid source branch: $BRANCH"; return 1 ;; esac
  git check-ref-format "refs/heads/$BRANCH" >/dev/null 2>&1 || { log_error "Invalid source branch: $BRANCH"; return 1; }
  mkdir -p -- "$INSTALL_DIR" || return 1
  INSTALL_DIR=$(cd -- "$INSTALL_DIR" && pwd -P) || return 1

  if [ -e "$INSTALL_DIR/.git" ] || [ -L "$INSTALL_DIR/.git" ]; then
    local checkout_root current_branch before_head fetched_head
    if [ -L "$INSTALL_DIR/.git" ]; then
      log_error "Refusing a symbolic-link Git directory at $INSTALL_DIR"
      return 1
    fi
    checkout_root=$(git -C "$INSTALL_DIR" rev-parse --show-toplevel) || return 1
    checkout_root=$(cd -- "$checkout_root" && pwd -P) || return 1
    [ "$checkout_root" = "$INSTALL_DIR" ] || { log_error "Install directory is not the checkout root"; return 1; }
    current_branch=$(git -C "$INSTALL_DIR" symbolic-ref --quiet --short HEAD) || { log_error "Detached checkout; select $BRANCH manually before updating"; return 1; }
    [ "$current_branch" = "$BRANCH" ] || { log_error "Checkout is on $current_branch, not $BRANCH; no branch switch attempted"; return 1; }
    source_checkout_is_clean || return 1
    before_head=$(git -C "$INSTALL_DIR" rev-parse --verify HEAD) || return 1
    log_info "Fetching origin branch $BRANCH for $INSTALL_DIR..."
    if ! git -C "$INSTALL_DIR" fetch --no-tags origin "refs/heads/$BRANCH"; then
      log_error "Fetch failed; checkout retained without update or default-branch fallback"
      return 1
    fi
    fetched_head=$(git -C "$INSTALL_DIR" rev-parse --verify 'FETCH_HEAD^{commit}') || return 1
    if ! git -C "$INSTALL_DIR" merge-base --is-ancestor "$before_head" "$fetched_head"; then
      log_error "origin/$BRANCH is not a fast-forward of this checkout; local commits retained, resolve manually"
      return 1
    fi
    # Recheck after the network operation. Do not hide changes in an automatic
    # stash, overwrite ignored files, or merge a different concurrently selected branch.
    source_checkout_is_clean || return 1
    current_branch=$(git -C "$INSTALL_DIR" symbolic-ref --quiet --short HEAD) || return 1
    [ "$current_branch" = "$BRANCH" ] && [ "$(git -C "$INSTALL_DIR" rev-parse --verify HEAD)" = "$before_head" ] || { log_error "Checkout changed during fetch; no update attempted"; return 1; }
    if ! git -C "$INSTALL_DIR" -c merge.autoStash=false merge --ff-only --no-edit --no-overwrite-ignore "$fetched_head"; then
      log_error "Fast-forward update refused; existing files retained. Resolve the checkout manually."
      return 1
    fi
  else
    if ! directory_is_empty "$INSTALL_DIR"; then
      log_error "Non-Git install directory is not empty: $INSTALL_DIR. Choose an empty --dir; no files were removed."
      return 1
    fi
    log_info "Cloning $REPO_URL (branch: $BRANCH) to $INSTALL_DIR..."
    if ! git clone --depth 1 --branch "$BRANCH" -- "$REPO_URL" "$INSTALL_DIR"; then
      log_error "Clone failed; no default-branch retry or directory cleanup attempted. Review $INSTALL_DIR before retrying."
      return 1
    fi
  fi
}

# Source fallback: clone an empty directory or fast-forward a clean checkout.
install_via_source() {
  log_step "Falling back to source install (git clone)"
  prepare_source_checkout || return 1
  local link_dir; link_dir="$(get_link_dir)"
  mkdir -p -- "$link_dir" || return 1
  cd -- "$INSTALL_DIR" || return 1

  # Choose package manager
  local pm="$NPM_CMD"
  if [ "$RUNTIME" = "node" ]; then export PATH="${NODE_CMD%/*}:$PATH"
  elif [ "$RUNTIME" = "bun" ]; then pm="$BUN_CMD"
  else log_error "No npm/bun found for build"; return 1; fi

  log_info "Installing dependencies ($pm install)..."
  if [ "$RUNTIME" = "bun" ]; then
    if ! "$pm" install --production >/dev/null 2>&1 && ! "$pm" install >/dev/null 2>&1; then log_error "bun install failed; no supported Node/npm fallback selected"; return 1; fi
  fi
  if [ "$RUNTIME" = "node" ]; then
    # Use npm ci if lock exists, otherwise install
    if [ -f "package-lock.json" ]; then
      if ! "$pm" ci --silent >/dev/null 2>&1; then
        log_warn "npm ci failed, trying npm install..."
        "$pm" install --silent >/dev/null 2>&1 || { log_error "npm install failed"; return 1; }
      fi
    else
      "$pm" install --silent >/dev/null 2>&1 || { log_error "npm install failed"; return 1; }
    fi
  fi

  if [ "$SKIP_BUILD" = false ]; then
    log_info "Building Kitsune Router ($pm run build)..."
    local build_args=(run build --silent)
    if [ "$RUNTIME" = "bun" ]; then build_args=(--bun "${build_args[@]}"); fi
    if ! "$pm" "${build_args[@]}" >/dev/null 2>&1; then
      log_warn "Build failed, but CLI may still work via dev mode"
      # Don't fail hard — dev mode can run without build
    else
      log_success "Build completed"
    fi
  else
    log_warn "Skipped build (--no-build)"
  fi

  # Link binary
  local cli_src="$INSTALL_DIR/cli/cli.js"
  local cli_link="$link_dir/kitsune-router"
  # Pin source verification independently of the selected runtime's PATH.
  SOURCE_CLI_CMD="$cli_link"
  if [ -f "$cli_src" ]; then
    ln -sf "$cli_src" "$cli_link"
    chmod +x "$cli_src" 2>/dev/null || true
    log_success "Linked $cli_link → $cli_src"
  else
    # Fallback: root cli.js?
    if [ -f "$INSTALL_DIR/cli.js" ]; then ln -sf "$INSTALL_DIR/cli.js" "$cli_link" && log_success "Linked $cli_link"; fi
  fi

  # Ensure link dir in PATH for current session
  export PATH="$link_dir:$PATH"
  return 0
}

ensure_path() {
  local link_dir; link_dir="$(get_link_dir)"
  case ":$PATH:" in *":$link_dir:"*) return 0;; esac
  log_warn "$link_dir is not in PATH"
  log_info "Add to your shell profile:"
  echo -e "  ${GRAY}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
  # Also hint for fish, zsh
  if [ -f "$HOME/.zshrc" ]; then log_info "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"; fi
  if [ -f "$HOME/.bashrc" ]; then log_info "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"; fi
  export PATH="$link_dir:$PATH"
}

kitsune_router_version() {
  local cli_cmd="$SOURCE_CLI_CMD"
  if [ -z "$cli_cmd" ]; then cli_cmd=$(command -v kitsune-router) || return 1; fi
  if [ "$RUNTIME" = "bun" ]; then
    "$BUN_CMD" "$cli_cmd" --version 2>/dev/null || "$BUN_CMD" "$cli_cmd" -v 2>/dev/null
  else
    "$cli_cmd" --version 2>/dev/null || "$cli_cmd" -v 2>/dev/null
  fi
}

verify_install() {
  log_step "Verifying installation"
  local link_dir; link_dir="$(get_link_dir)"
  # Refresh PATH
  export PATH="$link_dir:$PATH"
  export PATH="$HOME/.npm-global/bin:$PATH"
  export PATH="$HOME/.bun/bin:$PATH"
  if [ "$RUNTIME" = "node" ]; then export PATH="${NODE_CMD%/*}:$PATH"; fi

  local cli_cmd="$SOURCE_CLI_CMD"
  if [ -z "$cli_cmd" ]; then cli_cmd=$(command -v kitsune-router || true); fi
  if [ -n "$cli_cmd" ]; then
    local ver
    if ! ver=$(kitsune_router_version); then log_error "kitsune-router could not run with the selected $RUNTIME runtime"; return 1; fi
    log_success "Kitsune Router found: $ver ($cli_cmd)"
    return 0
  fi
  # Check link exists but not in PATH
  if [ -x "$link_dir/kitsune-router" ]; then
    log_warn "kitsune-router binary exists at $link_dir/kitsune-router but not in PATH"
    ensure_path
    if command -v kitsune-router >/dev/null 2>&1 && kitsune_router_version >/dev/null; then log_success "Now found after PATH fix"; return 0; fi
  fi
  if [ -x "$INSTALL_DIR/cli/cli.js" ]; then
    log_warn "CLI found at $INSTALL_DIR/cli/cli.js but not linked"
    ln -sf "$INSTALL_DIR/cli/cli.js" "$link_dir/kitsune-router" 2>/dev/null || true
    if command -v kitsune-router >/dev/null 2>&1 && kitsune_router_version >/dev/null; then log_success "Linked and found"; return 0; fi
  fi
  log_error "kitsune-router command not found after install"
  log_info "Try: export PATH=\"\$HOME/.local/bin:\$PATH\" && kitsune-router --help"
  log_info "Or check logs above for errors"
  return 1
}

# Main
main() {
  print_banner
  resolve_install_layout
  detect_os
  ensure_curl
  check_network
  check_git || true
  if ! check_node; then
    log_error "A working Node >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.${MIN_NODE_PATCH} with npm, or Bun, is required. No package installation attempted."
    return 1
  fi
  check_build_tools || true

  echo ""
  local installed=false

  # Try npm first (fastest, preferred)
  if install_via_npm; then
    installed=true
  else
    log_warn "npm global install failed — falling back to source"
    if install_via_source; then installed=true; else log_error "Source install also failed"; fi
  fi

  echo ""
  if [ "$installed" = true ] && verify_install; then
    echo ""
    echo -e "${GREEN}${BOLD}✓ Kitsune Router successfully installed!${RESET}"
    # Show version if possible
    local ver; ver=$(kitsune_router_version || echo "")
    if [ -n "$ver" ]; then echo -e "  ${GRAY}Version: $ver${RESET}"; fi
  else
    echo ""
    log_error "Kitsune Router installation failed"
    echo -e "  ${GRAY}Check output above. Try manual steps:${RESET}"
    echo -e "  ${GRAY}  npm install -g @bykitsune/router  # or${RESET}"
    echo -e "  ${GRAY}  git clone $REPO_URL $INSTALL_DIR && cd $INSTALL_DIR && npm install && npm run build${RESET}"
    return 1
  fi

  # Next steps
  echo ""
  echo -e "${BLUE}─────────────────────────────────────────────────────────────${RESET}"
  echo -e "${BOLD}🚀 Get Started with Kitsune Router:${RESET}"
  echo ""
  echo -e "  1. Start the gateway:"
  echo -e "     ${GREEN}${BOLD}kitsune-router${RESET}  ${GRAY}# or: kitsune-router --port 20128${RESET}"
  echo ""
  echo -e "  2. Dashboard:"
  echo -e "     ${CYAN}${BOLD}http://localhost:20128${RESET}  ${GRAY}(auto-opens)${RESET}"
  echo -e "     ${GRAY}API: http://localhost:20128/v1${RESET}"
  echo ""
  echo -e "  3. Use with AI tools:"
  echo -e "     ${GRAY}Claude Code:${RESET} ${BOLD}export ANTHROPIC_BASE_URL=http://localhost:20128${RESET}"
  echo -e "     ${GRAY}Codex/Cursor:${RESET} ${BOLD}export OPENAI_BASE_URL=http://localhost:20128/v1${RESET}"
  echo -e "     ${GRAY}API Key:${RESET} ${BOLD}Create a key in Dashboard → API Keys${RESET}"
  echo ""
  echo -e "  4. Manage:"
  echo -e "     ${GRAY}kitsune-router status  # health${RESET}"
  echo -e "     ${GRAY}kitsune-router start   # background${RESET}"
  echo -e "     ${GRAY}kitsune-router stop    # stop${RESET}"
  echo -e "     ${GRAY}kitsune-router --help  # all options${RESET}"
  echo ""
  echo -e "  ${GRAY}Docs: https://github.com/ByKitsune/kitsune-router#readme${RESET}"
  echo -e "  ${GRAY}Issues: https://github.com/ByKitsune/kitsune-router/issues${RESET}"
  echo -e "${BLUE}─────────────────────────────────────────────────────────────${RESET}"
  echo ""
  ensure_path
}

main "$@"
