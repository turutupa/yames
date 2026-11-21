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
import { line, type ToolChoice } from "../../coach/tools/types";
import { appendAskTurn, askTurnId, sendAsk } from "./askStore";
import { askCommandFacts, askYours, runAskCall, runTypedCall, typedGo } from "./askTools";

/**
 * An answerer tried after the router and before the model: true when it
 * answered (and wrote its own turns, the player's among them), false to let
 * the sentence go on to the model or the plain statement.
 *
 * Synchronous, by contract: it decides and writes its turns before it
 * returns. Anything but a boolean (a Promise above all) is taken as "not
 * answered", warned about in dev, and the sentence goes on to the model,
 * so an answerer that went on to write a turn later would give the player
 * two answers to one sentence (review t1b2c, finding 4).
 */
export type AskNextAnswerer = (text: string) => boolean;

const NO_ANSWER: AskNextAnswerer = () => false;
let nextAnswerer: AskNextAnswerer = NO_ANSWER;

/**
 * Plug in the answerer that comes after the router (one at a time, the last
 * wins); the returned function unplugs it. Today nothing is plugged in.
 * `fn` must be synchronous and return a boolean (see `AskNextAnswerer`): an
 * async answerer is never waited for, and its answer would follow the model's.
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
      case "call": {
        // A typed name opens at once only by the title's whole words; a partial one is one press
        // ("go to class" is not Classic Rock; review t1b2c, finding 5).
        const go = typedGo(routed.call);
        if (go.kind === "none") break;
        if (go.kind === "one" && !go.whole) return askWhich(said, [go.choice]);
        // A name that named nothing: the sentence goes on (review t1b2b, finding 2).
        if (runTypedCall(routed.call, said)) return "call";
        break;
      }
      case "which": {
        // Without spaces a named `go` is always one press; it is resolved first, so a leftover
        // that names nothing goes on, and the chip is the title a press opens (review t1b2c, finding 1).
        const only = routed.choices.length === 1 ? typedGo(routed.choices[0].call) : null;
        if (only?.kind === "none") break;
        if (only?.kind === "one") return askWhich(said, [only.choice]);
        // Several Paths, or a Step number the Path lacks: the runner's choices or its refusal, never a move.
        if (only?.kind === "runner") {
          if (runTypedCall(routed.choices[0].call, said)) return "which";
          break;
        }
        return askWhich(said, routed.choices);
      }
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
  // The slot is someone else's code: a throw is not an answer (review t1b2b, finding 5), and neither
  // is anything but a boolean, a Promise above all (review t1b2c, finding 4; see `setAskNextAnswerer`).
  let answered = false;
  try {
    const r: unknown = nextAnswerer(said);
    if (typeof r === "boolean") answered = r;
    else if (import.meta.env.DEV) console.warn("Ask's next answerer must answer synchronously with a boolean; got", typeof r, "(taken as not answered)");
  } catch {
    answered = false;
  }
  if (answered) return "next";
  sendAsk(said);
  return "asked";
}

/** "Which one?": the player's turn, then the choices, each a full call a press runs. */
function askWhich(said: string, choices: readonly ToolChoice[]): TypedOutcome {
  appendAskTurn({ id: askTurnId(), kind: "user", text: said });
  appendAskTurn({
    id: askTurnId(),
    kind: "tool",
    body: { kind: "refusal", line: line("coachTools.why.which", { query: said }), choices },
  });
  return "which";
}
