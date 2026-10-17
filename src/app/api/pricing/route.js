import { NextResponse } from "next/server";
import { getPricing, updatePricing, resetPricing, resetAllPricing } from "@/lib/localDb.js";
import { getDefaultPricing } from "open-sse/providers/pricing.js";
import { getSavedPricing } from "@/lib/db/repos/pricingRepo.js";

const RATE_FIELDS = new Set(["input", "output", "cached", "reasoning", "cache_creation", "cache_creation_1h"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function validateTier(tier, model) {
  if (tier === null) return null;
  if (!isPlainObject(tier)) return `Invalid pricing tier for ${model}`;
  for (const [field, value] of Object.entries(tier)) {
    if (field === "threshold") {
      if (!Number.isFinite(value) || value <= 0) {
        return `Invalid tier threshold for ${model}: must be a finite positive number`;
      }
    } else if (field === "inclusive") {
      if (typeof value !== "boolean") return `Invalid tier inclusive flag for ${model}: must be a boolean`;
    } else if (!RATE_FIELDS.has(field)) {
      return `Invalid tier pricing field: ${field} for ${model}`;
    } else if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return `Invalid tier pricing value for ${field} in ${model}: must be null or a finite non-negative number`;
    }
  }
  return null;
}

/**
 * GET /api/pricing
 * Merged rates by default; ?view=overrides returns only explicit saved fields.
 */
export async function GET(request) {
  try {
    const overrides = request?.url && new URL(request.url).searchParams.get("view") === "overrides";
    const pricing = overrides ? await getSavedPricing() : await getPricing();
    return NextResponse.json(pricing);
  } catch (error) {
    console.error("Error fetching pricing:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pricing
 * Update pricing configuration
 * Rate fields accept non-negative numbers or null (unknown); tier:null disables inheritance.
 */
export async function PATCH(request) {
  try {
    const body = await request.json();

    // Validate body structure
    if (!isPlainObject(body)) {
      return NextResponse.json(
        { error: "Invalid pricing data format" },
        { status: 400 }
      );
    }

    // Validate pricing structure
    for (const [provider, models] of Object.entries(body)) {
      if (!isPlainObject(models)) {
        return NextResponse.json(
          { error: `Invalid pricing for provider: ${provider}` },
          { status: 400 }
        );
      }

      for (const [model, pricing] of Object.entries(models)) {
        if (!isPlainObject(pricing)) {
          return NextResponse.json(
            { error: `Invalid pricing for model: ${provider}/${model}` },
            { status: 400 }
          );
        }

        // Validate pricing fields
        const tierError = Object.hasOwn(pricing, "tier") ? validateTier(pricing.tier, `${provider}/${model}`) : null;
        if (tierError) {
          return NextResponse.json({ error: tierError }, { status: 400 });
        }
        for (const [key, value] of Object.entries(pricing)) {
          if (key === "tier") continue;
          if (!RATE_FIELDS.has(key)) {
            return NextResponse.json(
              { error: `Invalid pricing field: ${key} for ${provider}/${model}` },
              { status: 400 }
            );
          }
          if (value !== null && (!Number.isFinite(value) || value < 0)) {
            return NextResponse.json(
              { error: `Invalid pricing value for ${key} in ${provider}/${model}: must be null or a finite non-negative number` },
              { status: 400 }
            );
          }
        }
      }
    }

    const updatedPricing = await updatePricing(body);
    return NextResponse.json(updatedPricing);
  } catch (error) {
    console.error("Error updating pricing:", error);
    return NextResponse.json(
      { error: "Failed to update pricing" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pricing
 * Reset pricing to defaults
 * Query params: ?provider=xxx&model=yyy (optional)
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const model = searchParams.get("model");

    if (provider && model) {
      // Reset specific model
      await resetPricing(provider, model);
    } else if (provider) {
      // Reset entire provider
      await resetPricing(provider);
    } else {
      // Reset all pricing
      await resetAllPricing();
    }

    const pricing = await getPricing();
    return NextResponse.json(pricing);
  } catch (error) {
    console.error("Error resetting pricing:", error);
    return NextResponse.json(
      { error: "Failed to reset pricing" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pricing/defaults
 * Get default pricing configuration
 */
export async function GET_DEFAULTS() {
  try {
    const defaultPricing = getDefaultPricing();
    return NextResponse.json(defaultPricing);
  } catch (error) {
    console.error("Error fetching default pricing:", error);
    return NextResponse.json(
      { error: "Failed to fetch default pricing" },
      { status: 500 }
    );
  }
}