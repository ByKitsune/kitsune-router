"use client";

/** Shared page composition, with real optional counts supplied by each page. */
export default function WorkspaceIntro({ eyebrow, title, description, icon, action, metrics = [], links = [] }) {
  return (
    <section
      className="workspace-enter relative min-w-0 overflow-hidden rounded-[24px] border border-border-subtle bg-surface p-5 shadow-soft sm:p-7"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-primary/[0.045]" />
      <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[11px]">
            {icon && <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{icon}</span>}
            {eyebrow}
          </p>
          <h2 className="text-[25px] font-semibold leading-tight tracking-[-0.045em] text-text-main sm:text-[32px]">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">{description}</p>
        </div>
        {action && <div className="shrink-0 self-start [&>button]:min-h-11">{action}</div>}
      </div>
      {metrics.length > 0 && (
        <dl className="relative mt-6 grid grid-cols-1 gap-3 border-t border-border-subtle pt-5 min-[420px]:grid-cols-3">
          {metrics.map(({ label, value, icon: metricIcon }) => (
            <div key={label} className="flex min-w-0 items-center gap-3 rounded-2xl bg-bg-alt/70 px-4 py-3">
              {metricIcon && <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[19px] text-primary">{metricIcon}</span>}
              <div className="min-w-0">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="mt-0.5 break-words text-lg font-semibold tracking-tight text-text-main tabular-nums">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
      {links.length > 0 && (
        <nav aria-label={`${eyebrow} sections`} className="relative mt-5 flex flex-wrap gap-2">
          {links.map(({ href, label }) => (
            <a key={href} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-subtle px-3.5 py-2 text-xs font-medium text-text-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
              {label}<span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_downward</span>
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
