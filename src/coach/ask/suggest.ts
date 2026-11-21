/**
 * Which chips to offer where (DESIGN 3.6 "Question chip", 5.1; leg c2b1a): one
 * pure function of where the chips sit and what is true there, so every place
 * that shows chips asks the same chooser.
 *
 * The places:
 *
 * - `readyNote`, `resultNote`: the Session's coach note (leg c1b1). Its chips
 *   are "Hear it first" (plays in place) and "What should I try?" (opens the
 *   Exercise's How). They are kept exactly as the player knows them: this leg
 *   adds no card chip to the note (a new row on the result screen is a layout
 *   change the note's scenes have not measured; c2b1b decides it with them).
 * - `toolNote`: the tools' note (leg c2a2): the run's own question chips,
 *   chosen by the tools' session (`coach/chips.ts`, three at most), in their
 *   order, unchanged.
 * - `askEmpty`, `askAbove`: Ask's empty state and the row above its text box.
 *   The fact cards that can answer here, ordered by what the last Take was,
 *   never the card the thread just answered. The empty state ends with the
 *   help set's "What is this screen for?" (`explain_screen`, leg c2cb).
 *
 * At most three chips from one place here (`MAX_CHIPS`). In Ask, card chips
 * and the tools' chips together are at most four (`askCards.ts`
 * `MAX_ASK_CHIPS`, review c2b1a F10), the cards first. A question chip is one question
 * shape; pressing it asks and answers in Ask.
 */
import type { CoachContext } from "../context";
import type { Line, ToolCall } from "../tools/types";
import { ungradedPlayer, type CardShape } from "./cards";
import { cardsHere } from "./intents";

export const MAX_CHIPS = 3;

export type ChipPlace = "readyNote" | "resultNote" | "toolNote" | "askEmpty" | "askAbove";

export type ChipChoice =
  /** The note's "Hear it first": plays the Exercise in place. */
  | { kind: "hear" }
  /** The note's "What should I try?": opens the Exercise's How. */
  | { kind: "try" }
  /** The tools' note: the run's own chip at this index. */
  | { kind: "feed"; index: number }
  /** A fact card: asks it in Ask. */
  | { kind: "card"; shape: CardShape; call: ToolCall; label: Line };

/** What is true where the chips sit. Each place reads only its own fields. */
export type ChipFacts = {
  /** The note can play the Exercise with sound now (`watch.hasSound && soundOn`). */
  hear?: boolean;
  /** The note has a How to open ("What should I try?"). */
  howTo?: boolean;
  /** How many question chips the tools' run offered. */
  feed?: number;
  /** The cards whose `when` is true here, in the list's order. */
  cards?: readonly CardShape[];
  /** What the last Take came to, for the cards' order. */
  verdict?: "passed" | "belowBar" | "tooShort" | "notCaught" | "ungraded" | null;
  /** The card the thread answered last: not offered again straight away. */
  answered?: CardShape | null;
};

/**
 * The words on a card's chip: a literal key each (the locale coverage reads
 * them). A card whose question needs words of the player's own (a chord, a
 * number of minutes) or a screen Ask has no context for (Test out, from a
 * Step's page) has no chip: it is reached by typing (leg c2b2a).
 */
const CARD_CHIP: Readonly<Partial<Record<CardShape, string>>> = {
  where_slipped: "ask.card.chip.where",
  early_or_late: "ask.card.chip.lean",
  why_not_counted: "ask.card.chip.count",
  what_changed: "ask.card.chip.changed",
  improving: "ask.card.chip.improving",
  score_made_of: "ask.card.chip.madeOf",
  pass_mark_distance: "ask.card.chip.distance",
  // Leg c4b3: offered before a Take, on Paths and Progress only (`BEFORE_A_TAKE`, last).
  suggest_path: "companion.pathSuggest.chip",
  // Leg c2b2a.
  exercise_purpose: "ask.card.chip.purpose",
  exercise_how: "ask.card.chip.how",
  exercise_try: "ask.card.chip.try",
  plan_why: "ask.card.chip.planWhy",
  plan_tempo: "ask.card.chip.planTempo",
  plan_next: "ask.card.chip.planNext",
  plan_return: "ask.card.chip.planReturn",
  pass_mark_ms: "ask.card.chip.passMarkMs",
  clean_tempo: "ask.card.chip.cleanTempo",
};

/**
 * Before the first Take of an Exercise (no verdict yet): the Path's words and
 * the plan's reasons (leg c2b2a). After a Take these follow the Take's own
 * cards, so they fill a row only where the Take's cards leave room.
 */
const BEFORE_A_TAKE: readonly CardShape[] = ["exercise_try", "plan_why", "exercise_purpose", "exercise_how", "plan_tempo", "plan_next", "clean_tempo", "suggest_path"];

/**
 * Where "Suggest a Path" is offered as a chip (leg c4b3, review M2): the Paths
 * list and Progress, the two places a player looks for what to do next, and
 * only before a Take (no verdict), last, within the three. Typed, it is
 * answered anywhere but a Take.
 */
const SUGGEST_PATH_CHIP_SCREENS: ReadonlySet<CoachContext["screen"]> = new Set(["paths", "progress"]);
const AFTER_THE_TAKE: readonly CardShape[] = ["exercise_try", "plan_next", "exercise_how"];

/**
 * Which cards come first after a Take of each kind; the first three that can
 * answer here are offered (c2b1b: below the pass mark, how far it is comes
 * second; after a pass, what changed).
 */
const CARD_ORDER: Readonly<Record<NonNullable<ChipFacts["verdict"]>, readonly CardShape[]>> = {
  belowBar: ["where_slipped", "pass_mark_distance", "early_or_late", "what_changed", "why_not_counted", "improving", "score_made_of", ...AFTER_THE_TAKE],
  passed: ["where_slipped", "what_changed", "early_or_late", "improving", "pass_mark_distance", "score_made_of", ...AFTER_THE_TAKE],
  // Nothing was measured: "why didn't that count", and what the score is made of.
  notCaught: ["why_not_counted", "score_made_of", ...AFTER_THE_TAKE],
  tooShort: ["why_not_counted", "score_made_of", ...AFTER_THE_TAKE],
  ungraded: ["why_not_counted", "score_made_of", ...AFTER_THE_TAKE],
};

function cardChips(facts: ChipFacts): ChipChoice[] {
  const here = new Set(facts.cards ?? []);
  const order = facts.verdict ? CARD_ORDER[facts.verdict] : BEFORE_A_TAKE;
  return order
    .filter((shape) => here.has(shape) && shape !== facts.answered && CARD_CHIP[shape] !== undefined)
    .slice(0, MAX_CHIPS)
    .map((shape) => ({ kind: "card" as const, shape, call: { tool: shape, args: {} }, label: { key: CARD_CHIP[shape] as string, values: {} } }));
}

/** The chips for one place: at most `MAX_CHIPS`, in the order they are drawn. */
export function suggestChips(place: ChipPlace, facts: ChipFacts): ChipChoice[] {
  let out: ChipChoice[];
  switch (place) {
    case "readyNote":
      out = [...(facts.hear ? [{ kind: "hear" as const }] : []), ...(facts.howTo ? [{ kind: "try" as const }] : [])];
      break;
    case "resultNote":
      out = facts.howTo ? [{ kind: "try" }] : [];
      break;
    case "toolNote":
      out = Array.from({ length: Math.max(0, facts.feed ?? 0) }, (_u, index) => ({ kind: "feed" as const, index }));
      break;
    case "askEmpty":
    case "askAbove":
      out = cardChips(facts);
      break;
  }
  return out.slice(0, MAX_CHIPS);
}

/** Ask's card chips for a context (`suggestChips` with the facts read off it). */
export function cardChipsFor(ctx: CoachContext, place: "askEmpty" | "askAbove", answered: CardShape | null = null): ChipChoice[] {
  const take = ctx.lastTake;
  const verdict = take ? (take.ungraded !== undefined ? "ungraded" : take.grade.verdict) : null;
  // A player without grading sees no card chips (Ask's empty state says why in
  // one line); the Path's words and the plan still answer a typed question.
  const cards = ungradedPlayer(ctx) ? [] : cardsHere(ctx).filter((c) => c !== "suggest_path" || SUGGEST_PATH_CHIP_SCREENS.has(ctx.screen));
  const chips = suggestChips(place, { cards, verdict, answered });
  // Ask's empty state always offers "What is this screen for?" (leg c2cb): every
  // screen has a help entry. Last, in the third place at most, so the cards keep two.
  if (place !== "askEmpty" || answered === "help") return chips;
  return [...chips.slice(0, MAX_CHIPS - 1), SCREEN_HELP_CHIP];
}

/** The help set's chip: `explain_screen`, answered in Ask as a help card. */
export const SCREEN_HELP_CHIP: ChipChoice = {
  kind: "card",
  shape: "help",
  call: { tool: "explain_screen", args: {} },
  label: { key: "help.ui.chip", values: {} },
};
