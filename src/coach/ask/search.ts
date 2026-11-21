/**
 * Engine 3 of Ask (DESIGN 5.3): search of the player's Paths.
 *
 * A typed question that is not a command and that no fact card took gets the
 * nearest passage of the Paths' own teaching text, in the player's language,
 * quoted as it is written ("From the Path · Step N"). Pure: no I/O, no store,
 * no React. The packs arrive already localized (`loadAllPacks(lng)`); the index
 * is built from them the first time a search runs and kept per language
 * (`searchIndexFor`), never at startup and never in a render.
 *
 * A passage is one field: a Step's `why`, `payoff` or one `howTo` line, an
 * Exercise's `purpose` or one `howTo` line, and the same fields of the variant
 * the player plays where the variant has its own words (`exerciseWords`).
 * Ranking is BM25 twice: the Steps first, each Step one document of all its
 * passages and its titles, then the best passage inside each Step (a single
 * line scored alone favoured short lines that shared one rare word with the
 * question). Tokens are words for scripts with spaces, and character bigrams
 * for Japanese, Chinese and Korean. Below `SEARCH_FLOOR` the answer is none:
 * a question about another topic must not get a random passage. The floor is
 * set from the fixtures (`searchData/fixtures/`, `searchFixtures.test.ts`).
 */

import type { BlockSource } from "../blocks/resolve";
import type { CoachAnswer } from "../blocks/types";
import type { PathDoc } from "../../paths/format";
import { isStepPassed, isSubscribed, type PlayerProgress } from "../../session/progress";

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

/** The fields a passage can come from. `goal` is not searched by default: see `INDEXED_FIELDS`. */
export type SearchField = "purpose" | "howTo" | "why" | "payoff" | "goal";

/**
 * The teaching text searched (DESIGN 5.3). `goal` was tried and left out: with
 * it the fixtures found the same number first (39 of 84) and one fewer over
 * the floor (34 against 35), though four more in the first three
 * (`searchFixtures.test.ts`, SEARCH_REPORT=1, the "with the Steps' goals" row).
 * Worth trying again when a model chooses among the candidates (c3b).
 */
export const INDEXED_FIELDS: readonly SearchField[] = ["purpose", "howTo", "why", "payoff"];

/** One quotable passage: one field of a Step or an Exercise, or one `howTo` line. */
export type Passage = {
  pathId: string;
  stepId: string;
  /** The Step's number in its Path, for "From the Path · Step N". */
  stepOrder: number;
  exerciseId?: string;
  /** Set when the words are a variant's own (`exercise.variation.variants[].purpose / howTo`). */
  variantId?: string;
  field: SearchField;
  /** The line of a `howTo`, counted from 0. */
  line?: number;
  /** The words as the pack says them, byte for byte. */
  text: string;
};

/**
 * A passage found. `score` is its Step's BM25 (the Steps are ranked, then the
 * Step's best passage is quoted); `coverage` the share of the question's
 * weight (idf) the Step holds; `passageScore` the passage's own BM25.
 */
export type SearchHit = Passage & { score: number; coverage: number; strength: number; passageScore: number };

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const STOP_FILES = import.meta.glob<{ lng: string; words: string[] }>("./searchData/stopwords/*.json", {
  eager: true,
  import: "default",
});

/** Languages written without spaces: stop words are cut out as substrings before the bigrams. */
const NO_SPACES = new Set(["ja", "zh-CN", "zh-TW"]);

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー々]+/gu;
const CJK_ONLY = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー々]+$/u;
const HAN_ONLY = /^[\p{Script=Han}々]$/u;
const WORD = /[\p{L}\p{N}]+/gu;
const DIGITS = /^\p{N}+$/u;
/** Latin letters that carry marks, folded one by one (never a kana's dakuten, never Cyrillic й). */
const LATIN_MARKED = /[À-ɏḀ-ỿ]/g;
const LATIN_SPECIAL: Readonly<Record<string, string>> = { đ: "d", ł: "l", ı: "i", ø: "o", œ: "oe", æ: "ae", ß: "ss" };

type Lang = { stop: Set<string>; cut: string[] };
const LANGS = new Map<string, Lang>();

function langOf(lng: string): Lang {
  let lang = LANGS.get(lng);
  if (lang) return lang;
  const file = STOP_FILES[`./searchData/stopwords/${lng}.json`];
  const words = (file?.words ?? []).map((w) => fold(w, lng));
  lang = NO_SPACES.has(lng)
    ? { stop: new Set(), cut: words.filter((w) => [...w].length >= 2).sort((a, b) => b.length - a.length) }
    : { stop: new Set(words), cut: [] };
  LANGS.set(lng, lang);
  return lang;
}

/**
 * Lower-case and fold as the locale's own search would. German umlauts are
 * written both ways by players ("Uebung", "Übung"), so ä ö ü become ae oe ue
 * and both meet. Every other Latin accent is dropped (es, fr, it, pt, pl, tr,
 * vi, nl: players type without them). Russian ё is е. Kana, Han and Hangul are
 * left as NFKC leaves them (half-width kana made full, full-width letters
 * made ASCII).
 */
export function fold(text: string, lng: string): string {
  let out = text.normalize("NFKC");
  out = lng === "tr" ? out.toLocaleLowerCase("tr") : out.toLowerCase();
  if (lng === "de") out = out.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
  out = out.replace(/ё/g, "е");
  out = out.replace(LATIN_MARKED, (c) => LATIN_SPECIAL[c] ?? c.normalize("NFD").replace(/\p{M}/gu, ""));
  return out.replace(/[đłıøœæß]/g, (c) => LATIN_SPECIAL[c] ?? c);
}

/**
 * The terms of a text in a language. Words for scripts with spaces (one
 * letter alone is dropped; numbers are kept); for a run of kana, Han or
 * Hangul, its overlapping character bigrams, and a single Han character
 * alone where the run is one character long. In a document every Han
 * character is also a term of its own, so a one-character question word
 * ("弦") can find it inside a longer run.
 */
export function tokenize(text: string, lng: string, asDocument = false): string[] {
  const lang = langOf(lng);
  let folded = fold(text, lng);
  for (const cut of lang.cut) if (folded.includes(cut)) folded = folded.split(cut).join(" ");
  folded = folded.replace(CJK_RUN, (run) => ` ${run} `);
  const out: string[] = [];
  for (const token of folded.match(WORD) ?? []) {
    if (CJK_ONLY.test(token)) {
      if (lang.stop.has(token)) continue;
      const chars = [...token];
      if (chars.length === 1) {
        out.push(token);
        continue;
      }
      for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
      if (asDocument) for (const c of chars) if (HAN_ONLY.test(c)) out.push(c);
      continue;
    }
    if ([...token].length < 2 && !DIGITS.test(token)) continue;
    if (lang.stop.has(token)) continue;
    out.push(stem(token, lng));
  }
  return out;
}

/** Languages whose words are cut to their first `PREFIX_STEM` letters: a stem without a stemmer. */
const PREFIX_LNGS = new Set(["de", "nl", "es", "fr", "it", "pt-BR", "pl", "ru", "tr"]);
export const PREFIX_STEM = 6;

/**
 * A light stem. English: the plural and the -ing / -ed endings ("pull-offs",
 * "picking", "tapped" meet "pull-off", "pick", "tap"). The inflected languages
 * with spaces: the first six letters, which joins "Akkord", "Akkorde",
 * "Akkorden" and "аккорд", "аккорды", "аккордов" at the cost of a rare
 * collision. Vietnamese (syllables) and the bigram languages: none.
 */
export function stem(token: string, lng: string): string {
  if (DIGITS.test(token)) return token;
  if (PREFIX_LNGS.has(lng)) return [...token].slice(0, PREFIX_STEM).join("");
  if (lng !== "en" || !/^[a-z]+$/.test(token)) return token;
  let t = token;
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  // A vowel must be left: "string", "speed" keep their endings.
  if (t.length > 5 && t.endsWith("ing") && /[aeiouy]/.test(t.slice(0, -3))) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed") && !t.endsWith("eed") && /[aeiouy]/.test(t.slice(0, -2))) t = t.slice(0, -2);
  else if (t.length > 4 && /(ss|x|ch|sh)es$/.test(t)) return t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  else return t;
  // "tapp", "strumm" → "tap", "strum"; "pull", "pass" keep their pair.
  if (/([b-df-hj-km-pr-tv-z])\1$/.test(t) && !/(ll|ss|zz|ff)$/.test(t)) t = t.slice(0, -1);
  return t;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/** BM25's two constants, the usual ones; the fixtures gave no reason to move them. */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/**
 * How many times a Step's own title counts in the Step's document. The
 * fixtures' grid (2026-11-20, progress/c2ca.md): weight 0, 1, 3, 5, 8 against
 * Step b 0.5 to 1 and ranking by the Step alone or Step plus passage; 8 with
 * the usual b and the Step alone found the most at 1 over the six languages
 * (39 of 84, against 26 with no titles).
 */
export const TITLE_WEIGHT = 8;

/** term → the documents holding it and how often, as parallel arrays. */
type Postings = Map<string, { docs: number[]; tfs: number[] }>;

/** One BM25 collection: its postings and its documents' lengths. */
type Collection = { postings: Postings; lengths: Float64Array; averageLength: number };

export type SearchIndex = {
  lng: string;
  passages: Passage[];
  /** The passages, each one document. */
  byPassage: Collection;
  /** The Steps, each one document of all its passages (variants' own words left out). */
  bySteps: Collection;
  /** passage → its Step's number in `bySteps`. */
  stepOf: Int32Array;
  /** `<exerciseId>|<variantId>` → the fields that variant words for itself. */
  variantFields: Map<string, Set<SearchField>>;
};

function collection(docs: string[][]): Collection {
  const postings: Postings = new Map();
  const lengths = new Float64Array(docs.length);
  let total = 0;
  docs.forEach((terms, doc) => {
    lengths[doc] = terms.length;
    total += terms.length;
    const counts = new Map<string, number>();
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, tf] of counts) {
      let list = postings.get(t);
      if (!list) postings.set(t, (list = { docs: [], tfs: [] }));
      list.docs.push(doc);
      list.tfs.push(tf);
    }
  });
  return { postings, lengths, averageLength: docs.length > 0 ? total / docs.length : 0 };
}

const idfOf = (n: number, df: number) => Math.log(1 + (n - df + 0.5) / (df + 0.5));

/** BM25 of `terms` over a collection: document → score, and document → the idf it matched. */
function bm25(c: Collection, terms: readonly string[]): { scores: Map<number, number>; matched: Map<number, number> } {
  const b = BM25_B;
  const n = c.lengths.length;
  const scores = new Map<number, number>();
  const matched = new Map<number, number>();
  for (const term of terms) {
    const list = c.postings.get(term);
    if (!list) continue;
    const df = list.docs.length;
    const idf = idfOf(n, df);
    for (let i = 0; i < df; i++) {
      const doc = list.docs[i];
      const tf = list.tfs[i];
      const norm = 1 - b + (b * c.lengths[doc]) / (c.averageLength || 1);
      scores.set(doc, (scores.get(doc) ?? 0) + (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm));
      matched.set(doc, (matched.get(doc) ?? 0) + idf);
    }
  }
  return { scores, matched };
}

function passagesOf(
  paths: readonly PathDoc[],
  fields: readonly SearchField[],
): { passages: Passage[]; variantFields: Map<string, Set<SearchField>> } {
  const passages: Passage[] = [];
  const variantFields = new Map<string, Set<SearchField>>();
  const wanted = new Set(fields);
  for (const path of paths) {
    // One copy of a sentence a Path says twice: the first, the Step's own before its Exercises'.
    const seen = new Set<string>();
    const add = (p: Passage) => {
      if (!wanted.has(p.field)) return;
      if (typeof p.text !== "string" || p.text.trim() === "") return;
      if (!p.variantId) {
        if (seen.has(p.text)) return;
        seen.add(p.text);
      }
      passages.push(p);
    };
    for (const step of path.steps) {
      const at = { pathId: path.id, stepId: step.id, stepOrder: step.order };
      add({ ...at, field: "goal", text: step.goal });
      add({ ...at, field: "why", text: step.why });
      add({ ...at, field: "payoff", text: step.payoff });
      step.howTo.forEach((text, line) => add({ ...at, field: "howTo", line, text }));
      for (const ex of step.exercises) {
        const own = { ...at, exerciseId: ex.id };
        add({ ...own, field: "purpose", text: ex.purpose });
        ex.howTo.forEach((text, line) => add({ ...own, field: "howTo", line, text }));
        for (const variant of ex.variation?.variants ?? []) {
          const fields = new Set<SearchField>();
          if (typeof variant.purpose === "string" && variant.purpose.trim() !== "") {
            fields.add("purpose");
            add({ ...own, variantId: variant.id, field: "purpose", text: variant.purpose });
          }
          const how = (variant.howTo ?? []).filter((t) => typeof t === "string" && t.trim() !== "");
          if (how.length > 0) {
            fields.add("howTo");
            variant.howTo?.forEach((text, line) => add({ ...own, variantId: variant.id, field: "howTo", line, text }));
          }
          if (fields.size > 0) variantFields.set(`${ex.id}|${variant.id}`, fields);
        }
      }
    }
  }
  return { passages, variantFields };
}

/**
 * The index of `paths` (already in `lng`), every Path given: the player's own
 * are chosen at search time (`SearchOptions.pathIds`), so the scores of one
 * question do not move with how many Paths a player follows and one floor
 * holds for everybody.
 */
export function buildSearchIndex(
  paths: readonly PathDoc[],
  lng: string,
  fields: readonly SearchField[] = INDEXED_FIELDS,
): SearchIndex {
  const { passages, variantFields } = passagesOf(paths, fields);
  const terms = passages.map((p) => tokenize(p.text, lng, true));
  const stepOf = new Int32Array(passages.length);
  const stepDocs: string[][] = [];
  const titles = new Map<string, string[]>();
  for (const path of paths) {
    for (const step of path.steps) {
      // The titles name the topic ("Power chords", "The quick change"): the Step is ranked
      // with them, its own title counted TITLE_WEIGHT times. A title is never quoted.
      const words: string[] = [];
      const own = tokenize(step.title, lng, true);
      for (let i = 0; i < TITLE_WEIGHT; i++) words.push(...own);
      for (const ex of step.exercises) words.push(...tokenize(ex.title, lng, true));
      titles.set(`${path.id}/${step.id}`, words);
    }
  }
  let last = "";
  passages.forEach((p, i) => {
    const key = `${p.pathId}/${p.stepId}`;
    if (key !== last) {
      stepDocs.push([...(titles.get(key) ?? [])]);
      last = key;
    }
    stepOf[i] = stepDocs.length - 1;
    if (!p.variantId) for (const t of terms[i]) stepDocs[stepDocs.length - 1].push(t);
  });
  return { lng, passages, byPassage: collection(terms), bySteps: collection(stepDocs), stepOf, variantFields };
}

const CACHE = new WeakMap<readonly PathDoc[], Map<string, SearchIndex>>();

/**
 * The index for these packs in this language, built the first time it is
 * asked for and kept while the same packs array lives. New packs (the app
 * loaded them again, or in another language) are a new array and a new index.
 */
export function searchIndexFor(paths: readonly PathDoc[], lng: string): SearchIndex {
  let byLng = CACHE.get(paths);
  if (!byLng) CACHE.set(paths, (byLng = new Map()));
  let index = byLng.get(lng);
  if (!index) byLng.set(lng, (index = buildSearchIndex(paths, lng)));
  return index;
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

/** One way over the floor: a Step's score and strength both at least these. */
export type SearchFloor = ReadonlyArray<{ score: number; strength: number }>;

/**
 * Below the floor the answer is none. A hit is over it one of two ways: a
 * strong score with some strength (a long question, several words matched),
 * or a fair score with nearly all of the question's weight matched (a short
 * one: "what is a power chord"). `strength` is the Step's score over the most
 * the question could score (every word's idf × (k1 + 1)), so a word no Path
 * has pulls it down.
 *
 * Set from the fixtures (`searchFixtures.test.ts`, SEARCH_REPORT=1, 2026-11-20):
 * the pair that lets none of the 77 near-misses through (en 16, de 20, ja 20,
 * es / ru / zh-CN 10 each) and keeps the most first-place hits: 36 of 39. One
 * number alone did worse: a score floor kept 30 (short questions score low),
 * a strength floor let "what time is it" through. The nearest near-misses:
 * "was kostet eine neue Gitarre" 8.36 / 0.475, "how do I tune my guitar"
 * 6.32 / 0.745 ("Tunes on one string").
 */
export const SEARCH_FLOOR: SearchFloor = [
  { score: 8.5, strength: 0.34 },
  { score: 4.5, strength: 0.84 },
];

/** How many candidates a search returns: the model (c3b) may later choose among them. */
export const SEARCH_LIMIT = 5;

export type SearchOptions = {
  /** Only these Paths (the player's: `searchPathIds`). Absent or null: every Path in the index. */
  pathIds?: ReadonlySet<string> | null;
  /** The variant played, where there is one: its own words replace the Exercise's. */
  played?: { exerciseId: string; variantId: string } | null;
  /** Defaults to `SEARCH_FLOOR`; null is no floor (the calibration run). */
  floor?: SearchFloor | null;
  /** Defaults to `SEARCH_LIMIT`. */
  limit?: number;
};

function eligible(index: SearchIndex, p: Passage, opts: SearchOptions): boolean {
  if (opts.pathIds && !opts.pathIds.has(p.pathId)) return false;
  const played = opts.played;
  if (p.variantId) return !!played && played.exerciseId === p.exerciseId && played.variantId === p.variantId;
  if (played && p.exerciseId === played.exerciseId) {
    const own = index.variantFields.get(`${played.exerciseId}|${played.variantId}`);
    if (own?.has(p.field)) return false;
  }
  return true;
}

/**
 * The nearest passages to `query`, best first: the Steps are ranked by BM25
 * over each Step's whole text (its title counted `TITLE_WEIGHT` times), and
 * each Step quotes its own best passage. At most `limit`, one per Step, each
 * over the floor. Empty: none.
 */
export function searchPaths(query: string, index: SearchIndex, opts: SearchOptions = {}): SearchHit[] {
  const terms = [...new Set(tokenize(query, index.lng))];
  const steps = index.bySteps.lengths.length;
  if (terms.length === 0 || index.passages.length === 0) return [];
  // What the whole question says, in the Steps' idf; a word no Step has counts in full.
  const said = terms.reduce((sum, t) => sum + idfOf(steps, index.bySteps.postings.get(t)?.docs.length ?? 0), 0);
  const stepRank = bm25(index.bySteps, terms);
  const passageRank = bm25(index.byPassage, terms).scores;
  // The best passage each Step has for the question, among the ones this player can be quoted.
  const best = new Map<number, { doc: number; score: number }>();
  for (const [doc, score] of passageRank) {
    if (!eligible(index, index.passages[doc], opts)) continue;
    const step = index.stepOf[doc];
    const now = best.get(step);
    if (!now || score > now.score || (score === now.score && doc < now.doc)) best.set(step, { doc, score });
  }
  const floor = opts.floor === undefined ? SEARCH_FLOOR : opts.floor;
  const ranked: SearchHit[] = [];
  for (const [step, { doc, score: passageScore }] of best) {
    const score = stepRank.scores.get(step) ?? 0;
    const coverage = said > 0 ? (stepRank.matched.get(step) ?? 0) / said : 0;
    const strength = said > 0 ? score / (said * (BM25_K1 + 1)) : 0;
    if (floor && !floor.some((f) => score >= f.score && strength >= f.strength)) continue;
    ranked.push({ ...index.passages[doc], score, coverage, strength, passageScore });
  }
  ranked.sort((a, b) => b.score - a.score || b.passageScore - a.passageScore);
  return ranked.slice(0, opts.limit ?? SEARCH_LIMIT);
}

// ---------------------------------------------------------------------------
// The player's Paths, and the answer
// ---------------------------------------------------------------------------

/**
 * "The player's Paths" (NEXT-LEGS judgement call 1): the Paths they follow
 * plus the ones they have passed a Step in. Null when that is none: a new
 * player searches all of them.
 */
export function searchPathIds(paths: readonly PathDoc[], progress: PlayerProgress | null | undefined): Set<string> | null {
  if (!progress) return null;
  const ids = new Set<string>();
  for (const path of paths) {
    if (progress.states.some((s) => s.pathId === path.id) && isSubscribed(progress, path.id)) ids.add(path.id);
    else if (path.steps.some((step) => isStepPassed(progress, path.id, step))) ids.add(path.id);
  }
  return ids.size > 0 ? ids : null;
}

export type SearchContext = {
  /** The player's language, as i18n has it. */
  language: string;
  /** Every pack the app has loaded, already in `language`. None loaded: no answer. */
  paths: readonly PathDoc[] | null | undefined;
  progress?: PlayerProgress | null;
  played?: SearchOptions["played"];
};

export type SearchAnswer = {
  /** One text block: the passage, quoted byte for byte. */
  answer: CoachAnswer;
  /** What the app attaches to it ("From the Path · Step N"). */
  source: BlockSource;
  /** The passage quoted, with where it is. */
  hit: SearchHit;
  /** Every candidate above the floor, best first (the quoted one first): for the model to choose from later. */
  candidates: SearchHit[];
};

/**
 * Engine 3 as Ask calls it, after the commands and the cards: the best
 * passage of the player's Paths for `text`, or null (nothing above the
 * floor, no packs loaded, nothing to search). Synchronous; the first call in a
 * language builds that language's index.
 */
export function answerSearchFor(text: string, ctx: SearchContext): SearchAnswer | null {
  const paths = ctx.paths;
  if (!paths || paths.length === 0 || text.trim() === "") return null;
  const index = searchIndexFor(paths, ctx.language);
  const candidates = searchPaths(text, index, {
    pathIds: searchPathIds(paths, ctx.progress),
    played: ctx.played ?? null,
  });
  const hit = candidates[0];
  if (!hit) return null;
  return {
    answer: { blocks: [{ type: "text", text: hit.text }] },
    // Which Path: a press on the source line opens this Step, not Step N of another Path (leg c2b2b).
    source: { kind: "path", step: hit.stepOrder, pathId: hit.pathId },
    hit,
    candidates,
  };
}
