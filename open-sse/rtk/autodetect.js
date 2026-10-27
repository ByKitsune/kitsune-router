// Port of auto_detect_filter (rtk src/cmds/system/pipe_cmd.rs, v0.45.x) +
// kitsunerouter post-hoc extras appended after the upstream chain.
//
// Upstream chain (synced 2026-08-25): cargo-test → pytest → go-test → mypy
//                     → grep → vitest → find → identity
// kitsunerouter extras (post-hoc tool_result compression; agents run RAW commands,
// so these stay valuable even though rtk CLI moved them into wrapped cmds):
//                  git-log → git-diff → git-status → build-output → porcelain
//                  → tree → ls → search-list → read-numbered → dedup-log
//                  → smart-truncate → null
import { DETECT_WINDOW, READ_NUMBERED_MIN_HIT_RATIO, SMART_TRUNCATE_MIN_LINES, MIN_COMPRESS_SIZE } from "./constants.js";
import { cargoTest } from "./filters/cargoTest.js";
import { pytest } from "./filters/pytest.js";
import { goTest } from "./filters/goTest.js";
import { mypy } from "./filters/mypy.js";
import { vitest } from "./filters/vitest.js";
import { jsonFilter } from "./filters/jsonCompact.js";
import { envFilter } from "./filters/env.js";
import { loadTomlFilters, applyTomlFilter } from "./tomlEngine.js";
import { gitDiff } from "./filters/gitDiff.js";
import { gitStatus } from "./filters/gitStatus.js";
import { gitLog } from "./filters/gitLog.js";
import { buildOutput } from "./filters/buildOutput.js";
import { grep } from "./filters/grep.js";
import { find } from "./filters/find.js";
import { dedupLog } from "./filters/dedupLog.js";
import { ls } from "./filters/ls.js";
import { tree } from "./filters/tree.js";
import { smartTruncate } from "./filters/smartTruncate.js";
import { readNumbered, READ_NUMBERED_LINE_RE } from "./filters/readNumbered.js";
import { searchList, SEARCH_LIST_HEADER_RE } from "./filters/searchList.js";

const RE_GIT_DIFF = /^diff --git /m;
const RE_GIT_DIFF_HUNK = /^@@ /m;
const RE_GIT_STATUS = /^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m;
const RE_GIT_LOG = /^[*|/\\ ]*commit [0-9a-f]{7,40}$/m;
const RE_PORCELAIN = /^[ MADRCU?!][ MADRCU?!] \S/m;
const RE_BUILD_OUTPUT = /^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)/im;
const RE_TREE_GLYPH = /[├└]──|│  /;
const RE_LS_ROW = /^[-dlbcps][rwx-]{9}/m;
const RE_LS_TOTAL = /^total \d+$/m;

export function autoDetectFilter(text) {
  // Rust: floor_char_boundary to avoid UTF-8 split — JS .slice() by char is safe
  const head = text.length > DETECT_WINDOW ? text.slice(0, DETECT_WINDOW) : text;
  const firstTrimmed = head.trimStart();

  // ── Upstream pipe_cmd.rs chain (order-sensitive, synced v0.45.x) ──

  if (head.includes("test result:") && head.includes("passed;")) return cargoTest;

  if (head.includes("=== test session starts")) return pytest;

  // (phpunit banner detection omitted — no JS port of the phpunit filter yet)

  if (firstTrimmed.startsWith("{") && head.includes("\"Action\"")) return goTest;

  if (head.includes(": error:") && head.includes(".py:")) return mypy;

  // kitsunerouter extras — git output shapes are highly specific and must win over
  // the generic build-output detector when both appear in one blob.
  if (RE_GIT_LOG.test(head)) return gitLog;
  if (RE_GIT_DIFF.test(head) || RE_GIT_DIFF_HUNK.test(head)) return gitDiff;
  if (RE_GIT_STATUS.test(head)) return gitStatus;

  // kitsunerouter extra, hoisted above grep/find/porcelain: compile & package-manager
  // noise ("   Compiling x", "npm ERR!") must route to build-output — porcelain
  // rows and grep lines would otherwise swallow it (old-order regression guard).
  if (RE_BUILD_OUTPUT.test(head)) return buildOutput;

  // grep/rg: lines matching file:number:content
  const lines = head.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  // Rust grep rule: first 5 non-empty lines, ANY matches "file:number:content"
  const first5 = nonEmpty.slice(0, 5);
  if (first5.some(isGrepLine)) return grep;

  if (head.includes("\"testResults\"") || head.includes("\"numTotalTests\"")) return vitest;

  // git status --porcelain MUST be checked before the find/path-dump rule:
  // porcelain rows (" M src/a.js") are shaped like paths and would otherwise
  // be swallowed by find. Path dumps never match the status-code pattern.
  if (isMostlyPorcelain(head)) return gitStatus;

  // find/fd: all non-empty lines look like file paths, minimum 3 lines
  let pathLikeLines = 0;
  for (const l of nonEmpty) {
    const t = l.trim();
    if (!t.includes(":") && (t.startsWith(".") || t.startsWith("/") || t.includes("/"))) pathLikeLines++;
  }
  if (nonEmpty.length >= 3 && pathLikeLines === nonEmpty.length) return find;

  // kitsunerouter extension: Windows drive-letter path dumps ("C:\repo\src\a.js").
  // The upstream no-colon rule excludes them because of the colon in "C:",
  // but agents on Windows emit these constantly — route them to `find`.
  const winPathLike = nonEmpty.filter((l) => /^[A-Za-z]:[\\/]/.test(l.trim())).length;
  if (nonEmpty.length >= 3 && winPathLike === nonEmpty.length) return find;

  // ── kitsunerouter post-hoc extensions (below the upstream chain) ──

  if (RE_TREE_GLYPH.test(head)) return tree;

  // ls -la: has "total N" header or >=3 rows starting with perms string
  if (RE_LS_TOTAL.test(head) || countMatches(head, RE_LS_ROW) >= 3) return ls;

  // Cursor Glob search list header
  if (SEARCH_LIST_HEADER_RE.test(head)) return searchList;

  // Line-numbered file dump ("  N|content") — fire only if many lines match
  if (lines.length >= SMART_TRUNCATE_MIN_LINES && isLineNumbered(lines)) {
    return readNumbered;
  }

  // kitsunerouter extras: structured payloads before generic fallbacks.
  // Large JSON → structural compact view; env dumps → redacted/truncated list.
  if (text.length >= MIN_COMPRESS_SIZE) {
    const t0 = text.trimStart();
    if ((t0.startsWith("{") || t0.startsWith("[")) && (() => { try { JSON.parse(text); return true; } catch { return false; } })()) {
      return jsonFilter;
    }
    const envLines = nonEmpty.filter((l) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l)).length;
    if (envLines >= 5 && envLines >= Math.ceil(nonEmpty.length / 2)) return envFilter;
  }

  // User/bundled declarative TOML filters (upstream src/filters/*.toml format):
  // match_command is tested against the output head — the closest post-hoc
  // signal to upstream's wrapped-command match.
  for (const def of loadTomlFilters()) {
    try {
      if (new RegExp(def.match_command).test(head)) {
        const defRef = def;
        return (input) => applyTomlFilter(defRef, input);
      }
    } catch { /* bad user regex — skip this filter */ }
  }

  // Fallback: dedupLog for generic multi-line noise with duplicates
  if (nonEmpty.length >= 5) return dedupLog;

  // Last resort: big blob with no structure — smart truncate
  if (lines.length >= SMART_TRUNCATE_MIN_LINES) return smartTruncate;

  return null;
}

function isGrepLine(line) {
  // Rust: splitn(3, ':') → parts.len()==3 && parts[1].parse::<usize>().is_ok()
  const first = line.indexOf(":");
  if (first === -1) return false;
  const second = line.indexOf(":", first + 1);
  if (second === -1) return false;
  const lineno = line.slice(first + 1, second);
  return /^\d+$/.test(lineno);
}

function isMostlyPorcelain(head) {
  const lines = head.split("\n").filter(l => l.trim());
  if (lines.length < 3) return false;
  const hits = lines.filter(l => RE_PORCELAIN.test(l)).length;
  return hits / lines.length >= 0.6;
}

function isLineNumbered(lines) {
  let hits = 0;
  let nonEmpty = 0;
  const sample = lines.slice(0, 100);
  for (const l of sample) {
    if (l.length === 0) continue;
    nonEmpty++;
    if (READ_NUMBERED_LINE_RE.test(l)) hits++;
  }
  if (nonEmpty < 5) return false;
  return hits / nonEmpty >= READ_NUMBERED_MIN_HIT_RATIO;
}

function countMatches(text, re) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) || []).length;
}
