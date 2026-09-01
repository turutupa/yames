// Guards the "file = language" contract:
//   - every file in src/locales/*.json is a supported language
//   - each file has a "_name" (native language name, used by the picker)
//   - every language has exactly the keys of en.json (no missing, no extra)
//   - every {{placeholder}} token used in en.json appears in each language too
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Vitest runs from the project root (no `root` override in vitest.config.ts).
const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

function localeFiles(): string[] {
  return fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));
}

function loadJson(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), "utf8"));
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
  const files = localeFiles();
  const en = loadJson("en.json");
  const enKeys = collectKeys(en);
  const enPlaceholders = leafValues(en).flatMap(placeholders);

  it("en.json is present and is the source of truth", () => {
    expect(files).toContain("en.json");
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it("every file declares a _name (native language name)", () => {
    for (const file of files) {
      expect(loadJson(file)._name, `${file} is missing "_name"`).toBeTypeOf("string");
    }
  });

  it("every language has exactly the en.json key set", () => {
    for (const file of files) {
      const keys = collectKeys(loadJson(file));
      expect(keys, `${file} key mismatch`).toEqual(enKeys);
    }
  });

  it("every {{placeholder}} from en.json exists in every language", () => {
    for (const file of files) {
      const p = leafValues(loadJson(file)).flatMap(placeholders);
      expect(p, `${file} placeholder drift`).toEqual(enPlaceholders);
    }
  });
});
