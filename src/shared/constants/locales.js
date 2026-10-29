import { LOCALES, LOCALE_NAMES, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";

// Languages identify a reader's preference; flags identify countries. Keep native
// and English names together so users can find a language in either script.
const ENGLISH_NAMES = {
  en: "English", vi: "Vietnamese", "zh-CN": "Chinese Simplified", "zh-TW": "Chinese Traditional",
  ja: "Japanese", "pt-BR": "Portuguese Brazil", "pt-PT": "Portuguese Portugal", ko: "Korean",
  es: "Spanish", de: "German", fr: "French", he: "Hebrew", ar: "Arabic", ru: "Russian",
  pl: "Polish", cs: "Czech", nl: "Dutch", tr: "Turkish", uk: "Ukrainian", tl: "Tagalog Filipino",
  id: "Indonesian Bahasa Indonesia", km: "Khmer Cambodian", th: "Thai", hi: "Hindi", bn: "Bengali",
  ur: "Urdu", ro: "Romanian", sv: "Swedish", it: "Italian", el: "Greek", hu: "Hungarian",
  fi: "Finnish", da: "Danish", no: "Norwegian", fa: "Persian Farsi",
};
export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);
export const LANGUAGE_OPTIONS = LOCALES.map((locale) => ({
  locale, name: LOCALE_NAMES[locale], englishName: ENGLISH_NAMES[locale],
  code: locale.toUpperCase(), direction: RTL_LOCALES.has(locale) ? "rtl" : "ltr",
}));

export function readDisplayLocale(cookie = typeof document === "undefined" ? "" : document.cookie) {
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  try {
    return normalizeLocale(value ? decodeURIComponent(value.slice(LOCALE_COOKIE.length + 1)) : "en");
  } catch {
    return "en";
  }
}

const searchable = (value) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("en");
export function searchLanguages(query) {
  const terms = searchable(query.trim()).split(/\s+/).filter(Boolean);
  return LANGUAGE_OPTIONS.filter((option) => {
    const haystack = searchable(`${option.name} ${option.englishName} ${option.code}`);
    return terms.every((term) => haystack.includes(term));
  });
}
