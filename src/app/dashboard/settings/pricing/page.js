"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { translate } from "@/i18n/runtime";
import Card from "@/shared/components/Card";
import PricingModal from "@/shared/components/PricingModal";

export default function PricingSettingsPage() {
  const [showModal, setShowModal] = useState(false);
  const [currentPricing, setCurrentPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const pending = useRef(null);

  const loadPricing = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const [response, diagnosticResponse] = await Promise.all([
        fetch("/api/pricing", { signal: controller.signal }),
        fetch("/api/pricing?view=diagnostics", { signal: controller.signal }).catch(() => null),
      ]);
      if (!response.ok) throw new Error("Pricing request failed");
      const [data, metadata] = await Promise.all([response.json(),
        diagnosticResponse?.ok ? diagnosticResponse.json().catch(() => null) : null]);
      if (controller.signal.aborted) return;
      setLoadError("");
      setCurrentPricing(data);
      setDiagnostics(metadata?.summary ? metadata : null);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("Failed to load pricing:", error);
        setLoadError("Pricing could not be loaded. Retry to view current estimates.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) loadPricing(); });
    return () => { disposed = true; pending.current?.abort(); };
  }, [loadPricing]);

  const handlePricingUpdated = () => {
    setLoading(true);
    setLoadError("");
    return loadPricing();
  };

  const providers = Object.keys(currentPricing || {}).sort();
  const rows = providers.flatMap(provider => Object.values(currentPricing[provider] || {}));
  const fullyPriced = diagnostics?.summary?.priced ?? rows.filter(quote => Number.isFinite(quote?.input) && Number.isFinite(quote?.output)).length;
  const incomplete = diagnostics?.summary ? diagnostics.summary.partial + diagnostics.summary.unknown : rows.length - fullyPriced;

  return (
    <div className="dashboard-page mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Pricing Settings</h1>
          <p className="text-text-muted mt-1">
            Review effective token estimates, missing rates and saved overrides
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-primary-hover"
          disabled={loading || Boolean(loadError)}
        >
          Edit Pricing
        </button>
      </div>

      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm"><p>{loadError}</p><button type="button" onClick={handlePricingUpdated} className="min-h-11 rounded-xl border border-border px-4 py-2 font-semibold">Retry</button></div>}
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-text-muted text-sm uppercase font-semibold">
            Models with input and output rates
          </div>
          <div className="text-2xl font-bold mt-1">
            {loading || loadError ? "…" : fullyPriced}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-text-muted text-sm uppercase font-semibold">
            Providers
          </div>
          <div className="text-2xl font-bold mt-1">
            {loading || loadError ? "…" : providers.length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-text-muted text-sm uppercase font-semibold">
            Unknown or partial rates
          </div>
          <div className="text-2xl font-bold mt-1 text-text-main">
            {loading || loadError ? "…" : incomplete}
          </div>
        </Card>
      </div>

      <p className="text-xs leading-5 text-text-muted">Model rows describe pricing configuration, not available accounts or provider entitlement. A known input and output rate does not guarantee every cache, reasoning, media or processing-speed charge is covered.</p>

      {/* Info Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">How Pricing Works</h2>
        <div className="space-y-3 text-sm text-text-muted">
          <p>
            <strong>Cost Estimates:</strong> Local estimates separate uncached input, cached input, cache creation, output and reasoning tokens without double-counting their subsets. Applicable long-context tiers are applied before calculation; these estimates are not an upstream invoice.
          </p>
          <p>
            <strong>Pricing Format:</strong> All rates are in <strong>dollars per million tokens</strong> ($/1M tokens).
            Example: An input rate of 2.50 means $2.50 per 1,000,000 input tokens.
          </p>
          <p>
            <strong>Token Types:</strong>
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li><strong>Input:</strong> Standard prompt tokens</li>
            <li><strong>Output:</strong> Completion/response tokens</li>
            <li><strong>Cached:</strong> Cached input tokens at the model-specific rate; there is no universal discount</li>
            <li><strong>Reasoning:</strong> Special reasoning/thinking tokens (fallback to output rate)</li>
            <li><strong>Cache Creation:</strong> Writes use their own documented tariffs and lifetime counters: Anthropic 5m/1h and native OpenAI 30m/12h remain distinct. Missing used rates stay unknown.</li>
          </ul>
          <p>
            <strong>Custom Pricing:</strong> You can override default pricing for specific models.
            Reset to defaults anytime to restore reference estimates. Missing rates are unknown, not free. Subscription quotas and media charges per image, duration, character or byte are not interchangeable with token prices.
            Delivered speed tariffs are independent from Standard; an unconfirmed tier is not priced by the requested speed. Known subtotals remain visibly incomplete when some requests are unpriced.
          </p>
        </div>
      </Card>

      {/* Current Pricing Preview */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Current Pricing Overview</h2>
          <button
            onClick={() => setShowModal(true)}
            className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
            disabled={loading || Boolean(loadError)}
          >
            View Full Details
          </button>
        </div>

        {loading ? (
          <div className="text-center py-4 text-text-muted">Loading pricing data...</div>
        ) : loadError ? <p className="text-sm text-text-muted">Current pricing is unavailable.</p> : currentPricing ? (
          <div className="space-y-3">
            {Object.keys(currentPricing).slice(0, 5).map(provider => (
              <div key={provider} className="text-sm">
                <span className="font-semibold">{provider.toUpperCase()}:</span>{" "}
                <span className="text-text-muted">
                  {translate("{count} model rows", { count: Object.keys(currentPricing[provider]).length })}
                </span>
              </div>
            ))}
            {Object.keys(currentPricing).length > 5 && (
              <div className="text-sm text-text-muted">
                {translate("{count} more providers", { count: Object.keys(currentPricing).length - 5 })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-text-muted">No pricing data available</div>
        )}
      </Card>

      {/* Pricing Modal */}
      <PricingModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={handlePricingUpdated}
        />
    </div>
  );
}
