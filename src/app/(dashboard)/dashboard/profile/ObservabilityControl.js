"use client";

import PropTypes from "prop-types";
import { Toggle } from "@/shared/components";

export default function ObservabilityControl({ settings, loading, error, onChange }) {
  const saved = settings.enableObservability === true;
  const enabled = typeof settings.observabilityEnabled === "boolean" ? settings.observabilityEnabled : saved;
  const source = ["OBSERVABILITY_ENABLED", "ENABLE_REQUEST_LOGS"].includes(settings.observabilitySource)
    ? settings.observabilitySource : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p id="observability-control-heading" className="font-medium text-sm sm:text-base">Enable Observability</p>
          <p className="text-xs sm:text-sm text-text-muted">
            Record request details in Usage → Details. This switch shows whether recording is currently enabled.
          </p>
        </div>
        <Toggle
          checked={enabled}
          onChange={onChange}
          disabled={loading || !!source}
          aria-labelledby="observability-control-heading"
        />
      </div>
      {source && (
        <div role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-xs leading-5 text-text-muted">
          <p>Managed by environment variable <code className="font-mono">{source}</code>.</p>
          <p>Change the server environment to use the saved dashboard preference.</p>
          <p>Saved dashboard preference: {saved ? "Enabled" : "Disabled"}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

ObservabilityControl.propTypes = {
  settings: PropTypes.object.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};
