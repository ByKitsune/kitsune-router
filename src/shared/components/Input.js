"use client";

import { useId } from "react";
import { cn } from "@/shared/utils/cn";

export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  className,
  inputClassName,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const descriptionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold leading-5 text-text-main">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative min-w-0">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
          </div>
        )}
        <input
          id={inputId}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : invalid}
          aria-describedby={[describedBy, descriptionId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "min-h-11 w-full min-w-0 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-text-main shadow-sm",
            "border border-border placeholder:text-text-subtle hover:border-text-subtle/50",
            "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40",
            "transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
            // iOS zoom fix
            "text-[16px] sm:text-sm",
            icon && "pl-10",
            error && "ring-1 ring-red-500 focus:ring-2 focus:ring-red-500/40 border-red-500/40",
            inputClassName
          )}
          {...props}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-red-500 flex items-center gap-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs leading-5 text-text-muted">{hint}</p>
      )}
    </div>
  );
}
