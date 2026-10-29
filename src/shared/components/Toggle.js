"use client";

import { useId } from "react";
import { cn } from "@/shared/utils/cn";

export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
}) {
  const labelId = useId();
  const descriptionId = useId();
  const sizes = {
    sm: { track: "h-5 w-9", thumb: "size-4", translate: "translate-x-4" },
    md: { track: "h-6 w-11", thumb: "size-5", translate: "translate-x-5" },
    lg: { track: "h-7 w-13", thumb: "size-6", translate: "translate-x-6" },
  };
  const dimensions = sizes[size] || sizes.md;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", disabled && "cursor-not-allowed opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy || (label && !ariaLabel ? labelId : undefined)}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => { if (!disabled && onChange) onChange(!checked); }}
        className="group relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex items-center rounded-full p-0.5 ring-1 ring-inset ring-black/5 transition-colors duration-300 motion-reduce:transition-none",
            checked ? "bg-primary" : "bg-surface-3 group-hover:bg-border",
            dimensions.track
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              checked ? dimensions.translate : "translate-x-0",
              dimensions.thumb
            )}
          />
        </span>
      </button>
      {(label || description) && (
        <div className="flex min-w-0 flex-col gap-0.5">
          {label && <span id={labelId} className="text-sm font-semibold leading-5 text-text-main">{label}</span>}
          {description && <span id={descriptionId} className="text-xs leading-5 text-text-muted">{description}</span>}
        </div>
      )}
    </div>
  );
}
