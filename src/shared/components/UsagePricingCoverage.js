"use client";

import Link from "next/link";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";

export default function UsagePricingCoverage({ stats }) {
  const count = stats.costCoverage?.totalCost?.unknownRequests;
  const hasCount = Number.isSafeInteger(count) && count > 0;
  const incomplete = hasCount || !Number.isFinite(stats.totalCost) || stats.totalCost < 0;
  if (!(stats.totalRequests > 0) || !incomplete) return null;

  return (
    <aside aria-label="Recorded price coverage" className="flex flex-col gap-3 rounded-2xl border border-warning/20 bg-warning/5 p-4 sm:flex-row sm:items-start sm:gap-4">
      <span aria-hidden="true" className="material-symbols-outlined hidden rounded-xl bg-warning/10 p-2 text-[18px] text-warning sm:block">price_check</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-text-main">Some requests have no recorded price</h3>
          {hasCount && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">{translate("{count} unpriced", { count })}</span>}
        </div>
        <p className="mt-1 text-xs leading-5 text-text-muted">Known subtotals exclude unpriced requests. Review rates for new requests; saved history keeps its original estimate.</p>
        <details className="mt-2 text-xs leading-5 text-text-muted">
          <summary className="w-fit cursor-pointer rounded text-text-main focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Why can prices be missing?</summary>
          <p className="mt-2 max-w-3xl">Missing token rates, subscription or media billing, and unconfirmed service tiers can leave requests unpriced. A recorded $0.00 can mean no charge or no tokens used for that component.</p>
        </details>
      </div>
      <Link href="/dashboard/settings/pricing" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-border-subtle bg-surface px-3 text-xs font-semibold text-text-main transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        Review pricing<span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </Link>
    </aside>
  );
}

UsagePricingCoverage.propTypes = {
  stats: PropTypes.shape({
    totalRequests: PropTypes.number,
    totalCost: PropTypes.number,
    costCoverage: PropTypes.shape({ totalCost: PropTypes.shape({ unknownRequests: PropTypes.number }) }),
  }).isRequired,
};
