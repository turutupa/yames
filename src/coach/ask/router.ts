/**
 * Typed commands: what the player typed, as one tool call, or "not a command"
 * (TOOLS 2.1, the "typed command" row; DESIGN 5.3, engine 1; leg t1b2a).
 *
 * `routeCommand(text, table, facts)` is pure: no React, no store, no i18n
 * runtime, nothing run. It returns one of
 *
 * - `call`: a tool call the runner (`runCoachTool`) takes as it is;
 * - `which`: two or more calls the words could mean, for "Which one?";
 * - `yours`: a never-list item, for "that one is yours" (`askYours`);
 * - `none`: not a command. Ask falls through to its next way of answering.
 *   `notHere` carries the call when the words were a command whose tool
 *   cannot run here (its `when` says no): the caller may let the runner say
 *   why, which changes nothing.
 *
 * ## A wrong action is the failure that matters
 *
 * So the router prefers `none` to a guess, in this order:
 *
 * 1. A question is not a command: a question mark, or a first word from the
 *    table's `questions` ("why", "can", "is"). "Can you open Paths for me
 *    later?" is answered, not obeyed.
 * 2. A sentence about something is not a command: any word from
 *    `notCommand` ("I", "it", "later", "not", "yesterday", "than").
 * 3. A never-list word answers `yours`, before any verb is looked at, so
 *    "start recording" or "open grading settings" can never become a call.
 * 4. Then the command itself, matched whole: a verb first (anywhere, in a
 *    language written without spaces; first or last in one whose table says
 *    `verbFinal`) and everything else accounted for.
 *    A word left over that the command does not use means `none`.
 *
 * Names (a Path, a Step, an Exercise, a jam, a preset) go to the tool as
 * `query`, as the player wrote them; the app resolves them (`resolve.ts`).
 * Numbers go as typed; the tools snap them.
 *
 * ## A bare number
 *
 * A tempo where a tempo can be set (Metronome, Drill, a jam, a Session
 * between Takes); minutes on Today, where that is the only number that makes
 * sense; "Which one?" with both where both could be meant and both can run;
 * otherwise nothing. A number that cannot be a tempo (under 20, over 300) is
 * not one, and one that cannot be today's minutes (over 60) is not those.
 */
import type { CoachContext } from "../context";
import type { NeverItem } from "../../containers/coach/neverList";
import { ROOT_NAMES } from "../blocks/spec";
import { chordNamePattern } from "../blocks/schema";
import { COACH_TOOLS } from "../tools/registry";
import { perBeatOf } from "../tools/make";
import type { RecipeSubdivision } from "../../paths/custom";
import { line, type CoachTool, type Line, type ToolArgs, type ToolCall, type ToolChoice } from "../tools/types";
import {
  CONNECTOR_IDS,
  NOUN_IDS,
  UNIT_IDS,
  phraseKey,
  type CommandTable,
  type ConnectorId,
  type NounId,
  type UnitId,
  type VerbId,
} from "./commandTable";

// ---------------------------------------------------------------------------
// What the router is told, and what it says
// ---------------------------------------------------------------------------

/** The little the router needs to know about where the player is. Plain data. */
export type CommandFacts = {
  /** The view on screen (`MainView`), or the coach's screen when the view is not known. */
  view: string;
  /** For each player tool, whether its `when(ctx)` says it can run here. */
  possible: Readonly<Record<string, boolean>>;
  /** A tempo can be set here (`set_tempo` can run). */
  tempo: boolean;
  /** Today's minutes are the number that makes sense here (Today, `set_minutes` can run). */
  minutes: boolean;
  /** A Session is on its ready or result screen. */
  betweenTakes: boolean;
};

export type RouteResult =
  | { kind: "call"; call: ToolCall }
  | { kind: "which"; choices: readonly ToolChoice[] }
  | { kind: "yours"; item: NeverItem }
  | { kind: "none"; notHere?: ToolCall };

/**
 * The facts, from the coach's context and the view on screen (`host.view()`;
 * Settings is a view the context reports as Today). Every player tool's
 * `when` is asked once; one that throws counts as "cannot run".
 */
export function commandFacts(ctx: CoachContext, view?: string | null, registry: readonly CoachTool[] = COACH_TOOLS): CommandFacts {
  const possible: Record<string, boolean> = {};
  for (const tool of registry) {
    if (tool.audience !== "player") continue;
    try {
      possible[tool.name] = tool.when(ctx) === true;
    } catch {
      possible[tool.name] = false;
    }
  }
  const at = view ?? ctx.screen;
  const phase = ctx.run?.phase;
  return {
    view: at,
    possible,
    tempo: possible.set_tempo === true,
    minutes: possible.set_minutes === true && at === "today",
    betweenTakes: phase === "ready" || phase === "result",
  };
}

const NONE: RouteResult = { kind: "none" };

/** Where a bare "start" / "play" means today's Session. */
const START_SCREENS = new Set(["today", "paths", "path", "step", "progress"]);

/** A tempo a player types (the tool screens allow 20 to 300). */
const TEMPO_MIN = 20;
const TEMPO_MAX = 300;
/** Today's minutes a bare number may be (the picker has 5 to 20). */
const MINUTES_BARE_MAX = 60;
/** The longest name, in words, the router hands a tool as a `query`. */
const QUERY_WORDS = 6;
const QUERY_CHARS = 80;

// ---------------------------------------------------------------------------
// The table, compiled once
// ---------------------------------------------------------------------------

type Toks = readonly string[];
type Phrases = readonly Toks[];

/** An ordinal place, "第#小节": the tokens before the number and after it. */
type Place = { pre: Toks; post: Toks };

type Compiled = {
  noSpaces: boolean;
  verbFinal: boolean;
  places: { bar: readonly Place[]; step: readonly Place[] };
  verbs: Array<{ id: VerbId; words: Toks }>;
  screens: Array<{ id: string; words: Toks }>;
  sections: Array<{ id: string; words: Toks }>;
  settingKeys: Array<{ id: string; words: Toks }>;
  onOff: Array<{ id: string; words: Toks }>;
  scales: Array<{ id: string; words: Toks }>;
  positions: Array<{ id: string; words: Toks }>;
  swapChoices: Array<{ id: string; words: Toks }>;
  never: Array<{ id: NeverItem; words: Toks }>;
  units: Record<UnitId, Phrases>;
  nouns: Record<NounId, Phrases>;
  connectors: Record<ConnectorId, Phrases>;
  sharp: Phrases;
  flat: Phrases;
  ordinals: Map<string, number>;
  unitWords: Set<string>;
  questions: Phrases;
  notCommand: Phrases;
  polite: Phrases;
  fillers: Phrases;
  /** `make_exercise`'s recipe words (leg t2c), or null: the language types no recipe. */
  recipe: CompiledRecipe | null;
};

type CompiledRecipe = {
  shapes: Array<{ id: string; words: Toks }>;
  chords: Array<{ id: string; words: Toks }>;
  subdivisions: Array<{ id: string; words: Toks }>;
  fret: readonly Place[];
  numberSuffixes: readonly string[];
  /** A root's letter that is also an article (`RecipeWords.article`). */
  article: { words: readonly string[]; rootAfter: Phrases; rootBefore: Phrases };
};

const compiledTables = new WeakMap<CommandTable, Compiled>();

/** Tokens: words with spaces; with no spaces, runs of digits, runs of Latin letters, and single characters. */
function tokenize(text: string, noSpaces: boolean): string[] {
  if (!noSpaces) return text.split(" ").filter((t) => t.length > 0);
  return text.replace(/ /g, "").match(/\d+|[a-z#'-]+|./gu) ?? [];
}

const byLength = (a: { words: Toks } | Toks, b: { words: Toks } | Toks): number =>
  ("words" in b ? b.words : b).length - ("words" in a ? a.words : a).length;

function compile(table: CommandTable): Compiled {
  const hit = compiledTables.get(table);
  if (hit) return hit;
  const ns = table.noSpaces;
  const toks = (p: string): Toks => tokenize(phraseKey(p), ns);
  const phrases = (words: readonly string[] | undefined): Phrases => (words ?? []).map(toks).filter((t) => t.length > 0).sort(byLength);
  const entries = <K extends string>(group: Partial<Record<K, readonly string[]>>): Array<{ id: K; words: Toks }> =>
    (Object.entries(group) as Array<[K, readonly string[] | undefined]>)
      .flatMap(([id, words]) => phrases(words).map((w) => ({ id, words: w })))
      .sort(byLength);
  const record = <K extends string>(ids: readonly K[], group: Partial<Record<K, readonly string[]>>): Record<K, Phrases> =>
    Object.fromEntries(ids.map((id) => [id, phrases(group[id])])) as Record<K, Phrases>;
  const units = record(UNIT_IDS, table.units);
  const places = (words: readonly string[] | undefined): Place[] =>
    (words ?? [])
      .map((w) => phraseKey(w).split("#"))
      .filter((parts) => parts.length === 2)
      .map(([pre, post]) => ({ pre: tokenize(pre.trim(), ns), post: tokenize(post.trim(), ns) }));
  const compiled: Compiled = {
    noSpaces: ns,
    verbFinal: table.verbFinal === true && !ns,
    places: { bar: places(table.ordinalPlaces?.bar), step: places(table.ordinalPlaces?.step) },
    verbs: entries(table.verbs),
    screens: entries(table.screens),
    sections: entries(table.sections),
    settingKeys: entries(table.settingKeys),
    onOff: entries(table.onOff),
    scales: entries(table.scales),
    positions: entries(table.positions),
    swapChoices: entries(table.swapChoices),
    never: entries(table.never),
    units,
    nouns: record(NOUN_IDS, table.nouns),
    connectors: record(CONNECTOR_IDS, table.connectors),
    sharp: phrases(table.roots.sharp),
    flat: phrases(table.roots.flat),
    ordinals: new Map(Object.entries(table.ordinals ?? {}).map(([w, n]) => [phraseKey(w), n])),
    unitWords: new Set(Object.values(units).flatMap((ps) => ps.filter((p) => p.length === 1).map((p) => p[0]))),
    questions: phrases(table.questions),
    notCommand: phrases(table.notCommand),
    polite: phrases(table.polite),
    fillers: phrases(table.fillers),
    recipe: table.recipe
      ? {
          shapes: entries(table.recipe.shapes ?? {}),
          chords: entries(table.recipe.chords ?? {}),
          subdivisions: entries(table.recipe.subdivisions ?? {}),
          fret: places(table.recipe.fret),
          numberSuffixes: (table.recipe.numberSuffixes ?? []).map(phraseKey),
          article: {
            words: (table.recipe.article?.words ?? []).map(phraseKey),
            rootAfter: phrases(table.recipe.article?.rootAfter),
            rootBefore: phrases(table.recipe.article?.rootBefore),
          },
        }
      : null,
  };
  compiledTables.set(table, compiled);
  return compiled;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function startsWith(t: Toks, p: Toks, at = 0): boolean {
  if (p.length === 0 || at + p.length > t.length) return false;
  for (let i = 0; i < p.length; i++) if (t[at + i] !== p[i]) return false;
  return true;
}

function endsWith(t: Toks, p: Toks): boolean {
  return t.length >= p.length && startsWith(t, p, t.length - p.length);
}

function equals(t: Toks, p: Toks): boolean {
  return t.length === p.length && startsWith(t, p);
}

function indexOf(t: Toks, p: Toks): number {
  for (let i = 0; i + p.length <= t.length; i++) if (startsWith(t, p, i)) return i;
  return -1;
}

/** The longest of `phrases` at the start of `t`, or null. */
function lead(t: Toks, phrases: Phrases): Toks | null {
  for (const p of phrases) if (startsWith(t, p)) return p;
  return null;
}

/** `t` without a leading phrase from `phrases`, or null when none leads it. */
function after(t: Toks, phrases: Phrases): Toks | null {
  const p = lead(t, phrases);
  return p ? t.slice(p.length) : null;
}

/** `t` with any one of `phrases` taken off its start, if one is there. */
function skip(t: Toks, phrases: Phrases): Toks {
  return after(t, phrases) ?? t;
}

/** `t` without a trailing phrase from `phrases`, or null. */
function before(t: Toks, phrases: Phrases): Toks | null {
  for (const p of phrases) if (endsWith(t, p)) return t.slice(0, t.length - p.length);
  return null;
}

function exactId<T extends string>(t: Toks, entries: ReadonlyArray<{ id: T; words: Toks }>): T | null {
  for (const e of entries) if (equals(t, e.words)) return e.id;
  return null;
}

function leadId<T extends string>(t: Toks, entries: ReadonlyArray<{ id: T; words: Toks }>): { id: T; rest: Toks } | null {
  for (const e of entries) if (startsWith(t, e.words)) return { id: e.id, rest: t.slice(e.words.length) };
  return null;
}

function contains(t: Toks, phrases: Phrases): boolean {
  return phrases.some((p) => indexOf(t, p) >= 0);
}

function joinToks(t: Toks, c: Compiled): string {
  return t.join(c.noSpaces ? "" : " ");
}

/** A whole number as typed (digits only, at most four). */
function num(token: string | undefined): number | null {
  return token !== undefined && /^\d{1,4}$/.test(token) ? Number(token) : null;
}

// ---------------------------------------------------------------------------
// The text
// ---------------------------------------------------------------------------

type Text = { toks: Toks; question: boolean };

function normalize(text: string, c: Compiled): Text {
  let s = text.normalize("NFKC").toLowerCase().replace(/[’‘`´]/g, "'");
  const question = /[?¿？]/.test(s);
  // A range typed "3-4" or "3–4" is "3 - 4"; a hyphen inside a word ("count-in") stays.
  s = s.replace(/(\d)\s*[-–—]\s*(?=\d)/g, "$1 - ");
  s = s.replace(/[^\p{L}\p{N}\p{M}#'\- ]+/gu, " ").replace(/\s+/g, " ").trim();
  const raw = tokenize(s, c.noSpaces);
  // "80bpm", "15min": a number glued to a unit is two words. Only a unit: "16th" stays one.
  const toks: string[] = [];
  for (const tok of raw) {
    const glued = /^(\d+)(\p{L}+)$/u.exec(tok);
    if (glued && c.unitWords.has(glued[2])) toks.push(glued[1], glued[2]);
    else if (tok !== "'" ) toks.push(tok);
  }
  return { toks, question };
}

function stripPolite(t: Toks, c: Compiled): Toks {
  let out = t;
  for (let moved = true; moved && out.length > 0; ) {
    moved = false;
    const front = after(out, c.polite);
    if (front) {
      out = front;
      moved = true;
    }
    const back = before(out, c.polite);
    if (back) {
      out = back;
      moved = true;
    }
  }
  return out;
}

function isQuestion(t: Toks, c: Compiled): boolean {
  return c.noSpaces ? contains(t, c.questions) : lead(t, c.questions) !== null;
}

function neverItem(t: Toks, c: Compiled): NeverItem | null {
  for (const e of c.never) if (indexOf(t, e.words) >= 0) return e.id;
  return null;
}

// ---------------------------------------------------------------------------
// The calls
// ---------------------------------------------------------------------------

const call = (tool: string, args: ToolArgs = {}): ToolCall => ({ tool, args });

/** A name to hand a tool as `query`: a few words, none of them a number, a unit or a verb. */
function query(t: Toks, c: Compiled): string | null {
  let q = t;
  for (let f = lead(q, c.fillers); f; f = lead(q, c.fillers)) q = q.slice(f.length);
  // "follow me": nothing is named.
  if (q.length === 0) return null;
  // "start a new session" asks for today's Session in words the router does not take; it is not an Exercise's name.
  if (contains(q, c.nouns.session)) return null;
  if (!c.noSpaces && q.length > QUERY_WORDS) return null;
  if (q.some((tok) => num(tok) !== null || tok === "-")) return null;
  if (lead(q, Object.values(c.connectors).flat())) return null;
  for (const v of c.verbs) if (v.id === "slower" || v.id === "faster") if (indexOf(q, v.words) >= 0) return null;
  for (const u of Object.values(c.units)) if (contains(q, u)) return null;
  // "start the metronome" names a screen, not an Exercise.
  if (exactId(q, c.screens) !== null) return null;
  const text = joinToks(q, c);
  // Without spaces, one character left over is the tail of a word, never a name: "開けて" less "開け"
  // is "て", which "はじめての…" contains (review t1b2b, finding 1).
  if (c.noSpaces && Array.from(text).length < 2) return null;
  return text.length > 0 && text.length <= QUERY_CHARS ? text : null;
}

/** Only fillers, or nothing at all. */
function empty(t: Toks, c: Compiled): boolean {
  let q = t;
  for (let f = lead(q, c.fillers); f; f = lead(q, c.fillers)) q = q.slice(f.length);
  return q.length === 0;
}

/** Try `parse` on `t`, then on `t` with one leading filler taken off, and so on. */
function withFillers<R>(t: Toks, c: Compiled, parse: (t: Toks) => R | null): R | null {
  for (let q: Toks | null = t; q; q = after(q, c.fillers)) {
    const r = parse(q);
    if (r !== null) return r;
    if (q.length === 0) break;
  }
  return null;
}

/** A number, and the unit after it if there is one: `[80]`, `[80, bpm]`. */
function numberWithUnit(t: Toks, c: Compiled): { n: number; unit: UnitId | null } | null {
  const n = num(t[0]);
  if (n === null) return null;
  const rest = t.slice(1);
  if (rest.length === 0) return { n, unit: null };
  for (const unit of UNIT_IDS) for (const p of c.units[unit]) if (equals(rest, p)) return { n, unit };
  return null;
}

/** The first ordinal place in `t` ("第7步"): where it starts and ends, and its number. */
function placeAt(t: Toks, places: readonly Place[]): { start: number; end: number; n: number } | null {
  for (let i = 0; i < t.length; i++) {
    for (const p of places) {
      if (p.pre.length > 0 && !startsWith(t, p.pre, i)) continue;
      const n = num(t[i + p.pre.length]);
      if (n === null || n < 1) continue;
      const end = i + p.pre.length + 1;
      if (p.post.length > 0 && !startsWith(t, p.post, end)) continue;
      return { start: i, end: end + p.post.length, n };
    }
  }
  return null;
}

/** "3", "3 to 4", "3 - 4", "the first", "第3小节": a range of bars. */
function barRange(t: Toks, c: Compiled): { from: number; to?: number } | null {
  let q = skip(t, c.fillers);
  const place = placeAt(q, c.places.bar);
  if (place && place.start === 0 && place.end === q.length) return { from: place.n };
  const ordinal = q.length > 0 ? c.ordinals.get(q[0]) : undefined;
  if (ordinal !== undefined) {
    const rest = after(q.slice(1), c.units.bar);
    return rest && rest.length === 0 ? { from: ordinal } : null;
  }
  q = skip(q, c.units.bar);
  const from = num(q[0]);
  if (from === null || from < 1) return null;
  if (q.length === 1) return { from };
  const tail = after(q.slice(1), c.connectors.to);
  const to = tail && tail.length === 1 ? num(tail[0]) : null;
  if (to === null || to < from) return null;
  return { from, to };
}

/** "step 7", "step 7 of alternate picking", "alternate picking step 7": a Step, and its Path's words. */
function stepPlace(t: Toks, c: Compiled): { step: number; path?: string } | null {
  let n: number | null;
  let head: Toks;
  let tail: Toks;
  const place = placeAt(t, c.places.step);
  if (place) {
    // "第7步", "7단계": the number inside an ordinal place.
    n = place.n;
    head = t.slice(0, place.start);
    tail = t.slice(place.end);
  } else {
    const i = t.findIndex((_, k) => c.units.step.some((p) => startsWith(t, p, k)));
    if (i < 0) return null;
    const stepLen = (c.units.step.find((p) => startsWith(t, p, i)) ?? []).length;
    n = num(t[i + stepLen]);
    if (n === null || n < 1) return null;
    head = t.slice(0, i);
    tail = t.slice(i + stepLen + 1);
  }
  if (head.length === 0 && tail.length === 0) return { step: n };
  if (head.length > 0 && tail.length === 0) {
    const path = query(skip(head, c.nouns.path), c);
    return path ? { step: n, path } : null;
  }
  if (head.length === 0) {
    const of = after(tail, c.connectors.of);
    const path = of ? query(skip(of, c.nouns.path), c) : null;
    return path ? { step: n, path } : null;
  }
  return null;
}

function bareNumber(n: number, f: CommandFacts): RouteResult {
  const tempo = f.tempo && n >= TEMPO_MIN && n <= TEMPO_MAX;
  const minutes = f.minutes && n >= 1 && n <= MINUTES_BARE_MAX;
  if (tempo && minutes) return which([call("set_tempo", { bpm: n }), call("set_minutes", { minutes: n })], f);
  if (tempo) return { kind: "call", call: call("set_tempo", { bpm: n }) };
  if (minutes) return { kind: "call", call: call("set_minutes", { minutes: n }) };
  return NONE;
}

/** A number with its unit, as the tool the unit names. */
function unitCall(n: number, unit: UnitId | null): ToolCall | null {
  switch (unit) {
    case "bpm":
      return call("set_tempo", { bpm: n });
    case "minutes":
      return call("set_minutes", { minutes: n });
    case "clicks":
      return n >= 1 && n <= 6 ? call("click_subdivision", { subdivision: n }) : null;
    case "step":
    case "bar":
    case "part":
    case null:
      return null;
  }
}

/** "theme velvet", "count in on", "band volume 80": a safe setting and its value. */
function settingCall(t: Toks, c: Compiled): ToolCall | null {
  const key = leadId(t, c.settingKeys);
  if (!key) return null;
  const rest = skip(key.rest, c.connectors.to);
  if (rest.length === 0) return null;
  switch (key.id) {
    case "countIn":
    case "coachVoice":
    case "coachSuggestions": {
      const value = exactId(rest, c.onOff);
      return value ? call("set_setting", { key: key.id, value }) : null;
    }
    case "bandVolume": {
      const n = rest.length === 1 ? num(rest[0]) : null;
      return n !== null && n <= 150 ? call("set_setting", { key: key.id, value: String(n) }) : null;
    }
    default: {
      if (!c.noSpaces && rest.length > 3) return null;
      const value = query(rest, c);
      return value ? call("set_setting", { key: key.id, value }) : null;
    }
  }
}

/** "settings", "practice settings", "settings practice", "settings · coach". */
function settingsCall(t: Toks, c: Compiled): ToolCall | null {
  const settings = c.screens.filter((s) => s.id === "settings").map((s) => s.words);
  const tail = after(t, settings);
  const head = before(t, settings);
  const section = tail !== null ? skip(tail, [...c.connectors.of, ...c.fillers]) : head !== null ? head : null;
  if (section === null) return null;
  const named = skip(section, c.fillers);
  if (named.length === 0) return call("go_to", { screen: "settings" });
  const id = exactId(named, c.sections);
  return id ? call("open_settings", { section: id }) : null;
}

/** A screen by its name alone: "paths", "the metronome", "settings". */
function screenCall(t: Toks, c: Compiled): ToolCall | null {
  const settings = settingsCall(t, c);
  if (settings) return settings;
  const id = exactId(skip(t, c.fillers), c.screens);
  return id ? call("go_to", { screen: id }) : null;
}

/** "a minor pentatonic", "c sharp dorian root on 5", "the a blues scale". */
function scaleCall(t: Toks, c: Compiled): ToolCall | null {
  const root = rootAt(t, c);
  if (!root) return null;
  const scale = leadId(root.rest, c.scales);
  if (!scale) return null;
  const rest = skip(scale.rest, c.nouns.scale);
  const args: Record<string, string> = { root: root.name, scale: scale.id };
  if (rest.length > 0) {
    const position = leadId(skip(rest, [...c.connectors.of, ...c.fillers]), c.positions);
    if (!position || position.rest.length > 0) return null;
    args.position = position.id;
  }
  return call("show_scale", args);
}

/** A root note: a letter, then "#", "b", "sharp" or "flat". */
function rootAt(t: Toks, c: Compiled): { name: string; rest: Toks } | null {
  const first = t[0];
  if (!first) return null;
  const letter = /^([a-g])(#|b)?$/.exec(first);
  if (!letter) return null;
  let name = letter[1].toUpperCase() + (letter[2] ?? "");
  let rest: Toks = t.slice(1);
  if (!letter[2]) {
    const sharp = after(rest, c.sharp);
    const flat = sharp ? null : after(rest, c.flat);
    if (sharp) {
      name += "#";
      rest = sharp;
    } else if (flat) {
      name += "b";
      rest = flat;
    }
  }
  return ROOT_NAMES.includes(name) ? { name, rest } : null;
}

let chordPattern: RegExp | null = null;

/** "chord am7", "the c#m7 chord", "am7": a chord the app can draw. A lone root needs the word "chord". */
function chordCall(t: Toks, c: Compiled): ToolCall | null {
  const named = after(t, c.nouns.chord) ?? before(t, c.nouns.chord);
  const body = named ?? t;
  if (body.length !== 1) return null;
  const tok = body[0];
  const name = tok.charAt(0).toUpperCase() + tok.slice(1);
  chordPattern ??= new RegExp(chordNamePattern());
  if (!chordPattern.test(name)) return null;
  if (named === null && ROOT_NAMES.includes(name)) return null;
  return call("show_chord", { chord: name });
}

// ---------------------------------------------------------------------------
// The verbs
// ---------------------------------------------------------------------------

function verbAt(t: Toks, c: Compiled): { id: VerbId; rest: Toks } | null {
  if (!c.noSpaces) {
    const first = leadId(t, c.verbs);
    if (first || !c.verbFinal) return first;
    // A language that puts the verb last ("pfade öffnen", "yolları aç"): a verb that ends the text.
    for (const v of c.verbs) if (t.length > v.words.length && endsWith(t, v.words)) return { id: v.id, rest: t.slice(0, t.length - v.words.length) };
    return null;
  }
  // Without spaces the verb may sit anywhere (Japanese and Korean put it last).
  // What is left keeps its particles in the middle; the ones at either end are dropped ("パスを" → "パス").
  for (const v of c.verbs) {
    const i = indexOf(t, v.words);
    if (i < 0) continue;
    let rest: Toks = [...t.slice(0, i), ...t.slice(i + v.words.length)];
    for (let back = before(rest, c.fillers); back; back = before(rest, c.fillers)) rest = back;
    return { id: v.id, rest };
  }
  return null;
}

type Parsed = readonly ToolCall[] | RouteResult | null;

function parseVerb(id: VerbId, rest: Toks, c: Compiled, f: CommandFacts): Parsed {
  switch (id) {
    case "open": {
      if (rest.length === 0) return null;
      const screen = screenCall(rest, c);
      if (screen) return [screen];
      const step = stepPlace(skip(rest, c.fillers), c);
      if (step) return [call("open_step", step.path ? { path: step.path, step: step.step } : { step: step.step })];
      const named = after(skip(rest, c.fillers), c.nouns.path) ?? before(rest, c.nouns.path) ?? rest;
      const path = query(named, c);
      return path ? [call("open_path", { path })] : null;
    }
    case "start": {
      const q = skip(rest, c.fillers);
      if (q.length === 0) return START_SCREENS.has(f.view) ? [call("start_today")] : null;
      // "start today", "start today's session at part 3", "start at 3", "start part 3".
      const session = after(q, c.nouns.session);
      const at = startAt(session ?? q, c);
      if (session !== null && session.length === 0) return [call("start_today")];
      if (at !== null) return [call("start_today", { at })];
      if (session !== null) return null;
      // "play outside picking", "play outside picking at 80".
      const exercise = skip(q, c.nouns.exercise);
      const atIndex = exercise.findIndex((_tok, k) => c.connectors.at.some((p) => startsWith(exercise, p, k)) && num(exercise[k + 1]) !== null);
      if (atIndex > 0) {
        const tempo = numberWithUnit(exercise.slice(atIndex + 1), c);
        const name = query(exercise.slice(0, atIndex), c);
        if (!tempo || (tempo.unit !== null && tempo.unit !== "bpm") || !name) return null;
        return [call("play_exercise", { exercise: name, bpm: tempo.n })];
      }
      const name = query(exercise, c);
      return name ? [call("play_exercise", { exercise: name })] : null;
    }
    case "slower":
    case "faster":
      return empty(rest, c) ? [call("set_tempo", { direction: id })] : null;
    case "loop": {
      const range = barRange(rest, c);
      return range ? [call("loop_bars", range)] : null;
    }
    case "show": {
      return withFillers(rest, c, (q) => {
        const bars = after(q, c.units.bar);
        if (bars) {
          const range = barRange(bars, c);
          return range ? [call("show_bars", range)] : null;
        }
        const scale = scaleCall(q, c);
        if (scale) return [scale];
        const chord = chordCall(q, c);
        return chord ? [chord] : null;
      });
    }
    case "follow": {
      const named = after(skip(rest, c.fillers), c.nouns.path) ?? before(rest, c.nouns.path) ?? rest;
      const path = query(named, c);
      return path ? [call("follow_path", { path })] : null;
    }
    case "load": {
      const q = skip(rest, c.fillers);
      const jam = after(q, c.nouns.jam) ?? before(q, c.nouns.jam);
      if (jam) {
        const name = query(jam, c);
        return name ? [call("load_jam", { jam: name })] : null;
      }
      const preset = after(q, c.nouns.preset) ?? before(q, c.nouns.preset);
      if (preset) {
        const name = query(preset, c);
        return name ? [call("load_preset", { preset: name })] : null;
      }
      const name = query(q, c);
      return name ? [call("load_jam", { jam: name }), call("load_preset", { preset: name })] : null;
    }
    case "set":
      return parseSet(skip(rest, c.fillers), c, f);
    case "focus": {
      const q = skip(skip(rest, c.connectors.of), c.fillers);
      if (q.length === 0) return null;
      if (c.nouns.mix.some((p) => equals(q, p))) return [call("set_focus")];
      const path = query(skip(q, c.nouns.path), c);
      return path ? [call("set_focus", { path })] : null;
    }
    case "swap": {
      const q = skip(skip(rest, c.fillers), c.units.part);
      const at = num(q[0]);
      if (at === null || at < 1) return null;
      const tail = skip(skip(q.slice(1), c.connectors.for), c.fillers);
      if (tail.length === 0) return SWAP_ORDER.map((choice) => call("swap_part", { at, choice }));
      const choice = exactId(tail, c.swapChoices);
      return choice ? [call("swap_part", { at, choice })] : null;
    }
    case "findEdge": {
      const name = query(skip(skip(rest, c.connectors.of), c.nouns.exercise), c);
      return name ? [call("find_edge", { exercise: name })] : null;
    }
    case "testOut": {
      const q = skip(skip(rest, c.connectors.of), c.fillers);
      const step = stepPlace(q, c);
      if (step) return [call("test_out", step.path ? { path: step.path, step: step.step } : { step: step.step })];
      const name = query(q, c);
      return name ? [call("test_out", { query: name })] : null;
    }
    case "explain": {
      const q = skip(rest, c.fillers);
      return q.length === 0 || c.nouns.screen.some((p) => equals(q, p)) ? [call("explain_screen")] : null;
    }
    case "make": {
      const made = recipeCall(rest, c, true);
      return made ? [made] : null;
    }
  }
}

// ---------------------------------------------------------------------------
// A recipe (leg t2c): "a minor pentatonic eighths 5th fret"
// ---------------------------------------------------------------------------

/** The most a typed position may be (`make_exercise`'s `position`). */
const MAX_RECIPE_FRET = 15;
const MAX_RECIPE_BARS = 8;

/** A number, or one written as an ordinal ("5th") with the table's suffixes. */
function ordinalNum(token: string | undefined, r: CompiledRecipe): number | null {
  const n = num(token);
  if (n !== null || token === undefined) return n;
  const m = /^(\d{1,4})(\p{L}+)$/u.exec(token);
  return m && r.numberSuffixes.includes(m[2]) ? Number(m[1]) : null;
}

/** "fret 5", "5th fret", "position 5" at the start of `t`: the fret and what follows. */
function fretAt(t: Toks, r: CompiledRecipe): { n: number; rest: Toks } | null {
  for (const p of r.fret) {
    if (p.pre.length > 0 && !startsWith(t, p.pre)) continue;
    const n = ordinalNum(t[p.pre.length], r);
    if (n === null) continue;
    const end = p.pre.length + 1;
    if (p.post.length > 0 && !startsWith(t, p.post, end)) continue;
    return { n, rest: t.slice(end + p.post.length) };
  }
  return null;
}

/**
 * The text read as a recipe, every word accounted for: a root and its scale
 * (or, with an arpeggio word, its chord), a shape, a subdivision, the fret it starts at, a number of bars, the word "exercise", and fillers
 * and connectors between them. `reading` says whether the words after the root
 * are a scale or a chord ("a minor" is both).
 */
function recipeAs(t: Toks, c: Compiled, r: CompiledRecipe, reading: "scale" | "chord", made: boolean): ToolCall | null {
  const args: Record<string, string | number> = {};
  // Without a verb, a recipe needs a word only an exercise has: "a minor pentatonic" alone is a scale, not a
  // request. A shape or a fret is not one (review t2c, finding 1): "a minor pentatonic box", "… at the 5th
  // fret" are what a player types to SEE a scale. A subdivision, a number of bars or "exercise" is.
  let exerciseWord = made;
  // The scale or chord was named with no key ("make a blues exercise"): the tool asks which (`why.make.root`).
  let keyless = false;
  // "a" was read as A only because a quality word followed it ("make a minor pentatonic exercise"):
  // a key the player names at the end ("… in e") is plainer, and wins (review t2cb, LOW 2).
  let guessed = false;
  const once = (name: string, value: string | number): boolean => {
    if (name in args) return false;
    args[name] = value;
    return true;
  };
  const glue = [...c.fillers, ...c.connectors.at, ...c.connectors.of, ...c.connectors.for];
  const musicOf = reading === "scale" ? c.scales : r.chords;
  let q = t;
  while (q.length > 0) {
    if (args.root === undefined && !keyless) {
      const root = rootAt(q, c);
      const music = root ? leadId(root.rest, musicOf) : null;
      // "a chromatic exercise": the shape with no key, not A's chromatic scale.
      if (root && music && music.id !== "chromatic") {
        const read = articleOrRoot(t, q, root.rest, c, r, musicOf);
        if (read === "root" || read === "guess") {
          args.root = root.name;
          guessed = read === "guess";
          args[reading] = music.id;
          q = skip(music.rest, c.nouns.scale);
          continue;
        }
        if (read === "keyless") {
          keyless = true;
          args[reading] = music.id;
          q = skip(music.rest, c.nouns.scale);
          continue;
        }
        // The article before a root that follows ("make a c major exercise"): a filler, below.
      }
    }
    const key = keyless || guessed ? trailingKey(q, c, r) : null;
    if (key) {
      args.root = key;
      keyless = guessed = false;
      q = [];
      continue;
    }
    const shape = leadId(q, r.shapes);
    if (shape) {
      if (!once("shape", shape.id)) return null;
      q = shape.rest;
      continue;
    }
    const sub = leadId(q, r.subdivisions);
    if (sub) {
      // The tool takes notes per beat (1 quarters … 4 sixteenths).
      if (!once("subdivision", perBeatOf(sub.id as RecipeSubdivision))) return null;
      exerciseWord = true;
      q = sub.rest;
      continue;
    }
    const fret = fretAt(q, r);
    if (fret) {
      if (fret.n > MAX_RECIPE_FRET || !once("position", fret.n)) return null;
      q = fret.rest;
      continue;
    }
    const bars = num(q[0]);
    const barsRest = bars === null ? null : after(q.slice(1), c.units.bar);
    if (bars !== null && barsRest) {
      if (bars < 1 || bars > MAX_RECIPE_BARS || !once("bars", bars)) return null;
      exerciseWord = true;
      q = barsRest;
      continue;
    }
    const noun = after(q, c.nouns.exercise);
    if (noun) {
      exerciseWord = true;
      q = noun;
      continue;
    }
    const filler = after(q, glue);
    if (filler) {
      q = filler;
      continue;
    }
    return null;
  }
  if (!exerciseWord) return null;
  // The chord reading is only an arpeggio's; the scale reading never is.
  if (reading === "chord" ? args.shape !== "arpeggio" || args.chord === undefined : args.shape === "arpeggio") return null;
  // Something to make: a root and its scale or chord, or the one shape with no key. A bare shape, or a
  // scale or chord with no key, is the tool's to ask about.
  if (args.root === undefined && args.shape !== "chromatic" && !keyless && !(made && args.shape !== undefined)) return null;
  return call("make_exercise", args);
}

/**
 * The token at the head of `q` is a root's letter followed by a scale or chord
 * name: is it that root, the article before a root still to come, or the
 * article with no key said at all? Only a letter in `article.words` ("a") is
 * ever anything but the root.
 */
function articleOrRoot(t: Toks, q: Toks, afterRoot: Toks, c: Compiled, r: CompiledRecipe, musicOf: Compiled["scales"]): "root" | "guess" | "article" | "keyless" {
  const a = r.article;
  // "a#", "ab", "a sharp", "a flat": a root, never an article.
  if (!a.words.includes(q[0]) || afterRoot.length !== q.length - 1) return "root";
  const before = t.slice(0, t.length - q.length);
  if (a.rootAfter.some((p) => endsWith(before, p))) return "root";
  // "a minor pentatonic": read as A, unless the line names its key at the end (`trailingKey`).
  if (a.rootBefore.some((p) => startsWith(afterRoot, p))) return "guess";
  for (let i = 1; i < q.length; i++) {
    const later = rootAt(q.slice(i), c);
    if (later && leadId(later.rest, musicOf)) return "article";
  }
  return "keyless";
}

/**
 * A key named after the scale, as the line's last words ("make a blues exercise in e"): one of
 * `article.rootAfter` that is also a connector ("in"), then a root and nothing after it. A table
 * with no article has none (review t2cb, LOW 2).
 */
function trailingKey(q: Toks, c: Compiled, r: CompiledRecipe): string | null {
  const connectors = [...c.connectors.at, ...c.connectors.of, ...c.connectors.for].map((p) => p.join(" "));
  const lead = r.article.rootAfter.filter((p) => connectors.includes(p.join(" ")));
  const rest = lead.length > 0 ? after(q, lead) : null;
  const root = rest ? rootAt(rest, c) : null;
  return root && root.rest.length === 0 ? root.name : null;
}

/** The recipe the words are, or null (not a recipe, or not in this language's table). */
function recipeCall(t: Toks, c: Compiled, made: boolean): ToolCall | null {
  if (!c.recipe || t.length === 0) return null;
  return recipeAs(t, c, c.recipe, "scale", made) ?? recipeAs(t, c, c.recipe, "chord", made);
}

const SWAP_ORDER = ["harder", "different", "style"] as const;

/** "at 3", "at part 3", "part 3", "from 3": the part of today's plan to start at. */
function startAt(t: Toks, c: Compiled): number | null {
  const q = skip(skip(t, c.connectors.at), c.units.part);
  const n = q.length === 1 ? num(q[0]) : null;
  return n !== null && n >= 1 && n <= MAX_START_PART ? n : null;
}

/** `start_today`'s `at` (the tool's `MAX_PART`). */
const MAX_START_PART = 20;

function parseSet(t: Toks, c: Compiled, f: CommandFacts): Parsed {
  if (t.length === 0) return null;
  // "set 80", "set 80 bpm", "set 15 minutes", "set 2 clicks".
  const counted = numberWithUnit(t, c);
  if (counted) {
    if (counted.unit === null) return bareNumber(counted.n, f);
    const made = unitCall(counted.n, counted.unit);
    return made ? [made] : null;
  }
  // "set the tempo to 80".
  const tempo = after(t, c.nouns.tempo);
  if (tempo) {
    const n = numberWithUnit(skip(tempo, c.connectors.to), c);
    return n && (n.unit === null || n.unit === "bpm") ? [call("set_tempo", { bpm: n.n })] : null;
  }
  // "set minutes to 15", "set clicks to 2".
  for (const unit of ["minutes", "clicks"] as const) {
    const rest = after(t, c.units[unit]);
    if (rest) {
      const n = skip(rest, c.connectors.to);
      const made = n.length === 1 && num(n[0]) !== null ? unitCall(num(n[0])!, unit) : null;
      return made ? [made] : null;
    }
  }
  // "set my goal to play the solo at 120".
  const goal = after(t, c.nouns.goal);
  if (goal) {
    const text = skip(goal, c.connectors.to);
    return text.length > 0 ? [call("set_goal", { text: joinToks(text, c) })] : null;
  }
  const setting = settingCall(t, c);
  return setting ? [setting] : null;
}

/** The forms with no verb: "80", "80 bpm", "15 minutes", "step 7", "paths", "theme velvet". */
function parseBare(t: Toks, c: Compiled, f: CommandFacts): Parsed {
  const counted = numberWithUnit(t, c);
  if (counted) {
    if (counted.unit === null) return bareNumber(counted.n, f);
    const made = unitCall(counted.n, counted.unit);
    if (made) return [made];
    // "7. Schritt": a number and a place's unit may be an ordinal place (leg t1b2b); a count is nothing.
    // Not without spaces: there a number glued to its unit ("3단계") is a count as often as a place, so
    // only a verb makes it one ("3단계 열어줘"; review t1b2b, finding 6).
    if (c.noSpaces) return null;
    const step = stepPlace(t, c);
    return step ? [call("open_step", step.path ? { path: step.path, step: step.step } : { step: step.step })] : null;
  }
  const tempo = after(t, c.nouns.tempo);
  if (tempo) {
    const n = numberWithUnit(skip(tempo, c.connectors.to), c);
    return n && (n.unit === null || n.unit === "bpm") ? [call("set_tempo", { bpm: n.n })] : null;
  }
  const step = stepPlace(t, c);
  if (step) return [call("open_step", step.path ? { path: step.path, step: step.step } : { step: step.step })];
  const screen = screenCall(t, c);
  if (screen) return [screen];
  const setting = settingCall(t, c);
  if (setting) return [setting];
  // "a minor pentatonic eighths 5th fret" (leg t2c): a recipe with no verb, every word a recipe's.
  const recipe = recipeCall(t, c, false);
  return recipe ? [recipe] : null;
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/**
 * A "Which one?" chip's words. Tempo reuses `coachTools.choice.rung`; the
 * others are `coachTools.command.*`, keys leg t1b2b adds in fifteen locales
 * with the wiring (nothing shows them before then).
 */
function labelOf(c: ToolCall): Line {
  const a = c.args;
  switch (c.tool) {
    case "set_tempo":
      return line("coachTools.choice.rung", { bpm: a.bpm ?? "" });
    case "set_minutes":
      return line("coachTools.command.minutes", { minutes: a.minutes ?? "" });
    case "load_jam":
      return line("coachTools.command.jam", { jam: a.jam ?? "" });
    case "load_preset":
      return line("coachTools.command.preset", { preset: a.preset ?? "" });
    case "open_path":
      return line("coachTools.choice.path", { path: a.path ?? "" });
    case "open_step":
      return line("coachTools.chip.openStep", { path: a.path ?? "", step: a.step ?? "" });
    case "swap_part":
      return line(
        a.choice === "harder" ? "coachTools.command.swapHarder" : a.choice === "different" ? "coachTools.command.swapDifferent" : "coachTools.command.swapStyle",
        { part: a.at ?? "" },
      );
    default:
      return line("coachTools.command.other", { tool: c.tool });
  }
}

/** Several calls: only the ones that can run here are offered. */
function which(calls: readonly ToolCall[], f: CommandFacts): RouteResult {
  const here = calls.filter((x) => f.possible[x.tool] === true);
  if (here.length >= 2) return { kind: "which", choices: here.map((x) => ({ label: labelOf(x), call: x })) };
  if (here.length === 1) return { kind: "call", call: here[0] };
  return calls.length > 0 ? { kind: "none", notHere: calls[0] } : NONE;
}

function settle(parsed: Parsed, f: CommandFacts): RouteResult {
  if (parsed === null) return NONE;
  if ("kind" in parsed) return parsed;
  const calls: readonly ToolCall[] = parsed;
  if (calls.length === 0) return NONE;
  if (calls.length === 1) return f.possible[calls[0].tool] === true ? { kind: "call", call: calls[0] } : { kind: "none", notHere: calls[0] };
  return which(calls, f);
}

/**
 * Without spaces, a name is whatever characters the verb left over, and a
 * leftover that happens to sit inside a real title resolves ("コース開ける"
 * once opened "ネックを知る" on its "る"). So there a `go` tool that would
 * navigate to a thing by such a name is never run at once: it is one choice,
 * "Which one?", a press (review t1b2b, finding 1). Screens and sections are
 * closed words, not leftovers, and still go at once.
 */
function pressNamedGo(r: RouteResult, c: Compiled): RouteResult {
  if (!c.noSpaces || r.kind !== "call") return r;
  const tool = COACH_TOOLS.find((x) => x.name === r.call.tool);
  if (tool?.kind !== "go" || !NAME_ARGS.some((k) => typeof r.call.args[k] === "string")) return r;
  return { kind: "which", choices: [{ label: labelOf(r.call), call: r.call }] };
}

/** The arguments a tool resolves by title from the player's words (`resolve.ts`). */
const NAME_ARGS = ["path", "query", "exercise", "jam", "preset"] as const;

/**
 * What the player typed, as a tool call, "Which one?", "that one is yours",
 * or not a command. Pure; see the file's head for the order of the checks.
 */
export function routeCommand(text: string, table: CommandTable, facts: CommandFacts): RouteResult {
  const c = compile(table);
  const typed = normalize(text, c);
  if (typed.question) return NONE;
  const t = stripPolite(typed.toks, c);
  if (t.length === 0) return NONE;
  if (isQuestion(t, c)) return NONE;
  if (contains(t, c.notCommand)) return NONE;
  const never = neverItem(t, c);
  if (never) return { kind: "yours", item: never };
  // "a bit faster": a filler may come before the verb.
  const verb = verbAt(t, c) ?? verbAt(skip(t, c.fillers), c);
  if (verb) return pressNamedGo(settle(parseVerb(verb.id, verb.rest, c, facts), facts), c);
  return pressNamedGo(settle(parseBare(t, c, facts), facts), c);
}
