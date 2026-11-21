/**
 * Fact cards in Ask's thread (leg c2b1a): a chip press, or typed English the
 * matcher is sure of, asks a card and answers it in the thread. The card is
 * written by the app from what it measured (`src/coach/ask/cards.ts`); this
 * file only puts the player's words and the card into the conversation.
 *
 * `answerCardFor(text)` is the seam for the text box's send path (leg t1b2b's
 * "next answerer", plugged in by c2b1b): it answers and returns the turn's id
 * when the text clearly asks a card, and returns null, writing nothing, when
 * it does not.
 *
 * Nothing here runs during a Take: Ask is not mounted then, so no chip can be
 * pressed and nothing can be typed.
 */
import type { FactCard, CardShape } from "../../coach/ask/cards";
import { isCard, ungradedPlayer } from "../../coach/ask/cards";
import { runFactCard } from "../../coach/ask/intents";
import { matchCard } from "../../coach/ask/match";
import { cardChipsFor, type ChipChoice } from "../../coach/ask/suggest";
import type { ToolCall } from "../../coach/tools/types";
import { appendAskTurn, askTurnId, type AskTurn } from "./askStore";
import { askToolContext } from "./askTools";

/** A card turn's body: the card, or the one line that says why there is none. */
export type CardBody = FactCard | { shape: null; line: FactCard["lines"][number] };

/** Ask a card by call and answer it in the thread: the player's words, then the card. */
export function askCard(call: ToolCall, said: string): string {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  const id = askTurnId();
  const ctx = askToolContext();
  const out = ctx ? runFactCard(call, ctx) : { line: { key: "ask.card.notNow.noTake", values: {} } };
  const card: CardBody = isCard(out) ? out : { shape: null, line: out.line };
  appendAskTurn({ id, kind: "card", card });
  return id;
}

/**
 * Typed English, after the command router: a card when the matcher is sure,
 * else null and nothing written (the next way of answering takes it).
 */
export function answerCardFor(text: string): string | null {
  const call = matchCard(text);
  return call ? askCard(call, text) : null;
}

/** The card the thread answered last, so its chip is not offered again at once. */
export function lastCardShape(turns: readonly AskTurn[]): CardShape | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.kind === "card") return turn.card.shape;
    if (turn.kind !== "user" && turn.kind !== "divider") return null;
  }
  return null;
}

/**
 * In a Session played without grading there is no card about quality to
 * offer: Ask's empty state says so in one line, instead of chips.
 */
export function askUngradedHere(): boolean {
  const ctx = askToolContext();
  return !!ctx && ctx.screen === "session" && ungradedPlayer(ctx);
}

/** Ask's card chips for where the player is now (none without a context). */
export function askCardChips(place: "askEmpty" | "askAbove", turns: readonly AskTurn[]): Array<ChipChoice & { kind: "card" }> {
  const ctx = askToolContext();
  if (!ctx) return [];
  try {
    return cardChipsFor(ctx, place, lastCardShape(turns)).filter((c): c is ChipChoice & { kind: "card" } => c.kind === "card");
  } catch {
    return [];
  }
}
