import PropTypes from "prop-types";
import { CapacityBadges } from "@/shared/components";

export default function ModelRow({ model, fullModel, alias, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onTest, isTesting, onDisable, caps, thinkingSuffix, onEditCaps, serviceTierWarning, testDisabledReason }) {
  const displayModel = thinkingSuffix ? `${fullModel}(${thinkingSuffix})` : fullModel;
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`provider-model-row group min-w-0 rounded-lg border ${borderColor}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[19px] text-text-muted" style={iconColor ? { color: iconColor } : undefined}>
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="min-w-0 flex-1">
          <code className="block break-all font-mono text-xs leading-5 text-text-main">{displayModel}</code>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {model.name && <span className="break-words text-[11px] text-text-muted">{model.name}</span>}
            <CapacityBadges caps={caps} colorOverride="text-text-muted/70" size={12} />
          </div>
        </div>
      </div>
      <div className="provider-model-actions">
        {onEditCaps && <button type="button" onClick={onEditCaps} title="Configure capabilities" aria-label="Configure capabilities">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">tune</span>
          <span className="sr-only">Capabilities</span>
        </button>}
        {onTest && <button type="button" onClick={onTest} aria-label={`Test ${displayModel}`} title={testDisabledReason || "Test model with the selected settings"} disabled={isTesting || !!testDisabledReason}>
          <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${isTesting ? "animate-spin" : ""}`}>{isTesting ? "progress_activity" : "science"}</span>
          {isTesting ? "Testing..." : "Test"}
        </button>}
        <button type="button" onClick={() => onCopy(displayModel, `model-${model.id}`)} aria-label={`Copy ${displayModel}`}>
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{copied === `model-${model.id}` ? "check" : "content_copy"}</span>
          {copied === `model-${model.id}` ? "Copied!" : "Copy"}
        </button>
        {(isCustom || onDisable) && <button type="button" onClick={isCustom ? onDeleteAlias : onDisable} className="hover:!bg-red-500/10 hover:!text-red-500" title={isCustom ? "Remove custom model" : "Disable this model"} aria-label={isCustom ? "Remove custom model" : "Disable this model"}>
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
        </button>}
      </div>
      {serviceTierWarning && <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">{serviceTierWarning}</p>}
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
  onEditCaps: PropTypes.func,
  serviceTierWarning: PropTypes.string,
  testDisabledReason: PropTypes.string,
};
