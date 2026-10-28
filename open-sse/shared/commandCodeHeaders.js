/** Command Code CLI 1.88.0 identity (upstream b1effa03). */
import { randomUUID } from "crypto";
import { PROVIDERS } from "../config/providers.js";
import { COMMAND_CODE_CLI_SURFACE, COMMAND_CODE_TASTE_LEARNING } from "../config/clientVersions.js";

// Subset of @sindresorhus/slugify replacements that NFD does not cover.
const CHAR_REPLACEMENTS = new Map([
  ["&", " and "], ["🦄", " unicorn "], ["♥", " love "],
  ["ß", "ss"], ["ẞ", "Ss"], ["ä", "ae"], ["Ä", "Ae"],
  ["ö", "oe"], ["Ö", "Oe"], ["ü", "ue"], ["Ü", "Ue"],
  ["Æ", "AE"], ["æ", "ae"], ["Ø", "O"], ["ø", "o"],
  ["Œ", "OE"], ["œ", "oe"], ["Ð", "D"], ["ð", "d"],
  ["Đ", "D"], ["đ", "d"], ["Þ", "TH"], ["þ", "th"],
  ["Ł", "L"], ["ł", "l"], ["ı", "i"],
]);

/** Slug the actual workingDir, using the upstream CLI's default splitting rules. */
export function slugifyPath(value) {
  let transliterated = "";
  for (const ch of String(value ?? "")) transliterated += CHAR_REPLACEMENTS.get(ch) ?? ch;
  return transliterated
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/([A-Z]{2,})(\d+)/g, "$1 $2")
    .replace(/([a-z\d]+)([A-Z]{2,})/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-rt-z\d]+)/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Fresh identity for translated requests and native requests lacking a thread. */
export function createCommandCodeSessionId() {
  return randomUUID();
}

export const COMMAND_CODE_WORKING_DIR = process.cwd();
export const COMMAND_CODE_PROJECT_SLUG = slugifyPath(COMMAND_CODE_WORKING_DIR);

export function buildCommandCodeHeaders({ apiKey, sessionId, accept, workingDir, headers: configuredHeaders } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(configuredHeaders || PROVIDERS.commandcode?.headers || {}),
  };
  // Avoid case-variant duplicates being combined into a different wire value.
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (["x-cli-surface", "x-taste-learning", "x-project-slug", "x-session-id"].includes(lower)
      || (apiKey && lower === "authorization") || (accept && lower === "accept")) delete headers[key];
  }
  headers["x-cli-surface"] = COMMAND_CODE_CLI_SURFACE;
  headers["x-taste-learning"] = COMMAND_CODE_TASTE_LEARNING;
  headers["x-project-slug"] = slugifyPath(workingDir ?? COMMAND_CODE_WORKING_DIR);
  headers["x-session-id"] = sessionId || createCommandCodeSessionId();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (accept) headers.Accept = accept;
  return headers;
}
