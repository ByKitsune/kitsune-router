import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { isDeepStrictEqual } from "util";
import { parseJSONC } from "confbox";

const pendingWrites = new Map();
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export class OpenCodeConfigError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function getConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".config"), "opencode");
}

function parseConfig(content, configPath) {
  try {
    const config = parseJSONC(content, { allowTrailingComma: true });
    if (!isObject(config)) throw new Error("Expected an object");
    return config;
  } catch {
    // Parser errors can include configuration contents (including credentials).
    throw new OpenCodeConfigError(`Invalid JSONC object in ${configPath}; refusing to overwrite it.`);
  }
}

export async function readOpenCodeConfig(configDir = getConfigDir()) {
  const paths = ["opencode.json", "opencode.jsonc"].map((name) => path.join(configDir, name));
  const existing = [];
  for (const configPath of paths) {
    try {
      // lstat distinguishes an absent file from a dangling symlink.
      await fs.lstat(configPath);
      existing.push(configPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new OpenCodeConfigError(`Cannot inspect ${configPath}; refusing to overwrite it.`);
      }
    }
  }
  if (existing.length > 1) {
    throw new OpenCodeConfigError(`Both ${paths[0]} and ${paths[1]} exist; select a single config before editing settings.`, 409);
  }
  const configPath = existing[0] || paths[0];
  if (!existing.length) return { configPath, targetPath: configPath, content: null, config: null };

  let targetPath, content, stat;
  try {
    targetPath = await fs.realpath(configPath);
    stat = await fs.stat(targetPath);
    if (!stat.isFile()) throw new Error("Expected a regular file");
    content = await fs.readFile(targetPath, "utf8");
  } catch {
    throw new OpenCodeConfigError(`Cannot read ${configPath}; refusing to overwrite it.`);
  }
  return { configPath, targetPath, content, mode: stat.mode & 0o777, config: parseConfig(content, configPath) };
}

// Locate values only after confbox has validated the document. Strings and
// comments are whole tokens, so punctuation inside them is never interpreted.
function valueSpans(content) {
  const tokens = [...content.matchAll(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[{}\[\]:,]|[^\s{}\[\]:,]+/g)]
    .filter(([text]) => !text.startsWith("//") && !text.startsWith("/*"))
    .map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
  let index = 0;
  function value() {
    const token = tokens[index++];
    const node = { start: token.start, end: token.end };
    if (token.text === "{") {
      node.properties = [];
      while (tokens[index].text !== "}") {
        const key = tokens[index++];
        index++; // colon
        const child = value();
        const comma = tokens[index].text === "," ? tokens[index++] : null;
        node.properties.push({ key: JSON.parse(key.text), start: key.start, value: child, comma });
      }
      node.end = tokens[index++].end;
    } else if (token.text === "[") {
      while (tokens[index].text !== "]") {
        value();
        if (tokens[index].text === ",") index++;
      }
      node.end = tokens[index++].end;
    }
    return node;
  }
  return value();
}

function editConfig(snapshot, config) {
  const { content, config: before, configPath } = snapshot;
  const edits = [];
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const indent = content.match(/^([\t ]+)"/m)?.[1] || "  ";
  const format = (value, depth) => JSON.stringify(value, null, indent).replace(/\n/g, newline + indent.repeat(depth));

  function visit(node, oldValue, newValue, depth) {
    if (isDeepStrictEqual(oldValue, newValue)) return;
    if (!node.properties || !isObject(newValue)) {
      edits.push({ start: node.start, end: node.end, text: format(newValue, depth) });
      return;
    }
    for (const property of node.properties) {
      if (!Object.hasOwn(newValue, property.key)) {
        edits.push({ start: property.start, end: property.comma?.end ?? property.value.end, text: "" });
      } else {
        visit(property.value, oldValue[property.key], newValue[property.key], depth + 1);
      }
    }
    const additions = Object.keys(newValue).filter((key) => !Object.hasOwn(oldValue, key));
    if (!additions.length) return;
    const last = node.properties.filter((property) => Object.hasOwn(newValue, property.key)).at(-1);
    if (last && !last.comma) edits.push({ start: last.value.end, end: last.value.end, text: "," });
    const text = additions.map((key) => `${indent.repeat(depth + 1)}${JSON.stringify(key)}: ${format(newValue[key], depth + 1)}`).join("," + newline);
    edits.push({ start: node.end - 1, end: node.end - 1, text: newline + text + newline + indent.repeat(depth) });
  }

  visit(valueSpans(content), before, config, 0);
  let result = content;
  // In compact objects the separator and new members share an offset. Apply
  // the later insertion first so the comma still precedes the new members.
  for (const edit of edits.reverse().sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  // Never write a partial or ambiguous edit if a document cannot be preserved.
  if (!isDeepStrictEqual(parseConfig(result, configPath), config)) {
    throw new OpenCodeConfigError(`Cannot safely edit ${configPath}; refusing to overwrite it.`);
  }
  return result;
}

export async function updateOpenCodeConfig(update, { create = false } = {}) {
  const configDir = getConfigDir();
  // All route mutations share one read/modify/write queue per config directory.
  const previous = pendingWrites.get(configDir) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const snapshot = await readOpenCodeConfig(configDir);
    if (!snapshot.config && !create) return snapshot;
    const config = structuredClone(snapshot.config || { $schema: "https://opencode.ai/config.json" });
    update(config);
    const content = snapshot.content === null ? JSON.stringify(config, null, 2) + "\n" : editConfig(snapshot, config);
    if (content === snapshot.content) return { ...snapshot, config };

    const temporaryPath = `${snapshot.targetPath}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(temporaryPath, content, { flag: "wx", mode: snapshot.mode ?? 0o600 });
      const latest = await readOpenCodeConfig(configDir);
      if (latest.configPath !== snapshot.configPath || latest.targetPath !== snapshot.targetPath || latest.content !== snapshot.content) {
        throw new OpenCodeConfigError(`Config changed while editing ${snapshot.configPath}; retry the request.`, 409);
      }
      if (snapshot.content === null) {
        // Atomic create, with no overwrite if a file appeared after the check.
        await fs.link(temporaryPath, snapshot.targetPath);
      } else {
        await fs.rename(temporaryPath, snapshot.targetPath);
      }
    } catch (error) {
      if (error instanceof OpenCodeConfigError) throw error;
      throw new OpenCodeConfigError(`Cannot write ${snapshot.configPath}; settings were not applied.`);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
    return { ...snapshot, config };
  });
  pendingWrites.set(configDir, operation);
  try {
    return await operation;
  } finally {
    if (pendingWrites.get(configDir) === operation) pendingWrites.delete(configDir);
  }
}
