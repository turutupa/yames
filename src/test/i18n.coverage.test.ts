// The parity check from UI_REVAMP.md §2.
//
// Every user-visible string is a key, which makes the locale files a more
// complete inventory of the product than any list a person would keep. So:
// a key with no call site is either a feature that was dropped or a string
// that was renamed, and a t() call with no key is a blank label. Both should
// be deliberate, and neither is visible in a diff.
//
// This is what noticed that settings.hotkeys.{actions,descs}.tab-3 survived
// the Pocket Check removal, hiding under settings rather than with the feature.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const LOCALES = path.join(SRC, "locales");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "locales") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function englishKeys(): string[] {
  const merged: Record<string, unknown> = {};
  for (const f of fs.readdirSync(path.join(LOCALES, "en"))) {
    Object.assign(merged, JSON.parse(fs.readFileSync(path.join(LOCALES, "en", f), "utf8")));
  }
  const walk = (o: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v !== null && typeof v === "object"
        ? walk(v as Record<string, unknown>, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    );
  return walk(merged).filter((k) => !k.startsWith("_"));
}

/**
 * What the code asks for.
 *
 * `t("a.b")` is the easy case. Plenty of keys never appear inside a `t()` call
 * at all — they are chosen elsewhere and handed over as a variable, the way
 * `coachStatus.ts` returns `key: "settings.coach.statusActive"` — so any
 * dotted string literal in the source counts as a reference. That trades a
 * little precision for the recall this check needs to be worth having.
 *
 * A computed key contributes a prefix instead: everything beneath it is live,
 * because there is no way to tell which branch runs.
 */
function callSites() {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  const dotted = /["'`]([a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+)["'`]/g;
  const templatePrefix = /`([a-zA-Z0-9_.-]*)\$\{/g;
  const concatPrefix = /"([a-zA-Z0-9_.-]*\.)"\s*\+/g;
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(dotted)) exact.add(m[1]);
    for (const m of text.matchAll(templatePrefix)) if (m[1]) prefixes.add(m[1]);
    for (const m of text.matchAll(concatPrefix)) prefixes.add(m[1]);
  }
  return { exact, prefixes };
}

function directCalls(): Set<string> {
  const called = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.-]+)"/g)) called.add(m[1]);
  }
  return called;
}

// i18next resolves these itself from the base key; they never appear in code.
const PLURAL_SUFFIXES = ["_one", "_other", "_two", "_few", "_many", "_zero"];

describe("locale key coverage", () => {
  const keys = englishKeys();
  const { exact, prefixes } = callSites();

  const used = (key: string) => {
    if (exact.has(key)) return true;
    for (const suffix of PLURAL_SUFFIXES) {
      if (key.endsWith(suffix) && exact.has(key.slice(0, -suffix.length))) return true;
    }
    for (const prefix of prefixes) if (key.startsWith(prefix)) return true;
    return false;
  };

  it("has no string the app never shows", () => {
    expect(keys.filter((k) => !used(k))).toEqual([]);
  });

  it("has no t() call without a string", () => {
    // Narrower than the scan above: only literal keys handed straight to t(),
    // where a miss really is a blank label rather than a dotted string of some
    // other kind — a selector, a path, an event name.
    const have = new Set(keys);
    const missing = [...directCalls()].filter(
      (k) => !have.has(k) && !keys.some((real) => real.startsWith(`${k}.`)),
    );
    expect(missing).toEqual([]);
  });

  it("still finds a healthy number of both", () => {
    // A guard on the guard: if the scanner ever stops matching, the two
    // assertions above pass vacuously and the check quietly dies.
    expect(keys.length).toBeGreaterThan(500);
    expect(directCalls().size).toBeGreaterThan(200);
  });
});
