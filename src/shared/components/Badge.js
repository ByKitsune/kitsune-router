"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "border-border bg-surface-2 text-text-muted",
  primary: "border-brand-500/15 bg-brand-500/10 text-brand-600 dark:text-brand-300",
  success: "border-green-500/15 bg-green-500/10 text-green-600 dark:text-green-400",
  warning: "border-yellow-500/15 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  error: "border-red-500/15 bg-red-500/10 text-red-600 dark:text-red-400",
  info: "border-blue-500/15 bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border font-medium leading-4 tracking-[0.01em]",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            variant === "success" && "bg-green-500",
            variant === "warning" && "bg-yellow-500",
            variant === "error" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-gray-500"
          )}
        />
      )}
      {icon && <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
