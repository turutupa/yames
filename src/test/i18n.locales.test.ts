// Guards the "directory = language, file = namespace" contract:
//   - every directory in src/locales/ is a supported language
//   - each language carries the same set of namespace files
//   - no top-level group is claimed by two namespaces (the loader merges
//     namespaces shallowly, so a clash would resolve by glob order)
//   - each language declares a "_name" (native name, used by the picker)
//   - every language has exactly the keys of English (no missing, no extra)
//   - every {{placeholder}} token used in English appears in each language too
//
// The namespaces exist so that work on four screens touches four files rather
// than one. They are not part of the key space: `t("drill.mode")` is
// `drill.mode` wherever it is stored, and moving a group between namespace
// files must change nothing a caller can see.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Vitest runs from the project root (no `root` override in vitest.config.ts).
const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

const NAMESPACES = [
  "chain",
  "coach",
  "common",
  "drill",
  "metronome",
  "onboarding",
  "settings",
  "shell",
  "zen",
];

function languages(): string[] {
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function namespaceFiles(lang: string): string[] {
  return fs
    .readdirSync(path.join(LOCALES_DIR, lang))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function loadNamespace(lang: string, ns: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang, `${ns}.json`), "utf8"));
}

/** One language's namespaces merged the way the loader merges them. */
function loadLanguage(lang: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const ns of namespaceFiles(lang)) Object.assign(out, loadNamespace(lang, ns));
  return out;
}

/** All leaf keys, skipping "_" meta keys (e.g. _name). */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([key, value]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return typeof value === "object" && value !== null
        ? collectKeys(value as Record<string, unknown>, next)
        : [next];
    })
    .sort();
}

function leafValues(obj: Record<string, unknown>): unknown[] {
  return Object.entries(obj)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([, value]) =>
      typeof value === "object" && value !== null
        ? leafValues(value as Record<string, unknown>)
        : [value]
    );
}

function placeholders(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe("locale files", () => {
  const langs = languages();
  const en = loadLanguage("en");
  const enKeys = collectKeys(en);
  const enPlaceholders = leafValues(en).flatMap(placeholders);

  it("English is present and is the source of truth", () => {
    expect(langs).toContain("en");
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it("no stray flat locale file survives the namespace split", () => {
    const strays = fs
      .readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);
    expect(strays).toEqual([]);
  });

  it("every language carries the same namespaces", () => {
    for (const lang of langs) {
      expect(namespaceFiles(lang), `${lang} namespace mismatch`).toEqual(NAMESPACES);
    }
  });

  it("no top-level group is claimed by two namespaces", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const ns of NAMESPACES) {
      for (const group of Object.keys(loadNamespace("en", ns))) {
        const prev = owner.get(group);
        if (prev) clashes.push(`${group} is in both ${prev} and ${ns}`);
        else owner.set(group, ns);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("every language declares a _name (native language name)", () => {
    for (const lang of langs) {
      expect(loadNamespace(lang, "common")._name, `${lang} is missing "_name"`).toBeTypeOf(
        "string",
      );
    }
  });

  it("every language has exactly the English key set", () => {
    for (const lang of langs) {
      expect(collectKeys(loadLanguage(lang)), `${lang} key mismatch`).toEqual(enKeys);
    }
  });

  it("every {{placeholder}} from English exists in every language", () => {
    for (const lang of langs) {
      const p = leafValues(loadLanguage(lang)).flatMap(placeholders);
      expect(p, `${lang} placeholder drift`).toEqual(enPlaceholders);
    }
  });

  it("Pocket Check left no strings behind", () => {
    const stale = enKeys.filter((k) => k.includes("pocketCheck") || k.includes("tab-3"));
    expect(stale).toEqual([]);
  });
});
