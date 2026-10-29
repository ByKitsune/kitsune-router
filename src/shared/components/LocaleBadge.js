import { Languages } from "lucide-react";
import { normalizeLocale } from "@/i18n/config";

export default function LocaleBadge({ locale, compact = false }) {
  return (
    <span data-i18n-skip="true" className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-semibold tracking-[0.04em] ${compact ? "text-[11px]" : "border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-text-main"}`} dir="ltr">
      <Languages size={compact ? 17 : 15} aria-hidden="true" strokeWidth={1.7} />
      {normalizeLocale(locale).toUpperCase()}
    </span>
  );
}
