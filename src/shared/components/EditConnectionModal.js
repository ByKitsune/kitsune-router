"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import Modal from "@/shared/components/Modal";
import Input from "@/shared/components/Input";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";
import Select from "@/shared/components/Select";
import { withConnectionBaseUrl } from "@/shared/utils/connectionBaseUrl";
import { buildConnectionValidationPayload } from "@/shared/utils/connectionValidation";

export default function EditConnectionModal({ isOpen, connection, proxyPools, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    priority: 1,
    apiKey: "",
  });
  const [azureData, setAzureData] = useState({
    azureEndpoint: "",
    apiVersion: "2024-10-01-preview",
    deployment: "",
    organization: "",
  });
  const [cloudflareData, setCloudflareData] = useState({ accountId: "" });
  const [baseUrl, setBaseUrl] = useState("");
  const [region, setRegion] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationState, setValidationState] = useState(null);
  const validationRequest = useRef(null);
  const testRequest = useRef(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !connection) return undefined;
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setFormData({
          name: connection.name || "",
          priority: connection.priority || 1,
          apiKey: "",
        });
      }
      // Load Azure-specific data if present
      if (connection.provider === "azure") {
        if (!cancelled) {
          setAzureData({
            azureEndpoint: connection.providerSpecificData?.azureEndpoint || "",
            apiVersion: connection.providerSpecificData?.apiVersion || "2024-10-01-preview",
            deployment: connection.providerSpecificData?.deployment || "",
            organization: connection.providerSpecificData?.organization || "",
          });
        }
      }
      if (connection.provider === "cloudflare-ai") {
        if (!cancelled) setCloudflareData({ accountId: connection.providerSpecificData?.accountId || "" });
      }
      if (!cancelled) setBaseUrl(connection.providerSpecificData?.baseUrl || "");
      // Load region for providers that support it (e.g. xiaomi-tokenplan)
      const providerCfg = AI_PROVIDERS?.[connection.provider];
      if (providerCfg?.regions) {
        const savedRegion = connection.providerSpecificData?.region || providerCfg.defaultRegion || providerCfg.regions[0]?.id || "";
        if (!cancelled) setRegion(savedRegion);
      }
      if (!cancelled) setTestResult(null);
      if (!cancelled) setValidationState(null);
    })();
    return () => { cancelled = true; };
  }, [connection, isOpen]);

  const isOAuth = connection?.authType === "oauth";
  const isAzure = connection?.provider === "azure";
  const isCloudflareAi = connection?.provider === "cloudflare-ai";
  const isCompatible = connection
    ? (isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider))
    : false;
  const providerRegions = connection ? (AI_PROVIDERS?.[connection.provider]?.regions || null) : null;
  const connectionBaseUrl = connection ? (AI_PROVIDERS?.[connection.provider]?.connectionBaseUrl || null) : null;

  // Preserve existing connection settings (including legacy proxy policy) while
  // applying exactly the same edited provider data to Check and Save.
  const buildProviderSpecificData = () => {
    let data = { ...(connection?.providerSpecificData || {}) };
    if (isAzure) data = { ...data, ...azureData };
    if (isCloudflareAi) data = { ...data, ...cloudflareData };
    if (providerRegions && region) data.region = region;
    if (connectionBaseUrl) return withConnectionBaseUrl(data, baseUrl);
    return Object.keys(data).length > 0 ? data : undefined;
  };
  const providerSpecificData = buildProviderSpecificData();
  const validationPayload = buildConnectionValidationPayload({
    provider: connection?.provider,
    apiKey: formData.apiKey,
    proxyPoolId: connection?.proxyPoolId,
    providerSpecificData,
  });
  const validationKey = JSON.stringify([isOpen, connection?.id, validationPayload]);
  const validationResult = validationState?.key === validationKey ? validationState.result : null;
  const currentTestResult = testResult?.key === validationKey ? testResult.result : null;
  const savedRegion = connection?.providerSpecificData?.region
    || AI_PROVIDERS?.[connection?.provider]?.defaultRegion || providerRegions?.[0]?.id || "";
  // The stored-connection endpoint cannot test an unsaved replacement key or
  // endpoint. Save those edits before testing the stored connection again.
  const hasCredentialEdits = Boolean(formData.apiKey
    || (connectionBaseUrl && baseUrl.trim() !== (connection?.providerSpecificData?.baseUrl || "").trim())
    || (providerRegions && region !== savedRegion));

  useEffect(() => () => {
    // Fetch implementations may still resolve after abort. The signal and
    // request identity also fence the eventual completion below.
    validationRequest.current?.abort();
    testRequest.current?.abort();
  }, [validationKey]);

  const handleClose = () => {
    validationRequest.current?.abort();
    testRequest.current?.abort();
    onClose();
  };

  const handleTest = async () => {
    if (!connection?.provider || saving || validating || hasCredentialEdits) return;
    const controller = new AbortController();
    testRequest.current?.abort();
    testRequest.current = controller;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST", signal: controller.signal });
      const data = await res.json();
      if (!controller.signal.aborted && testRequest.current === controller) {
        setTestResult({ key: validationKey, result: res.ok && data.valid ? "success" : "failed" });
      }
    } catch {
      if (!controller.signal.aborted && testRequest.current === controller) {
        setTestResult({ key: validationKey, result: "failed" });
      }
    } finally {
      if (testRequest.current === controller) {
        testRequest.current = null;
        setTesting(false);
      }
    }
  };

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
    if (!connection?.provider || !formData.apiKey) return;
    await validateCredentials();
  };

  const handleSubmit = async () => {
    if (!connection || saving || validating) return;
    setSaving(true);
    try {
      const updates = {
        name: formData.name,
        priority: formData.priority,
      };
      if (isAzure || isCloudflareAi || providerRegions || connectionBaseUrl) {
        updates.providerSpecificData = providerSpecificData;
        if (JSON.stringify(providerSpecificData || {}) !== JSON.stringify(connection.providerSpecificData || {})) {
          // A redacted existing key cannot verify changed endpoint/region data
          // here. Keep its previous error until a real check succeeds.
          updates.testStatus = "unknown";
        }
      }
      if (!isOAuth && formData.apiKey) {
        updates.apiKey = formData.apiKey;
        const isValid = validationResult === "success" ? true : await validateCredentials();
        // Closing the dialog or changing its connection cancels this Save too.
        if (isValid === null) return;
        updates.testStatus = isValid ? "active" : "unknown";
        if (isValid) {
          updates.lastError = null;
          updates.lastErrorAt = null;
        }
      }
      await onSave(updates);
    } finally {
      setSaving(false);
    }
  };

  if (!connection) return null;

  return (
    <Modal isOpen={isOpen} title="Edit Connection" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          disabled={saving}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isOAuth ? "Account name" : "Production Key"}
        />
        {isOAuth && connection.email && (
          <div className="bg-sidebar/50 p-3 rounded-lg">
            <p className="text-sm text-text-muted mb-1">Email</p>
            <p className="font-medium">{connection.email}</p>
          </div>
        )}
        <Input
          label="Priority"
          disabled={saving}
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 1 })}
        />
        {connectionBaseUrl && (
          <Input
            label={connectionBaseUrl.label || "Base URL"}
            disabled={saving}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={connectionBaseUrl.placeholder || ""}
            hint={connectionBaseUrl.hint}
          />
        )}

        {!isOAuth && (
          <>
            <div className="flex gap-2">
              <Input
                label="API Key"
                disabled={saving}
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Enter new API key"
                hint="Leave blank to keep the current API key."
                className="flex-1"
              />
              <div className="pt-6">
                <Button onClick={handleValidate} disabled={!formData.apiKey || validating || saving} variant="secondary">
                  {validating ? "Checking..." : "Check"}
                </Button>
              </div>
            </div>
            {validationResult && (
              <Badge variant={validationResult === "success" ? "success" : "error"}>
                {validationResult === "success" ? "Valid" : "Invalid"}
              </Badge>
            )}
          </>
        )}

        {isAzure && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">Azure OpenAI Configuration</h3>
            <div className="flex flex-col gap-3">
              <Input
                label="Azure Endpoint"
                disabled={saving}
                value={azureData.azureEndpoint}
                onChange={(e) => setAzureData({ ...azureData, azureEndpoint: e.target.value })}
                placeholder="https://your-resource.openai.azure.com"
                hint="Your Azure OpenAI resource endpoint URL"
              />
              <Input
                label="Deployment Name"
                disabled={saving}
                value={azureData.deployment}
                onChange={(e) => setAzureData({ ...azureData, deployment: e.target.value })}
                placeholder="gpt-4"
                hint="The deployment name in your Azure resource"
              />
              <Input
                label="API Version"
                disabled={saving}
                value={azureData.apiVersion}
                onChange={(e) => setAzureData({ ...azureData, apiVersion: e.target.value })}
                placeholder="2024-10-01-preview"
                hint="Azure OpenAI API version to use"
              />
              <Input
                label="Organization"
                disabled={saving}
                value={azureData.organization}
                onChange={(e) => setAzureData({ ...azureData, organization: e.target.value })}
                placeholder="Organization ID"
                hint="Required for billing"
              />
            </div>
          </div>
        )}

        {providerRegions && (
          <Select
            label="Region"
            disabled={saving}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            options={providerRegions.map((r) => ({ value: r.id, label: r.label }))}
          />
        )}

        {!isCompatible && !isAzure && !isCloudflareAi && (
          <div className="flex items-center gap-3">
            <Button onClick={handleTest} variant="secondary" disabled={testing || saving || validating || hasCredentialEdits}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            {currentTestResult && (
              <Badge variant={currentTestResult === "success" ? "success" : "error"}>
                {currentTestResult === "success" ? "Valid" : "Failed"}
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={saving || validating}>{saving ? "Saving..." : "Save"}</Button>
          <Button onClick={handleClose} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

EditConnectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    priority: PropTypes.number,
    authType: PropTypes.string,
    provider: PropTypes.string,
    proxyPoolId: PropTypes.string,
    providerSpecificData: PropTypes.object,
  }),
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
  })),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

