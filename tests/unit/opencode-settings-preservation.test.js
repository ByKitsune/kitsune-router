import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJSONC } from "confbox";
import { GET, POST, PATCH, DELETE } from "../../src/app/api/cli-tools/opencode-settings/route.js";

const sandbox = "/tmp/opencode/zen-wave-20261019/opencode";
const endpoint = "http://localhost/api/cli-tools/opencode-settings";
const applyBody = {
  baseUrl: "http://localhost:20128",
  apiKey: "fixture-key",
  models: ["update", "added"],
  activeModel: "added",
  subagentModel: "added",
};
const source = `// Keep the user's banner.
{
  "$schema": "https://opencode.ai/config.json",
  // Keep this legacy preference and its comment.
  "theme": "catppuccin",
  "permission": { "bash": "ask" },
  "permissions": [{ "action": "shell", "resource": "*", "effect": "ask" }],
  "providers": { "openai": { "settings": { "apiKey": "{env:OPENAI_API_KEY}" } } },
  "agents": { "reviewer": { "description": "Keep native agent" } },
  "plugins": ["custom-plugin",],
  "instructions": ["literal ,} and ,]", "https://example.test/a//b", "quote: \\\" /* not a comment */"],
  "mcp": { "local": { "type": "local", "command": ["fixture",], }, },
  "provider": {
    // Keep the other provider.
    "other": { "options": { "baseURL": "https://example.test/a//b", }, },
    "kitsunerouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "My router",
      "options": { "baseURL": "http://old/v1", "apiKey": "old-key", "headers": { "x-custom": "keep" }, },
      "models": {
        // Keep custom model metadata.
        "update": { "name": "My model", "limit": { "context": 32000 }, "modalities": { "input": ["text"], "output": ["text"] }, },
        "keep": { "name": "Keep", },
      },
    },
  },
  "model": "kitsunerouter/update",
  "agent": {
    "reviewer": { "model": "other/review", "prompt": "Keep reviewer" },
    "explorer": { "description": "My explorer", "mode": "subagent", "model": "kitsunerouter/update", "prompt": "Keep explorer", },
  },
}
`;

let dir;
let configDir;

function request(method, body, query = "") {
  return new Request(endpoint + query, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

const operations = {
  GET: () => GET(),
  POST: () => POST(request("POST", applyBody)),
  PATCH: () => PATCH(request("PATCH", { clearActiveModel: true })),
  DELETE: () => DELETE(request("DELETE")),
};

async function seed(content = source, name = "opencode.json") {
  await fs.mkdir(configDir, { recursive: true });
  const file = path.join(configDir, name);
  await fs.writeFile(file, content, { mode: 0o600 });
  return file;
}

async function readConfig(file) {
  return parseJSONC(await fs.readFile(file, "utf8"), { allowTrailingComma: true });
}

function expectUnrelated(config) {
  expect(config).toMatchObject({
    $schema: "https://opencode.ai/config.json",
    theme: "catppuccin",
    permission: { bash: "ask" },
    permissions: [{ action: "shell", resource: "*", effect: "ask" }],
    providers: { openai: { settings: { apiKey: "{env:OPENAI_API_KEY}" } } },
    agents: { reviewer: { description: "Keep native agent" } },
    plugins: ["custom-plugin"],
    instructions: ["literal ,} and ,]", "https://example.test/a//b", 'quote: " /* not a comment */'],
    mcp: { local: { type: "local", command: ["fixture"] } },
    provider: { other: { options: { baseURL: "https://example.test/a//b" } } },
    agent: { reviewer: { model: "other/review", prompt: "Keep reviewer" } },
  });
}

beforeEach(async () => {
  await fs.mkdir(sandbox, { recursive: true });
  dir = await fs.mkdtemp(path.join(sandbox, "case-"));
  const home = path.join(dir, "home");
  await fs.mkdir(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("DATA_DIR", path.join(dir, "data"));
  vi.stubEnv("XDG_CONFIG_HOME", "");
  // Exercise config-based installation detection, without invoking an installed CLI.
  vi.stubEnv("PATH", "");
  configDir = path.join(os.homedir(), ".config", "opencode");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("OpenCode settings preserve existing JSONC", () => {
  it.each(["opencode.json", "opencode.jsonc"])("GET reads %s with comments and trailing commas without modifying it", async (name) => {
    const file = await seed(source, name);
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ installed: true, hasKitsuneRouter: true, configPath: file,
      opencode: { models: ["update", "keep"], activeModel: "update", baseURL: "http://old/v1" } });
    expectUnrelated(data.config);
    expect(await fs.readFile(file, "utf8")).toBe(source);
  });

  it("GET does not strip comma/bracket sequences or comment markers inside JSON strings", async () => {
    const text = String.raw`{"instructions":["literal ,} and ,]","https://example.test//path","escaped \" // /* string */","backslash \\"]}`;
    const file = await seed(text);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).config).toEqual(JSON.parse(text));
    expect(await fs.readFile(file, "utf8")).toBe(text);
  });

  it.each(["opencode.json", "opencode.jsonc"])("POST merges into %s while preserving custom settings and comments", async (name) => {
    const file = await seed(source, name);
    const response = await operations.POST();
    expect(response.status).toBe(200);
    expect((await response.json()).configPath).toBe(file);
    const config = await readConfig(file);
    expectUnrelated(config);
    expect(config.provider.kitsunerouter).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      name: "My router",
      options: { baseURL: "http://localhost:20128/v1", apiKey: "fixture-key", headers: { "x-custom": "keep" } },
      models: {
        update: { name: "My model", limit: { context: 32000 }, modalities: { input: ["text"], output: ["text"] } },
        keep: { name: "Keep" },
        added: { name: "added" },
      },
    });
    expect(config.model).toBe("kitsunerouter/added");
    expect(config.agent.explorer).toEqual({ description: "My explorer", mode: "subagent", model: "kitsunerouter/added", prompt: "Keep explorer" });
    const written = await fs.readFile(file, "utf8");
    for (const comment of ["// Keep the user's banner.", "// Keep this legacy preference and its comment.", "// Keep the other provider.", "// Keep custom model metadata."]) {
      expect(written).toContain(comment);
    }
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(configDir)).toEqual([name]);
  });

  it.each(["opencode.json", "opencode.jsonc"])("PATCH changes only the active model in %s", async (name) => {
    const file = await seed(source, name);
    const response = await operations.PATCH();
    expect(response.status).toBe(200);
    expect(await fs.readFile(file, "utf8")).toBe(source.replace('"model": "kitsunerouter/update",\n', '"model": "",\n'));
    expectUnrelated(await readConfig(file));
    expect(await fs.readdir(configDir)).toEqual([name]);
  });

  it("PATCH with no requested change leaves the file byte-for-byte intact", async () => {
    const file = await seed(source);
    const response = await PATCH(request("PATCH", {}));
    expect(response.status).toBe(200);
    expect(await fs.readFile(file, "utf8")).toBe(source);
  });

  it.each(["opencode.json", "opencode.jsonc"])("DELETE removes the router from %s while preserving user-defined explorer settings", async (name) => {
    const file = await seed(source, name);
    const response = await operations.DELETE();
    expect(response.status).toBe(200);
    const config = await readConfig(file);
    expectUnrelated(config);
    expect(config.provider.kitsunerouter).toBeUndefined();
    expect(config.model).toBeUndefined();
    expect(config.agent.explorer).toEqual({ description: "My explorer", mode: "subagent", prompt: "Keep explorer" });
    expect(await fs.readFile(file, "utf8")).toContain("// Keep the other provider.");
    expect(await fs.readdir(configDir)).toEqual([name]);
  });

  it("DELETE of one model keeps the other model and its explorer selection", async () => {
    const file = await seed(source.replace('"model": "kitsunerouter/update", "prompt"', '"model": "kitsunerouter/keep", "prompt"'));
    const response = await DELETE(request("DELETE", undefined, "?model=update"));
    expect(response.status).toBe(200);
    const config = await readConfig(file);
    expectUnrelated(config);
    expect(config.provider.kitsunerouter.models).toEqual({ keep: { name: "Keep" } });
    expect(config.model).toBe("kitsunerouter/keep");
    expect(config.agent.explorer.model).toBe("kitsunerouter/keep");
  });

  it("creates a new config only when both supported filenames are absent", async () => {
    const response = await operations.POST();
    expect(response.status).toBe(200);
    const file = path.join(configDir, "opencode.json");
    expect((await response.json()).configPath).toBe(file);
    expect(await readConfig(file)).toMatchObject({ model: "kitsunerouter/added", provider: { kitsunerouter: { models: { added: { name: "added" } } } } });
    expect(await fs.readdir(configDir)).toEqual(["opencode.json"]);
    expect((await operations.DELETE()).status).toBe(200);
    expect((await readConfig(file)).agent).toBeUndefined();
  });

  it.each(["PATCH", "DELETE"])("%s does not create an absent config", async (method) => {
    expect((await operations[method]()).status).toBe(200);
    await expect(fs.stat(configDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses XDG_CONFIG_HOME consistently for all methods instead of the default home config", async () => {
    const homeFile = await seed('{"theme":"untouched home"}');
    vi.stubEnv("XDG_CONFIG_HOME", path.join(dir, "xdg"));
    configDir = path.join(dir, "xdg", "opencode");
    const file = await seed(source, "opencode.jsonc");
    expect((await (await GET()).json()).configPath).toBe(file);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      expect((await operations[method]()).status).toBe(200);
      expectUnrelated(await readConfig(file));
      expect(await fs.readFile(homeFile, "utf8")).toBe('{"theme":"untouched home"}');
      expect(await fs.readdir(configDir)).toEqual(["opencode.jsonc"]);
    }
  });

  it("does not fall back to the home config when the XDG config is malformed", async () => {
    const homeFile = await seed('{"theme":"untouched home"}');
    vi.stubEnv("XDG_CONFIG_HOME", path.join(dir, "xdg"));
    configDir = path.join(dir, "xdg", "opencode");
    const file = await seed('{"mcp":', "opencode.jsonc");
    expect((await operations.POST()).status).toBeGreaterThanOrEqual(400);
    expect(await fs.readFile(file, "utf8")).toBe('{"mcp":');
    expect(await fs.readFile(homeFile, "utf8")).toBe('{"theme":"untouched home"}');
    expect(await fs.readdir(configDir)).toEqual(["opencode.jsonc"]);
  });

  it.each(Object.keys(operations))("%s refuses ambiguous sibling config files without modifying either", async (method) => {
    const json = await seed('{"theme":"json"}');
    const jsonc = await seed(source, "opencode.jsonc");
    const response = await operations[method]();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/opencode\.json.*opencode\.jsonc/);
    expect(await fs.readFile(json, "utf8")).toBe('{"theme":"json"}');
    expect(await fs.readFile(jsonc, "utf8")).toBe(source);
  });

  for (const name of ["opencode.json", "opencode.jsonc"]) {
    it.each(Object.keys(operations))(`%s fails closed on malformed ${name}`, async (method) => {
      const malformed = '{"mcp": {"private": true}, "model":';
      const file = await seed(malformed, name);
      const response = await operations[method]();
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect((await response.json()).error).toContain(name);
      expect(await fs.readFile(file, "utf8")).toBe(malformed);
      expect(await fs.readdir(configDir)).toEqual([name]);
    });
  }

  it.each(["", "null", "[]", '"not an object"', '{"theme":"keep"} /* unterminated'])('POST refuses non-object or invalid JSONC %j', async (content) => {
    const file = await seed(content);
    expect((await operations.POST()).status).toBeGreaterThanOrEqual(400);
    expect(await fs.readFile(file, "utf8")).toBe(content);
  });

  it.each(Object.keys(operations))("%s reports a real filesystem read failure instead of treating it as absent", async (method) => {
    await fs.mkdir(path.join(configDir, "opencode.jsonc"), { recursive: true });
    const response = await operations[method]();
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).error).toContain("opencode.jsonc");
    expect(await fs.readdir(configDir)).toEqual(["opencode.jsonc"]);
  });

  it("POST does not replace an existing file when reading it is denied", async () => {
    const file = await seed(source);
    const readFile = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation((target, ...args) => {
      if (String(target) === file) return Promise.reject(Object.assign(new Error("fixture denied"), { code: "EACCES" }));
      return readFile(target, ...args);
    });
    expect((await operations.POST()).status).toBeGreaterThanOrEqual(400);
    expect(await readFile(file, "utf8")).toBe(source);
  });

  it("POST treats a dangling config symlink as an error rather than a missing file", async () => {
    await fs.mkdir(configDir, { recursive: true });
    const file = path.join(configDir, "opencode.jsonc");
    const target = path.join(dir, "missing-target");
    await fs.symlink(target, file);
    expect((await operations.POST()).status).toBeGreaterThanOrEqual(400);
    expect(await fs.readlink(file)).toBe(target);
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readdir(configDir)).toEqual(["opencode.jsonc"]);
  });

  it("concurrent POST requests retain both added models", async () => {
    const file = await seed('{"theme":"keep"}');
    const responses = await Promise.all(["first", "second"].map((model) => POST(request("POST", {
      ...applyBody, models: [model], activeModel: model,
    }))));
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(responses.map((response) => response.status), JSON.stringify(bodies)).toEqual([200, 200]);
    expect(await readConfig(file)).toMatchObject({ theme: "keep", provider: { kitsunerouter: { models: {
      first: { name: "first" }, second: { name: "second" },
    } } } });
    expect(await fs.readdir(configDir)).toEqual(["opencode.json"]);
  });

  it("POST refuses to overwrite an external edit made after its initial read", async () => {
    const file = await seed(source);
    const externalEdit = '{"theme":"externally changed", "instructions":["keep this edit"]}';
    const readFile = fs.readFile.bind(fs);
    let edited = false;
    vi.spyOn(fs, "readFile").mockImplementation(async (target, ...args) => {
      const result = await readFile(target, ...args);
      if (String(target) === file && !edited) {
        edited = true;
        await fs.writeFile(file, externalEdit);
      }
      return result;
    });
    expect((await operations.POST()).status).toBe(409);
    expect(await readFile(file, "utf8")).toBe(externalEdit);
    expect(await fs.readdir(configDir)).toEqual(["opencode.json"]);
  });

  it("POST leaves the original file intact and cleans up when atomic replacement fails", async () => {
    const file = await seed(source);
    vi.spyOn(fs, "rename").mockRejectedValue(Object.assign(new Error("fixture denied"), { code: "EACCES" }));
    expect((await operations.POST()).status).toBeGreaterThanOrEqual(400);
    expect(await fs.readFile(file, "utf8")).toBe(source);
    expect(await fs.readdir(configDir)).toEqual(["opencode.json"]);
  });
});
