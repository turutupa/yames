/**
 * The help set (DESIGN 5.3, the "The app" row; leg c2cb): what each screen is
 * for and what the app's written words mean, in a few sentences each, written
 * from what the code does. The words are in `src/locales/<lng>/help.json`
 * (`help.entry.<id>`); this file holds which entries there are, which screens
 * each belongs to, and the English question shapes that reach them.
 *
 * Three ways in:
 * - `explain_screen` (a `read` tool, a chip in Ask's empty state, or typed in
 *   any language through the command router) answers with the entry for the
 *   screen the player is on (`helpForScreen`): every screen has one, and the
 *   types say so (`SCREEN_HELP`, `SESSION_HELP`);
 * - typed English (`helpMatch.ts` `matchHelp`), after the router and the fact cards and
 *   before search, as the cards match: only a clear question about one screen
 *   or one word;
 * - nothing else. A number about the player is never in an entry: the cards
 *   say those (c2b2a's computed terms: "what does 85% mean", "my clean tempo").
 *
 * Tuning (the owner's decision 9): the app has no tuner, so the coach says
 * nothing about tuning. A typed English question about it (`helpMatch.ts` `asksAboutTuning`)
 * gets one plain sentence saying so, before any card, help entry or Path
 * passage could answer it with something that happens to mention tuning.
 *
 * Pure: no React, no store, no i18n.
 */
import type { CoachContext, CoachScreen } from "../context";
import type { RunPhase } from "../../session/runner";
import { line, type Line, type ToolResult } from "../tools/types";
import type { FactCard } from "./cards";

/** One help entry per screen, the Session's by what it is showing. */
export type HelpScreenId =
  | "today"
  | "paths"
  | "path"
  | "step"
  | "sessionReady"
  | "sessionTake"
  | "sessionResult"
  | "sessionTimed"
  | "sessionRecap"
  | "progress"
  | "tools"
  | "metronome"
  | "drill"
  | "setlist"
  | "jam"
  | "songs"
  | "settings"
  | "modelSelector"
  | "ask";

/** The app's own written words (the computed ones are c2b2a's cards). */
export type HelpWordId =
  | "take"
  | "step"
  | "level"
  | "rung"
  | "passMark"
  | "cleanTempo"
  | "review"
  | "parked"
  | "benchmark"
  | "grading"
  | "notFair"
  | "listen"
  | "toolRuns"
  | "myExercises"
  | "notebook"
  | "variant"
  | "countIn"
  | "loop"
  | "testOut"
  | "warmUp";

export type HelpId = `screen.${HelpScreenId}` | `word.${HelpWordId}`;

/** Where a help entry is the player's question: the screens it is about or used on. */
export type HelpPlace = CoachScreen | "settings" | "modelSelector";

export type HelpEntry = {
  id: HelpId;
  /** The screens this entry is about (a screen's) or appears on (a word's). */
  places: readonly HelpPlace[];
  /**
   * The words a typed English question names it by, as regex alternatives
   * over `normalizeQuestion`'s text (lower case, no punctuation).
   */
  names: string;
  /** A screen's name may only be a page's ("the step page"): a bare "step" is the word. */
  suffixNeeded?: true;
};

const ALL_LEARNING: readonly HelpPlace[] = ["today", "paths", "path", "step", "session", "progress"];
const ALL_TOOLS: readonly HelpPlace[] = ["tools", "beat", "drill", "setlist", "jam", "songs"];

/** Every entry, screens first. `help.json` has `help.entry.<id>` for each, in fifteen languages. */
export const HELP: readonly HelpEntry[] = [
  { id: "screen.today", places: ["today"], names: "today|home" },
  { id: "screen.paths", places: ["paths"], names: "paths|paths list|list of paths" },
  { id: "screen.path", places: ["path"], names: "path|path s", suffixNeeded: true },
  { id: "screen.step", places: ["step"], names: "step|step s", suffixNeeded: true },
  { id: "screen.sessionReady", places: ["session"], names: "ready|session ready|session|practice session", suffixNeeded: true },
  { id: "screen.sessionTake", places: ["session"], names: "take|recording|playing", suffixNeeded: true },
  { id: "screen.sessionResult", places: ["session"], names: "result|results|score|take result", suffixNeeded: true },
  { id: "screen.sessionTimed", places: ["session"], names: "warm ?up|finisher|timed step", suffixNeeded: true },
  { id: "screen.sessionRecap", places: ["session"], names: "recap|session recap|session summary" },
  { id: "screen.progress", places: ["progress"], names: "progress" },
  { id: "screen.tools", places: ["tools"], names: "tools|tools hub" },
  { id: "screen.metronome", places: ["beat"], names: "metronome|beat|click" },
  { id: "screen.drill", places: ["drill"], names: "drill|drills|speed ramp|speed trainer" },
  { id: "screen.setlist", places: ["setlist"], names: "setlist|set list|setlists" },
  { id: "screen.jam", places: ["jam"], names: "jam|jams|backing band|band" },
  { id: "screen.songs", places: ["songs"], names: "songs|song|song library" },
  { id: "screen.settings", places: ["settings"], names: "settings|preferences|options" },
  {
    id: "screen.modelSelector",
    places: ["settings", "modelSelector"],
    names: "model selector|model picker|model menu|model choice|models|model|coach model|local model|brain",
  },
  { id: "screen.ask", places: [...ALL_LEARNING, ...ALL_TOOLS], names: "ask|ask panel|coach|coach panel|chat" },
  { id: "word.take", places: ["session", "songs", "progress"], names: "takes?" },
  { id: "word.step", places: ["paths", "path", "step", "session"], names: "steps?" },
  { id: "word.level", places: ["paths", "path"], names: "levels?" },
  { id: "word.rung", places: ["path", "step", "session", "progress"], names: "rungs?|ladder|tempo ladder" },
  { id: "word.passMark", places: ["step", "session"], names: "pass marks?|passing marks?" },
  { id: "word.cleanTempo", places: ["step", "session", "progress"], names: "clean tempos?" },
  { id: "word.review", places: ["today", "progress", "session"], names: "reviews?|spaced review|due|comes back|coming back" },
  { id: "word.parked", places: ["today", "progress", "session"], names: "parked|parking|park" },
  { id: "word.benchmark", places: ["path", "step", "progress"], names: "benchmarks?" },
  { id: "word.grading", places: ["session", "settings"], names: "grading|graded|ungraded|grades?|without grading|grading off|grading on" },
  { id: "word.notFair", places: ["session", "progress"], names: "not fair|marked not fair|mark(ed)? (it |this |a take |the take )?(as )?not fair|marking a take not fair" },
  { id: "word.listen", places: ["beat", "drill", "setlist"], names: "listen|listen switch|listen button|listening" },
  { id: "word.toolRuns", places: ["progress"], names: "tool runs?|tools runs?" },
  { id: "word.myExercises", places: ["paths"], names: "my exercises|my own exercises|own exercises" },
  { id: "word.notebook", places: [...ALL_LEARNING, ...ALL_TOOLS], names: "notebook|the notebook|notebook tab" },
  { id: "word.variant", places: ["session", "step"], names: "variants?|variations?" },
  { id: "word.countIn", places: ["session", "beat", "drill"], names: "count ?ins?|counting in" },
  { id: "word.loop", places: ["session"], names: "loop|loops|looping|loop a bar|loop bars" },
  { id: "word.testOut", places: ["step", "path"], names: "test out|testing out|test outs" },
  { id: "word.warmUp", places: ["session"], names: "warm ?ups?|finishers?" },
];

const BY_ID: ReadonlyMap<HelpId, HelpEntry> = new Map(HELP.map((e) => [e.id, e]));

/** The entry, or undefined for an id that is not one. */
export function helpEntry(id: string): HelpEntry | undefined {
  return BY_ID.get(id as HelpId);
}

/** The key of an entry's words in `help.json`. */
export function helpKey(id: HelpId): string {
  return `help.entry.${id}`;
}

/** The entry for each screen outside a Session. A new screen without one does not compile. */
const SCREEN_HELP: Readonly<Record<Exclude<CoachScreen, "session">, HelpId>> = {
  today: "screen.today",
  paths: "screen.paths",
  path: "screen.path",
  step: "screen.step",
  progress: "screen.progress",
  tools: "screen.tools",
  beat: "screen.metronome",
  drill: "screen.drill",
  setlist: "screen.setlist",
  jam: "screen.jam",
  songs: "screen.songs",
};

/** The Session's entry by what it is showing. A new phase without one does not compile. */
const SESSION_HELP: Readonly<Record<RunPhase, HelpId>> = {
  idle: "screen.sessionReady",
  ready: "screen.sessionReady",
  // A loop is running, not the ready screen (leg c2cc, review L4).
  looping: "word.loop",
  playing: "screen.sessionTake",
  listening: "screen.sessionTake",
  result: "screen.sessionResult",
  timedReady: "screen.sessionTimed",
  timed: "screen.sessionTimed",
  recap: "screen.sessionRecap",
};

/** The help entry for where the player is (`ctx.screen`, and in a Session its phase). */
export function helpForScreen(ctx: Pick<CoachContext, "screen" | "run">): HelpId {
  if (ctx.screen === "session") return SESSION_HELP[ctx.run?.phase ?? "ready"];
  return SCREEN_HELP[ctx.screen];
}

/** `explain_screen`'s answer: the entry for this screen, as its receipt (Ask draws it as a help card). */
export function explainScreen(ctx: Pick<CoachContext, "screen" | "run">): ToolResult {
  return { ok: true, receipt: line(helpKey(helpForScreen(ctx))) };
}

/** A receipt that is a help entry's words (`explain_screen`'s): Ask draws it as a help card, not as something done. */
export function isHelpLine(l: Line): boolean {
  return l.key.startsWith("help.entry.");
}

/** A help entry, or the tuning line, as Ask's card: the app's words, labelled "Worked out by the app". */
export function helpCard(l: Line): FactCard {
  return { shape: "help", lines: [l], source: { kind: "app" } };
}

/** The one sentence a tuning question gets (the owner's decision 9; matched in `helpMatch.ts`). */
export const TUNING_KEY = "help.tuning.none";
