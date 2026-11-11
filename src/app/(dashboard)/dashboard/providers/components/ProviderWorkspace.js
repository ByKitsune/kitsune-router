import Link from "next/link";
import "../provider-workspace.css";

/** Page composition shared by the provider library and its native detail routes. */
export function ProviderPageHeader({ title, description, eyebrow, icon = "deployed_code", back, actions, metrics = [] }) {
  return (
    <header className="provider-page-heading">
      {back && (
        <Link href={back.href} className="provider-back-link">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
          {back.label}
        </Link>
      )}
      <div className="provider-page-heading-main">
        <div className="min-w-0">
          {eyebrow && <p className="provider-eyebrow"><span aria-hidden="true" className="material-symbols-outlined text-[16px]">{icon}</span>{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="provider-page-description">{description}</p>}
        </div>
        {actions && <div className="provider-page-actions">{actions}</div>}
      </div>
      {metrics.length > 0 && <dl className="provider-page-metrics">
        {metrics.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>}
    </header>
  );
}

export function ProviderLoadingState({ detail = false }) {
  return (
    <div className="provider-workspace provider-loading" role="status" aria-label="Loading..." aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div aria-hidden="true" className="provider-loading-heading"><i /><i /></div>
      <div aria-hidden="true" className={detail ? "provider-loading-detail" : "provider-card-grid"}>
        {Array.from({ length: detail ? 2 : 6 }, (_, index) => <div key={index} className="provider-loading-card"><i /><i /><i /></div>)}
      </div>
    </div>
  );
}
