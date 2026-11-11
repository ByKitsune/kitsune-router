import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";
import "../usage/usage.css";

export default function QuotaPage() {
  return (
    <div className="quota-workspace w-full min-w-0 space-y-6">
      <div className="page-heading">
        <div className="min-w-0">
          <h2 className="page-title">Capacity & limits</h2>
          <p className="page-description">Monitor connected provider capacity and available quotas before your next request.</p>
        </div>
      </div>
      <Suspense fallback={<CardSkeleton />}>
        <ProviderLimits />
      </Suspense>
    </div>
  );
}
