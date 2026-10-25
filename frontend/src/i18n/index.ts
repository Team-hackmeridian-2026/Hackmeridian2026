import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import fr from "./fr.json";
import pt from "./pt.json";

/**
 * UI languages. English is the default; the choice is remembered in localStorage.
 * Stellar addresses, contract names and standard terms (EURC, SEP-24, IP-NFT…) are never translated.
 */
export const LANGUAGES = [
  { code: "en", label: "EN", name: "English", locale: "en-GB" },
  { code: "fr", label: "FR", name: "Français", locale: "fr-FR" },
  { code: "pt", label: "PT", name: "Português", locale: "pt-PT" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "biolicensing.lang";
const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.code === value);

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : "en";
  } catch {
    return "en";
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, pt: { translation: pt } },
  lng: storedLanguage(),
  fallbackLng: "en",
  supportedLngs: LANGUAGES.map((l) => l.code),
  // React already escapes rendered strings.
  interpolation: { escapeValue: false },
});

function applyLanguage(lng: string) {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

applyLanguage(i18n.language);
i18n.on("languageChanged", applyLanguage);

/** BCP 47 locale of the current language, for numbers and dates. */
export function currentLocale(): string {
  return LANGUAGES.find((l) => l.code === i18n.resolvedLanguage)?.locale ?? "en-GB";
}

export default i18n;
