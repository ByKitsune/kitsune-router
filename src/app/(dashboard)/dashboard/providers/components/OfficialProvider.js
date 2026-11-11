import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/shared/constants/config";

export default function OfficialProvider() {
  return (
    <section id="official-provider" aria-labelledby="official-provider-heading" className="provider-official">
      <div className="provider-official-logo flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-[#fffefa] p-1.5">
        <Image src="/brand/bykitsune-favicon-512.png" alt="" width={36} height={36} />
      </div>
      <div className="provider-official-copy">
        <div className="provider-official-identity flex flex-wrap items-center gap-2.5">
          <h2 id="official-provider-heading" className="text-base font-semibold tracking-tight">{BRAND.organization}</h2>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><span aria-hidden="true" className="material-symbols-outlined text-[14px]">verified</span>Official provider</span>
        </div>
        <p>The official provider from the team behind {BRAND.name}. Explore ByKitsune&apos;s AI services and ecosystem.</p>
      </div>
      <div className="provider-official-actions">
        <Link href="/dashboard/providers/bykitsune" aria-label={`Connect ${BRAND.organization}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-primary-hover">
          <span>Connect <span className="provider-official-brand-label">{BRAND.organization}</span></span><span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
        <a href={BRAND.sponsorUrl} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${BRAND.organization} website (opens in a new tab)`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-text-muted transition-colors hover:text-primary">
          <span className="provider-official-website-label">Visit website</span><span aria-hidden="true" className="material-symbols-outlined text-[15px]">arrow_outward</span>
        </a>
      </div>
    </section>
  );
}
