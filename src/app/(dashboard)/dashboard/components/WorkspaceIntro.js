"use client";

/** Shared page heading, optional real counts and section navigation. */
export default function WorkspaceIntro({ eyebrow, title, description, icon, action, metrics = [], links = [] }) {
  return <section className="workspace-intro min-w-0">
    <div className="page-heading">
      <div>
        {eyebrow && <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-text-muted">
          {icon && <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">{icon}</span>}{eyebrow}
        </p>}
        <h2 className="page-title">{title}</h2>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
    {metrics.length > 0 && <dl className="metric-strip mb-5">{metrics.map(({ label, value, icon: metricIcon }) => <div key={label}>
      <dt className="flex items-center gap-2">{metricIcon && <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{metricIcon}</span>}{label}</dt><dd>{value}</dd>
    </div>)}</dl>}
    {links.length > 0 && <nav aria-label={`${eyebrow} sections`} className="mb-5 flex flex-wrap gap-2 border-b border-border-subtle pb-4">{links.map(({ href, label }) => <a key={href} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main">
      {label}<span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_downward</span>
    </a>)}</nav>}
  </section>;
}
