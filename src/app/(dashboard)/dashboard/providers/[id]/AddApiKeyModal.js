"use client";

import { useState, useRef, useLayoutEffect } from "react";
import PropTypes from "prop-types";
import { Button, Badge, Input, Modal, Select } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { planBulkAdd } from "@/shared/utils/bulkAdd";
import { withConnectionBaseUrl } from "@/shared/utils/connectionBaseUrl";
import { buildConnectionValidationPayload } from "@/shared/utils/connectionValidation";

const BULK_PLACEHOLDER = `name1|sk-key1\nname2|sk-key2\nsk-key-only-auto-named`;

const NONE_PROXY_POOL_VALUE = "__none__";

const createInitialFormData = () => ({
  name: "",
  apiKey: "",
  defaultModel: "",
  priority: 1,
  proxyPoolId: NONE_PROXY_POOL_VALUE,
  ollamaHostUrl: "",
  baseUrl: "",
});

const createInitialAzureData = () => ({
  azureEndpoint: "",
  apiVersion: "2024-10-01-preview",
  deployment: "",
  organization: "",
});

export default function AddApiKeyModal({ isOpen, provider, providerName, isCompatible, isAnthropic, authType, authHint, website, proxyPools, error, existingNames, onSave, onBulkDone, onClose }) {
  const isOllamaLocal = provider === "ollama-local";
  const isCookie = authType === "cookie";
  const isXaiApiKey = provider === "xai" && !isCookie;
  const credentialLabel = isCookie ? "Cookie Value" : provider === "qoder" ? "Personal Access Token (PAT)" : "API Key";
  const credentialPlaceholder = isCookie
    ? (provider === "grok-web" ? "sso=xxxxx... or just the raw value" : "eyJhbGciOi...")
    : (isXaiApiKey ? "xai-..." : provider === "qoder" ? "pt-..." : "");
  const connectionBaseUrl = AI_PROVIDERS?.[provider]?.connectionBaseUrl || null;

  const isAzure = provider === "azure";
  const isCloudflareAi = provider === "cloudflare-ai";
  const providerRegions = AI_PROVIDERS?.[provider]?.regions || null;
  const defaultRegion = AI_PROVIDERS?.[provider]?.defaultRegion || providerRegions?.[0]?.id || "";

  const [formData, setFormData] = useState(createInitialFormData);
  const [azureData, setAzureData] = useState(createInitialAzureData);
  const [cloudflareData, setCloudflareData] = useState({ accountId: "" });
  const [region, setRegion] = useState(defaultRegion);
  const [validating, setValidating] = useState(false);
  const [validationState, setValidationState] = useState(null);
  const validationRequest = useRef(null);
  const bulkRequest = useRef(null);
  const saveGeneration = useRef(0);
  const providerGeneration = useRef(0);
  const [saving, setSaving] = useState(false);
  const bulkPlaceholder = isCloudflareAi
    ? `name1|sk-key1|acc123456\nname2|sk-key2|def789012\nsk-key-only-auto-named`
    : provider === "qoder"
      ? `name1|pt-xxxxx\nname2|pt-yyyyy\npt-only-auto-named`
      : BULK_PLACEHOLDER;

  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null); // { success, failed }

  const [formScope, setFormScope] = useState({ provider, isOpen });
  // A new provider/open boundary is a fresh draft. Adjust local state before
  // rendering its fields, so credentials cannot flash in another account form.
  if (formScope.provider !== provider || formScope.isOpen !== isOpen) {
    setFormScope({ provider, isOpen });
    setFormData(createInitialFormData());
    setAzureData(createInitialAzureData());
    setCloudflareData({ accountId: "" });
    setRegion(defaultRegion);
    setValidationState(null);
    setValidating(false);
    setSaving(false);
    setMode("single");
    setBulkText("");
    setBulkResult(null);
  }

  // Reset state and close
  const handleClose = () => {
    validationRequest.current?.abort();
    bulkRequest.current?.abort();
    saveGeneration.current += 1;
    setSaving(false);
    setValidating(false);
    setFormData(createInitialFormData());
    setAzureData(createInitialAzureData());
    setCloudflareData({ accountId: "" });
    setRegion(defaultRegion);
    setValidationState(null);
    setMode("single");
    setBulkText("");
    setBulkResult(null);
    onClose();
  };

  const buildProviderSpecificData = () => {
    if (isOllamaLocal && formData.ollamaHostUrl.trim()) {
      return { baseUrl: formData.ollamaHostUrl.trim() };
    }
    if (isAzure) {
      return {
        azureEndpoint: azureData.azureEndpoint,
        apiVersion: azureData.apiVersion,
        deployment: azureData.deployment,
        organization: azureData.organization,
      };
    }
    if (isCloudflareAi) {
      return { accountId: cloudflareData.accountId };
    }
    if (providerRegions && region) {
      return { region };
    }
    if (connectionBaseUrl) {
      return withConnectionBaseUrl(undefined, formData.baseUrl);
    }
    return undefined;
  };

  const providerSpecificData = buildProviderSpecificData();
  const validationPayload = buildConnectionValidationPayload({
    provider, apiKey: formData.apiKey, proxyPoolId: formData.proxyPoolId, providerSpecificData,
  });
  const validationKey = JSON.stringify([isOpen, provider, validationPayload]);
  const validationResult = validationState?.key === validationKey ? validationState.result : null;

  useLayoutEffect(() => () => {
    validationRequest.current?.abort();
  }, [validationKey]);
  useLayoutEffect(() => () => {
    providerGeneration.current += 1;
  }, [provider]);
  useLayoutEffect(() => () => {
    validationRequest.current?.abort();
    bulkRequest.current?.abort();
    saveGeneration.current += 1;
  }, [provider, isOpen]);

  const validateCredentials = async () => {
    const controller = new AbortController();
    validationRequest.current?.abort();
    validationRequest.current = controller;
    setValidating(true);
    setValidationState(null);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validationPayload),
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted || validationRequest.current !== controller) return null;
      const valid = res.ok && data.valid === true;
      setValidationState({ key: validationKey, result: valid ? "success" : "failed" });
      return valid;
    } catch {
      if (controller.signal.aborted || validationRequest.current !== controller) return null;
      setValidationState({ key: validationKey, result: "failed" });
      return false;
    } finally {
      if (validationRequest.current === controller) {
        validationRequest.current = null;
        setValidating(false);
      }
    }
  };

  const handleValidate = async () => {
    if (saving) return;
    await validateCredentials();
  };

  const handleSubmit = async () => {
    if (!provider || saving || validating) return;
    if (!isOllamaLocal && (!formData.apiKey || !formData.name)) return;
    if (isCompatible && !formData.defaultModel.trim()) return;
    // Capture the complete payload before yielding; the probe and mutation
    // must never combine fields from different drafts.
    const payload = {
      name: formData.name || (isOllamaLocal ? "Ollama Local" : ""),
      apiKey: formData.apiKey,
      defaultModel: isCompatible ? formData.defaultModel.trim() : undefined,
      priority: formData.priority,
      proxyPoolId: validationPayload.proxyPoolId,
      providerSpecificData,
    };
    const generation = ++saveGeneration.current;
    setSaving(true);
    try {
      const valid = await validateCredentials();
      if (valid === null || saveGeneration.current !== generation) return;
      const saved = await onSave({ ...payload, testStatus: valid ? "active" : "unknown" });
      if (saveGeneration.current === generation && saved) handleClose();
    } finally {
      if (saveGeneration.current === generation) setSaving(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (saving || validating) return;
    const lines = bulkText.split("\n");
    if (!lines.length) return;
    // Plan collision-free names against existing connections so a generated
    // "Key N" never matches a saved name (which the backend would upsert /
    // overwrite instead of inserting). See bulkAdd.js for the full rationale.
    const plan = planBulkAdd(lines, existingNames, { isCloudflareAi });
    if (!plan.length) return;
    const generation = ++saveGeneration.current;
    const controller = new AbortController();
    bulkRequest.current?.abort();
    bulkRequest.current = controller;
    const isCurrent = () => !controller.signal.aborted && saveGeneration.current === generation;
    const initialProviderGeneration = providerGeneration.current;
    setSaving(true);
    setBulkResult(null);
    let success = 0;
    let failed = 0;
    try {
      for (const entry of plan) {
        if (!isCurrent()) return;
        try {
          // Validate each key before saving so bulk-added connections get a
          // real status (active/unknown) like single adds, instead of a
          // hardcoded "unknown" that never flips until a manual test.
          let isValid = false;
          try {
            const vres = await fetch("/api/providers/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildConnectionValidationPayload({
                provider,
                apiKey: entry.apiKey,
                proxyPoolId: formData.proxyPoolId,
                providerSpecificData: entry.providerSpecificData,
              })),
              signal: controller.signal,
            });
            const vdata = await vres.json().catch(() => ({}));
            isValid = vres.ok && vdata.valid === true;
          } catch {
            isValid = false;
          }
          if (!isCurrent()) return;
          const res = await fetch("/api/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              apiKey: entry.apiKey,
              name: entry.name,
              priority: 1,
              proxyPoolId: formData.proxyPoolId === NONE_PROXY_POOL_VALUE ? null : formData.proxyPoolId,
              testStatus: isValid ? "active" : "unknown",
              ...(entry.providerSpecificData ? { providerSpecificData: entry.providerSpecificData } : {}),
            }),
            signal: controller.signal,
          });
          if (res.ok) success++;
          else failed++;
        } catch {
          failed++;
        }
      }
      if (!isCurrent()) return;
      bulkRequest.current = null;
      setSaving(false);
      setBulkResult({ success, failed });
    } finally {
      if (bulkRequest.current === controller) bulkRequest.current = null;
      // Cancel stops future dispatch; it cannot undo an acknowledged mutation.
      // Refresh those partial successes on the same provider, including after
      // closing the dialog, without invoking an old provider's callback.
      if (success > 0 && onBulkDone && providerGeneration.current === initialProviderGeneration) {
        await onBulkDone();
      }
    }
  };

  if (!provider) return null;

  return (
    <Modal isOpen={isOpen} title={`Add ${providerName || provider} ${credentialLabel}`} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        {/* Mode switcher */}
        <div className="flex gap-2">
          <Button size="sm" disabled={saving || validating} variant={mode === "single" ? "primary" : "ghost"} onClick={() => { setMode("single"); setBulkResult(null); }}>Single</Button>
          <Button size="sm" disabled={saving || validating} variant={mode === "bulk" ? "primary" : "ghost"} onClick={() => { setMode("bulk"); setBulkResult(null); }}>Bulk Add</Button>
        </div>

        {mode === "bulk" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              {isCloudflareAi
                ? <>One key per line. Format: <code>name|apiKey|accountId</code> or just <code>apiKey</code> (auto-named by index).</>
                : provider === "qoder"
                  ? <>One PAT per line. Format: <code>name|pt-...</code> or just <code>pt-...</code> (auto-named by index).</>
                  : <>One key per line. Format: <code>name|apiKey</code> or just <code>apiKey</code> (auto-named by index).</>
              }
            </p>
            <textarea
              disabled={saving}
              className="w-full rounded border border-accent/30 bg-sidebar p-2 text-sm font-mono resize-y min-h-[140px] focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={bulkPlaceholder}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkResult && (
              <div className={`text-sm font-medium ${bulkResult.failed > 0 ? "text-yellow-400" : "text-green-400"}`}>
                ✓ {bulkResult.success} added{bulkResult.failed > 0 ? `, ✗ ${bulkResult.failed} failed` : ""}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleBulkSubmit} fullWidth disabled={saving || validating || !bulkText.trim()}>
                {saving ? "Adding..." : "Add All Keys"}
              </Button>
              <Button onClick={handleClose} variant="ghost" fullWidth>Cancel</Button>
            </div>
          </div>
        )}

        {mode === "single" && (<>
        <Input
          disabled={saving}
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isOllamaLocal ? "Ollama Local" : "Production Key"}
        />
        {connectionBaseUrl && (
          <Input
            disabled={saving}
            label={connectionBaseUrl.label || "Base URL"}
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder={connectionBaseUrl.placeholder || ""}
            hint={connectionBaseUrl.hint}
          />
        )}
        {isOllamaLocal && (
          <div className="flex gap-2">
            <Input
              disabled={saving}
              label="Ollama Host URL"
              value={formData.ollamaHostUrl}
              onChange={(e) => setFormData({ ...formData, ollamaHostUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="flex-1"
            />
            <div className="pt-6">
              <Button onClick={handleValidate} disabled={validating || saving} variant="secondary">
                {validating ? "Checking..." : "Check"}
              </Button>
            </div>
          </div>
        )}
        {!isOllamaLocal && (
          <div className="flex gap-2">
            <Input
              disabled={saving}
              label={credentialLabel}
              type={isCookie ? "text" : "password"}
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={credentialPlaceholder}
              className="flex-1"
            />
            <div className="pt-6">
              <Button onClick={handleValidate} disabled={!formData.apiKey || validating || saving} variant="secondary">
                {validating ? "Checking..." : "Check"}
              </Button>
            </div>
          </div>
        )}
        {isXaiApiKey && (
          <p className="text-xs text-text-muted">
            Use a direct xAI API key from console.x.ai. This is separate from Grok Build OAuth.
          </p>
        )}
        {isCookie && authHint && (
          <p className="text-xs text-text-muted">
            {authHint}
            {website && (
              <>
                {" "}
                <a href={website} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Open {website.replace(/^https?:\/\//, "")}
                </a>
              </>
            )}
          </p>
        )}
        {providerRegions && (
          <Select
            disabled={saving}
            label="Region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            options={providerRegions.map((r) => ({ value: r.id, label: r.label }))}
          />
        )}
        {isCompatible && (
          <Input
            disabled={saving}
            label="Default Model"
            value={formData.defaultModel}
            onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
            placeholder={isAnthropic ? "claude-3-5-sonnet-latest" : "gpt-4o-mini"}
          />
        )}
        {isOllamaLocal && (
          <p className="text-xs text-text-muted">
            Leave blank to use <code>http://localhost:11434</code>. For remote Ollama, enter the full host URL (e.g. <code>http://192.168.1.10:11434</code>).
          </p>
        )}
        {validationResult && (
          <Badge variant={validationResult === "success" ? "success" : "error"}>
            {validationResult === "success" ? "Valid" : "Invalid"}
          </Badge>
        )}
        {error && (
          <p className="text-xs text-red-500 break-words">{error}</p>
        )}
        {isCompatible && (
          <p className="text-xs text-text-muted">
            Enter the model ID exactly as your compatible endpoint expects it. This model will be saved as the connection default.
          </p>
        )}
        {isCloudflareAi && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">Cloudflare Workers AI</h3>
            <Input
              disabled={saving}
              label="Account ID"
              value={cloudflareData.accountId}
              onChange={(e) => setCloudflareData({ ...cloudflareData, accountId: e.target.value })}
              placeholder="abc123def456..."
            />
            <p className="text-xs text-text-muted mt-2">
              Find your Account ID in the right sidebar of <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">dash.cloudflare.com</a>
            </p>
          </div>
        )}
        {isAzure && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">Azure OpenAI Configuration</h3>
            <div className="flex flex-col gap-3">
              <Input
                disabled={saving}
                label="Azure Endpoint"
                value={azureData.azureEndpoint}
                onChange={(e) => setAzureData({ ...azureData, azureEndpoint: e.target.value })}
                placeholder="https://your-resource.openai.azure.com"
              />
              <Input
                disabled={saving}
                label="Deployment Name"
                value={azureData.deployment}
                onChange={(e) => setAzureData({ ...azureData, deployment: e.target.value })}
                placeholder="gpt-4"
              />
              <Input
                disabled={saving}
                label="API Version"
                value={azureData.apiVersion}
                onChange={(e) => setAzureData({ ...azureData, apiVersion: e.target.value })}
                placeholder="2024-10-01-preview"
              />
              <Input
                disabled={saving}
                label="Organization"
                value={azureData.organization}
                onChange={(e) => setAzureData({ ...azureData, organization: e.target.value })}
                placeholder="Organization ID"
              />
            </div>
          </div>
        )}

        <Input

          disabled={saving}
          label="Priority"
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })}
        />

        <Select

          disabled={saving}
          label="Proxy Pool"
          value={formData.proxyPoolId}
          onChange={(e) => setFormData({ ...formData, proxyPoolId: e.target.value })}
          options={[
            { value: NONE_PROXY_POOL_VALUE, label: "None" },
            ...(proxyPools || []).map((pool) => ({ value: pool.id, label: pool.name })),
          ]}
          placeholder="None"
        />

        {(proxyPools || []).length === 0 && (
          <p className="text-xs text-text-muted">
            No active proxy pools available. Create one in Proxy Pools page first.
          </p>
        )}

        <p className="text-xs text-text-muted">
          Legacy manual proxy fields are still accepted by API for backward compatibility.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={saving || validating || (!isOllamaLocal && (!formData.name || !formData.apiKey)) || (isCompatible && !formData.defaultModel.trim()) || (isAzure && (!azureData.azureEndpoint || !azureData.deployment || !azureData.organization)) || (isCloudflareAi && !cloudflareData.accountId)}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
        </>)}
      </div>
    </Modal>
  );
}

AddApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string,
  providerName: PropTypes.string,
  isCompatible: PropTypes.bool,
  isAnthropic: PropTypes.bool,
  authType: PropTypes.string,
  authHint: PropTypes.string,
  website: PropTypes.string,
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
  })),
  error: PropTypes.string,
  existingNames: PropTypes.arrayOf(PropTypes.string),
  onSave: PropTypes.func.isRequired,
  onBulkDone: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
