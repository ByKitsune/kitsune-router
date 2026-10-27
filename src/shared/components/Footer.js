import Link from "next/link";
import Image from "next/image";
import { BRAND } from "../../../branding/identity.mjs";

export default function Footer() {
  return (
    <footer className="bg-surface-2 text-text-main">
      <div className="mx-auto max-w-[1400px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div className="max-w-lg">
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">{BRAND.tagline}</p>
            <p className="mt-4 text-base leading-7">
              Maintained and sponsored by <a href={BRAND.sponsorUrl} className="font-semibold underline underline-offset-4">{BRAND.organization}</a>.
              {" "}Choose your own providers. A ByKitsune account is not required.
            </p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-1 text-base font-semibold md:max-w-xs md:justify-end">
            <a href={BRAND.docsUrl} className="inline-flex min-h-11 items-center hover:underline underline-offset-4">Documentation</a>
            <a href={BRAND.repository} className="inline-flex min-h-11 items-center hover:underline underline-offset-4">Source</a>
            <a href={`${BRAND.repository}/blob/HEAD/LICENSE`} className="inline-flex min-h-11 items-center hover:underline underline-offset-4">MIT license</a>
            <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex min-h-11 items-center hover:underline underline-offset-4">Contact</a>
          </nav>
        </div>
        <Link href="/landing" className="mt-12 flex w-fit items-center gap-3 sm:gap-5" aria-label={`${BRAND.name} home`}>
          <Image src="/icons/logo.svg" alt="" width={92} height={92} className="h-12 w-12 shrink-0 sm:h-20 sm:w-20" />
          <span className="text-[clamp(28px,6.5vw,94px)] font-semibold leading-none tracking-[-0.065em]">{BRAND.name}</span>
        </Link>
        <div className="mt-10 flex flex-col justify-between gap-4 text-[13px] leading-6 text-text-muted sm:flex-row sm:gap-8">
          <p>
            MIT licensed. Original work © 2024–2026 decolua and contributors.
            {" "}Built on <a href="https://github.com/decolua/9router" className="underline underline-offset-4">9Router</a>.
          </p>
          <p className="max-w-sm">Provider names and marks belong to their respective owners. No provider endorsement is implied.</p>
        </div>
      </div>
    </footer>
  );
}
