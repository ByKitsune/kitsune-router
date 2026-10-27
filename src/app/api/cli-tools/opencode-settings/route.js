"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { OpenCodeConfigError, readOpenCodeConfig, updateOpenCodeConfig } from "@/shared/utils/opencodeConfig";

const execAsync = promisify(exec);

const explorerDefaults = {
  description: "Fast explorer subagent for codebase exploration",
  mode: "subagent",
};

const errorResponse = (error, fallback) => NextResponse.json({
  error: error instanceof OpenCodeConfigError ? error.message : fallback,
}, { status: error instanceof OpenCodeConfigError ? error.status : 500 });

// A readable config also counts as installed; binary detection is the fallback.
const checkOpenCodeInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where opencode" : "which opencode";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    return false;
  }
};

const hasKitsuneRouterConfig = (config) => {
  if (!config?.provider) return false;
  return !!config.provider["kitsunerouter"];
};

// GET - Check opencode CLI and read current settings
export async function GET() {
  try {
    const { config, configPath } = await readOpenCodeConfig();
    const isInstalled = config !== null || await checkOpenCodeInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "OpenCode CLI is not installed",
      });
    }

    const providerConfig = config?.provider?.["kitsunerouter"];
    const modelMap = providerConfig?.models || {};

    return NextResponse.json({
      installed: true,
      config,
      hasKitsuneRouter: hasKitsuneRouterConfig(config),
      configPath,
      opencode: {
        models: Object.keys(modelMap),
        activeModel: config?.model?.startsWith("kitsunerouter/") ? config.model.replace(/^kitsunerouter\//, "") : null,
        baseURL: providerConfig?.options?.baseURL || null,
      },
    });
  } catch (error) {
    console.log("Error checking opencode settings:", error);
    return errorResponse(error, "Failed to check opencode settings");
  }
}

// POST - Apply Kitsune Router as openai-compatible provider (multi-model support)
export async function POST(request) {
  try {
    const { baseUrl, apiKey, model, models, activeModel, subagentModel } = await request.json();

    // Accept either `model` (string, legacy) or `models` (array of strings)
    const modelsArray = Array.isArray(models) ? models.slice() : (typeof model === "string" ? [model] : []);

    if (!baseUrl || modelsArray.length === 0) {
      return NextResponse.json({ error: "baseUrl and at least one model are required" }, { status: 400 });
    }

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
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
    const effectiveSubagentModel = subagentModel || modelsArray[0];

    const { configPath } = await updateOpenCodeConfig((config) => {
      if (!config.provider) config.provider = {};
      const existingProvider = config.provider["kitsunerouter"] || { npm: "@ai-sdk/openai-compatible", options: {}, models: {} };
      existingProvider.options = {
        ...existingProvider.options,
        baseURL: normalizedBaseUrl,
        apiKey: keyToUse,
      };
      existingProvider.models = existingProvider.models || {};
      for (const m of modelsArray) {
        if (!m || typeof m !== "string") continue;
        // Existing model metadata belongs to the user.
        if (!Object.hasOwn(existingProvider.models, m)) {
          existingProvider.models[m] = { name: m, modalities: { input: ["text", "image"], output: ["text"] } };
        }
      }
      config.provider["kitsunerouter"] = existingProvider;
      config.model = activeModel === "" ? "" : `kitsunerouter/${activeModel || modelsArray[0]}`;
      if (!config.agent) config.agent = {};
      config.agent.explorer = {
        ...explorerDefaults,
        ...config.agent.explorer,
        model: `kitsunerouter/${effectiveSubagentModel}`,
      };
    }, { create: true });

    return NextResponse.json({
      success: true,
      message: "OpenCode settings applied successfully!",
      configPath,
    });
  } catch (error) {
    console.log("Error applying opencode settings:", error);
    return errorResponse(error, "Failed to apply settings");
  }
}

// PATCH - Update specific settings (e.g., clear active model)
export async function PATCH(request) {
  try {
    const { clearActiveModel } = await request.json();
    const { config } = await updateOpenCodeConfig((config) => {
      // Clear active model but keep models in the list
      if (clearActiveModel === true && config.model?.startsWith("kitsunerouter/")) {
        config.model = "";
      }
    });
    if (!config) {
      return NextResponse.json({ success: true, message: "No config file found" });
    }

    return NextResponse.json({
      success: true,
      message: "Settings updated",
    });
  } catch (error) {
    console.log("Error patching opencode settings:", error);
    return errorResponse(error, "Failed to patch settings");
  }
}

// DELETE - Remove Kitsune Router provider or specific models from config
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelToRemove = searchParams.get("model");
    const { config } = await updateOpenCodeConfig((config) => {
      // If specific model provided, remove just that model
      if (modelToRemove && config.provider?.["kitsunerouter"]?.models) {
        delete config.provider["kitsunerouter"].models[modelToRemove];
        if (Object.keys(config.provider["kitsunerouter"].models).length === 0) {
          delete config.provider["kitsunerouter"];
          if (config.model?.startsWith("kitsunerouter/")) delete config.model;
        } else if (config.model === `kitsunerouter/${modelToRemove}`) {
          const remainingModels = Object.keys(config.provider["kitsunerouter"].models);
          config.model = `kitsunerouter/${remainingModels[0]}`;
        }
      } else {
        if (config.provider) delete config.provider["kitsunerouter"];
        if (config.model?.startsWith("kitsunerouter/")) delete config.model;
      }

      const explorer = config.agent?.explorer;
      if (explorer?.model?.startsWith("kitsunerouter/") &&
          (!modelToRemove || !config.provider?.kitsunerouter || explorer.model === `kitsunerouter/${modelToRemove}`)) {
        delete explorer.model;
        // Remove generated defaults, but retain user-defined agent settings.
        const onlyDefaults = Object.keys(explorer).every((key) => explorer[key] === explorerDefaults[key]);
        if (onlyDefaults) delete config.agent.explorer;
        if (Object.keys(config.agent).length === 0) delete config.agent;
      }
    });
    if (!config) {
      return NextResponse.json({ success: true, message: "No config file to reset" });
    }

    return NextResponse.json({
      success: true,
      message: modelToRemove ? `Model "${modelToRemove}" removed` : "Kitsune Router settings removed from OpenCode",
    });
  } catch (error) {
    console.log("Error resetting opencode settings:", error);
    return errorResponse(error, "Failed to reset opencode settings");
  }
}
