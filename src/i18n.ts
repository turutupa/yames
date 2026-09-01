import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * Locale files are auto-discovered: every *.json in ./locales becomes a
 * supported language. The file name is the language tag (e.g. "de.json" → "de").
 * Each file must carry a top-level "_name" key with the language's native name
 * (e.g. "Deutsch"), which is used by the language picker in Settings.
 *
 * English (en.json) stays the default and the fallback for missing keys.
 */
const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

const resources: Record<string, { translation: Record<string, unknown> }> = {};
const languageNames: Record<string, string> = {};

for (const [path, module] of Object.entries(localeModules)) {
  const lang = path.match(/locales\/(.+)\.json$/)?.[1];
  if (!lang) continue;
  // JSON modules are wrapped in `{ default: ... }` by Vite.
  const contents =
    (module as { default?: Record<string, unknown> }).default ?? module;
  const { _name, ...translation } = contents;
  languageNames[lang] = typeof _name === "string" ? _name : lang;
  resources[lang] = { translation };
}

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export interface LanguageInfo {
  code: string;
  name: string;
}

/** All discovered languages with their native names, English first. */
export function getLanguages(): LanguageInfo[] {
  return Object.keys(resources)
    .map((code) => ({ code, name: languageNames[code] ?? code }))
    .sort((a, b) =>
      a.code === "en" ? -1 : b.code === "en" ? 1 : a.name.localeCompare(b.name)
    );
}

export default i18n;
