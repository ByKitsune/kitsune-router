import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import RuntimeI18nBoundary from "@/i18n/RuntimeI18nBoundary";
import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";
import "../usage/usage.css";

function QuotaPage() {
  return (
    <div className="quota-workspace w-full min-w-0 space-y-6">
      <div className="page-heading">
        <div className="min-w-0">
          <h2 className="page-title">Capacity & limits</h2>
          <p className="page-description">Monitor connected provider capacity and available quotas before your next request.</p>
        </div>
      </div>
      <Suspense fallback={<CardSkeleton />}>
        <RuntimeI18nBoundary><ProviderLimits /></RuntimeI18nBoundary>
      </Suspense>
    </div>
  );
}

export default withRuntimeI18nPage(QuotaPage);
