"use server";

import { NextResponse } from "next/server";
import { readExistingConfig } from "@/lib/cliTools/readExistingConfig";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Resolve chatLanguageModels.json path per OS
const getConfigPath = () => {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || home, "Code", "User", "chatLanguageModels.json");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Code", "User", "chatLanguageModels.json");
  }
  return path.join(home, ".config", "Code", "User", "chatLanguageModels.json");
};

const readConfig = async () => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    // Tolerate JSONC (trailing commas) and treat unparseable files as "no config"
    // rather than throwing a 500 that the UI misreads as "tool not installed".
    const stripped = content.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  } catch (error) {
    return null;
  }
};

const hasKitsuneRouterConfig = (config) => {
  if (!Array.isArray(config)) return false;
  return config.some((entry) => entry.name === "Kitsune Router");
};

const getKitsuneRouterEntry = (config) => {
  if (!Array.isArray(config)) return null;
  return config.find((entry) => entry.name === "Kitsune Router") || null;
};

// GET - Read current copilot config
export async function GET() {
  try {
    const config = await readConfig();
    const entry = getKitsuneRouterEntry(config);

    return NextResponse.json({
      installed: true,
      config,
      hasKitsuneRouter: hasKitsuneRouterConfig(config),
      configPath: getConfigPath(),
      currentModel: entry?.models?.[0]?.id || null,
      currentUrl: entry?.models?.[0]?.url || null,
    });
  } catch (error) {
    console.log("Error checking copilot settings:", error);
    return NextResponse.json({ error: "Failed to check copilot settings" }, { status: 500 });
  }
}

// POST - Apply Kitsune Router config to chatLanguageModels.json
export async function POST(request) {
  try {
    const { baseUrl, apiKey, models } = await request.json();

    if (!baseUrl || !models?.length) {
      return NextResponse.json({ error: "baseUrl and models are required" }, { status: 400 });
    }

    const configPath = getConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    // Read the existing provider array. A file that exists but cannot be read or
    // parsed must NOT be treated as empty: the array is written back below, so
    // that would drop every other model provider the user had configured.
    const existingConfig = await readExistingConfig(configPath, JSON.parse);
    if (existingConfig !== null && !Array.isArray(existingConfig)) {
      throw new Error(`${configPath} is not a provider array; refusing to overwrite it`);
    }
    const config = existingConfig ?? [];

    let keyToUse = apiKey;
    if (!keyToUse || keyToUse === "sk_kitsunerouter" || keyToUse === "sk_9router") {
      try {
        const { getApiKeys } = await import("@/lib/db/repos/apiKeysRepo.js");
        const keys = await getApiKeys();
        const active = keys?.filter(k => k.isActive);
        keyToUse = active?.length > 0 ? active[0].key : (keyToUse || "sk_kitsunerouter");
      } catch {
        keyToUse = keyToUse || "sk_kitsunerouter";
      }
    }
    const endpointUrl = `${baseUrl}/chat/completions#models.ai.azure.com`;
    const newEntry = {
      name: "Kitsune Router",
      vendor: "azure",
      apiKey: keyToUse,
      models: models.map((id) => ({
        id,
        name: id,
        url: endpointUrl,
        toolCalling: true,
        vision: false,
        maxInputTokens: 128000,
        maxOutputTokens: 16000,
      })),
    };

    // Replace existing Kitsune Router entry or append
    const idx = config.findIndex((e) => e.name === "Kitsune Router");
    if (idx >= 0) {
      config[idx] = newEntry;
    } else {
      config.push(newEntry);
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Copilot settings applied! Reload VS Code to take effect.",
      configPath,
    });
  } catch (error) {
    console.log("Error updating copilot settings:", error);
    // Surface the one failure the user can act on — a config file of theirs that
    // cannot be parsed — and keep everything else generic.
    const refusedToClobber = String(error?.message || "").includes("refusing to overwrite it");
    return NextResponse.json(
      { error: refusedToClobber ? error.message : "Failed to update copilot settings" },
      { status: 500 }
    );
  }
}

// DELETE - Remove Kitsune Router entry from chatLanguageModels.json
export async function DELETE() {
  try {
    const configPath = getConfigPath();

    let config = [];
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(existing);
      config = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    config = config.filter((e) => e.name !== "Kitsune Router");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Kitsune Router removed from Copilot config",
    });
  } catch (error) {
    console.log("Error resetting copilot settings:", error);
    return NextResponse.json({ error: "Failed to reset copilot settings" }, { status: 500 });
  }
}
