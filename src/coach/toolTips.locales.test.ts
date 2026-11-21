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
 *   - English passes the honesty lint, with no exceptions (leg tc1).
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
 * nothing about tuning, "the pass mark", never "the bar", for a threshold,
 * no pitch word in a timing line and no guitar word in the generic text.
 */
const LINT: [string, RegExp][] = [
  ["tuning", /\btun(e|ed|es|er|ers|ing)\b|in tune|out of tune/i],
  ["cause", /\bbecause\b|\bdue to\b/i],
  ["body", /\btension\b|\btense[sd]?\b|\bposture\b|\bwrists?\b|\bshoulders?\b/i],
  // "across the bar" / "per bar" is a bar of music; "the bar" as a threshold is not.
  ["threshold called a bar", /(?<!\b(across|per|in|within|through|over|of|each|every) )\b(the|your) bar\b(?! (line|by bar))/i],
];

/**
 * The body's state, said anywhere as a fact or a cause (leg tc2): the app
 * measures timing against the click, not fatigue, stiffness, strain or pain.
 * "Stop if anything hurts" is the one way a line may mention pain.
 */
// Leg tc2b: + pain / painful (not "painless", which says nothing hurts),
// exhausted, worn out, numb, hydrate; "stamina" only as a claim about the
// player's ("your stamina", "stamina wall"), since a Path grades `stamina`
// and the scenario is called that. "tension" and "posture" are in LINT above.
const BODY_STATE =
  /\b(tired|tiring|fatigue[ds]?|sore|aches?|aching|cramp\w*|stiff(en\w*)?|injur\w*|tendons?|strain(s|ed|ing)?|pains?|painful|exhausted|worn out|numb|hydrat\w*)\b|\byour stamina\b|\bstamina(?:'s)? (wall|is|runs?|fad\w*|drop\w*|gone)\b|\bgetting heavy\b|\bfeel(s|ing)? (heavy|tight|locked)\b|\bworking (too hard|harder than)\b|\bpast (your )?peak\b|(?<!\b(anything|something) )\bhurt(s|ing)?\b/i;
/**
 * The slots that fire on time played or on accuracy falling at one tempo
 * (fatigue, check_in, stamina) offer a break and say what was measured; they
 * do not mention the body at all, not even as an instruction ("shake it out",
 * "breathe", "come back fresh"). "Long stretch" is time; the guitar's neck is
 * not the player's.
 */
const BREAK_SCENARIO = /^(fatigue|check_in|stamina)$/;
// Not "a touch" (an amount: "drop the BPM a touch"), "no pressure" or
// "fresh start" (leg tc2b). "drink" and "water" are body advice (leg tc2b).
const BODY_WORD =
  /\b(hands?|fingers?|wrists?|arms?|forearms?|shoulders?|limbs?|grip\w*|body|breath\w*|breathe|relax\w*|loose\w*|tight\w*|tense|shake|recover\w*|heav(y|ier)|attack|drink|water|(your|lower|upper) back|you (tend to )?fade)\b|\bfresh\b(?! start)|(?<!\bno )\bpressure\b|(?<!\ba )\btouch\b|(?<!\b(long|quiet|solid|steady|uninterrupted|clean|this|that|a) )\bstretch(es|ing)?\b|(?<!\b(on|up|down|along|across|off) the )\bneck\b(?! (pickup|position))/i;

/**
 * The `stamina` slot (leg tc2b). `detectStaminaPattern` compares a preset's
 * oldest third of sessions with its newest third, in one BPM band, and
 * `{staminaMinutes}` is the AVERAGE LENGTH of those sessions: nothing scores
 * a session minute by minute. So a stamina line may say "your sessions here
 * run about {staminaMinutes} minutes" and "the recent ones scored lower", and
 * never that something happens at, around or past minute N.
 */
const STAMINA_PER_MINUTE =
  /\bminute \{staminaMinutes\}|\{staminaMinutes\}[- ]minute (mark|point)|\b(around|at|past|after|by) (the )?minute\b|\bat this tempo\b/i;

/** A pitch word in a line about timing ("a half-step earlier"). */
const PITCH_WORD = /\bhalf[- ]steps?\b|\bwhole[- ]steps?\b|\bsemitones?\b/i;
const TIMING_SCENARIO = /^(rushing|dragging|rushing_trend|dragging_trend|bias_only|oscillating|grid_lost|grid_discontinuity|pace_coaching|ic_placement_drift|ic_spacing_drift|accuracy_drop|recovery)$/;
/** "Pick attack" is a guitar word: the instrument-neutral `generic` (catalogue and overlays) may not say it. */
const GUITAR_WORD = /\bpick(ing)? attack\b|\bpick hand\b|\bstrum/i;

// Empty since leg tc1 (2026-11-21), which reworded the 42 lines this lint and
// the second readers caught (plans/coach/progress/tc1.md); leg tc2 widened it
// to BODY_STATE and the break slots' BODY_WORD and reworded the 98 lines those
// caught (plans/coach/progress/tc2.md). A new hit is a line to reword, not a
// line to list here.
const LINT_KNOWN: string[] = [];

describe("toolTips: the English honesty lint", () => {
  it("catches only the lines already reported", () => {
    const hits = leaves(en)
      .filter(([p, v]) => {
        if (p.startsWith("words.")) return false;
        const s = v as string;
        if (LINT.some(([, re]) => re.test(s))) return true;
        // catalog.<vocabulary>.<scenario>... and <overlay>.generic.<scenario>...
        const [, vocabulary, scenario] = p.split(".");
        if (BODY_STATE.test(s)) return true;
        if (BREAK_SCENARIO.test(scenario) && BODY_WORD.test(s)) return true;
        if (scenario === "stamina" && STAMINA_PER_MINUTE.test(s)) return true;
        if (TIMING_SCENARIO.test(scenario) && PITCH_WORD.test(s)) return true;
        return vocabulary === "generic" && GUITAR_WORD.test(s);
      })
      .map(([p]) => p);
    expect(hits.sort()).toEqual([...LINT_KNOWN].sort());
  });

  // The lint's edges (leg tc2b): what it must catch and what it must let by.
  it("catches the body and the per-minute claim, and lets ordinary words by", () => {
    for (const s of [
      "Tension creeping in.",
      "Stop if there's any pain.",
      "That's painful to keep up.",
      "You sound exhausted.",
      "Worn out? Take five.",
      "Fingers going numb?",
      "90 seconds off, hydrate, return.",
      "Your stamina is fading.",
      "You've hit the stamina wall.",
    ])
      expect(BODY_STATE.test(s) || LINT.some(([, re]) => re.test(s)), s).toBe(true);
    for (const s of [
      "A painless way back in: drop 5 BPM.",
      "This exercise grades stamina: hold it for the whole Take.",
      "Stop if anything hurts.",
    ])
      expect(BODY_STATE.test(s), s).toBe(false);
    for (const s of ["Lighten your touch.", "Come back fresh.", "Take the pressure off.", "A drink of water, then back in."])
      expect(BODY_WORD.test(s), s).toBe(true);
    for (const s of ["Drop the BPM a touch.", "No pressure — pause if you want.", "Fresh start at the same BPM.", "Long stretch since my last tip."])
      expect(BODY_WORD.test(s), s).toBe(false);
    for (const s of [
      "Your scores dip around minute {staminaMinutes}.",
      "Past the {staminaMinutes}-minute mark your timing slips.",
      "Accuracy dips at minute {staminaMinutes}.",
      "Your scores at this tempo slip.",
    ])
      expect(STAMINA_PER_MINUTE.test(s), s).toBe(true);
    expect(STAMINA_PER_MINUTE.test("Your sessions here run about {staminaMinutes} minutes, and the recent ones scored lower.")).toBe(false);
  });
});
