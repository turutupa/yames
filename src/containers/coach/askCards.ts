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
import { isCard, lastTakeHere, ungradedPlayer } from "../../coach/ask/cards";
import { runFactCard } from "../../coach/ask/intents";
import { matchCard, type CardCall } from "../../coach/ask/match";
import type { CoachContext } from "../../coach/context";
import { cardChipsFor, type ChipChoice } from "../../coach/ask/suggest";
import type { ToolCall } from "../../coach/tools/types";
import { appendAskTurn, askTurnId, type AskTurn } from "./askStore";
import { askToolContext } from "./askTools";

/** A card turn's body: the card, or the one line that says why there is none. */
export type CardBody = FactCard | { shape: null; line: FactCard["lines"][number] };

const NO_TAKE_KEY = "ask.card.notNow.noTake";

/** The card for a call where the player is now, or the one line that says why there is none. */
function cardBodyFor(call: ToolCall): CardBody {
  const ctx = askToolContext();
  const out = ctx ? runFactCard(call, ctx) : { line: { key: NO_TAKE_KEY, values: {} } };
  return isCard(out) ? out : { shape: null, line: out.line };
}

function writeCard(card: CardBody, said: string): string {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  const id = askTurnId();
  appendAskTurn({ id, kind: "card", card });
  return id;
}

/** Ask a card by call and answer it in the thread: the player's words, then the card. */
export function askCard(call: ToolCall, said: string): string {
  return writeCard(cardBodyFor(call), said);
}

/**
 * Typed English, after the command router: a card when the matcher is sure,
 * else null and nothing written (the next way of answering takes it).
 * Synchronous, as the send path's slot requires.
 *
 * With no Take of this Exercise to read (Songs, Jam, a Session before its
 * first Take) it is not a card's question either: null, nothing written, and
 * the next answerer (a model that has the song's review) sees it (review
 * c2b1a F6). A chip still answers "no Take yet" in one line: it asked.
 */
export function answerCardFor(text: string): string | null {
  const call = matchCard(text);
  if (!call) return null;
  // Checked before the card runs, grading on or off: with grading off the card
  // answers "you're playing without grading" before it looks for a Take, and
  // that line on Songs, Jam or Today would keep the question from the model
  // (review c2b1c M4).
  const ctx = askToolContext();
  if (!ctx || !readsSomethingHere(call, ctx)) return null;
  const card = cardBodyFor(call);
  if (card.shape === null && card.line.key === NO_TAKE_KEY) return null;
  return writeCard(card, text);
}

/**
 * The cards as the text box's next answerer (t1b2b's slot, `setAskNextAnswerer`;
 * plugged by `AskPanel` while it is mounted, leg c2b1b): after the router,
 * before the model or the plain statement. Synchronous, as the slot requires:
 * `answerCardFor` decides and writes both turns before it returns.
 *
 * English only: the matcher reads English, so in any other language typed
 * text never reaches a card (a German "where did it slip?" goes on to the
 * model); every language reaches the cards by chip. `language` is read at
 * each send, so a change of language in Settings counts at once.
 */
export function typedCardAnswerer(language: () => string): (text: string) => boolean {
  return (text) => isEnglish(language()) && answerCardFor(text) !== null;
}

function isEnglish(language: string): boolean {
  return language === "en" || language.startsWith("en-");
}

/** A card has something to read here: the last Take of the Exercise on screen, or for a metric question, the Exercise. */
function readsSomethingHere(call: CardCall, ctx: CoachContext): boolean {
  if (lastTakeHere(ctx)) return true;
  // What the score is made of reads the Exercise, not a Take (c2b1b).
  if (call.tool === "score_made_of") return ctx.exercise !== undefined;
  const what = call.args.what;
  return call.tool === "why_not_counted" && typeof what === "string" && what !== "take" && ctx.exercise !== undefined;
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

/**
 * At most this many chips in Ask at once, card chips and tool chips together:
 * the tools' own cap (`toolChips.ts` `MAX_CHIPS`, t1b1), so a screen without
 * cards looks as it did and one with them never grows past it (review c2b1a F10).
 */
export const MAX_ASK_CHIPS = 4;

/** The tool chips that fit beside `cards` card chips: the cards go first. */
export function withinChipCap<T>(cards: number, tools: readonly T[]): T[] {
  return tools.slice(0, Math.max(0, MAX_ASK_CHIPS - cards));
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
