import { NextResponse } from "next/server";
import { applyReviewedCapabilities, getReviewedModelMetadata } from "open-sse/providers/metadata/reviewed.js";
import { getModelAliases, setModelAlias, getCustomModels } from "@/models";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { AI_MODELS } from "@/shared/constants/config";
import { getProviderAlias } from "@/shared/constants/providers";
import { getModelKind, PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { canonicalizeProviderId } from "open-sse/providers/identity.js";
import { getCapabilitiesForModel, withDeclaredCapabilities } from "open-sse/providers/capabilities.js";
import { getCapabilityVerification } from "open-sse/providers/metadata/modelsDevCapabilityResolution.js";

// GET /api/models - Get models with aliases
export async function GET() {
  try {
    const modelAliases = await getModelAliases();
    const disabled = await getDisabledModels();

    const canonicalKey = (provider, model) => `${canonicalizeProviderId(provider)}/${model}`;
    const aliasesByModel = new Map(Object.entries(modelAliases).filter(([, target]) => typeof target === "string" && target.includes("/"))
      .map(([alias, target]) => {
        const slash = target.indexOf("/");
        return [canonicalKey(target.slice(0, slash), target.slice(slash + 1)), alias];
      }));
    const customByModel = new Map((await getCustomModels())
      .filter((m) => m?.id && getModelKind(m, "llm") === "llm")
      .map((m) => [canonicalKey(m.providerAlias, m.id), m]));
    const isDisabled = (provider, model) => Object.entries(disabled).some(([token, ids]) =>
      canonicalizeProviderId(token) === canonicalizeProviderId(provider) && Array.isArray(ids) && ids.includes(model));
    const models = [];
    const seen = new Set();
    const rows = [...AI_MODELS, ...[...customByModel.values()].map((m) => ({ provider: m.providerAlias, model: m.id, name: m.name || m.id }))];
    for (const m of rows) {
      const key = canonicalKey(m.provider, m.model);
      if (seen.has(key) || isDisabled(m.provider, m.model)) continue;
      seen.add(key);
      const providerId = canonicalizeProviderId(m.provider);
      const providerAlias = getProviderAlias(providerId) || m.provider;
      const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
      const declared = PROVIDER_MODELS[staticAlias]?.find((row) => row.id === m.model && getModelKind(row, "llm") === "llm");
      const custom = customByModel.get(key);
      const reviewedBase = applyReviewedCapabilities({
        ...getCapabilitiesForModel(providerId, m.model),
        ...(declared?.contextLength ? { contextWindow: declared.contextLength } : {}),
        ...(declared?.maxOutputTokens ? { maxOutput: declared.maxOutputTokens } : {}),
      }, providerId, m.model);
      const c = withDeclaredCapabilities({
        ...reviewedBase,
        ...(custom?.contextWindow ? { contextWindow: custom.contextWindow } : {}),
        ...(custom?.maxOutput ? { maxOutput: custom.maxOutput } : {}),
      }, custom?.caps, providerId, m.model);
      const metadata = getReviewedModelMetadata(providerId, m.model);
      models.push({
        ...m,
        fullModel: `${m.provider}/${m.model}`,
        routedModel: `${providerAlias}/${m.model}`,
        alias: aliasesByModel.get(key) || m.model,
        caps: c,
        metadata: {
          ...metadata,
          capabilityVerification: getCapabilityVerification(providerId, m.model, c, metadata, custom?.caps),
        },
      });
    }

    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// PUT /api/models - Update model alias
export async function PUT(request) {
  try {
    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    const modelAliases = await getModelAliases();

    // Check if alias already exists for different model
    const existingModel = modelAliases[alias] && modelAliases[alias] !== model;

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    // Update alias
    await setModelAlias(alias, model);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}
