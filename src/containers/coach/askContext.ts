/**
 * What Ask shows and sends about where the player is: the one quiet
 * "Looking at: …" line under its head (DESIGN 3.6, mock 02), the key that
 * decides when a divider goes into the thread, and the prompt for a typed
 * question when a model is ready.
 *
 * All of it is read from a `CoachContext` (`src/coach/context.ts`) the host
 * built in an effect or a handler, never in a render.
 */
import type { TFunction } from "i18next";
import type { CoachContext } from "../../coach/context";
import type { AskTurn } from "./askStore";

/** The parts of "Looking at: …", in order. Never empty. */
export function lookingAtParts(ctx: CoachContext, t: TFunction): string[] {
  const parts: string[] = [];
  if (ctx.screen === "session" && ctx.exercise) {
    parts.push(ctx.exercise.title);
    const run = ctx.run;
    if (run?.phase === "ready" || run?.phase === "timedReady") {
      if (run.outcomes.length > 0) parts.push(t("ask.looking.readyFor", { n: run.takes + 1 }));
    } else if (run?.phase === "result" && ctx.lastTake) {
      parts.push(t("ask.looking.take", { n: ctx.lastTake.takeNumber }));
    }
    return parts;
  }
  parts.push(t(`ask.screen.${ctx.screen}`));
  if (ctx.screen === "session" && ctx.run?.phase === "recap") parts.push(t("ask.looking.recap"));
  if (ctx.screen === "jam" && ctx.jam) parts.push(ctx.jam.jam.name);
  if (ctx.screen === "songs" && ctx.song) parts.push(ctx.song.song.name);
  return parts;
}

/** When this changes mid-conversation, the thread gets a divider. */
export function askScreenKey(ctx: CoachContext): string {
  return [ctx.screen, ctx.screen === "session" ? (ctx.exercise?.id ?? "") : "", ctx.jam?.jam.id ?? "", ctx.song?.song.id ?? ""].join("|");
}

/**
 * A player's turn a tool answered: a chip's words, a typed command, a "show
 * me" (`runAskCall`, `askYours` write the user turn, then the tool turn after
 * it). The model sees no tool turns, so without this it would read a question
 * nobody replied to. A divider between the two does not count as a reply.
 */
function answeredByTool(turns: readonly AskTurn[], index: number): boolean {
  for (let i = index + 1; i < turns.length; i++) {
    const next = turns[i];
    if (next.kind === "divider") continue;
    // A fact card answers its question the same way (leg c2b1a).
    return next.kind === "tool" || next.kind === "card";
  }
  return false;
}

/** The last exchanges, as the old chat sent them. */
const TURNS_IN_PROMPT = 6;

/**
 * The prompt for one typed question: the context the app measured, the last
 * few turns, the question. The wording of the instruction is the old chat's
 * (`useSession.sendChat` before this leg), so the model's behaviour and the
 * Rust side's `chat` kind are unchanged.
 */
export function askPrompt(
  contextText: string,
  turns: readonly AskTurn[],
  question: string,
  /** The coach's sentence or the bar Ask was opened about (`AskRequest.about`). */
  about?: string | null,
): string {
  if (about) contextText = `${contextText}\nThe player is asking about this: "${about}"`;
  const recent = turns
    .filter((x, i): x is AskTurn & { kind: "user" | "coach" } =>
      (x.kind === "user" && !answeredByTool(turns, i)) || (x.kind === "coach" && !x.pending))
    .slice(-TURNS_IN_PROMPT);
  const conversation =
    recent.length > 0
      ? "\nConversation so far:\n" +
        recent.map((x) => (x.kind === "user" ? `User: ${x.text}` : `Coach: ${x.text}`)).join("\n") +
        "\n"
      : "";
  return `Current context:\n${contextText}\n${conversation}\nUser asks: ${question}\nAnswer concisely based only on the data above.`;
}
