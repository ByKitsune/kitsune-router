"use client";

import { useState, useEffect, useRef } from "react";
import { getDefaultPricing } from "open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "open-sse/providers/metadata/reviewed.js";
import { getProviderIdentityTokens } from "open-sse/providers/identity.js";

export default function PricingModal({ isOpen, onClose, onSave }) {
  const [pricingData, setPricingData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const initialPricing = useRef({});
  const savedPricing = useRef({});
  const changes = useRef({});

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [effectiveResponse, savedResponse] = await Promise.all([
          fetch("/api/pricing"), fetch("/api/pricing?view=overrides"),
        ]);
        if (!effectiveResponse.ok || !savedResponse.ok) throw new Error("Pricing could not be loaded");
        const [data, overrides] = await Promise.all([effectiveResponse.json(), savedResponse.json()]);
        if (cancelled) return;
        initialPricing.current = data;
        savedPricing.current = overrides;
        changes.current = {};
        setPricingData(data);
      } catch (error) {
        console.error("Failed to load pricing:", error);
        if (!cancelled) setLoadError("Failed to load pricing. Close and reopen to retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const handlePricingChange = (provider, model, field, value) => {
    const numValue = value === "" ? undefined : Number(value);
    if (value !== "" && (!Number.isFinite(numValue) || numValue < 0)) return;
    const modelChanges = { ...changes.current[provider]?.[model] };
    if (Object.is(numValue, initialPricing.current[provider]?.[model]?.[field])) delete modelChanges[field];
    else modelChanges[field] = numValue;
    changes.current = { ...changes.current, [provider]: { ...changes.current[provider], [model]: modelChanges } };

    setPricingData(prev => {
      const modelPricing = { ...prev[provider]?.[model] };
      if (value === "") delete modelPricing[field];
      else modelPricing[field] = numValue;
      return {
        ...prev,
        [provider]: { ...prev[provider], [model]: modelPricing }
      };
    });
  };

  const handleSave = async () => {
    const updates = Object.create(null);
    for (const [provider, models] of Object.entries(changes.current)) {
      for (const [model, fields] of Object.entries(models)) {
        if (Object.keys(fields).length === 0) continue;
        const token = getProviderIdentityTokens(provider).find(id => Object.hasOwn(savedPricing.current[id] || {}, model));
        const row = token === undefined ? {} : { ...savedPricing.current[token][model] };
        for (const [field, value] of Object.entries(fields)) {
          if (value === undefined) delete row[field];
          else row[field] = value;
        }
        updates[provider] = { ...updates[provider], [model]: row };
      }
    }
    if (Object.keys(updates).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        onSave?.();
        onClose();
      } else {
        const error = await response.json();
        alert(`Failed to save pricing: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to save pricing:", error);
      alert("Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all pricing to defaults? This cannot be undone.")) return;

    try {
      const response = await fetch("/api/pricing", { method: "DELETE" });
      if (response.ok) {
        const defaults = getDefaultPricing();
        setPricingData(defaults);
        initialPricing.current = defaults;
        savedPricing.current = {};
        changes.current = {};
        setLoadError("");
      }
    } catch (error) {
      console.error("Failed to reset pricing:", error);
      alert("Failed to reset pricing");
    }
  };

  if (!isOpen) return null;

  // Get all unique providers and models for display
  const allProviders = Object.keys(pricingData).sort();
  const pricingFields = ["input", "output", "cached", "reasoning", "cache_creation", "cache_creation_1h"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-base border border-border rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-semibold">Pricing Configuration</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-text-muted">Loading pricing data...</div>
          ) : loadError ? (
            <div role="alert" className="text-center py-8 text-red-500">{loadError}</div>
          ) : (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-bg-subtle border border-border rounded-lg p-3 text-sm">
                <p className="font-medium mb-1">Token Cost Estimates</p>
                <p id="pricing-rates-help" className="text-text-muted">
                  Editable rates are <strong>USD per million tokens</strong> ($/1M tokens)
                  for local cost estimates, not an upstream invoice.
                  Subscriptions and media units are not equivalent to token tariffs; see each model’s billing scope.
                  Not specified means unknown, not free. Clearing a field omits its override; untouched unknown rates stay unknown.
                  Cache-write rates distinguish the 5m/default TTL from the 1h TTL; saved tier rates and thresholds are preserved.
                </p>
              </div>

              {/* Pricing Tables */}
              {allProviders.map(provider => {
                const models = Object.keys(pricingData[provider]).sort();
                return (
                  <div key={provider} className="border border-border rounded-lg overflow-hidden">
                    <div className="bg-bg-subtle px-4 py-2 font-semibold text-sm">
                      {provider.toUpperCase()}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-bg-hover text-text-muted uppercase text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left">Model</th>
                            <th className="px-3 py-2 text-right">Input</th>
                            <th className="px-3 py-2 text-right">Output</th>
                            <th className="px-3 py-2 text-right">Cached</th>
                            <th className="px-3 py-2 text-right">Reasoning</th>
                            <th className="px-3 py-2 text-right">Cache Write (5m/default)</th>
                            <th className="px-3 py-2 text-right">Cache Write (1h)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {models.map(model => {
                            const reviewed = getReviewedModelMetadata(provider, model);
                            const billing = reviewed?.billing;
                            return (
                              <tr key={model} className="hover:bg-bg-subtle/50">
                                <td className="px-3 py-2 font-medium">
                                  {model}
                                  <div className="text-xs font-normal text-text-muted mt-1 max-w-sm">
                                    {billing ? (
                                      <>
                                        <p>Billing: {billing.kind?.replaceAll("_", " ") || "unverified"} · {billing.unit?.replaceAll("_", " ") || "unit unknown"}{billing.currency ? ` (${billing.currency})` : ""}</p>
                                        {(billing.note || reviewed.sources?.length > 0) && (
                                          <details className="mt-1">
                                            <summary className="cursor-pointer">Billing scope &amp; sources</summary>
                                            {billing.note && <p className="mt-1">{billing.note}</p>}
                                            {reviewed.sources?.map((source, index) => (
                                              <a key={source} href={source} target="_blank" rel="noopener noreferrer" className="block text-primary underline break-all">
                                                Source {index + 1}
                                              </a>
                                            ))}
                                          </details>
                                        )}
                                      </>
                                    ) : <p>Local estimate · billing scope unverified</p>}
                                  </div>
                                </td>
                                {pricingFields.map(field => (
                                  <td key={field} className="px-3 py-2">
                                    <label>
                                      <span className="sr-only">{provider} {model} {field.replaceAll("_", " ")}{field === "cache_creation" ? " (5m/default)" : ""} (USD per million tokens)</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={pricingData[provider][model][field] ?? ""}
                                        placeholder="Not specified"
                                        aria-describedby="pricing-rates-help"
                                        onChange={(e) => handlePricingChange(provider, model, field, e.target.value)}
                                        className="w-28 px-2 py-1 text-right bg-bg-base border border-border rounded focus:outline-none focus:border-primary"
                                      />
                                    </label>
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {allProviders.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  No pricing data available
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded border border-red-500/20 transition-colors"
            disabled={saving}
          >
            Reset to Defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text border border-border rounded transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={saving || loading || Boolean(loadError)}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}