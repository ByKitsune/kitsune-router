"use client";

import { CAPACITY_META } from "@/shared/constants/models";
import Tooltip from "./Tooltip";

// Render small icon badges for a model's capabilities (only those set true).
// colorOverride: force a single color class for all badges (default: per-cap color).
// size: icon font-size in px (default 16).
export default function CapacityBadges({ caps, className = "", colorOverride, size = 16 }) {
  if (!caps) return null;
  const active = Object.keys(CAPACITY_META).filter((k) => caps[k]);
  if (active.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {active.map((k) => {
        const kind = caps.capabilityVerification?.[k]?.kind;
        const inferred = kind === "inferred";
        const label = kind === "operator-declared" ? "Operator-declared capability" : inferred ? "Inferred capability" : "Provider model reference";
        return <Tooltip key={k} text={<><span>{CAPACITY_META[k].label}</span>{" — "}<span>{CAPACITY_META[k].desc}</span>{kind && <span className="mt-1 block border-t border-white/15 pt-1 text-[10px]">{label}</span>}</>}>
          <span
            role="img"
            aria-label={CAPACITY_META[k].label}
            data-capability-confidence={caps.capabilityVerification?.[k]?.kind}
            className={`inline-flex leading-none cursor-help ${inferred ? "opacity-60" : ""} ${colorOverride || CAPACITY_META[k].color}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: `${size}px` }}>{CAPACITY_META[k].icon}</span>
          </span>
        </Tooltip>;
      })}
    </span>
  );
}
