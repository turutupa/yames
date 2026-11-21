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
 * Ranking is BM25 over one passage at a time: a Step's `why`, `payoff` and
 * each `howTo` line, an Exercise's `purpose` and each `howTo` line, and the
 * same fields of the variant the player plays where the variant has its own
 * words (`exerciseWords`). Tokens are words for scripts with spaces, and
 * character bigrams for Japanese, Chinese and Korean. Below `SEARCH_FLOOR`
 * the answer is none: a question about another topic must not get a random
 * passage. The floor is set from the fixtures (`searchData/fixtures/`, see
 * `search.test.ts`).
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
 * The teaching text searched, per owner. `goal` was tried and left out: a
 * Step's goal names what is played ("Play E minor and A minor in time"), not
 * how or why, and with it in the index the fixtures lost hits to goals that
 * share only a chord name (search.test.ts records the run).
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

export type SearchHit = Passage & { score: number };

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
    out.push(token);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/** BM25's two constants, the usual ones; the fixtures gave no reason to move them. */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export type SearchIndex = {
  lng: string;
  passages: Passage[];
  /** term → the passages holding it and how often, as parallel arrays. */
  postings: Map<string, { docs: number[]; tfs: number[] }>;
  lengths: Float64Array;
  averageLength: number;
  /** `<exerciseId>|<variantId>` → the fields that variant words for itself. */
  variantFields: Map<string, Set<SearchField>>;
};

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
  const postings = new Map<string, { docs: number[]; tfs: number[] }>();
  const lengths = new Float64Array(passages.length);
  let total = 0;
  passages.forEach((p, doc) => {
    const terms = tokenize(p.text, lng, true);
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
  return {
    lng,
    passages,
    postings,
    lengths,
    averageLength: passages.length > 0 ? total / passages.length : 0,
    variantFields,
  };
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

/**
 * The score below which a passage is not an answer. Set from the fixtures
 * (`search.test.ts`, "the floor"): above the best score of every question in
 * the near-miss tables, below the best score of the questions that hit.
 */
export const SEARCH_FLOOR = 6;

/** How many candidates a search returns: the model (c3b) may later choose among them. */
export const SEARCH_LIMIT = 5;

export type SearchOptions = {
  /** Only these Paths (the player's: `searchPathIds`). Absent or null: every Path in the index. */
  pathIds?: ReadonlySet<string> | null;
  /** The variant played, where there is one: its own words replace the Exercise's. */
  played?: { exerciseId: string; variantId: string } | null;
  /** Defaults to `SEARCH_FLOOR`; the calibration test passes 0. */
  floor?: number;
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
 * The nearest passages to `query`, best first: at most `limit`, one per
 * Step or Exercise (five lines of one Exercise are one answer, not five), each
 * at or above the floor. Empty: none.
 */
export function searchPaths(query: string, index: SearchIndex, opts: SearchOptions = {}): SearchHit[] {
  const terms = [...new Set(tokenize(query, index.lng))];
  const n = index.passages.length;
  if (terms.length === 0 || n === 0) return [];
  const scores = new Map<number, number>();
  for (const term of terms) {
    const list = index.postings.get(term);
    if (!list) continue;
    const df = list.docs.length;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (let i = 0; i < df; i++) {
      const doc = list.docs[i];
      const tf = list.tfs[i];
      const norm = 1 - BM25_B + (BM25_B * index.lengths[doc]) / (index.averageLength || 1);
      const s = (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
      scores.set(doc, (scores.get(doc) ?? 0) + s);
    }
  }
  const floor = opts.floor ?? SEARCH_FLOOR;
  const limit = opts.limit ?? SEARCH_LIMIT;
  const ranked = [...scores]
    .filter(([doc, score]) => score >= floor && eligible(index, index.passages[doc], opts))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out: SearchHit[] = [];
  const owners = new Set<string>();
  for (const [doc, score] of ranked) {
    const p = index.passages[doc];
    const owner = `${p.pathId}/${p.stepId}/${p.exerciseId ?? ""}`;
    if (owners.has(owner)) continue;
    owners.add(owner);
    out.push({ ...p, score });
    if (out.length >= limit) break;
  }
  return out;
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
    source: { kind: "path", step: hit.stepOrder },
    hit,
    candidates,
  };
}
