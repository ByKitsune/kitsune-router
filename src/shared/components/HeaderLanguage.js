"use client";

import { useState, useSyncExternalStore } from "react";
import { LOCALE_NAMES } from "@/i18n/config";
import { onLocaleChange } from "@/i18n/runtime";
import { readDisplayLocale } from "@/shared/constants/locales";
import LocaleBadge from "./LocaleBadge";
import LanguageSwitcher from "./LanguageSwitcher";

const serverLocale = () => "en";

export default function HeaderLanguage() {
  const [open, setOpen] = useState(false);
  const locale = useSyncExternalStore(onLocaleChange, readDisplayLocale, serverLocale);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl px-2 text-text-muted transition-[background-color,color,box-shadow] duration-200 hover:bg-surface-2 hover:text-text-main motion-reduce:transition-none sm:px-2.5"
        title={`Language: ${LOCALE_NAMES[locale]}`}
        aria-label={`Choose language, current: ${LOCALE_NAMES[locale]}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-i18n-skip="true"
      >
        <LocaleBadge locale={locale} compact />
      </button>
      <LanguageSwitcher hideTrigger isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
