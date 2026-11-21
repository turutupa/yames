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
import { TOOL_CATALOGUE_VERSION } from "../tools/registry";
import { checkCall } from "../tools/run";
import { argString, takeRunning, type ActTool, type Line, type ToolArgs, type ToolCatalogue, type ToolSpec } from "../tools/types";
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
  spec: Omit<ToolSpec, "name" | "kind" | "audience">,
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

export const FACT_CARDS: readonly FactCardTool[] = [
  entry(
    "where_slipped",
    { args: [TAKE_ARG], note: "Where the last Take slipped: the bars of the tune, on how many rounds, and which way the notes there leaned." },
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
    },
    measuredTake,
    (_args, ctx) => whatChanged(ctx),
  ),
  entry(
    "improving",
    {
      args: [],
      note: "The measured Takes of this Exercise, as a named window: tempo, clean tempos earned, evenness of the oldest, the newest and the best. Needs three; Takes marked not fair are left out.",
    },
    cardAboutLastTake,
    (_args, ctx) => improving(ctx),
  ),
  entry(
    "score_made_of",
    { args: [], note: "What this Exercise's pass mark checks, in its own numbers, and what it does not grade." },
    cardAboutExercise,
    (_args, ctx) => scoreMadeOf(ctx),
  ),
  entry(
    "pass_mark_distance",
    { args: [TAKE_ARG], note: "Each check of the last Take against its pass mark, in the Exercise's own numbers, and the tempo it is passed at." },
    measuredTake,
    (_args, ctx) => passMarkDistance(ctx),
  ),
];

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
