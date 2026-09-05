import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * Locale files are auto-discovered: every directory under ./locales is a
 * supported language, named by its language tag (e.g. "de" → "de"), and every
 * *.json inside it is one namespace of that language's strings.
 *
 * Keys keep their full path regardless of which file they live in —
 * `t("drill.mode")` reads `drill/drill.json`'s `drill.mode`. The namespaces
 * exist so that four people working on four screens edit four different files
 * instead of one; they are not part of the key space, and moving a group from
 * one namespace file to another changes nothing a caller can see.
 *
 * Each language's common.json must carry a top-level "_name" with the
 * language's native name (e.g. "Deutsch"), used by the picker in Settings.
 *
 * English stays the default and the fallback for missing keys.
 */
const localeModules = import.meta.glob("./locales/*/*.json", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

const resources: Record<string, { translation: Record<string, unknown> }> = {};
const languageNames: Record<string, string> = {};

for (const [path, module] of Object.entries(localeModules)) {
  const lang = path.match(/locales\/([^/]+)\/[^/]+\.json$/)?.[1];
  if (!lang) continue;
  // JSON modules are wrapped in `{ default: ... }` by Vite.
  const contents =
    (module as { default?: Record<string, unknown> }).default ?? module;
  const { _name, ...translation } = contents;
  if (typeof _name === "string") languageNames[lang] = _name;
  // A shallow merge is enough and is deliberate: namespaces never share a
  // top-level group, and `i18n.test.ts` fails the build if two ever do.
  resources[lang] = {
    translation: { ...(resources[lang]?.translation ?? {}), ...translation },
  };
}

for (const lang of Object.keys(resources)) {
  languageNames[lang] ??= lang;
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
