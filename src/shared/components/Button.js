"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-primary hover:bg-primary-hover text-[var(--color-on-primary)] shadow-[0_3px_8px_-3px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "bg-surface hover:bg-surface-2 text-text-main border border-border shadow-sm disabled:opacity-50",
  outline: "border border-border text-text-main hover:bg-surface-2 hover:border-brand-500/40",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text-main",
  danger: "bg-red-500 hover:bg-red-600 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
  success: "bg-green-600 hover:bg-green-700 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  sm: "min-h-11 px-3.5 text-xs rounded-xl sm:min-h-8",
  md: "min-h-11 px-4 text-sm rounded-xl sm:min-h-10",
  lg: "min-h-12 px-5 text-sm rounded-2xl sm:px-6",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex max-w-full shrink-0 items-center justify-center gap-2 font-semibold leading-5 tracking-[-0.01em] cursor-pointer",
        "transition-[background-color,border-color,box-shadow,transform,color] duration-200 ease-out motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "active:scale-[0.97] motion-reduce:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      ) : icon ? (
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{iconRight}</span>
      )}
    </button>
  );
}
