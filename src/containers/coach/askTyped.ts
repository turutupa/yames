/**
 * What Ask's text box does with a sentence (DESIGN 5.3, the order of
 * attempts; leg t1b2b). One function, `answerTyped`, called by the send and by
 * nothing else: a send is a press, so nothing here runs per beat, and Ask is
 * not mounted during a Take (the router's facts refuse every call there too).
 *
 * 1. The typed-command router (`routeCommand`), in the player's language:
 *    - `call`: the runner, shown as any tool result (`runAskCall`);
 *    - `which`: the refusal turn "Which one?" with the choices, each a full call;
 *    - `yours`: "that one is yours" (`askYours`);
 *    - `none` with `notHere`: the runner says why not here, and changes nothing.
 * 2. The next answerer (`setAskNextAnswerer`): today it answers nothing; the
 *    fact cards plug in here (c2b1a's `answerCardFor`, wired by c2b1b).
 * 3. What Ask did before commands: the model when one is selected, otherwise
 *    the plain statement (`sendAsk` → the host's answerer).
 *
 * With a model selected the router still runs first: a command is never
 * handed to a model to be described instead of done.
 */
import { commandTableFor } from "../../coach/ask/commandTable";
import { routeCommand } from "../../coach/ask/router";
import { line } from "../../coach/tools/types";
import { appendAskTurn, askTurnId, sendAsk } from "./askStore";
import { askCommandFacts, askYours, runAskCall } from "./askTools";

/**
 * An answerer tried after the router and before the model: true when it
 * answered (and wrote its own turns, the player's among them), false to let
 * the sentence go on to the model or the plain statement.
 */
export type AskNextAnswerer = (text: string) => boolean;

const NO_ANSWER: AskNextAnswerer = () => false;
let nextAnswerer: AskNextAnswerer = NO_ANSWER;

/**
 * Plug in the answerer that comes after the router (one at a time, the last
 * wins); the returned function unplugs it. Today nothing is plugged in.
 */
export function setAskNextAnswerer(fn: AskNextAnswerer | null): () => void {
  const mine = fn ?? NO_ANSWER;
  nextAnswerer = mine;
  return () => {
    if (nextAnswerer === mine) nextAnswerer = NO_ANSWER;
  };
}

/** What the router made of a sentence, for a test: the turn kind it led to. */
export type TypedOutcome = "call" | "which" | "yours" | "notHere" | "next" | "asked";

/**
 * The player sent `text` from Ask's box, in `language` (i18next's). The router
 * first, then the next answerer, then the model or the plain statement.
 */
export function answerTyped(text: string, language: string): TypedOutcome | null {
  const said = text.trim();
  if (!said) return null;
  const table = commandTableFor(language);
  const facts = table ? askCommandFacts() : null;
  if (table && facts) {
    const routed = routeCommand(said, table, facts);
    switch (routed.kind) {
      case "call":
        runAskCall(routed.call, said);
        return "call";
      case "which":
        appendAskTurn({ id: askTurnId(), kind: "user", text: said });
        appendAskTurn({
          id: askTurnId(),
          kind: "tool",
          body: { kind: "refusal", line: line("coachTools.why.which", { query: said }), choices: routed.choices },
        });
        return "which";
      case "yours":
        askYours(routed.item, said);
        return "yours";
      case "none":
        if (routed.notHere) {
          // The runner refuses it ("Not on this screen") and changes nothing.
          runAskCall(routed.notHere, said);
          return "notHere";
        }
        break;
    }
  }
  if (nextAnswerer(said)) return "next";
  sendAsk(said);
  return "asked";
}
