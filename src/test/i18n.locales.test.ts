// Guards the "file = language" contract:
//   - every file in src/locales/*.json is a supported language
//   - each file has a "_name" (native language name, used by the picker)
//   - every language covers exactly en.json's *base* key set (no missing, no extra)
//   - plural variants use real CLDR categories, not typos
//   - every {{placeholder}} token used in en.json appears in each language too
//
// Base key set, not literal key set: plural cardinality is language-specific.
// English needs two forms (one/other); Russian and Polish need four
// (one/few/many/other); Japanese and Chinese need one. Demanding identical
// literal keys across locales would make correct Slavic pluralisation
// impossible, so keys are compared with any trailing CLDR plural suffix
// stripped, and the suffixes themselves are validated separately.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Vitest runs from the project root (no `root` override in vitest.config.ts).
const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

/** The six CLDR plural categories i18next appends as `key_<category>`. */
const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

function localeFiles(): string[] {
  return fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));
}

function loadJson(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), "utf8"));
}

/** `foo.bar_few` -> `foo.bar`; leaves non-plural keys untouched. */
function stripPluralSuffix(key: string): string {
  for (const suffix of PLURAL_SUFFIXES) {
    const tail = `_${suffix}`;
    if (key.endsWith(tail) && key.length > tail.length) {
      return key.slice(0, -tail.length);
    }
  }
  return key;
}

/** All leaf [dottedKey, value] pairs, skipping "_" meta keys (e.g. _name). */
function collectEntries(
  obj: Record<string, unknown>,
  prefix = ""
): [string, unknown][] {
  return Object.entries(obj)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([key, value]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return typeof value === "object" && value !== null
        ? collectEntries(value as Record<string, unknown>, next)
        : ([[next, value]] as [string, unknown][]);
    });
}

/** Unique keys with plural suffixes stripped, sorted. */
function baseKeys(entries: [string, unknown][]): string[] {
  return [...new Set(entries.map(([key]) => stripPluralSuffix(key)))].sort();
}

function placeholders(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
}

/**
 * base key -> the set of placeholders used across all of its plural variants.
 * Compared per key rather than as one flat list, so a locale with four plural
 * forms is not penalised for repeating `{{count}}` more often than English.
 */
function placeholdersByBaseKey(
  entries: [string, unknown][]
): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const [key, value] of entries) {
    const base = stripPluralSuffix(key);
    out[base] ??= new Set();
    for (const token of placeholders(value)) out[base].add(token);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, [...v].sort()])
  );
}

describe("locale files", () => {
  const files = localeFiles();
  const en = loadJson("en.json");
  const enEntries = collectEntries(en);
  const enBaseKeys = baseKeys(enEntries);
  const enPlaceholders = placeholdersByBaseKey(enEntries);

  it("en.json is present and is the source of truth", () => {
    expect(files).toContain("en.json");
    expect(enBaseKeys.length).toBeGreaterThan(100);
  });

  it("every file declares a _name (native language name)", () => {
    for (const file of files) {
      expect(loadJson(file)._name, `${file} is missing "_name"`).toBeTypeOf("string");
    }
  });

  it("every language covers exactly the en.json base key set", () => {
    for (const file of files) {
      const keys = baseKeys(collectEntries(loadJson(file)));
      expect(keys, `${file} key mismatch`).toEqual(enBaseKeys);
    }
  });

  it("every plural variant uses a real CLDR category", () => {
    for (const file of files) {
      for (const [key] of collectEntries(loadJson(file))) {
        const base = stripPluralSuffix(key);
        if (base === key) continue; // not a plural variant
        const suffix = key.slice(base.length + 1);
        expect(
          PLURAL_SUFFIXES,
          `${file}: "${key}" uses unknown plural category "_${suffix}"`
        ).toContain(suffix);
      }
    }
  });

  it("every {{placeholder}} from en.json exists in every language", () => {
    for (const file of files) {
      const p = placeholdersByBaseKey(collectEntries(loadJson(file)));
      expect(p, `${file} placeholder drift`).toEqual(enPlaceholders);
    }
  });
});
