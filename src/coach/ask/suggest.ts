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
 *   never the card the thread just answered.
 *
 * At most three chips from one place here (`MAX_CHIPS`). In Ask, card chips
 * and the tools' chips together are at most four (`askCards.ts`
 * `MAX_ASK_CHIPS`, review c2b1a F10), the cards first. A question chip is one question
 * shape; pressing it asks and answers in Ask.
 */
import type { CoachContext } from "../context";
import type { Line, ToolCall } from "../tools/types";
import type { CardShape } from "./cards";
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

/** The words on a card's chip: a literal key each (the locale coverage reads them). */
const CARD_CHIP: Readonly<Record<CardShape, string>> = {
  where_slipped: "ask.card.chip.where",
  early_or_late: "ask.card.chip.lean",
  why_not_counted: "ask.card.chip.count",
  what_changed: "ask.card.chip.changed",
  improving: "ask.card.chip.improving",
  score_made_of: "ask.card.chip.madeOf",
  pass_mark_distance: "ask.card.chip.distance",
};

/**
 * Which cards come first after a Take of each kind; the first three that can
 * answer here are offered (c2b1b: below the pass mark, how far it is comes
 * second; after a pass, what changed).
 */
const CARD_ORDER: Readonly<Record<NonNullable<ChipFacts["verdict"]>, readonly CardShape[]>> = {
  belowBar: ["where_slipped", "pass_mark_distance", "early_or_late", "what_changed", "why_not_counted", "improving", "score_made_of"],
  passed: ["where_slipped", "what_changed", "early_or_late", "improving", "pass_mark_distance", "score_made_of"],
  // Nothing was measured: "why didn't that count", and what the score is made of.
  notCaught: ["why_not_counted", "score_made_of"],
  tooShort: ["why_not_counted", "score_made_of"],
  ungraded: ["why_not_counted", "score_made_of"],
};

function cardChips(facts: ChipFacts): ChipChoice[] {
  const here = new Set(facts.cards ?? []);
  const order = facts.verdict ? CARD_ORDER[facts.verdict] : [];
  return order
    .filter((shape) => here.has(shape) && shape !== facts.answered)
    .slice(0, MAX_CHIPS)
    .map((shape) => ({ kind: "card" as const, shape, call: { tool: shape, args: {} }, label: { key: CARD_CHIP[shape], values: {} } }));
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
  return suggestChips(place, { cards: cardsHere(ctx), verdict, answered });
}
