import { createI18n } from "vue-i18n";
import { en } from "./locales/en";
import { fr, type MessageSchema } from "./locales/fr";

export type Locale = "fr" | "en";

export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";

const STORAGE_KEY = "taxipannel:locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LOCALES.includes(saved as Locale)) return saved as Locale;
  } catch {
    // Private mode and quota errors: a stored preference is not worth a crash.
  }
  for (const tag of navigator.languages ?? []) {
    const subtag = tag.split("-")[0] as Locale;
    if (LOCALES.includes(subtag)) return subtag;
  }
  return DEFAULT_LOCALE;
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en },
});

export function currentLocale(): Locale {
  return i18n.global.locale.value;
}

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // See initialLocale().
  }
}

/**
 * Escape hatch for composables, which have no `useI18n()` component context.
 * `useEncodeJob` needs it to turn an `errors.<PanelErrorCode>` into a message.
 */
export function tk(key: string, named?: Record<string, unknown>): string {
  return named ? i18n.global.t(key as never, named as never) : i18n.global.t(key as never);
}

document.documentElement.lang = i18n.global.locale.value;
