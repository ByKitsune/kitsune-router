// Port of rtk src/cmds/system/env_cmd.rs (v0.45.x) — post-hoc variant.
// Compresses `env`/`printenv` dumps: sorted, values truncated, and — as a
// kitsunerouter security extension — secret-looking values are redacted outright
// (upstream only truncates; agents pasting real env vars into tool results
// is exactly how API keys leak into LLM contexts).
import { CAP_LIST } from "../constants.js";

const ENV_LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const SECRET_KEY_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|PRIVATE)/i;
const VALUE_PREVIEW = 50;
const VALUE_LONG = 100;

export function envFilter(text) {
  const entries = [];
  for (const line of text.split("\n")) {
    const m = ENV_LINE_RE.exec(line);
    if (!m) return null; // one non-env line → not an env dump
    entries.push([m[1], m[2]]);
  }
  if (entries.length < 5) return null;

  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const render = ([key, value]) => {
    let display;
    if (SECRET_KEY_RE.test(key)) {
      display = `<redacted:${value.length} chars>`;
    } else if (value.length > VALUE_LONG) {
      display = `${value.slice(0, VALUE_PREVIEW)}... (${value.length} chars)`;
    } else {
      display = value;
    }
    return `${key}=${display}`;
  };

  // PATH-style entries first, then everything else (mirrors upstream grouping).
  const pathVars = entries.filter(([k]) => k.includes("PATH"));
  const restVars = entries.filter(([k]) => !k.includes("PATH"));

  const body = [];
  if (pathVars.length > 0) {
    body.push(`path (${pathVars.length}):`);
    for (const e of pathVars) body.push(`  ${render(e)}`);
  }
  if (restVars.length > 0) {
    if (pathVars.length > 0) body.push("");
    body.push(`other (${restVars.length}):`);
    for (const e of restVars.slice(0, CAP_LIST)) body.push(`  ${render(e)}`);
    if (restVars.length > CAP_LIST) body.push(`  ... +${restVars.length - CAP_LIST} more vars`);
  }

  return `${entries.length} env vars:\n${body.join("\n")}`;
}
