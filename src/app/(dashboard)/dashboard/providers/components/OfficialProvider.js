import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/shared/constants/config";

export default function OfficialProvider() {
  return (
    <section
      id="official-provider"
      aria-labelledby="official-provider-heading"
      className="relative flex min-w-0 scroll-mt-6 flex-col gap-6 overflow-hidden rounded-[24px] border border-primary/30 bg-primary/5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-[#fffefa] p-3">
          <Image src="/brand/bykitsune-favicon-512.png" alt="" width={72} height={72} />
        </div>
        <div className="min-w-0">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">verified</span>
            Official provider
          </span>
          <h2 id="official-provider-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">{BRAND.organization}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">
            The official provider from the team behind {BRAND.name}. Explore ByKitsune&apos;s AI services and ecosystem.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-start lg:items-center">
        <Link
          href="/dashboard/providers/bykitsune"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          Connect {BRAND.organization}
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </Link>
        <a
          href={BRAND.sponsorUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${BRAND.organization} website (opens in a new tab)`}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-text-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Visit website
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">arrow_outward</span>
        </a>
      </div>
    </section>
  );
}
