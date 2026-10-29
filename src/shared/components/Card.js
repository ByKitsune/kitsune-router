"use client";

import { cn } from "@/shared/utils/cn";

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  className,
  ...props
}) {
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-4 sm:p-6",
    lg: "p-5 sm:p-8",
  };

  return (
    <div
      className={cn(
        "min-w-0 bg-surface border border-border-subtle",
        elev ? "rounded-[22px] shadow-[var(--shadow-elev)]" : "rounded-[22px] shadow-[var(--shadow-soft)]",
        "transition-[border-color,box-shadow] duration-300 motion-reduce:transition-none",
        hover && "hover:shadow-[var(--shadow-warm)] hover:border-brand-500/30 cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || subtitle || action) && (
        <div className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-40 items-start gap-3">
            {icon && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-2 text-primary">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="font-semibold leading-6 tracking-[-0.025em] text-text-main break-words">{title}</h3>
              )}
              {subtitle && (
                <p className="mt-1 text-sm leading-6 text-text-muted break-words">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "min-w-0 p-4 rounded-2xl",
        "bg-bg border border-border-subtle",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl p-3 -mx-3 px-3 transition-colors duration-200 motion-reduce:transition-none",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-surface-2/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        "group flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl p-3 -mx-3 px-3",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-surface-2/50 transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
};
