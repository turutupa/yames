/**
 * The question shapes the app answers itself (DESIGN 5.3, engine 2): each one
 * a `read` tool of the coach's tool shape (`src/coach/tools/types.ts`), plain
 * data (name, closed arguments, a note) with its `when` and `run` beside it,
 * plus `card`, which writes the whole answer (`cards.ts`).
 *
 * A card is added by adding an entry to `FACT_CARDS` (leg c2b1b: what changed,
 * am I improving, what the score is made of, how far the pass mark is). The
 * same entry serves a chip (`suggest.ts`), typed English (`match.ts`) and,
 * later, a model that picks a card by name and arguments.
 *
 * Why the list is its own, beside `COACH_TOOLS` rather than inside it: the
 * typed-command router's table is held to "every tool in `COACH_TOOLS` has an
 * English command" (`router.test.ts`), and a card is reached by a question,
 * never by a command. `factCardCatalogue()` gives the plain-data half in the
 * registry's own shape, so a model's catalogue is the two lists together.
 *
 * `when` is the context check every card shares: nothing while a Take runs;
 * nothing about quality for a player who is not graded; a card about the last
 * Take only when there is one, of the Exercise on screen.
 */
import type { CoachContext } from "../context";
import { suggestPathCard } from "../pathSuggest";
import { coachStored } from "../store";
import { TOOL_CATALOGUE_VERSION } from "../tools/registry";
import { checkCall } from "../tools/run";
import { argNumber, argString, takeRunning, type ActTool, type Line, type ToolArgs, type ToolCatalogue, type ToolSpec } from "../tools/types";
import {
  chordNotesCard,
  cleanTempo,
  exerciseHow,
  exercisePurpose,
  exerciseTry,
  passMarkMs,
  planMinutes,
  planNext,
  planReturn,
  planSkip,
  planStepHere,
  planTempo,
  planWhy,
  scaleFits,
  UNKNOWN_SUFFIX,
} from "./pathCards";
import { withChangeNote } from "./changeNote";
import { CHORD_SUFFIXES, ROOT_NAMES } from "../blocks/spec";
import {
  ASKABLE_METRICS,
  earlyOrLate,
  improving,
  isCard,
  lastTakeHere,
  passMarkDistance,
  scoreMadeOf,
  ungradedPlayer,
  UNGRADED_LINE,
  whatChanged,
  whereSlipped,
  whyNotCounted,
  type AskableMetric,
  type CardShape,
  type FactCard,
  type Lean,
  type NoCard,
} from "./cards";

/** A fact card: a `read` tool that also writes its whole answer. */
export type FactCardTool = ActTool & {
  kind: "read";
  name: CardShape;
  /** The answer, or why there is none here (one line, never silence). */
  card: (args: ToolArgs, ctx: CoachContext) => FactCard | NoCard;
  /**
   * What the card answers in at most six words, written by hand and distinct
   * from every other card's: the choice prompt's line when the cards' notes
   * do not fit their budget (leg c2b2ac; three words cut from the note gave
   * "Why this part" and "The scales the").
   */
  short: string;
  /**
   * Reads no Take (leg c2b2a: the Path's words, the plan, theory, the app's
   * terms): answered for a player who plays without grading too, and the card
   * itself says why it cannot answer here.
   */
  readsNoTake?: true;
};

/** The card's `run` for the generic runner: its first sentence as the receipt. */
function runOf(card: FactCardTool["card"]): ActTool["run"] {
  return (args, _host, ctx) => {
    const out = card(args, ctx);
    if (!isCard(out)) return { ok: false, why: "notNow", line: out.line };
    return { ok: true, receipt: out.lines[0] };
  };
}

/** Graded, not in a Take, and a Take of the Exercise on screen to read. */
export function cardAboutLastTake(ctx: CoachContext): boolean {
  return !takeRunning(ctx) && !ungradedPlayer(ctx) && lastTakeHere(ctx) !== null;
}

/** A Take the note measured something in (caught, long enough, graded). */
function measuredTake(ctx: CoachContext): boolean {
  const take = ctx.lastTake;
  if (!cardAboutLastTake(ctx) || !take) return false;
  return take.ungraded === undefined && (take.grade.verdict === "passed" || take.grade.verdict === "belowBar");
}

function entry(
  name: CardShape,
  spec: Omit<ToolSpec, "name" | "kind" | "audience"> & { short: string },
  when: (ctx: CoachContext) => boolean,
  card: FactCardTool["card"],
): FactCardTool {
  return { name, kind: "read", audience: "player", ...spec, when, card, run: runOf(card) };
}

const TAKE_ARG = {
  name: "take",
  type: { kind: "enum", values: ["last"] },
  optional: true,
  note: "Which Take: the last one played (the default).",
} as const;

/** A chord as two closed sets: its root and the app's own suffix ("" major, "m7", …), or `unknown` (c2b2a). */
const CHORD_ARGS: ToolSpec["args"] = [
  { name: "root", type: { kind: "enum", values: ROOT_NAMES }, note: "The chord's root, as a musician writes it." },
  {
    name: "suffix",
    type: { kind: "enum", values: [...CHORD_SUFFIXES, UNKNOWN_SUFFIX] },
    note: "The quality as the app writes it after the root (\"\" for major); `unknown` when the player's chord is not one the app reads.",
  },
];

export const FACT_CARDS: readonly FactCardTool[] = [
  entry(
    "where_slipped",
    {
      args: [TAKE_ARG],
      note: "Where the last Take slipped: the bars of the tune, on how many rounds, and which way the notes there leaned.",
      short: "where it slipped",
    },
    measuredTake,
    (_args, ctx) => whereSlipped(ctx),
  ),
  entry(
    "early_or_late",
    {
      args: [
        TAKE_ARG,
        {
          name: "premise",
          type: { kind: "enum", values: ["early", "late"] },
          optional: true,
          note: "The way the question assumed the Take leaned (rushing: early; dragging: late). Answered first when the Take says otherwise.",
        },
      ],
      note: "Whether the last Take landed early or late, by bars of the tune.",
      short: "early or late",
    },
    measuredTake,
    (args, ctx) => earlyOrLate(ctx, (argString(args, "premise") as Lean | undefined) ?? null),
  ),
  entry(
    "why_not_counted",
    {
      args: [
        TAKE_ARG,
        {
          name: "what",
          type: { kind: "enum", values: ["take", ...ASKABLE_METRICS] },
          optional: true,
          note: "The last Take (the default), or something the player thought was graded.",
        },
      ],
      note: "Why the last Take did or did not count, or why something is not graded on this Exercise.",
      short: "why it counted or not",
    },
    cardAboutLastTake,
    (args, ctx) => whyNotCounted(ctx, (argString(args, "what") as "take" | AskableMetric | undefined) ?? "take"),
  ),
  // Leg c2b1b.
  entry(
    "what_changed",
    {
      args: [TAKE_ARG],
      note: "The last Take beside the last measured Take before it on this Exercise: the tempo of each, the number each kept, and whether each met the pass mark. Takes marked not fair are left out.",
      short: "Take vs the one before",
    },
    measuredTake,
    (_args, ctx) => whatChanged(ctx),
  ),
  entry(
    "improving",
    {
      args: [],
      note: "The measured Takes of this Exercise, as a named window: tempo, clean tempos earned, evenness of the oldest, the newest and the best. Needs three; Takes marked not fair are left out.",
      short: "progress over Takes",
    },
    cardAboutLastTake,
    (_args, ctx) => improving(ctx),
  ),
  entry(
    "score_made_of",
    { args: [], note: "What this Exercise's pass mark checks, in its own numbers, and what it does not grade.", short: "what the pass mark checks" },
    cardAboutExercise,
    (_args, ctx) => scoreMadeOf(ctx),
  ),
  entry(
    "pass_mark_distance",
    {
      args: [TAKE_ARG],
      note: "Each check of the last Take against its pass mark, in the Exercise's own numbers, and the tempo it is passed at.",
      short: "how close to passing",
    },
    measuredTake,
    (_args, ctx) => passMarkDistance(ctx),
  ),
  // Leg c2b2a: the Path, the plan, theory and the app's terms (`pathCards.ts`).
  // Offered (as a chip) only where the Path has the words; asked anyway, the card says it has none.
  pathEntry(
    "exercise_purpose",
    [],
    "What this Exercise is for, in the Path's own words.",
    "what it is for",
    (ctx) => !!ctx.exercise?.purpose.trim(),
    (_a, ctx) => exercisePurpose(ctx),
  ),
  pathEntry(
    "exercise_how",
    [],
    "How to play this Exercise, in the Path's own words.",
    "how to play it",
    (ctx) => (ctx.exercise?.howTo.length ?? 0) > 0,
    (_a, ctx) => exerciseHow(ctx),
  ),
  pathEntry(
    "exercise_try",
    [],
    "The Path's cue for the next Take: the one the last Take's measurements pick, else the Exercise's general cue.",
    "what to try next",
    (ctx) => (ctx.exercise?.cues?.length ?? 0) > 0,
    (_a, ctx) => exerciseTry(ctx),
  ),
  // Leg c2b2ac (review L3): the notes say what the cards say ("this Session's plan").
  pathEntry("plan_why", [], "Why this part is in this Session's plan, in the plan's own reasons.", "why this part is planned", planStepRunning, (_a, ctx) =>
    planWhy(ctx),
  ),
  pathEntry(
    "plan_tempo",
    [],
    "The tempo this part was planned at and why; the tempo now when it moved.",
    "why this tempo",
    planStepRunning,
    (_a, ctx) => planTempo(ctx),
  ),
  pathEntry("plan_next", [], "The next part of this Session's plan.", "what comes next", planStepRunning, (_a, ctx) => planNext(ctx)),
  pathEntry("plan_skip", [], "What Test out is, ending in its proposal for the Step the player is on.", "skipping ahead", () => false, (_a, ctx) =>
    planSkip(ctx),
  ),
  pathEntry(
    "plan_minutes",
    [{ name: "minutes", type: { kind: "integer", min: 1, max: 240 }, note: "The minutes the player has." }],
    // Today's plan, rightly: the lengths are what Today plans for, outside a Session.
    "The lengths today's plan comes in, ending in the proposal to change it.",
    "plan for N minutes",
    () => false,
    (args, ctx) => planMinutes(ctx, argNumber(args, "minutes") ?? null),
  ),
  pathEntry("plan_return", [], "When the review schedule brings this Exercise back.", "when it comes back", exerciseHere, (_a, ctx) =>
    planReturn(ctx),
  ),
  pathEntry(
    "scale_fits",
    CHORD_ARGS,
    "The scales the app picks over a chord in a key it names, only those holding every note of the chord, spelled; the first drawn.",
    "scales that hold a chord",
    () => false,
    // On Jam, the note that makes the change into this chord audible follows (leg c5a1, `changeNote.ts`).
    (args, ctx) => theoryCard(scaleFits, args, ctx),
  ),
  pathEntry("chord_notes", CHORD_ARGS, "The notes of a chord, spelled by the app, and its grip.", "notes of a chord", () => false, (args, ctx) =>
    theoryCard(chordNotesCard, args, ctx),
  ),
  pathEntry(
    "pass_mark_ms",
    [{ name: "value", type: { kind: "integer", min: 1, max: 100 }, optional: true, note: "The percentage the player asked about." }],
    "This Exercise's evenness pass mark in milliseconds at this tempo.",
    "what a percentage means",
    gradedExerciseHere,
    (args, ctx) => passMarkMs(ctx, argNumber(args, "value") ?? null),
  ),
  pathEntry(
    "clean_tempo",
    [],
    "What a clean tempo is, and the player's own on this Exercise.",
    "what a clean tempo is",
    gradedExerciseHere,
    (_a, ctx) => cleanTempo(ctx),
  ),
  // Leg c4b3 (DESIGN 6.4): "suggest a Path". Reads the curriculum and which
  // Paths were started, never a grade or a Take, so an ungraded player is
  // answered too and it is answered anywhere but a Take. It names a Path; it
  // never subscribes.
  pathEntry(
    "suggest_path",
    [],
    "One Path to try next: not started, nothing it builds on missing; a goal the player set orders it.",
    // Six characters at most: the cards' share of the choice prompt stood at
    // 292 of its 300 tokens before this card (c2b2ac).
    "a Path",
    () => true,
    (_a, ctx) => suggestPathCard(ctx.progress, coachStored().goal),
  ),
];

function pathEntry(
  name: CardShape,
  args: ToolSpec["args"],
  note: string,
  short: string,
  when: (ctx: CoachContext) => boolean,
  card: FactCardTool["card"],
): FactCardTool {
  return { ...entry(name, { args, note, short }, (ctx) => !takeRunning(ctx) && when(ctx), card), readsNoTake: true };
}

/** A theory card from its two closed arguments, with the Jam's change note when there is one (leg c5a1). */
function theoryCard(build: (root: string, suffix: string) => FactCard, args: ToolArgs, ctx: CoachContext): FactCard | NoCard {
  const root = argString(args, "root") ?? "";
  const suffix = argString(args, "suffix") ?? UNKNOWN_SUFFIX;
  return withChangeNote(build(root, suffix), ctx, root, suffix);
}

/** An Exercise on screen (its words, its cue, its schedule). */
function exerciseHere(ctx: CoachContext): boolean {
  return ctx.exercise !== undefined;
}

/** A graded Exercise on screen, for a graded player (the pass mark's terms). */
function gradedExerciseHere(ctx: CoachContext): boolean {
  return ctx.exercise !== undefined && ctx.exercise.grading === "graded" && !ungradedPlayer(ctx);
}

/** A Session running a plan step (of the plan it runs, not Today's: c2b2ab H1). */
function planStepRunning(ctx: CoachContext): boolean {
  return planStepHere(ctx) !== null;
}

/** Graded, not in a Take, and an Exercise on screen (a card that reads the Exercise, not a Take). */
export function cardAboutExercise(ctx: CoachContext): boolean {
  return !takeRunning(ctx) && !ungradedPlayer(ctx) && ctx.exercise !== undefined;
}

export function findCard(name: string): FactCardTool | undefined {
  return FACT_CARDS.find((c) => c.name === name);
}

/** The cards that can answer here, in the list's order. */
export function cardsHere(ctx: CoachContext): CardShape[] {
  return FACT_CARDS.filter((c) => {
    try {
      return c.when(ctx);
    } catch {
      return false;
    }
  }).map((c) => c.name);
}

/** The plain-data half, in the registry's catalogue shape (for a model's catalogue, later). */
export function factCardCatalogue(): ToolCatalogue {
  return {
    version: TOOL_CATALOGUE_VERSION,
    tools: FACT_CARDS.map(({ name, kind, audience, args, note }) => ({ name, kind, audience, args, note })),
  };
}

/**
 * A card asked for by call (a chip, the matcher, later a model's pick): the
 * shape check of the tools' runner, then the context, then the card. Never
 * throws; anything but an answer is one line saying why.
 */
export function runFactCard(call: unknown, ctx: CoachContext): FactCard | NoCard {
  const checked = checkCall(call, FACT_CARDS, "player");
  if (!checked.ok) return { line: checked.line };
  const tool = checked.call.tool as FactCardTool;
  if (takeRunning(ctx)) return { line: { key: "coachTools.why.notNow.take", values: {} } };
  // The Path's words, the plan, theory and the app's terms read no Take: the
  // card itself says why it cannot answer here (leg c2b2a).
  if (tool.readsNoTake) {
    try {
      return tool.card(checked.call.args, ctx);
    } catch {
      return { line: NOT_HERE };
    }
  }
  if (ungradedPlayer(ctx)) return { line: UNGRADED_LINE };
  // `when` decides what is offered. Asked anyway about a Take that was not
  // caught, too short or not graded, the card answers "I didn't measure that"
  // itself (uncertainty by rule); with no Take of this Exercise, one line says so.
  // "Is my pick direction graded?" needs the Exercise, not a Take.
  const what = argString(checked.call.args, "what");
  const aboutExercise =
    ctx.exercise !== undefined && ((tool.name === "why_not_counted" && what !== undefined && what !== "take") || tool.name === "score_made_of");
  if (!tool.when(ctx) && !cardAboutLastTake(ctx) && !aboutExercise) return { line: NO_TAKE };
  try {
    return tool.card(checked.call.args, ctx);
  } catch {
    return { line: NO_TAKE };
  }
}

const NO_TAKE: Line = { key: "ask.card.notNow.noTake", values: {} };
const NOT_HERE: Line = { key: "ask.card.path.noExercise", values: {} };
