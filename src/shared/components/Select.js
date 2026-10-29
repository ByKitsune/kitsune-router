"use client";

import { useId } from "react";
import { cn } from "@/shared/utils/cn";

export default function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  error,
  hint,
  disabled = false,
  required = false,
  className,
  selectClassName,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...props
}) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const descriptionId = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {label && (
        <label htmlFor={selectId} className="text-[13px] font-semibold leading-5 text-text-main">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      <div className="relative min-w-0">
        <select
          id={selectId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : invalid}
          aria-describedby={[describedBy, descriptionId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "min-h-11 w-full min-w-0 appearance-none rounded-xl bg-surface px-3.5 py-2.5 pr-10 text-text-main shadow-sm",
            "border border-border hover:border-text-subtle/50",
            "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40",
            "transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
            "text-[16px] sm:text-sm",
            error && "ring-1 ring-red-500 focus:ring-2 focus:ring-red-500/40 border-red-500/40",
            selectClassName
          )}
          {...props}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">expand_more</span>
        </div>
      </div>
      {error && (
        <p id={`${selectId}-error`} role="alert" className="flex items-center gap-1 text-xs leading-5 text-red-500">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
      {hint && !error && <p id={`${selectId}-hint`} className="text-xs leading-5 text-text-muted">{hint}</p>}
    </div>
  );
}
