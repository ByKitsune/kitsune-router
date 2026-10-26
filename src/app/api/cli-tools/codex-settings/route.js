import { NextResponse } from "next/server";
import { readExistingConfig } from "@/lib/cliTools/readExistingConfig";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseTOML, stringifyTOML } from "confbox";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

const getCodexDir = () => path.join(os.homedir(), ".codex");
const getCodexConfigPath = () => path.join(getCodexDir(), "config.toml");
const getCodexAuthPath = () => path.join(getCodexDir(), "auth.json");

// Flatten confbox-parsed TOML into a writable object, preserving nested tables
const parsedToWritable = (obj) => obj ?? {};

// Set a nested key from a flat dotted path, creating intermediate objects as needed
const setNestedSection = (obj, dottedKey, value) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

// Delete a nested key from a flat dotted path
const deleteNestedSection = (obj, dottedKey) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (cur == null) return;
  }
  delete cur[keys[keys.length - 1]];
};

// Check if codex CLI is installed (via which/where or config file exists)
const checkCodexInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where codex" : "which codex";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getCodexConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

// Read current config.toml
const readConfig = async () => {
  try {
    const configPath = getCodexConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if config has Kitsune Router settings
const hasKitsuneRouterConfig = (config) => {
  if (!config) return false;
  return config.includes("model_provider = \"kitsunerouter\"") || config.includes("[model_providers.kitsunerouter]");
};

// GET - Check codex CLI and read current settings
export async function GET() {
  try {
    const isInstalled = await checkCodexInstalled();
    
    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Codex CLI is not installed",
      });
    }

    const config = await readConfig();

    return NextResponse.json({
      installed: true,
      config,
      hasKitsuneRouter: hasKitsuneRouterConfig(config),
      configPath: getCodexConfigPath(),
    });
  } catch (error) {
    console.log("Error checking codex settings:", error);
    return NextResponse.json({ error: "Failed to check codex settings" }, { status: 500 });
  }
}

// POST - Update Kitsune Router settings (merge with existing config)
export async function POST(request) {
  try {
    let { baseUrl, apiKey, model, subagentModel } = await request.json();
    
    if (!baseUrl || !model) {
      return NextResponse.json({ error: "baseUrl and model are required" }, { status: 400 });
    }

    if (!apiKey || apiKey === "sk_kitsunerouter" || apiKey === "sk_9router") {
      try {
        const { getApiKeys } = await import("@/lib/db/repos/apiKeysRepo.js");
        const keys = await getApiKeys();
        const active = keys?.filter(k => k.isActive);
        if (active?.length > 0) {
          apiKey = active[0].key;
        } else {
          apiKey = apiKey || "sk_kitsunerouter";
        }
      } catch {
        apiKey = apiKey || "sk_kitsunerouter";
      }
    }
    const codexDir = getCodexDir();
    const configPath = getCodexConfigPath();

    // Ensure directory exists
    await fs.mkdir(codexDir, { recursive: true });

    // Read and parse existing config. A file that exists but cannot be read or
    // parsed must NOT be treated as empty: the merge below writes the result back,
    // so that would replace every provider, MCP server and policy the user had.
    const existingConfig = await readExistingConfig(configPath, (raw) => parsedToWritable(parseTOML(raw)));
    const parsed = existingConfig ?? {};

    // Update only Kitsune Router related fields (api_key goes to auth.json, not config.toml)
    parsed.model = model;
    parsed.model_provider = "kitsunerouter";

    // Custom providers ignore auth.json - the key must travel as a static header
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    setNestedSection(parsed, "model_providers.kitsunerouter", {
      name: "Kitsune Router",
      base_url: normalizedBaseUrl,
      wire_api: "responses",
      http_headers: { Authorization: `Bearer ${apiKey}` },
    });

    // Subagent model is a scalar under [agents]; agents.<role> now means a custom role
    deleteNestedSection(parsed, "agents.subagent");
    setNestedSection(parsed, "agents.default_subagent_model", subagentModel || model);

    // Write merged config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    return NextResponse.json({
      success: true,
      message: "Codex settings applied successfully!",
      configPath,
    });
  } catch (error) {
    console.log("Error updating codex settings:", error);
    // Surface the one failure the user can act on — a config file of theirs that
    // cannot be parsed — and keep everything else generic.
    const refusedToClobber = String(error?.message || "").includes("refusing to overwrite it");
    return NextResponse.json(
      { error: refusedToClobber ? error.message : "Failed to update codex settings" },
      { status: 500 }
    );
  }
}

// DELETE - Remove Kitsune Router settings only (keep other settings)
export async function DELETE() {
  try {
    const configPath = getCodexConfigPath();

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No config file to reset",
        });
      }
      throw error;
    }

    // Remove Kitsune Router related root fields only if they point to kitsunerouter
    if (parsed.model_provider === "kitsunerouter") {
      delete parsed.model;
      delete parsed.model_provider;
    }

    // Remove kitsunerouter provider section
    deleteNestedSection(parsed, "model_providers.kitsunerouter");

    // Remove subagent configuration (both the current key and the legacy role form)
    deleteNestedSection(parsed, "agents.default_subagent_model");
    deleteNestedSection(parsed, "agents.subagent");

    // Write updated config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Remove OPENAI_API_KEY from auth.json
    const authPath = getCodexAuthPath();
    const authData = (await readExistingConfig(authPath, JSON.parse)) ?? {};
    delete authData.OPENAI_API_KEY;
    delete authData.auth_mode;

    // Write back or delete if empty
    if (Object.keys(authData).length === 0) {
      await fs.unlink(authPath).catch(() => {});
    } else {
      await fs.writeFile(authPath, JSON.stringify(authData, null, 2));
    }

    return NextResponse.json({
      success: true,
      message: "Kitsune Router settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting codex settings:", error);
    return NextResponse.json({ error: "Failed to reset codex settings" }, { status: 500 });
  }
}
