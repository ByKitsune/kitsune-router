"use client";

import { useState, useEffect, useRef } from "react";
import { getReviewedModelMetadata } from "open-sse/providers/metadata/reviewed.js";
import { getModelsDevPricingReference } from "open-sse/providers/pricing.js";
import { getProviderIdentityTokens } from "open-sse/providers/identity.js";
import { PRICING_RATE_FIELDS } from "open-sse/config/pricingConfig.js";
import { translate } from "@/i18n/runtime";

const PRICING_PAGE_SIZE = 40;

export default function PricingModal({ isOpen, onClose, onSave }) {
  const [pricingData, setPricingData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [diagnostics, setDiagnostics] = useState(null);
  const [editedModels, setEditedModels] = useState({});
  const [saveError, setSaveError] = useState("");
  const dialogRef = useRef(null);
  const initialPricing = useRef({});
  const savedPricing = useRef({});
  const changes = useRef({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      setSaveError("");
      setDiagnostics(null);
      try {
        const [effectiveResponse, savedResponse, diagnosticResponse] = await Promise.all([
          fetch("/api/pricing"), fetch("/api/pricing?view=overrides"),
          fetch("/api/pricing?view=diagnostics").catch(() => null),
        ]);
        if (!effectiveResponse.ok || !savedResponse.ok) throw new Error("Pricing could not be loaded");
        const [data, overrides, diagnosticData] = await Promise.all([effectiveResponse.json(), savedResponse.json(),
          diagnosticResponse?.ok ? diagnosticResponse.json().catch(() => null) : null]);
        if (cancelled) return;
        initialPricing.current = data;
        savedPricing.current = overrides;
        changes.current = {};
        setEditedModels({});
        setPricingData(data);
        setDiagnostics(diagnosticData?.providers && diagnosticData?.summary ? diagnosticData : null);
      } catch (error) {
        console.error("Failed to load pricing:", error);
        if (!cancelled) setLoadError("Failed to load pricing. Close and reopen to retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const handlePricingChange = (provider, model, field, value, serviceTier = null) => {
    const numValue = value === "" ? undefined : Number(value);
    if (value !== "" && (!Number.isFinite(numValue) || numValue < 0)) return;
    const modelChanges = { ...changes.current[provider]?.[model] };
    const changeKey = serviceTier ? `service_tiers.${serviceTier}.${field}` : field;
    const initialRow = initialPricing.current[provider]?.[model];
    const initialValue = serviceTier ? initialRow?.service_tiers?.[serviceTier]?.[field] : initialRow?.[field];
    if (Object.is(numValue, initialValue)) delete modelChanges[changeKey];
    else modelChanges[changeKey] = numValue;
    changes.current = { ...changes.current, [provider]: { ...changes.current[provider], [model]: modelChanges } };
    setEditedModels(prev => ({ ...prev, [JSON.stringify([provider, model])]: Object.keys(modelChanges).length > 0 }));

    setPricingData(prev => {
      const modelPricing = { ...prev[provider]?.[model] };
      const quote = serviceTier ? { ...modelPricing.service_tiers?.[serviceTier] } : modelPricing;
      if (value === "") delete quote[field];
      else quote[field] = numValue;
      if (serviceTier) modelPricing.service_tiers = { ...modelPricing.service_tiers, [serviceTier]: quote };
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
          const [scope, tier, rate] = field.split(".");
          if (scope === "service_tiers" && tier && rate) {
            const quote = row.service_tiers?.[tier] === null
              ? { ...Object.fromEntries(pricingFields.map(name => [name, null])), tier: null }
              : { ...row.service_tiers?.[tier] };
            if (value === undefined) delete quote[rate];
            else quote[rate] = value;
            row.service_tiers = { ...row.service_tiers, [tier]: quote };
          } else if (value === undefined) delete row[field];
          else row[field] = value;
        }
        updates[provider] = { ...updates[provider], [model]: row };
      }
    }
    if (Object.keys(updates).length === 0) { onClose(); return; }
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await onSave?.();
        onClose();
      } else {
        const error = await response.json();
        setSaveError(translate("Failed to save pricing: {error}", { error: error.error || response.status }));
      }
    } catch (error) {
      console.error("Failed to save pricing:", error);
      setSaveError(translate("Failed to save pricing"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(translate("Reset all pricing to defaults? This cannot be undone."))) return;
    setSaveError("");
    setSaving(true);
    try {
      const response = await fetch("/api/pricing", { method: "DELETE" });
      if (response.ok) {
        const defaults = await response.json();
        setPricingData(defaults);
        initialPricing.current = defaults;
        savedPricing.current = {};
        changes.current = {};
        setEditedModels({});
        setLoadError("");
        setDiagnostics(null);
        await onSave?.();
      } else setSaveError(translate("Failed to reset pricing"));
    } catch (error) {
      console.error("Failed to reset pricing:", error);
      setSaveError(translate("Failed to reset pricing"));
    } finally { setSaving(false); }
  };

  // Get all unique providers and models for display
  const normalizedQuery = query.trim().toLowerCase();
  const matchingRows = Object.keys(pricingData).sort().flatMap(provider =>
    Object.keys(pricingData[provider]).filter(model => !normalizedQuery || `${provider}/${model}`.toLowerCase().includes(normalizedQuery)).sort().map(model => [provider, model]));
  const pageCount = Math.max(1, Math.ceil(matchingRows.length / PRICING_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleModels = Object.create(null);
  for (const [provider, model] of matchingRows.slice(currentPage * PRICING_PAGE_SIZE, (currentPage + 1) * PRICING_PAGE_SIZE)) {
    (visibleModels[provider] ||= []).push(model);
  }
  const allProviders = Object.keys(visibleModels).filter(provider => visibleModels[provider].length > 0).sort();
  const pricingFields = PRICING_RATE_FIELDS;

  return (
    <dialog ref={dialogRef} aria-labelledby="pricing-modal-title"
      onCancel={onClose} onClose={() => { if (isOpen) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%_-_1.5rem)] max-w-6xl overflow-hidden rounded-[24px] border border-border-subtle bg-surface p-0 text-text-main shadow-elevated backdrop:bg-black/40 backdrop:backdrop-blur-md sm:w-[calc(100%_-_3rem)]"
    >
      {isOpen && <div className="flex max-h-[90dvh] min-w-0 flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle p-5">
          <h2 id="pricing-modal-title" className="text-xl font-semibold">Pricing Configuration</h2>
          <button
            type="button"
            aria-label="Close pricing configuration"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-2xl leading-none text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-text-muted">Loading pricing data...</div>
          ) : loadError ? (
            <div role="alert" className="text-center py-8 text-red-500">{loadError}</div>
          ) : (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-surface-2 border border-border rounded-lg p-3 text-sm">
                <p className="font-medium mb-1">Token Cost Estimates</p>
                <p id="pricing-rates-help" className="text-text-muted">
                  Editable rates are <strong>USD per million tokens</strong> ($/1M tokens)
                  for local cost estimates, not an upstream invoice.
                  Subscriptions and media units are not equivalent to token tariffs; see each model’s billing scope.
                  Not specified means unknown, not free. Clearing a field omits its override; untouched unknown rates stay unknown.
                  Cache-write rates distinguish the 5m/default TTL from the 1h TTL; saved tier rates and thresholds are preserved.
                  Native OpenAI writes keep their separate 30m and 12h lifetimes.
                  Delivered processing-speed tariffs are separate complete quotes; an unconfirmed tier remains unpriced.
                  Time-dependent native rates are shown for the current view; actual usage uses the recorded request timestamp. Saved overrides still win.
                  Exact eligible token references can supply local estimates during their verified observation window; unspecified cache and reasoning rates remain unknown.
                </p>
              </div>
              {diagnostics && <div className="rounded-2xl border border-border-subtle bg-bg-alt p-4" aria-label="Saved pricing coverage">
                <p className="text-sm font-semibold">Saved pricing coverage</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[['Input and output priced', diagnostics.summary.priced], ['Some rates missing', diagnostics.summary.partial], ['Token tariff unavailable', diagnostics.summary.unknown], ['Operator overrides', diagnostics.summary.operatorOverrides]].map(([label, value]) => <div key={label}><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums" data-i18n-skip="true">{value}</dd></div>)}
                </dl>
                <p className="mt-3 text-xs leading-5 text-text-muted">Coverage describes editable token estimates, not account availability or settled charges.</p>
              </div>}
              <label className="block text-sm">
                <span className="block mb-1 font-medium">Find provider or model</span>
                <input
                  type="search"
                  value={query}
                  onChange={event => { setQuery(event.target.value); setPage(0); }}
                  placeholder="Provider or exact model ID"
                  className="w-full px-3 py-2 bg-bg border border-border rounded focus:outline-none focus:border-primary"
                />
              </label>

              {matchingRows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
                <p role="status">{translate("Showing {start}–{end} of {count} models", { start: currentPage * PRICING_PAGE_SIZE + 1, end: Math.min((currentPage + 1) * PRICING_PAGE_SIZE, matchingRows.length), count: matchingRows.length })}</p>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={translate("Previous page")} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded-xl border border-border px-3 font-semibold disabled:opacity-40">{translate("Previous page")}</button>
                  <span className="tabular-nums">{translate("Page {page} of {count}", { page: currentPage + 1, count: pageCount })}</span>
                  <button type="button" aria-label={translate("Next page")} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded-xl border border-border px-3 font-semibold disabled:opacity-40">{translate("Next page")}</button>
                </div>
              </div>}

              {/* Pricing Tables */}
              {allProviders.map(provider => {
                const models = visibleModels[provider];
                return (
                  <div key={provider} className="border border-border rounded-lg overflow-hidden">
                    <div className="bg-surface-2 px-4 py-2 font-semibold text-sm">
                      {provider.toUpperCase()}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-max text-sm">
                        <thead className="bg-surface-2 text-text-muted uppercase text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left">Model</th>
                            <th className="px-3 py-2 text-right">Input</th>
                            <th className="px-3 py-2 text-right">Output</th>
                            <th className="px-3 py-2 text-right">Cached</th>
                            <th className="px-3 py-2 text-right">Reasoning</th>
                            <th className="px-3 py-2 text-right">Cache Write (5m/default)</th>
                            <th className="px-3 py-2 text-right">Cache Write (1h)</th>
                            <th className="px-3 py-2 text-right">Cache Write (OpenAI 30m)</th>
                            <th className="px-3 py-2 text-right">Cache Write (OpenAI 12h)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {models.map(model => {
                            const reviewed = getReviewedModelMetadata(provider, model);
                            const billing = reviewed?.billing;
                            const catalog = typeof getModelsDevPricingReference === "function" ? getModelsDevPricingReference(provider, model) : null;
                            const diagnostic = diagnostics?.providers?.[provider]?.[model];
                            const edited = Boolean(editedModels[JSON.stringify([provider, model])]);
                            const sourceLabel = edited ? "Unsaved override" : diagnostic?.source === "operator-override" ? "Operator override" : diagnostic?.source === "catalog-estimate" ? "Catalog estimate" : diagnostic?.source === "built-in-estimate" ? "Built-in estimate" : diagnostic?.source === "unpriced" ? "No effective token tariff" : null;
                            return (
                              <tr key={model} className="hover:bg-surface-2/50">
                                <td className="min-w-64 max-w-sm px-3 py-2 font-medium align-top">
                                  <span data-i18n-skip="true">{model}</span>
                                  {sourceLabel && <p className="mt-1.5 inline-flex rounded-full border border-border-subtle bg-surface-2 px-2 py-1 text-[10px] font-semibold text-text-muted">{sourceLabel}</p>}
                                  {diagnostic?.catalog?.status === "reference-only" && <p className="mt-1 text-xs font-normal text-text-muted">Catalog reference is not an eligible token tariff for this route.</p>}
                                  {diagnostic?.catalog?.status === "expired" && <p className="mt-1 text-xs font-normal text-warning">Catalog estimate expired; add a verified override or refresh its source.</p>}
                                  {diagnostic?.catalog?.status === "unmapped" && diagnostic.status !== "priced" && <p className="mt-1 text-xs font-normal text-text-muted">No exact catalog rate is mapped to this provider and model.</p>}
                                  {diagnostic?.status === "partial" && <p className="mt-1 text-xs font-normal text-text-muted">Some token components remain unknown.</p>}
                                  <div className="text-xs font-normal text-text-muted mt-1 max-w-sm">
                                    {billing ? (
                                      <>
<p>{translate("Billing: {kind} · {unit}{currency}", { kind: billing.kind ? translate(billing.kind.replaceAll("_", " ")) : translate("unverified"), unit: billing.unit ? translate(billing.unit.replaceAll("_", " ")) : translate("unit unknown"), currency: billing.currency ? ` (${billing.currency})` : "" })}</p>
                                        {(billing.note || reviewed.sources?.length > 0) && (
                                          <details className="mt-1">
                                            <summary className="cursor-pointer">Billing scope &amp; sources</summary>
                                            {billing.note && <p className="mt-1">{billing.note}</p>}
                                            {reviewed.sources?.map((source, index) => (
                                              <a key={source} href={source} target="_blank" rel="noopener noreferrer" className="block text-primary underline break-all">
                                                {translate("Source {index}", { index: index + 1 })}
                                              </a>
                                            ))}
                                          </details>
                                        )}
                                      </>
                                    ) : <p>Local estimate · billing scope unverified</p>}
                                    {catalog && (
                                      <details className="mt-1">
<summary className="cursor-pointer">{translate("models.dev catalog reference · {date}", { date: catalog.snapshotDate })}</summary>
                                        <p className="mt-1">Reference only, not an invoice or a promise that these rates apply. Catalog zero can describe a plan or a different unit. The editable fields show the effective estimate.</p>
<p>{translate("Catalog product/model: {product} / {model}", { product: catalog.product, model: catalog.model })}</p>
<p><span>Raw cost fields:</span> <code className="break-all" data-i18n-skip="true">{JSON.stringify(catalog.cost)}</code></p>
<p>{translate("File and hash verified: {date} UTC", { date: catalog.verifiedAtUtc })}</p>
<p className="break-all"><span>Snapshot SHA-256:</span> <span data-i18n-skip="true">{catalog.sha256}</span></p>
                                        <a href={catalog.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Catalog source</a>
                                      </details>
                                    )}
                                  </div>
                                  {pricingData[provider][model].service_tiers && (
                                    <details className="mt-2 text-xs font-normal">
                                      <summary className="cursor-pointer">Delivered speed tariffs</summary>
                                      {Object.entries(pricingData[provider][model].service_tiers).map(([tier, quote]) => (
                                        <div key={tier} className="mt-2">
<p className="font-medium">{translate("{tier} · USD per million tokens", { tier })}</p>
                                          <div className="grid grid-cols-2 gap-2 mt-1">
                                            {pricingFields.map(field => (
                                              <label key={field} className="flex flex-col gap-1">
<span>{tier} {translate(field.replaceAll("_", " "))}</span>
                                                <input
                                                  type="number" step="any" min="0"
                                                  value={quote?.[field] ?? ""}
                                                  placeholder="Not specified"
                                                  aria-describedby="pricing-rates-help"
                                                  onChange={event => handlePricingChange(provider, model, field, event.target.value, tier)}
                                                  className="w-28 px-2 py-1 text-right bg-bg border border-border rounded focus:outline-none focus:border-primary"
                                                />
                                              </label>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </details>
                                  )}
                                </td>
                                {pricingFields.map(field => (
                                  <td key={field} className="px-3 py-2">
                                    <label>
<span className="sr-only">{translate("{provider} {model} {field} (USD per million tokens)", { provider, model, field: `${translate(field.replaceAll("_", " "))}${field === "cache_creation" ? " (5m/default)" : ""}` })}</span>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={pricingData[provider][model][field] ?? ""}
                                        placeholder="Not specified"
                                        aria-describedby="pricing-rates-help"
                                        onChange={(e) => handlePricingChange(provider, model, field, e.target.value)}
                                        className="w-28 px-2 py-1 text-right bg-bg border border-border rounded focus:outline-none focus:border-primary"
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
                  {normalizedQuery ? "No matching provider or model" : "No pricing data available"}
                </div>
              )}
            </div>
          )}
        </div>

        {saveError && <p role="alert" className="mx-5 mb-4 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">{saveError}</p>}
        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-4">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-danger hover:bg-danger/10 rounded border border-danger/20 transition-colors"
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
      </div>}
    </dialog>
  );
}
