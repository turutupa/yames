/**
 * The router's training set, generated (leg c3d1, TOOLS 3.4, brief items 2-5).
 *
 * Per language: a situation (a screen, a Path and Step, a Session phase,
 * grading, a tempo), a wording written by a helper for one intent with its
 * slots filled from the app's own data, a tool list (shuffled, some withheld),
 * and the answer the RUNNER gives (`judge`): never a model's.
 *
 * The mix is weighted to the decisions the stock models get wrong (c3b2m:
 * they act where they should ask or refuse): far fewer calls than the
 * held-out set's two in three (`DEFAULT_MIX`).
 *
 * Pure and seeded: the same wordings, Paths and seed give the same records.
 */
import type { PathDoc } from "../../paths/format";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import { SETTINGS_SECTIONS } from "../tools/host";
import { GO_TO_SCREENS } from "../tools/go";
import { resolveExercise, resolvePath, resolveStep } from "../tools/resolve";
import { CHORD_SUFFIXES, NECK_POSITIONS, ROOT_NAMES, SCALE_NAMES } from "../blocks/spec";
import { commandTableFor } from "../ask/commandTable";
import { GRAMMAR_QUERY_MAX } from "../ask/grammar";
import { CARD_IDS } from "../ask/evalCards";
import { WORLD_FOLLOWED, WORLD_JAMS, WORLD_PRESETS, WORLD_THEMES, contextFor, effectOf, type EvalLanguage, type EvalView, type Expect, type Situation } from "../ask/evalWorld";
import { ASKABLE_METRICS, ungradedPlayer } from "../ask/cards";
import { FACT_CARDS, cardAboutLastTake, type FactCardTool } from "../ask/intents";
import type { CoachContext, CoachRun } from "../context";
import { checkCall } from "../tools/run";
import { argString, takeRunning, type ToolArgs } from "../tools/types";
import type { TakeOutcome } from "../../session/runner";
import { CALL_INTENTS, CARD_INTENTS, NONE_INTENTS, YOURS_INTENTS, slotsIn, type CallIntent, type Filled, type Intent, type Slot } from "./intents";
import type { LeakGuard } from "./leakage";
import { leakKey } from "./leakage";
import type { TrainRecord } from "./render";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** `evals/coach/train/wordings/<lng>.json`, as the helpers write it. */
export type WordingsFile = {
  language: string;
  writer: string;
  wordings: Record<string, string[]>;
  goals?: string[];
  vocab?: Partial<Record<"screen" | "section" | "scale" | "position" | "metric", Record<string, string[]>>>;
};

/**
 * Shares of a language's records by what the right answer is (the rest of `none` split below).
 * `cardNone`: a card question the card's own rule turns away here (no Take to read, a Take
 * running, an ungraded player): `none` (leg c3int).
 */
export type Mix = { call: number; which: number; yours: number; card: number; cardNone: number; noneAsked: number; wrongScreen: number; withheld: number };

/**
 * About two in five calls (the held-out set: two in three), the rest the
 * decisions the stock models miss: "which one?", "that one is yours", and
 * three kinds of nothing (not a request; a tool that cannot run here; a tool
 * not in the list). Cards take a share only once `EVAL_CARDS` has ids.
 */
export const DEFAULT_MIX: Mix = { call: 0.4, which: 0.18, yours: 0.16, card: 0, cardNone: 0, noneAsked: 0.13, wrongScreen: 0.09, withheld: 0.04 };
/** The card questions' shares with cards on: a card answer 20%, a card question turned away 4%. */
const CARD_SHARE = 0.2;
const CARD_NONE_SHARE = 0.04;
/**
 * With cards on (leg c3int): the card shares, and every other share of
 * `DEFAULT_MIX` scaled by what is left, so call / which / yours / none keep
 * c3d1's proportions among the records that are not card questions.
 */
export const CARD_MIX: Mix = (() => {
  const rest = 1 - CARD_SHARE - CARD_NONE_SHARE;
  const scaled = Object.fromEntries(Object.entries(DEFAULT_MIX).map(([k, x]) => [k, x * rest])) as Mix;
  return { ...scaled, card: CARD_SHARE, cardNone: CARD_NONE_SHARE };
})();

export type GenOptions = {
  /** Records wanted in this language. */
  size: number;
  seed: number;
  mix?: Mix;
  /** Wording ids (`<intent>#<index>`) a reviewer rejected: never used. */
  blocked?: ReadonlySet<string>;
  guard: LeakGuard;
};

export type GenResult = { records: TrainRecord[]; drops: Record<string, number> };

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Rng = () => number;
export function rngFor(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Names, from the Paths in the language
// ---------------------------------------------------------------------------

const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const splitWords = (t: string) => t.split(/[\s・·,、/()（）:：-]+/u).filter(Boolean);

/**
 * A word a name may stand on alone, or begin or end with: a content word, not
 * "und", "über", "và", "e" (reviewers rejected names cut at those, c3d1). In a
 * script without spaces, three characters or more.
 */
function contentWord(w: string, stop: ReadonlySet<string>): boolean {
  if (/\d/.test(w) || stop.has(w.toLowerCase())) return false;
  return [...w].length >= (UNSPACED.test(w) ? 3 : 5);
}

/** A run of words (a part of a title) that reads as a name: its first and last words are content words. */
function goodRun(words: readonly string[], stop: ReadonlySet<string>): boolean {
  return contentWord(words[0], stop) && contentWord(words[words.length - 1], stop);
}

/** Name forms: the title, runs of two or more of its words, and its longer single words. */
function nameForms(title: string, stop: ReadonlySet<string>): string[] {
  const words = splitWords(title);
  const out = new Set<string>([title]);
  if (UNSPACED.test(title)) {
    out.add(title.replace(/[\s・·]/gu, ""));
    for (const w of words) if (contentWord(w, stop)) out.add(w);
  } else {
    for (let n = 2; n < words.length; n++) {
      for (let i = 0; i + n <= words.length; i++) if (goodRun(words.slice(i, i + n), stop)) out.add(words.slice(i, i + n).join(" "));
    }
    for (const w of words) if (contentWord(w, stop)) out.add(w);
  }
  return [...out];
}

type Names = { unique: string[]; ambiguous: string[] };

/**
 * The names that find exactly their own title (the title, its first and last
 * two words), and the single words that match several titles. `full` uses
 * every form (`nameForms`): for the Paths, which are few.
 */
function namesOf<T>(
  titles: readonly string[],
  resolve: (q: string) => { found?: T; several?: readonly T[] },
  idOf: (title: string) => T | undefined,
  stop: ReadonlySet<string>,
  full = false,
): Names {
  const unique = new Set<string>();
  const words = new Set<string>();
  for (const title of titles) {
    const own = idOf(title);
    const split = splitWords(title);
    const runs = UNSPACED.test(title) || split.length <= 3 ? [] : [split.slice(0, 2), split.slice(-2)].filter((r) => goodRun(r, stop)).map((r) => r.join(" "));
    const forms = full ? nameForms(title, stop) : [title, ...runs];
    for (const form of forms) {
      const r = resolve(form);
      if (r.found !== undefined && r.found === own) unique.add(form);
    }
    for (const w of split) if (contentWord(w, stop)) words.add(w.toLowerCase());
  }
  const ambiguous = [...words].filter((w) => {
    const r = resolve(w);
    return r.several !== undefined && r.several.length > 1;
  });
  return { unique: [...unique].sort(), ambiguous: ambiguous.sort() };
}

export type LanguageData = {
  lang: EvalLanguage;
  paths: readonly PathDoc[];
  path: Names;
  step: Names;
  exercise: Names;
  followed: string[];
  words: Record<"screen" | "section" | "scale" | "position" | "metric", Record<string, string[]>>;
  goals: string[];
};

/** Settings sections a training call may open: not the three whose controls are the player's own (the command tables leave them out too). */
const OPENABLE_SECTIONS = (Object.keys(SETTINGS_SECTIONS) as string[]).filter((s) => !["devices", "grading", "recording"].includes(s));

export function languageData(lang: EvalLanguage, paths: readonly PathDoc[], file: WordingsFile): LanguageData {
  const table = commandTableFor(lang);
  const fromTable = (key: "screens" | "sections" | "scales" | "positions", ids: readonly string[], over?: Record<string, string[]>) => {
    const out: Record<string, string[]> = {};
    const tableWords = (table?.[key] ?? {}) as Record<string, readonly string[] | undefined>;
    for (const id of ids) {
      const words = over?.[id] ?? tableWords[id];
      if (words && words.length > 0) out[id] = [...words];
    }
    return out;
  };
  const stepHits = paths.flatMap((p) => p.steps.map((s) => ({ p, s })));
  const exerciseTitles = [...new Set(paths.flatMap((p) => p.steps.flatMap((s) => s.exercises.map((e) => e.title))))];
  const followedDocs = WORLD_FOLLOWED.map((id) => paths.find((p) => p.id === id)).filter((p): p is PathDoc => !!p);
  // The language's small words (the command table's fillers, connectors, question and "not a command" words): never a name alone.
  const stop = new Set<string>(
    table
      ? [...table.fillers, ...table.notCommand, ...table.polite, ...table.questions, ...Object.values(table.connectors).flat()].map((w) => w.toLowerCase())
      : [],
  );
  return {
    lang,
    paths,
    path: namesOf(
      paths.map((p) => p.title),
      (q) => {
        const r = resolvePath(q, paths);
        return "found" in r ? { found: r.found } : "several" in r ? { several: r.several } : {};
      },
      (t) => paths.find((p) => p.title === t),
      stop,
      true,
    ),
    step: namesOf(
      [...new Set(stepHits.map((h) => h.s.title))],
      (q) => {
        const r = resolveStep({ paths }, { query: q });
        return "found" in r ? { found: r.found.step.title } : "several" in r ? { several: r.several.map((h) => h.step.title) } : {};
      },
      (t) => t,
      stop,
    ),
    exercise: namesOf(
      exerciseTitles,
      (q) => {
        const r = resolveExercise(q, { paths });
        return "found" in r ? { found: r.found.exercise.title } : "several" in r ? { several: r.several.map((h) => h.exercise.title) } : {};
      },
      (t) => t,
      stop,
    ),
    followed: followedDocs.flatMap((p) => nameForms(p.title, stop).filter((f) => {
      const r = resolvePath(f, paths);
      return "found" in r && r.found.id === p.id;
    })),
    words: {
      screen: fromTable("screens", GO_TO_SCREENS, file.vocab?.screen),
      section: fromTable("sections", OPENABLE_SECTIONS, file.vocab?.section),
      scale: fromTable("scales", SCALE_NAMES, file.vocab?.scale),
      position: fromTable("positions", NECK_POSITIONS, file.vocab?.position),
      // The wordings file's own words only: no command table names these.
      metric: Object.fromEntries(ASKABLE_METRICS.flatMap((id) => (file.vocab?.metric?.[id]?.length ? [[id, [...file.vocab.metric[id]]]] : []))),
    },
    goals: (file.goals ?? []).filter((g) => g.trim() !== "" && !/\d/.test(g)),
  };
}

// ---------------------------------------------------------------------------
// Situations
// ---------------------------------------------------------------------------

const VIEW_WEIGHTS: ReadonlyArray<[EvalView, number]> = [
  ["today", 3],
  ["paths", 4],
  ["progress", 1],
  ["beat", 2],
  ["drill", 2],
  ["jam", 2],
  ["setlist", 1],
  ["songs", 1],
  ["tools", 1],
  ["settings", 1],
  ["session", 4],
];

export function sampleSituation(rng: Rng, paths: readonly PathDoc[]): Situation {
  const total = VIEW_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  let view: EvalView = "today";
  for (const [v, w] of VIEW_WEIGHTS) {
    if ((r -= w) < 0) {
      view = v;
      break;
    }
  }
  const g = rng();
  const grading = g < 0.7 ? undefined : g < 0.85 ? ("off" as const) : ("ask" as const);
  const s: Situation = { view, ...(grading ? { grading } : {}) };
  if (view === "beat" || view === "drill" || view === "jam") s.tempo = int(rng, 12, 32) * 5;
  if (view === "paths" || view === "session") {
    const p = pick(rng, paths);
    const depth = view === "session" ? 2 : int(rng, 0, 2);
    if (depth >= 1) s.path = p.id;
    if (depth >= 2) s.step = pick(rng, p.steps).order;
  }
  if (view === "session") {
    const ph = rng();
    s.phase = ph < 0.45 ? "ready" : ph < 0.7 ? "result" : ph < 0.85 ? "playing" : "listening";
  }
  return s;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

const SOLFEGE: Record<string, Record<string, string>> = {
  es: { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" },
  it: { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" },
  "pt-BR": { C: "Dó", D: "Ré", E: "Mi", F: "Fá", G: "Sol", A: "Lá", B: "Si" },
  fr: { C: "Do", D: "Ré", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" },
};
/** German and Dutch-speaking players may mean B or B flat by "B" (German "H"): no B-rooted names there. */
const NO_B = new Set(["de"]);
const COMMON_SUFFIXES = ["", "m", "7", "m7", "maj7", "sus4", "sus2", "dim", "6", "9", "add9", "m7b5", "5"];

function rootFill(rng: Rng, lang: string): { said: string; value: string } {
  const letters = ROOT_NAMES.filter((r) => !(NO_B.has(lang) && r.startsWith("B")));
  const sol = SOLFEGE[lang];
  if (sol && rng() < 0.5) {
    const letter = pick(rng, Object.keys(sol).filter((l) => letters.includes(l)));
    return { said: sol[letter], value: letter };
  }
  const natural = rng() < 0.75;
  const pool = letters.filter((r) => (natural ? r.length === 1 : r.length === 2));
  const value = pick(rng, pool);
  return { said: value, value };
}

const casing = (rng: Rng, s: string) => (rng() < 0.45 && !UNSPACED.test(s) ? s.toLowerCase() : s);

/**
 * Every slot of `intent` filled for this situation, or null when it cannot be
 * (no word for it in the language, no Path to count a Step on). `ambiguous`
 * fills the name slots with words that match several titles.
 */
export function fillSlots(rng: Rng, intent: Intent, situation: Situation, data: LanguageData, ambiguous: boolean): Filled | null {
  const f: Filled = {};
  const set = (s: Slot, said: string, value: string | number = said) => {
    f[s] = { said, value };
  };
  const names = (n: Names) => (ambiguous ? n.ambiguous : n.unique);
  for (const slot of intent.slots) {
    switch (slot) {
      case "path":
      case "stepName":
      case "exercise": {
        const list = names(slot === "path" ? data.path : slot === "stepName" ? data.step : data.exercise);
        if (list.length === 0) return null;
        set(slot, casing(rng, pick(rng, list)));
        break;
      }
      case "followed":
        if (data.followed.length === 0) return null;
        set(slot, casing(rng, pick(rng, data.followed)));
        break;
      case "step": {
        let doc: PathDoc | undefined;
        if (intent.slots.includes("path")) {
          const named = f.path ?? null;
          // The Path slot is filled first (slots are in that order in every intent that has both).
          const r = named ? resolvePath(String(named.value), data.paths) : null;
          doc = r && "found" in r ? r.found : r && "several" in r ? r.several[0] : undefined;
        } else {
          doc = data.paths.find((p) => p.id === situation.path);
        }
        if (!doc) return null;
        const n = int(rng, 1, Math.max(1, doc.steps.length));
        set(slot, String(n), n);
        break;
      }
      case "screen":
      case "section":
      case "scale":
      case "position":
      case "metric": {
        const table = data.words[slot];
        const ids = Object.keys(table);
        if (ids.length === 0) return null;
        const id = pick(rng, ids);
        set(slot, pick(rng, table[id]), id);
        break;
      }
      case "root": {
        const r = rootFill(rng, data.lang);
        set(slot, r.said, r.value);
        break;
      }
      case "chord": {
        const roots = ROOT_NAMES.filter((r) => !(NO_B.has(data.lang) && r.startsWith("B")) && (r.length === 1 || rng() < 0.3));
        const suffix = pick(rng, COMMON_SUFFIXES.filter((s) => s === "" || CHORD_SUFFIXES.includes(s)));
        const chord = `${pick(rng, roots)}${suffix}`;
        set(slot, chord, chord);
        break;
      }
      case "bpm": {
        const n = int(rng, 10, 40) * 5 + (rng() < 0.2 ? int(rng, 1, 4) : 0);
        set(slot, String(n), n);
        break;
      }
      case "minutes": {
        const n = pick(rng, [5, 10, 15, 20, 25, 30]);
        set(slot, String(n), n);
        break;
      }
      case "part": {
        const n = int(rng, 1, 3);
        set(slot, String(n), n);
        break;
      }
      case "subdivision": {
        const n = int(rng, 2, 4);
        set(slot, String(n), n);
        break;
      }
      case "from": {
        const n = int(rng, 1, 16);
        set(slot, String(n), n);
        break;
      }
      case "to": {
        const from = Number(f.from?.value ?? 1);
        const n = from + int(rng, 1, 7);
        set(slot, String(n), n);
        break;
      }
      case "jam":
        set(slot, casing(rng, pick(rng, WORLD_JAMS)));
        break;
      case "preset":
        set(slot, casing(rng, pick(rng, WORLD_PRESETS)));
        break;
      case "theme": {
        const t = pick(rng, WORLD_THEMES);
        set(slot, rng() < 0.3 ? t[0].toUpperCase() + t.slice(1) : t, t);
        break;
      }
      case "view": {
        const view = pick(rng, ["neck", "runway", "tab"]);
        set(slot, view, view);
        break;
      }
      case "goal":
        if (data.goals.length === 0) return null;
        set(slot, pick(rng, data.goals));
        break;
    }
  }
  return f;
}

/** The wording with its slots filled. */
export function fillText(template: string, f: Filled): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_all, s: string) => f[s as Slot]?.said ?? `{${s}}`);
}

/** A wording is usable when its placeholders are exactly the intent's slots, each once, and it has no digit of its own. */
export function wordingProblem(intent: Intent, template: string): string | null {
  const got = slotsIn(template).sort();
  const want = [...intent.slots].sort();
  if (got.join(",") !== want.join(",")) return `slots ${got.join(",")} (want ${want.join(",")})`;
  if (/\p{Nd}/u.test(template.replace(/\{[a-zA-Z]+\}/g, ""))) return "a digit outside the slots";
  if (template.trim() === "") return "empty";
  return null;
}

// ---------------------------------------------------------------------------
// The judge: the runner decides
// ---------------------------------------------------------------------------

export type Judged = { expect: Expect; tags: string[] } | { drop: string };

/** The runner's refusals that mean "not on this screen / not during a Take" (`checkContext`, and a tool's own "not here"). */
export const WRONG_SCREEN = /^notNow:coachTools\.why\.notNow\.(here|take)\b/;
/** The ones that mean "that is already so": the request was right, nothing needed changing. */
export const ALREADY = /^notNow:coachTools\.why\.notNow\.(alreadySetting|alreadyGoal|alreadyMinutes|alreadyFocus|alreadyThere|following)\b/;

/**
 * What the app should do with `intent` said here, with these tools shown.
 * A call: what the runner accepts (a door a later leg wires counts, as in
 * `judgeExpected`); several matches: "which"; a tool that cannot run here, or
 * is not in the list: nothing. Anything else the runner refuses is dropped.
 */
export function judge(intent: Intent, f: Filled, situation: Situation, lang: string, paths: readonly PathDoc[], shown: ReadonlySet<string>): Judged {
  switch (intent.kind) {
    case "yours":
      return { expect: { kind: "yours", item: intent.item }, tags: ["never"] };
    case "none":
      return { expect: { kind: "none" }, tags: ["not-a-request"] };
    case "card":
      return CARD_IDS.includes(intent.card) ? judgeCard(intent.card, intent.args?.(f) ?? {}, situation, lang, paths) : { drop: "card not on coach yet" };
    case "call": {
      const args = intent.args(f);
      // A name longer than the grammar lets a query be could never be written by the model.
      const spec = CATALOGUE.tools.find((t) => t.name === intent.tool);
      for (const field of spec?.args ?? []) {
        const value = args[field.name];
        if (typeof value === "string" && field.type.kind === "query" && [...value].length > Math.min(field.type.maxLength, GRAMMAR_QUERY_MAX)) {
          return { drop: "a name longer than the grammar allows" };
        }
      }
      const effect = effectOf({ tool: intent.tool, args }, situation, lang, paths);
      const tags = intent.id === "tempo_faster" || intent.id === "tempo_slower" ? ["relative"] : [];
      if (effect.refused !== null && WRONG_SCREEN.test(effect.refused)) return { expect: { kind: "none" }, tags: [...tags, "wrong-screen"] };
      // Asked for what is already so ("count-in off" while it is off): the call is still what was asked; the app answers "already".
      const already = effect.refused !== null && ALREADY.test(effect.refused);
      if (already) tags.push("already");
      const accepted = effect.did !== null || effect.refused?.startsWith("notWiredYet:") || already;
      if (accepted || effect.which) {
        if (!shown.has(intent.tool)) return { expect: { kind: "none" }, tags: [...tags, "withheld"] };
        return effect.which ? { expect: { kind: "which" }, tags: [...tags, "ambiguous"] } : { expect: { kind: "call", tool: intent.tool, args }, tags };
      }
      return { drop: `runner: ${effect.refused ?? "refused"}` };
    }
  }
}

/**
 * The coach's context for a card question (leg c3int). The eval world keeps
 * no Takes: as in the held-out set, a Session's result screen stands for "a
 * Take of the Exercise on screen just ended", so there the context carries a
 * measured one (only what `when` reads: its Exercise and a graded verdict;
 * no card body runs on it). `run.ungraded` is the runner's `null` (the
 * world's `contextFor` writes `false`, which `ungradedPlayer` reads as
 * ungraded).
 */
export function cardContext(situation: Situation, lang: string, paths: readonly PathDoc[]): CoachContext {
  const ctx = contextFor(situation, lang, paths);
  const run = ctx.run ? ({ ...ctx.run, ungraded: null } as unknown as CoachRun) : undefined;
  const withRun = run ? { ...ctx, run } : ctx;
  if (situation.view !== "session" || situation.phase !== "result" || !ctx.exercise) return withRun;
  const lastTake = {
    stepId: situation.step === undefined ? "" : String(situation.step),
    exerciseId: ctx.exercise.id,
    title: ctx.exercise.title,
    bpm: run?.bpm ?? 80,
    takeNumber: 1,
    grade: { verdict: "belowBar", cleanBpm: null },
    previousValue: null,
    cleanBefore: null,
  } as unknown as TakeOutcome;
  return { ...withRun, lastTake };
}

/**
 * A card question, judged by the card's own rule (`runFactCard`'s gate,
 * before any card body): the shape check (`checkCall` on `FACT_CARDS`),
 * then nothing while a Take runs, nothing about quality for an ungraded
 * player, and otherwise the card when its `when` holds, a Take of this
 * Exercise is there, or it reads the Exercise (`score_made_of`, a
 * `why_not_counted` naming one thing). Anything turned away is `none`.
 */
export function judgeCard(card: string, args: ToolArgs, situation: Situation, lang: string, paths: readonly PathDoc[]): Judged {
  const checked = checkCall({ tool: card, args }, FACT_CARDS, "player");
  if (!checked.ok) return { drop: `card ${card}: ${checked.line.key}` };
  const tool = checked.call.tool as FactCardTool;
  const ctx = cardContext(situation, lang, paths);
  if (takeRunning(ctx)) return { expect: { kind: "none" }, tags: ["card-near", "take-running"] };
  if (ungradedPlayer(ctx)) return { expect: { kind: "none" }, tags: ["card-near", "ungraded"] };
  const what = argString(checked.call.args, "what");
  const aboutExercise = ctx.exercise !== undefined && ((tool.name === "why_not_counted" && what !== undefined && what !== "take") || tool.name === "score_made_of");
  if (!tool.when(ctx) && !cardAboutLastTake(ctx) && !aboutExercise) return { expect: { kind: "none" }, tags: ["card-near", "no-take"] };
  const tags = ["card", ...Object.keys(args).map((k) => `card-${k}`)];
  return { expect: { kind: "card", card, ...(Object.keys(args).length > 0 ? { args } : {}) }, tags };
}

/**
 * Where a card question is asked: mostly a Session (its result screen the
 * most, where the cards have a Take), sometimes anywhere.
 */
function cardSituation(rng: Rng, paths: readonly PathDoc[]): Situation {
  if (rng() < 0.2) return sampleSituation(rng, paths);
  const p = pick(rng, paths);
  const ph = rng();
  const phase = ph < 0.6 ? "result" : ph < 0.8 ? "ready" : ph < 0.92 ? "playing" : "listening";
  const g = rng();
  const grading = g < 0.8 ? undefined : g < 0.9 ? ("off" as const) : ("ask" as const);
  return { view: "session", path: p.id, step: pick(rng, p.steps).order, phase, ...(grading ? { grading } : {}) };
}

// ---------------------------------------------------------------------------
// One language
// ---------------------------------------------------------------------------

const CATALOGUE = toolCatalogue(COACH_TOOLS);
const PLAYER_TOOLS = CATALOGUE.tools.map((t) => t.name);

/** A shuffled tool list: usually all, sometimes a few withheld (never `keep`; `drop` always). */
function toolList(rng: Rng, keep: string | null, drop: string | null): string[] {
  const r = rng();
  const k = r < 0.4 ? 0 : r < 0.7 ? int(rng, 1, 2) : int(rng, 3, 6);
  const out = shuffle(rng, PLAYER_TOOLS).filter((t) => t !== drop);
  const withhold = new Set(shuffle(rng, out.filter((t) => t !== keep)).slice(0, k));
  return out.filter((t) => !withhold.has(t));
}

type Bucket = "call" | "which" | "yours" | "card" | "cardNone" | "noneAsked" | "wrongScreen" | "withheld";

/** The intents a bucket draws from. */
function intentsFor(bucket: Bucket): readonly Intent[] {
  switch (bucket) {
    case "call":
    case "wrongScreen":
    case "withheld":
      return CALL_INTENTS;
    case "which":
      return CALL_INTENTS.filter((i) => i.slots.some((s) => s === "path" || s === "stepName" || s === "exercise"));
    case "yours":
      return YOURS_INTENTS;
    case "card":
    case "cardNone":
      return CARD_INTENTS.filter((i) => CARD_IDS.includes(i.card));
    case "noneAsked":
      return NONE_INTENTS;
  }
}

function wanted(bucket: Bucket, j: { expect: Expect; tags: string[] }): boolean {
  switch (bucket) {
    case "call":
      return j.expect.kind === "call";
    case "which":
      return j.expect.kind === "which";
    case "wrongScreen":
      return j.expect.kind === "none" && j.tags.includes("wrong-screen");
    case "withheld":
      return j.expect.kind === "none" && j.tags.includes("withheld");
    case "yours":
      return j.expect.kind === "yours";
    case "card":
      return j.expect.kind === "card";
    case "cardNone":
      return j.expect.kind === "none" && j.tags.includes("card-near");
    case "noneAsked":
      return j.expect.kind === "none";
  }
}

const TRIES = 40;

/**
 * Intents drawn more often than the rest: "faster" / "slower" with no number
 * were the stock 4B's commonest error (c3b2m: an invented bpm on 18 items).
 */
const INTENT_WEIGHT: Readonly<Record<string, number>> = { tempo_faster: 3, tempo_slower: 3 };

export function generateLanguage(data: LanguageData, file: WordingsFile, opts: GenOptions): GenResult {
  const mix = opts.mix ?? DEFAULT_MIX;
  const rng = rngFor(hashString(`${data.lang}:${opts.seed}`));
  const drops: Record<string, number> = {};
  const drop = (why: string) => {
    drops[why] = (drops[why] ?? 0) + 1;
  };
  // The usable wordings per intent.
  const usable = new Map<string, Array<{ id: string; text: string }>>();
  for (const [intentId, list] of Object.entries(file.wordings)) {
    const intent = [...CALL_INTENTS, ...YOURS_INTENTS, ...NONE_INTENTS, ...CARD_INTENTS].find((i) => i.id === intentId);
    if (!intent) {
      drop("wording: unknown intent");
      continue;
    }
    const ok: Array<{ id: string; text: string }> = [];
    list.forEach((text, i) => {
      const id = `${intentId}#${i}`;
      if (opts.blocked?.has(`${data.lang}:${id}`)) return drop("wording: rejected by the reviewer");
      const why = wordingProblem(intent, text);
      if (why) return drop(`wording: ${why}`);
      ok.push({ id, text });
    });
    usable.set(intentId, ok);
  }

  const records: TrainRecord[] = [];
  const seen = new Set<string>();
  const buckets: Bucket[] = ["call", "which", "yours", "card", "cardNone", "noneAsked", "wrongScreen", "withheld"];
  for (const bucket of buckets) {
    const target = Math.round(opts.size * mix[bucket]);
    const pool = intentsFor(bucket)
      .filter((i) => (usable.get(i.id)?.length ?? 0) > 0)
      .flatMap((i) => Array.from({ length: INTENT_WEIGHT[i.id] ?? 1 }, () => i));
    if (target === 0 || pool.length === 0) continue;
    let made = 0;
    let misses = 0;
    let turn = 0;
    while (made < target && misses < target * 3 + 50) {
      const intent = pool[turn++ % pool.length];
      const wording = pick(rng, usable.get(intent.id)!);
      let done = false;
      let lastRefusal: string | null = null;
      for (let t = 0; t < TRIES && !done; t++) {
        const situation = bucket === "card" || bucket === "cardNone" ? cardSituation(rng, data.paths) : sampleSituation(rng, data.paths);
        const f = fillSlots(rng, intent, situation, data, bucket === "which");
        if (!f) continue;
        const tool = intent.kind === "call" ? (intent as CallIntent).tool : null;
        const shown = new Set(toolList(rng, bucket === "withheld" ? null : tool, bucket === "withheld" ? tool : null));
        const j = judge(intent, f, situation, data.lang, data.paths, shown);
        if ("drop" in j) lastRefusal = j.drop;
        if ("drop" in j || !wanted(bucket, j)) continue;
        const text = fillText(wording.text, f);
        if (opts.guard.leak(data.lang, text)) {
          drop("leak: too close to a held-out item");
          done = true;
          break;
        }
        const key = `${leakKey(text)}|${JSON.stringify(situation)}|${JSON.stringify(j.expect)}`;
        if (seen.has(key)) {
          done = true;
          break;
        }
        seen.add(key);
        records.push({
          id: "",
          language: data.lang,
          kind: j.expect.kind,
          intent: intent.id,
          wording: wording.id,
          writer: file.writer,
          situation,
          tools: shuffle(rng, [...shown]),
          text,
          expect: j.expect,
          ...(tool ? { call: { tool, args: (intent as CallIntent).args(f) } } : {}),
          ...(intent.kind === "card" ? { card: { card: intent.card, args: intent.args?.(f) ?? {} } } : {}),
          tags: j.tags,
        });
        made++;
        done = true;
      }
      if (!done) {
        misses++;
        drop(`no situation for ${bucket}: ${intent.id}${lastRefusal ? ` (${lastRefusal})` : ""}`);
      }
    }
    if (made < target) drop(`short: ${bucket} ${made}/${target}`);
  }
  shuffle(rng, records).forEach((r, i) => {
    r.id = `${data.lang}-${String(i + 1).padStart(5, "0")}`;
    records[i] = r;
  });
  records.sort((a, b) => a.id.localeCompare(b.id));
  return { records, drops };
}

// ---------------------------------------------------------------------------
// The validation split
// ---------------------------------------------------------------------------

/**
 * About `share` of each (language, kind) group goes to validation, taken in
 * whole wordings where it can be (records ordered by their wording's hash),
 * so the training leg watches unseen wordings, never the held-out set.
 */
export function splitValidation(records: readonly TrainRecord[], share = 0.05): { train: TrainRecord[]; validation: TrainRecord[] } {
  const groups = new Map<string, TrainRecord[]>();
  for (const r of records) {
    const k = `${r.language}|${r.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const held = new Set<string>();
  for (const list of groups.values()) {
    const n = Math.max(1, Math.round(list.length * share));
    if (list.length < 4) continue;
    const ordered = [...list].sort((a, b) => hashString(a.wording) - hashString(b.wording) || a.id.localeCompare(b.id));
    for (const r of ordered.slice(0, n)) held.add(r.id);
  }
  return { train: records.filter((r) => !held.has(r.id)), validation: records.filter((r) => held.has(r.id)) };
}

/** Counts per language × kind, and the hard-case tags. */
export function countRecords(records: readonly TrainRecord[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of records) {
    const row = (out[r.language] ??= {});
    row[r.kind] = (row[r.kind] ?? 0) + 1;
    row.total = (row.total ?? 0) + 1;
    for (const t of r.tags) row[t] = (row[t] ?? 0) + 1;
  }
  return out;
}
