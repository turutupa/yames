/**
 * The tools' tip catalogue in fifteen languages (leg c5c3).
 *
 * `i18n.locales.test.ts` says every language carries `toolTips.json` with the
 * same keys. This file says the rest:
 *   - every slot (vocabulary x scenario x severity) has as many variants as
 *     English, and each variant carries exactly its English variant's
 *     `{placeholders}`;
 *   - the sections still waiting for a translation are exactly the ones named
 *     below, by name (they hold English's text and the loader never shows them);
 *     at the end of c5c3 the list is empty;
 *   - the loader shows a language's own text, a pending instrument falls back
 *     to that language's `generic`, a pending `generic` to English;
 *   - English passes the honesty lint, except for the lines listed by name
 *     (reported to the owner, not rewritten here).
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import i18n from "../i18n";
import { createShuffleState, pickTemplate } from "./templates";
import {
  DEFAULT_MODE_CATALOG,
  TEMPLATE_CATALOG,
  localizeTipContext,
  toolTipsFor,
  toolTipsLanguage,
  toolTipWords,
} from "./templateCatalog";

const LOCALES = path.resolve(process.cwd(), "src/locales");
const PENDING_FILE = path.resolve(process.cwd(), "src/coach/toolTipsPending.json");

/**
 * (locale, section) pairs not translated yet. Must equal toolTipsPending.json,
 * so a section cannot quietly stay English: emptying this list is the leg's end.
 */
// Empty since 2026-11-21: all fourteen locales carry every section. A new
// section or locale lands here, by name, until it is translated.
const STILL_PENDING: Record<string, string[]> = {};

type Tree = { [k: string]: Tree | Tree[] | string | string[] };
const read = (lang: string) =>
  (JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "toolTips.json"), "utf8")) as { toolTips: Tree }).toolTips;

const langs = fs
  .readdirSync(LOCALES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "en")
  .map((e) => e.name)
  .sort();

const en = read("en");
const placeholders = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(",");

/** Every (dotted path, value) leaf, in order. */
function leaves(t: unknown, prefix = ""): [string, unknown][] {
  if (t === null || typeof t !== "object") return [[prefix, t]];
  return Object.entries(t).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

/** The section a leaf belongs to, as toolTipsPending.json names sections. */
function sectionOf(p: string): string {
  const [top, second] = p.split(".");
  if (top === "catalog") return second;
  return top; // defaultMode, proMode, words
}

const SECTIONS = ["generic", "defaultMode", "proMode", "words", "electric-guitar", "acoustic-guitar", "bass", "drums", "piano"];

describe("toolTips: every locale has English's slots, variants and placeholders", () => {
  const enLeaves = leaves(en);
  it("English has the 1,305 lines of the catalogue and its 13 words", () => {
    expect(enLeaves.length).toBe(1318);
  });
  for (const lang of langs) {
    it(`${lang}`, () => {
      const theirs = new Map(leaves(read(lang)));
      const drift: string[] = [];
      for (const [p, e] of enLeaves) {
        const t = theirs.get(p);
        if (typeof t !== "string" || t.trim() === "") drift.push(`${p}: missing`);
        else if (placeholders(t) !== placeholders(e as string)) drift.push(`${p}: [${placeholders(t)}] vs [${placeholders(e as string)}]`);
      }
      expect(theirs.size, `${lang} has a slot or variant English lacks`).toBe(enLeaves.length);
      expect(drift).toEqual([]);
    });
  }
});

describe("toolTips: the sections still in English are named", () => {
  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")) as Record<string, string[]>;
  it("the pending file is the list above", () => {
    expect(pending).toEqual(STILL_PENDING);
  });
  it("names only real locales and sections", () => {
    for (const [lang, sections] of Object.entries(pending)) {
      expect(langs).toContain(lang);
      for (const s of sections) expect(SECTIONS).toContain(s);
    }
  });
  for (const lang of langs) {
    it(`${lang}: a section marked done is translated, and has no "!"`, () => {
      const skip = new Set(pending[lang] ?? []);
      const theirs = new Map(leaves(read(lang)));
      const bySection = new Map<string, { n: number; same: number }>();
      const bangs: string[] = [];
      for (const [p, e] of leaves(en)) {
        const s = sectionOf(p);
        if (skip.has(s)) continue;
        const t = theirs.get(p) as string;
        const c = bySection.get(s) ?? { n: 0, same: 0 };
        c.n++;
        if (t === e) c.same++;
        bySection.set(s, c);
        if (/[!！]/.test(t)) bangs.push(p);
      }
      for (const [s, c] of bySection) {
        // A few short lines may read the same ("BPM"); half of a section may not.
        expect(c.same / c.n, `${lang}/${s}: ${c.same} of ${c.n} identical to English`).toBeLessThan(0.5);
      }
      expect(bangs).toEqual([]);
    });
  }
});

describe("toolTips: the loader", () => {
  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")) as Record<string, string[]>;
  afterAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("English reads exactly the file", () => {
    const r = toolTipsFor("en");
    expect(r.lang).toBe("en");
    expect(JSON.stringify(r.catalog)).toBe(JSON.stringify(en.catalog));
    expect(r.words).toEqual(en.words);
  });

  it("an unknown language reads English", () => {
    expect(toolTipsFor("xx").lang).toBe("en");
    expect(toolTipsFor(undefined).lang).toBe("en");
  });

  for (const lang of langs) {
    it(`${lang}: its own sections, pending ones fall back (instrument to its generic, generic to English)`, () => {
      const skip = new Set(pending[lang] ?? []);
      const file = read(lang);
      const r = toolTipsFor(lang);
      if (skip.has("generic")) {
        expect(r.lang).toBe("en");
        expect(r.catalog).toEqual(toolTipsFor("en").catalog);
        return;
      }
      expect(r.lang).toBe(lang);
      for (const v of Object.keys(en.catalog as Tree)) {
        if (skip.has(v)) expect(r.catalog[v as keyof typeof r.catalog]).toBeUndefined();
        else expect(r.catalog[v as keyof typeof r.catalog]).toEqual((file.catalog as Tree)[v]);
      }
      expect(r.words).toEqual(skip.has("words") ? en.words : file.words);
      expect(r.defaultMode).toEqual(skip.has("defaultMode") ? en.defaultMode : file.defaultMode);
    });
  }

  it("the exported catalogues follow i18n.language, and the rephrase is English only", async () => {
    const done = langs.find((l) => !(pending[l] ?? []).includes("generic"));
    await i18n.changeLanguage("en");
    expect(toolTipsLanguage()).toBe("en");
    const enLine = pickTemplate(TEMPLATE_CATALOG, createShuffleState(), {
      vocab: "generic",
      scenario: "session_start_cold",
      severity: "neutral",
      rng: () => 0,
    });
    expect((en.catalog as Tree).generic).toBeDefined();
    expect(((en.catalog as { generic: Tree }).generic.session_start_cold as Tree).neutral).toContain(enLine);
    if (!done) return; // nothing translated yet: every language reads English
    await i18n.changeLanguage(done);
    expect(toolTipsLanguage()).toBe(done);
    const theirs = read(done).catalog as { generic: Tree };
    const line = pickTemplate(TEMPLATE_CATALOG, createShuffleState(), {
      vocab: "drums",
      scenario: "session_start_cold",
      severity: "neutral",
      rng: () => 0,
    });
    const own = (pending[done] ?? []).includes("drums")
      ? (theirs.generic.session_start_cold as Tree).neutral
      : ((read(done).catalog as Tree).drums as Tree).session_start_cold;
    expect(JSON.stringify(own)).toContain(JSON.stringify(line).slice(1, -1));
    expect(DEFAULT_MODE_CATALOG.generic).toEqual(toolTipsFor(done).defaultMode.generic);
  });

  it("the gatekeeper's English direction tokens become the language's words", async () => {
    await i18n.changeLanguage("en");
    expect(localizeTipContext({ biasMs: 14, direction: "before", correctionDirection: "later" })).toEqual({
      biasMs: 14,
      direction: "before",
      correctionDirection: "later",
    });
    expect(toolTipWords().change.separator).toBe("; ");
    const done = langs.find((l) => !(pending[l] ?? []).includes("words") && !(pending[l] ?? []).includes("generic"));
    if (!done) return;
    await i18n.changeLanguage(done);
    const w = read(done).words as { direction: Record<string, string> };
    expect(localizeTipContext({ direction: "after" }).direction).toBe(w.direction.after);
  });
});

/**
 * The honesty lint over English (ROADMAP's voice rules): no cause claimed for
 * a mistake, no claim about the body or technique the coach cannot hear,
 * nothing about tuning, and "the pass mark", never "the bar", for a threshold.
 * The lines that fail it today are listed here and reported, not rewritten:
 * rewording the English is the owner's call.
 */
const LINT: [string, RegExp][] = [
  ["tuning", /\btun(e|ing)\b|in tune|out of tune/i],
  ["cause", /\bbecause\b|\bdue to\b/i],
  ["body", /\btension\b|\btense[sd]?\b|\bposture\b|\bwrist\b|\bshoulders?\b/i],
  ["threshold called a bar", /\b(the|your) bar\b(?! (line|by bar))/i],
];

// 30 lines, found 2026-11-21. Nearly all name the body (tension, wrists,
// shoulders) in the fatigue and stamina slots; proMode's flat_dynamics.1 says
// "across the bar", a bar of music, and is a false positive kept on the list.
const LINT_KNOWN: string[] = [
  "catalog.acoustic-guitar.fatigue.correction.1",
  "catalog.acoustic-guitar.fatigue.correction.6",
  "catalog.acoustic-guitar.fatigue.encouragement.1",
  "catalog.acoustic-guitar.fatigue.encouragement.2",
  "catalog.acoustic-guitar.fatigue.encouragement.3",
  "catalog.acoustic-guitar.fatigue.encouragement.7",
  "catalog.acoustic-guitar.muddy_hits.neutral.1",
  "catalog.bass.fatigue.correction.6",
  "catalog.bass.fatigue.encouragement.2",
  "catalog.bass.fatigue.encouragement.5",
  "catalog.drums.fatigue.correction.2",
  "catalog.electric-guitar.fatigue.correction.0",
  "catalog.electric-guitar.fatigue.correction.1",
  "catalog.electric-guitar.fatigue.correction.3",
  "catalog.electric-guitar.fatigue.correction.6",
  "catalog.electric-guitar.fatigue.encouragement.1",
  "catalog.electric-guitar.fatigue.encouragement.2",
  "catalog.electric-guitar.fatigue.encouragement.3",
  "catalog.electric-guitar.fatigue.encouragement.7",
  "catalog.electric-guitar.session_start_cold.neutral.2",
  "catalog.electric-guitar.stamina.neutral.0",
  "catalog.generic.check_in.correction.4",
  "catalog.piano.fatigue.correction.6",
  "catalog.piano.fatigue.encouragement.2",
  "catalog.piano.fatigue.encouragement.5",
  "catalog.piano.fatigue.encouragement.7",
  "catalog.piano.recovery.encouragement.2",
  "catalog.piano.stamina.neutral.0",
  "catalog.piano.stamina.neutral.1",
  "proMode.generic.flat_dynamics.neutral.1",
];

describe("toolTips: the English honesty lint", () => {
  it("catches only the lines already reported", () => {
    const hits = leaves(en)
      .filter(([p, v]) => !p.startsWith("words.") && LINT.some(([, re]) => re.test(v as string)))
      .map(([p]) => p);
    expect(hits.sort()).toEqual([...LINT_KNOWN].sort());
  });
});
