/**
 * The words in a Path pack, in other languages.
 *
 * A pack's structure, notes and grading are the same in every language; only
 * what a player reads changes. So the translations are an overlay, never a
 * second pack: one file per language and Path,
 * `src/paths/packs/i18n/<lng>/<pathId>.json`, keyed by stable ids (`path.title`,
 * `level.<levelId>.summary`, `step.<stepId>.howTo.0`,
 * `exercise.<exerciseId>.coachLine`,
 * `exercise.<exerciseId>.variant.<variantId>.howTo.1`, ...). `en/<pathId>.json` is the English
 * source for translators, written by `npm run paths -- strings` from the pack.
 *
 * Each translated string carries a hash of the English it was translated from
 * (`from`). When the English changes, the hash stops matching and the reader
 * shows the new English until someone translates it again: a stale
 * translation never says something the pack no longer says. A missing string
 * reads as English too. Both are allowed; `paths -- check` counts them.
 *
 * Only text a player reads is here. Ids, tab, chords, note names in data,
 * variant labels and author-facing notes (`orderRationale`,
 * `difficultyException`, `feedbackNote`, review history) stay as they are.
 */
import type { Exercise, Level, PathDoc, Step, Variation } from "./format";

/** Bump if the key scheme changes in a way old overlays cannot follow. */
export const STRINGS_VERSION = 1;

export type PackStrings = Record<string, string>;

/** The English source, as written to `i18n/en/<pathId>.json`. */
export type EnglishStrings = {
  version: typeof STRINGS_VERSION;
  path: string;
  lng: "en";
  strings: PackStrings;
};

/** One language's translations of one Path. */
export type StringsOverlay = {
  version: typeof STRINGS_VERSION;
  path: string;
  lng: string;
  strings: PackStrings;
  /** Key to `sourceHash` of the English the translation was made from. */
  from: Record<string, string>;
};

/** FNV-1a over UTF-16 units, as eight hex digits. Stable and cheap. */
export function sourceHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Given a key and its English, the text to show. */
type Lookup = (key: string, english: string) => string;

function list(lookup: Lookup, key: string, items: readonly string[] | undefined): string[] | undefined {
  return items?.map((text, i) => lookup(`${key}.${i}`, text));
}

function exerciseText(ex: Exercise, lookup: Lookup): Exercise {
  const k = `exercise.${ex.id}`;
  const out: Exercise = {
    ...ex,
    title: lookup(`${k}.title`, ex.title),
    purpose: lookup(`${k}.purpose`, ex.purpose),
    howTo: list(lookup, `${k}.howTo`, ex.howTo) ?? [],
    coachLine: lookup(`${k}.coachLine`, ex.coachLine),
    detection: { ...ex.detection, notes: list(lookup, `${k}.detection`, ex.detection.notes) ?? [] },
  };
  if (ex.selfCheck) out.selfCheck = list(lookup, `${k}.selfCheck`, ex.selfCheck);
  if (ex.variation) out.variation = variationText(ex.variation, k, lookup);
  return out;
}

/**
 * A variant's own words (`purpose`, `howTo`), under
 * `exercise.<exerciseId>.variant.<variantId>.purpose` and `...howTo.<n>`. A
 * variant id is `dimension=value` pairs joined by commas ("key=F#-minor",
 * "position=5,key=Bb"); it is used whole and unescaped: a key is one JSON
 * object key, never split on its dots, in the overlays, the todo files and
 * here. Variants with no text of their own are shared, not copied, and so is
 * the whole variation when none has any.
 */
function variationText(variation: Variation, exerciseKey: string, lookup: Lookup): Variation {
  if (!variation.variants.some((v) => v.purpose !== undefined || v.howTo !== undefined)) return variation;
  return {
    ...variation,
    variants: variation.variants.map((variant) => {
      if (variant.purpose === undefined && variant.howTo === undefined) return variant;
      const k = `${exerciseKey}.variant.${variant.id}`;
      const out = { ...variant };
      if (variant.purpose !== undefined) out.purpose = lookup(`${k}.purpose`, variant.purpose);
      if (variant.howTo !== undefined) out.howTo = list(lookup, `${k}.howTo`, variant.howTo);
      return out;
    }),
  };
}

function stepText(step: Step, lookup: Lookup): Step {
  const k = `step.${step.id}`;
  return {
    ...step,
    title: lookup(`${k}.title`, step.title),
    goal: lookup(`${k}.goal`, step.goal),
    why: lookup(`${k}.why`, step.why),
    howTo: list(lookup, `${k}.howTo`, step.howTo) ?? [],
    payoff: lookup(`${k}.payoff`, step.payoff),
    exercises: step.exercises.map((ex) => exerciseText(ex, lookup)),
  };
}

function levelText(level: Level, lookup: Lookup): Level {
  const k = `level.${level.id}`;
  return {
    ...level,
    title: lookup(`${k}.title`, level.title),
    summary: lookup(`${k}.summary`, level.summary),
    placement: {
      ...level.placement,
      startHereIf: list(lookup, `${k}.startHereIf`, level.placement.startHereIf) ?? [],
    },
    warmups: level.warmups.map((ex) => exerciseText(ex, lookup)),
  };
}

/**
 * The one walk over a pack's player-facing text. Extraction and translation
 * both go through it, so the keys a translator sees are the keys the app reads.
 * Copies only what holds text; notes, grading and every variant without words
 * of its own are shared.
 */
function walk(doc: PathDoc, lookup: Lookup): PathDoc {
  const out: PathDoc = {
    ...doc,
    title: lookup("path.title", doc.title),
    goal: lookup("path.goal", doc.goal),
    assumes: lookup("path.assumes", doc.assumes),
    gradingLimits: lookup("path.gradingLimits", doc.gradingLimits),
    prerequisites: {
      ...doc.prerequisites,
      skills: list(lookup, "path.skills", doc.prerequisites.skills) ?? [],
    },
    steps: doc.steps.map((s) => stepText(s, lookup)),
  };
  if (doc.levels) out.levels = doc.levels.map((l) => levelText(l, lookup));
  return out;
}

/** Every translatable English string of a pack, by key, in reading order. */
export function extractStrings(doc: PathDoc): PackStrings {
  const strings: PackStrings = {};
  walk(doc, (key, english) => {
    strings[key] = english;
    return english;
  });
  return strings;
}

export function englishStrings(doc: PathDoc): EnglishStrings {
  return { version: STRINGS_VERSION, path: doc.id, lng: "en", strings: extractStrings(doc) };
}

/**
 * A pack in another language: each string from the overlay when it was
 * translated from the English the pack says now, the English otherwise.
 * Returns the same pack when there is nothing to apply.
 */
export function localizePack(doc: PathDoc, overlay: StringsOverlay | null | undefined): PathDoc {
  if (!overlay || overlay.path !== doc.id) return doc;
  return walk(doc, (key, english) => {
    const text = overlay.strings[key];
    if (typeof text !== "string" || text.trim() === "") return english;
    return overlay.from[key] === sourceHash(english) ? text : english;
  });
}

/** Reads an overlay file, or null when it is not one. */
export function readOverlay(raw: unknown): StringsOverlay | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Partial<StringsOverlay>;
  if (o.version !== STRINGS_VERSION || typeof o.path !== "string" || typeof o.lng !== "string") return null;
  if (typeof o.strings !== "object" || o.strings === null) return null;
  return { version: STRINGS_VERSION, path: o.path, lng: o.lng, strings: o.strings, from: o.from ?? {} };
}

/** `{{name}}` interpolation and `<tag>` markup, which must survive translation. */
const PLACEHOLDER = /\{\{[^}]*\}\}|<\/?[a-zA-Z][^>]*>/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;

function tokens(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) ?? []).sort();
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export type OverlayReport = {
  /** Keys the overlay has and the English does not. An error: delete them. */
  stale: string[];
  /** English keys with no translation. Allowed: they read as English. */
  missing: string[];
  /** Translated from English that has since changed. Read as English. */
  outdated: string[];
  /** A placeholder or markup that is not in both. An error. */
  placeholders: string[];
  /** Numbers that differ from the English. A warning: tempos, frets, bars. */
  numbers: string[];
  /** Translated and current. */
  translated: number;
};

/** What `paths -- check` says about one overlay against its English. */
export function checkOverlay(english: PackStrings, overlay: StringsOverlay): OverlayReport {
  const report: OverlayReport = { stale: [], missing: [], outdated: [], placeholders: [], numbers: [], translated: 0 };
  for (const key of Object.keys(overlay.strings)) {
    if (!(key in english)) report.stale.push(key);
  }
  for (const key of Object.keys(overlay.from)) {
    if (!(key in english) && !(key in overlay.strings)) report.stale.push(key);
  }
  for (const [key, source] of Object.entries(english)) {
    const text = overlay.strings[key];
    if (typeof text !== "string" || text.trim() === "") {
      report.missing.push(key);
      continue;
    }
    if (overlay.from[key] !== sourceHash(source)) {
      report.outdated.push(key);
      continue;
    }
    report.translated += 1;
    if (!sameTokens(tokens(source, PLACEHOLDER), tokens(text, PLACEHOLDER))) report.placeholders.push(key);
    if (!sameTokens(tokens(source, NUMBER), tokens(text, NUMBER))) report.numbers.push(key);
  }
  return report;
}

/** The English still to translate: missing or outdated keys. */
export function stringsToTranslate(english: PackStrings, overlay: StringsOverlay | null): PackStrings {
  if (!overlay) return { ...english };
  const report = checkOverlay(english, overlay);
  const todo: PackStrings = {};
  for (const key of [...report.missing, ...report.outdated]) todo[key] = english[key];
  return todo;
}

/**
 * Merge new translations into an overlay, stamped with the English they were
 * made from. A translation for one key also fills every other key with the
 * same English that has none, so a sentence repeated across Exercises is
 * translated once. Keys not in the English are refused.
 */
export function mergeTranslations(
  english: PackStrings,
  overlay: StringsOverlay | null,
  pathId: string,
  lng: string,
  translations: PackStrings,
): { overlay: StringsOverlay; refused: string[] } {
  const strings: PackStrings = {};
  const from: Record<string, string> = {};
  const refused: string[] = [];
  const byEnglish = new Map<string, string>();
  for (const [key, text] of Object.entries(translations)) {
    if (!(key in english) || typeof text !== "string" || text.trim() === "") {
      refused.push(key);
      continue;
    }
    byEnglish.set(english[key], text);
  }
  for (const [key, source] of Object.entries(english)) {
    const fresh = key in translations && !refused.includes(key) ? translations[key] : undefined;
    const kept =
      overlay && typeof overlay.strings[key] === "string" && overlay.from[key] === sourceHash(source)
        ? overlay.strings[key]
        : undefined;
    const text = fresh ?? kept ?? byEnglish.get(source);
    if (text === undefined) continue;
    strings[key] = text;
    from[key] = sourceHash(source);
  }
  return { overlay: { version: STRINGS_VERSION, path: pathId, lng, strings, from }, refused };
}

/** An overlay as bytes: stable key order (the English's), one string a line. */
export function serializeOverlay(overlay: StringsOverlay | EnglishStrings): string {
  return `${JSON.stringify(overlay, null, 2)}\n`;
}
