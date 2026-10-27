import Image from "next/image";
import Link from "next/link";
import { DOCS_CONFIG, t } from "@/constants/docsConfig";
import { docsHref, withBasePath } from "@/lib/urls.mjs";

export default function DocsBrand({ lang, onClick }) {
  return (
    <Link href={docsHref(lang)} className="docs-brand" aria-label={`${DOCS_CONFIG.logo} — ${t(lang, "documentation")}`} onClick={onClick}>
      <Image src={withBasePath("/icons/logo.svg")} width={40} height={40} alt="" className="docs-brand-mark" unoptimized />
      <span className="docs-brand-copy">
        <span className="docs-brand-name">{DOCS_CONFIG.logo}</span>
        <span className="docs-brand-byline">{DOCS_CONFIG.organization}<span className="docs-brand-context"><span aria-hidden="true"> / </span>{t(lang, "documentation")}</span></span>
      </span>
    </Link>
  );
}
