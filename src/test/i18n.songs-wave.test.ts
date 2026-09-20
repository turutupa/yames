// The Songs wave's strings, in the fourteen other languages.
//
// `i18n.locales.test.ts` guards the SHAPE of the locale files: same
// namespaces, same keys, same placeholders. It cannot see the thing that
// actually went wrong every time a wave shipped: the keys were all there and
// every value was still the English sentence. English is an acceptable
// fallback for a key that does not exist yet; it is not an acceptable
// translation, and nothing failed when a locale carried 186 of them.
//
// So this file checks the values. Its subject is exactly the keys this wave
// added — `git diff main...songs-v1 -- src/locales/en` at the time W16 ran —
// rather than every key in the repo, because 359 keys that predate the wave
// are also still English and untangling those is somebody else's afternoon
// (see the report on `songs-w16-words`). A later wave adds its own list, or
// replaces this one with the whole key space once the backlog is cleared.
//
// A value that is legitimately the same word in another language goes on
// ALLOWED below, per language, with the reason. "BPM" is a unit; "Tempo" is
// what a German, Spanish, French, Italian, Dutch, Polish, Turkish or
// Vietnamese musician writes; "OK" is "OK". Listing the languages rather than
// waving the key through means a fifteenth locale that ships English is still
// a failure.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

/** Every locale that must carry a translation. English is the source. */
const LANGS = [
  "de", "es", "fr", "it", "ja", "ko", "nl", "pl",
  "pt-BR", "ru", "tr", "vi", "zh-CN", "zh-TW",
];

/**
 * The keys `src/locales/en` gained between `main` (8cc7ea1f) and the end of
 * the Songs wave: the `songs` namespace, the coach's blocks, the three
 * renamed report stats, the coaching-stance settings and the Songs tab's
 * rail label and hotkey.
 */
const ADDED_BY_THE_SONGS_WAVE = [
  "coachBlocks.action.click.1",
  "coachBlocks.action.click.2",
  "coachBlocks.action.click.3",
  "coachBlocks.action.click.4",
  "coachBlocks.action.click.5",
  "coachBlocks.action.click.6",
  "coachBlocks.action.comeBack.inDays",
  "coachBlocks.action.comeBack.tomorrow",
  "coachBlocks.action.loadJam",
  "coachBlocks.action.loadPreset",
  "coachBlocks.action.loopBars",
  "coachBlocks.action.loopBarsAt",
  "coachBlocks.action.ramp",
  "coachBlocks.compare.any",
  "coachBlocks.compare.soon",
  "coachBlocks.compare.title",
  "coachBlocks.fretboard.aria",
  "coachBlocks.passage.bars",
  "coachBlocks.position.open",
  "coachBlocks.position.rootOn3",
  "coachBlocks.position.rootOn4",
  "coachBlocks.position.rootOn5",
  "coachBlocks.position.rootOn6",
  "coachBlocks.progress.aria",
  "coachBlocks.progress.caption",
  "coachBlocks.shape.which",
  "coachBlocks.tab.attempt",
  "coachBlocks.tab.plain",
  "coachBlocks.tab.soon",
  "coachBlocks.take.any",
  "coachBlocks.take.soon",
  "coachBlocks.take.whole",
  "coachReport.covLabel",
  "coachReport.covTitle",
  "coachReport.effLabel",
  "coachReport.effTitle",
  "coachReport.gridLabel",
  "coachReport.gridTitle",
  "nav.songs",
  "presets.titleSongs",
  "settings.coach.stance",
  "settings.coach.stanceHint",
  "settings.coach.stanceLearning",
  "settings.coach.stanceLearningDesc",
  "settings.coach.stanceStrict",
  "settings.coach.stanceStrictDesc",
  "settings.hotkeys.actions.tab-5",
  "settings.hotkeys.descs.tab-5",
  "songs.band.bass",
  "songs.band.click",
  "songs.band.droppedNotes",
  "songs.band.droppedNotes_other",
  "songs.band.drums",
  "songs.band.keys",
  "songs.band.label",
  "songs.band.leftOut",
  "songs.band.leftOut_other",
  "songs.band.levelFor",
  "songs.band.muteFor",
  "songs.band.note",
  "songs.barsCount",
  "songs.barsCount_other",
  "songs.bpm",
  "songs.capo",
  "songs.capoLabel",
  "songs.countIn.bars",
  "songs.countIn.bars_other",
  "songs.countIn.counting",
  "songs.countIn.label",
  "songs.countIn.none",
  "songs.countIn.note",
  "songs.dismiss",
  "songs.dropHere",
  "songs.empty.body",
  "songs.empty.private",
  "songs.empty.title",
  "songs.engine.busy",
  "songs.engine.cannotPlay",
  "songs.fromBar",
  "songs.import",
  "songs.library.add",
  "songs.library.due",
  "songs.library.dueTitle",
  "songs.library.empty",
  "songs.library.remove",
  "songs.library.summary",
  "songs.loop",
  "songs.loopNote",
  "songs.loopOff",
  "songs.loopOn",
  "songs.meter",
  "songs.percent",
  "songs.picker.cancel",
  "songs.picker.notTab",
  "songs.picker.strings",
  "songs.picker.strings_other",
  "songs.picker.title",
  "songs.picker.which",
  "songs.range",
  "songs.review.again",
  "songs.review.amount.beat",
  "songs.review.amount.eighth",
  "songs.review.amount.hair",
  "songs.review.amount.mostOfABeat",
  "songs.review.amount.sixteenth",
  "songs.review.amount.thirtySecond",
  "songs.review.amount.tripletEighth",
  "songs.review.bars.here",
  "songs.review.bars.one",
  "songs.review.bars.range",
  "songs.review.chordsHonesty",
  "songs.review.goes",
  "songs.review.goes_other",
  "songs.review.lessLabel",
  "songs.review.mark.accentQuiet",
  "songs.review.mark.early",
  "songs.review.mark.extra",
  "songs.review.mark.late",
  "songs.review.mark.missed",
  "songs.review.mark.notAssessed",
  "songs.review.mark.onTime",
  "songs.review.mark.slightlyEarly",
  "songs.review.mark.slightlyLate",
  "songs.review.moreLabel",
  "songs.review.moreLabel_other",
  "songs.review.notSaved",
  "songs.review.notes",
  "songs.review.notes_other",
  "songs.review.nothingToSay",
  "songs.review.pass",
  "songs.review.passes",
  "songs.review.say.afterShift.1",
  "songs.review.say.afterShift.2",
  "songs.review.say.afterShift.3",
  "songs.review.say.beatPositionBias.1",
  "songs.review.say.beatPositionBias.2",
  "songs.review.say.beatPositionBias.3",
  "songs.review.say.clean.1",
  "songs.review.say.clean.2",
  "songs.review.say.clean.3",
  "songs.review.say.consistentMiss.1",
  "songs.review.say.consistentMiss.2",
  "songs.review.say.consistentMiss.3",
  "songs.review.say.dragging.1",
  "songs.review.say.dragging.2",
  "songs.review.say.dragging.3",
  "songs.review.say.drift.1",
  "songs.review.say.drift.2",
  "songs.review.say.drift.3",
  "songs.review.say.extras.1",
  "songs.review.say.extras.2",
  "songs.review.say.extras.3",
  "songs.review.say.fallsApart.1",
  "songs.review.say.fallsApart.2",
  "songs.review.say.fallsApart.3",
  "songs.review.say.improved.1",
  "songs.review.say.improved.2",
  "songs.review.say.improved.3",
  "songs.review.say.rushing.1",
  "songs.review.say.rushing.2",
  "songs.review.say.rushing.3",
  "songs.review.say.subdivisionWeak.1",
  "songs.review.say.subdivisionWeak.2",
  "songs.review.say.subdivisionWeak.3",
  "songs.review.say.tempoCeiling.1",
  "songs.review.say.tempoCeiling.2",
  "songs.review.say.tempoCeiling.3",
  "songs.review.say.uneven.1",
  "songs.review.say.uneven.2",
  "songs.review.say.uneven.3",
  "songs.review.summary",
  "songs.review.tab.nothing",
  "songs.review.title",
  "songs.review.tooShort",
  "songs.review.when.early",
  "songs.review.when.late",
  "songs.review.working",
  "songs.sections",
  "songs.speed",
  "songs.speedNote",
  "songs.tab.drawing",
  "songs.tab.failed",
  "songs.tempo",
  "songs.toBar",
  "songs.tuning",
  "songs.warn.barOverfilled",
  "songs.warn.tempoFlattened",
  "songs.warn.tempoFlattened_other",
  "songs.wholeSong",
];

/**
 * Values that are allowed to read exactly as they do in English, per language
 * and with the reason. A unit, a symbol, or a word that language's musicians
 * genuinely write the English way — never "we have not got to it yet".
 */
const ALLOWED: { key: string; langs: string[]; why: string }[] = [
  { key: "songs.bpm", langs: LANGS, why: "BPM is the unit, everywhere" },
  { key: "songs.dismiss", langs: LANGS, why: '"OK" is OK in all fourteen' },
  {
    key: "songs.percent",
    langs: ["es", "it", "ja", "ko", "nl", "pl", "pt-BR", "ru", "vi", "zh-CN", "zh-TW"],
    why: "number then %, no space — de and fr take a space, tr puts the sign first",
  },
  {
    key: "songs.tempo",
    langs: ["de", "es", "fr", "it", "nl", "pl", "tr", "vi"],
    why: "the Italian word these languages already borrowed; pt-BR says andamento",
  },
  {
    key: "songs.capoLabel",
    langs: ["fr", "nl", "vi"],
    why: "capo, the guitarist's word, unchanged",
  },
  { key: "songs.band.bass", langs: ["de", "vi"], why: "the instrument, spelt the same" },
  { key: "songs.band.drums", langs: ["nl"], why: "matches jam.band.drums, which is Drums in Dutch" },
  { key: "songs.band.keys", langs: ["de"], why: "matches jam.band.keys, which is Keys in German" },
  { key: "nav.songs", langs: ["de"], why: "German rock musicians say Songs" },
  { key: "presets.titleSongs", langs: ["de"], why: "the rail label again" },
  { key: "settings.coach.stanceStrict", langs: ["fr"], why: "strict is the French word too" },
  { key: "songs.sections", langs: ["fr"], why: "sections is the French word too" },
  { key: "songs.review.notes", langs: ["fr"], why: "note is the French word too" },
  { key: "songs.review.notes_other", langs: ["fr"], why: "and its plural" },
];

/** True when `lang` may ship English for `key`. */
function allowed(lang: string, key: string): boolean {
  return ALLOWED.some((entry) => entry.key === key && entry.langs.includes(lang));
}

function loadLanguage(lang: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const file of fs.readdirSync(path.join(LOCALES_DIR, lang))) {
    if (!file.endsWith(".json")) continue;
    Object.assign(out, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang, file), "utf8")));
  }
  return out;
}

/** The value at a dotted key, or undefined. */
function at(tree: Record<string, unknown>, dotted: string): unknown {
  let node: unknown = tree;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** The plural categories i18next will ask this language for. */
function categories(lang: string): string[] {
  return [...new Intl.PluralRules(lang).resolvedOptions().pluralCategories];
}

/**
 * Which category the bare key stands for in this repo's files.
 *
 * i18next looks up `key_<category>` and falls back to `key`, so the bare key
 * is the singular where a language has one and the only form where it does
 * not. That is the convention every locale file here already follows.
 */
function categoryOfBareKey(lang: string): string {
  return categories(lang).includes("one") ? "one" : "other";
}

const en = loadLanguage("en");

describe("the Songs wave's strings in the other fourteen languages", () => {
  it("added exactly the keys this file claims were added", () => {
    // If English gains or loses one of these, the list above is stale and
    // every check below is quietly measuring the wrong thing.
    const missing = ADDED_BY_THE_SONGS_WAVE.filter((key) => typeof at(en, key) !== "string");
    expect(missing, "keys on the list that English no longer has").toEqual([]);
  });

  it("no wave key is still the English string, unless it is allow-listed", () => {
    const untranslated: string[] = [];
    for (const lang of LANGS) {
      const tree = loadLanguage(lang);
      for (const key of ADDED_BY_THE_SONGS_WAVE) {
        if (allowed(lang, key)) continue;
        if (at(tree, key) === at(en, key)) untranslated.push(`${lang} ${key}`);
      }
    }
    expect(untranslated, "still English — translate them or allow-list them with a reason").toEqual(
      [],
    );
  });

  it("allow-listed entries really are identical, so the list cannot rot", () => {
    // The mirror of the test above: an allow-list entry for a key somebody has
    // since translated is a note about a decision nobody is making any more.
    const stale: string[] = [];
    for (const entry of ALLOWED) {
      for (const lang of entry.langs) {
        if (at(loadLanguage(lang), entry.key) !== at(en, entry.key)) {
          stale.push(`${lang} ${entry.key} (${entry.why})`);
        }
      }
    }
    expect(stale, "allow-listed but no longer English — drop the entry").toEqual([]);
  });

  it("every allow-listed key is one this wave added", () => {
    const strays = ALLOWED.map((entry) => entry.key).filter(
      (key) => !ADDED_BY_THE_SONGS_WAVE.includes(key),
    );
    expect(strays, "allow-listing a key this test does not check").toEqual([]);
  });

  it("every placeholder English uses survives, exactly, in every language", () => {
    // Per key, not as one big bag: the old shape check compared every
    // placeholder in a language against every placeholder in English, which
    // passes just as happily when a translator moves {{amount}} from one
    // sentence into another. This caught exactly that, in all fourteen at
    // once, on this wave's `songs.review.say.drift.3`.
    const drift: string[] = [];
    const tokens = (value: unknown): string =>
      typeof value === "string"
        ? [...new Set([...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort().join(",")
        : "";
    for (const lang of LANGS) {
      const tree = loadLanguage(lang);
      for (const key of ADDED_BY_THE_SONGS_WAVE) {
        const want = tokens(at(en, key));
        const got = tokens(at(tree, key));
        if (want !== got) drift.push(`${lang} ${key}: English has [${want}], it has [${got}]`);
      }
    }
    expect(drift, "a sentence gained or lost a placeholder in translation").toEqual([]);
  });

  it("every language carries the plural forms its own rules need", () => {
    // Polish and Russian need four categories, Spanish and French and Italian
    // and Brazilian Portuguese three, Japanese and Korean and Vietnamese and
    // both Chinese one. A missing form does not throw: i18next falls back to
    // the bare key, which is the singular, and a Pole reads "5 takt".
    const bases = [
      ...new Set(
        ADDED_BY_THE_SONGS_WAVE.filter((key) => PLURAL_SUFFIX.test(key)).map((key) =>
          key.replace(PLURAL_SUFFIX, ""),
        ),
      ),
    ].sort();
    expect(bases.length, "the wave's pluralised keys").toBeGreaterThan(0);

    const gaps: string[] = [];
    for (const lang of LANGS) {
      const tree = loadLanguage(lang);
      const bare = categoryOfBareKey(lang);
      for (const base of bases) {
        for (const category of categories(lang)) {
          if (category === bare) continue; // the bare key is this one
          const variant = `${base}_${category}`;
          if (typeof at(tree, variant) !== "string") gaps.push(`${lang} ${variant}`);
        }
      }
    }
    expect(gaps, "a plural form the language's own rules will ask for").toEqual([]);
  });
});
