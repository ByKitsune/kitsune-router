import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";

export default function QuotaPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px]">
      <div className="mb-7 flex min-w-0 flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Capacity & limits</p>
        <h2 className="text-2xl font-semibold tracking-[-0.045em] text-text-main sm:text-3xl">Stay ahead of your limits</h2>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">Monitor connected provider capacity and available quotas before your next request.</p>
      </div>
      <Suspense fallback={<CardSkeleton />}>
      <ProviderLimits />
    </Suspense>
    </div>
  );
}
