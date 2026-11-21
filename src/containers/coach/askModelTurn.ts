/**
 * The model's turn in Ask's thread (DESIGN 5.3 engine 4a, 5.5, mock 11; leg
 * c3b2a). The answer chain (`answerTyped`) comes here last, after the router
 * and every synchronous answerer said nothing, and only when the model is on
 * for the player's language and tier (`modelTurnWanted`: never in this build,
 * `MODEL_LANGS` is empty).
 *
 * What the player sees: their words and the plain statement at once; then,
 * when the speed gate says yes (`asksUseModel`), "Looking for more… Stop"
 * while the model chooses; then what it chose under the plain
 * statement (a card, or a `read` tool's receipt, at once; a `go` or `confirm`
 * call as a one-press proposal labelled as the model's reading), or nothing.
 *
 * A turn in flight is cancelled (`cancel_generation`) and its result dropped
 * when: a Take or a count-in starts (`takeStarted` on the coach bus, and the
 * host's `noteAskTake`), a jam take's recording starts (`noteAskJamTake`),
 * the panel unmounts, the player sends anything else, or Stop is pressed.
 * None starts while a Take or a jam take runs.
 */
import i18n from "../../i18n";
import { subscribe as subscribeCoach } from "../../coach/bus";
import {
  askModelChoice,
  asksUseModel,
  cancelChoice,
  choiceFactsFrom,
  choiceRequest,
  modelLangOn,
  newChoiceId,
  type GateCaps,
  type ModelChoice,
} from "../../coach/ask/model";
import type { CoachToolHost } from "../../coach/tools/host";
import { getCoachModelSnapshot } from "../../hooks/coachLoader";
import { getCoachCapabilities } from "../../ipc";
import { IS_MOBILE } from "../../platform";
import { cardBodyFor } from "./askCards";
import { answeredByTool } from "./askContext";
import { appendAskTurn, askTakeGate, askTurnId, getAskState, settleAskTurn, type AskTurn } from "./askStore";
import { askCommandFacts, askTakeNow, askToolContext, askToolHost, modelCallBody, onAskTakeStart } from "./askTools";

type Live = {
  token: number;
  generationId: number | null;
  workingId: string | null;
  off: Array<() => void>;
};

let live: Live | null = null;
let tokens = 0;

/** Whether a typed line that nothing else answered goes to the model's turn: on for this language and tier. */
export function modelTurnWanted(language: string): boolean {
  if (IS_MOBILE) return false;
  return modelLangOn(getCoachModelSnapshot().choice, language);
}

/** Whether a model turn is in flight (tests, and the panel's Stop). */
export function modelTurnLive(): boolean {
  return live !== null;
}

/**
 * Stop the turn in flight, if any: cancelled in Rust, its working line gone,
 * and whatever it returns later dropped. Safe to call at any time.
 */
export function stopModelTurn(): void {
  const was = live;
  if (!was) return;
  live = null;
  for (const off of was.off) off();
  if (was.generationId !== null) cancelChoice(was.generationId);
  if (was.workingId !== null) settleAskTurn(was.workingId, "gone");
}

/**
 * The player's last line for the model's `Before:`, skipping one a tool or a
 * card answered (a chip's words, a typed command): the model sees no tool
 * turns, so it would read a request the app already carried out (review
 * c3b2a M1). One rule with the old chat's prompt: `answeredByTool`.
 */
function lastUserText(): string | null {
  const turns = getAskState().turns;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.kind === "user" && !answeredByTool(turns, i)) return turn.text;
  }
  return null;
}

/**
 * The model's turn for `said`: the player's words and the plain statement at
 * once, then (async) the model, when the gate says yes.
 */
export function answerWithModel(said: string, language: string): void {
  stopModelTurn();
  const previous = lastUserText();
  appendAskTurn({ id: askTurnId(), kind: "user", text: said });
  appendAskTurn({ id: askTurnId(), kind: "app", text: i18n.t("ask.model.plain") });
  const model = getCoachModelSnapshot().state;
  if (model === "loading" || model === "waiting") {
    // The fact, not a promise (review c3b2a L2): nothing asks again when it is ready.
    appendAskTurn({ id: askTurnId(), kind: "app", text: i18n.t("ask.reply.gettingReady") });
    return;
  }
  if (model !== "ready" || askTakeGate() || askTakeNow()) return;
  tokens += 1;
  const turn: Live = { token: tokens, generationId: null, workingId: null, off: [] };
  live = turn;
  // A Take, a count-in or a jam take starting stops it, panel open or not.
  turn.off.push(
    subscribeCoach((event) => {
      if (event.type === "takeStarted") stopModelTurn();
    }),
    onAskTakeStart(() => stopModelTurn()),
  );
  void choose(turn, said, language, previous);
}

function sounding(host: CoachToolHost | null): boolean {
  if (!host) return true;
  try {
    return host.sounding() !== null;
  } catch {
    return true;
  }
}

function names(read: () => unknown): string[] {
  try {
    const list = read();
    return Array.isArray(list) ? list.map((x: { name?: unknown }) => (typeof x?.name === "string" ? x.name : "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function choose(turn: Live, said: string, language: string, previous: string | null): Promise<void> {
  let caps: GateCaps | null = null;
  try {
    caps = await getCoachCapabilities();
  } catch {
    caps = null;
  }
  if (live !== turn) return;
  const host = askToolHost();
  const ctx = askToolContext();
  const facts = askCommandFacts();
  const tier = getCoachModelSnapshot().choice;
  if (!host || !ctx || !facts || !asksUseModel(caps, tier, language, sounding(host)) || askTakeGate() || askTakeNow()) {
    stopModelTurn();
    return;
  }
  let tempo: number | null = null;
  try {
    const now = facts.tempo ? host.tempo() : null;
    tempo = typeof now === "number" ? now : null;
  } catch {
    tempo = null;
  }
  const request = choiceRequest(
    said,
    choiceFactsFrom(ctx, { view: facts.view, possible: facts.possible, tempo }, { jams: names(() => host.jams()), presets: names(() => host.presets()) }),
    newChoiceId(),
    previous,
  );
  turn.generationId = request.generationId;
  turn.workingId = askTurnId();
  appendAskTurn({ id: turn.workingId, kind: "model" });
  const { choice } = await askModelChoice(request);
  // Superseded (another send, Stop, a Take, the panel gone): dropped. Its working line went with the cancel.
  if (live !== turn) return;
  live = null;
  for (const off of turn.off) off();
  settleAskTurn(turn.workingId, turnFor(turn.workingId, choice) ?? "gone");
}

/** What the model chose, as the turn that replaces the working line; null adds nothing. */
function turnFor(id: string, choice: ModelChoice): AskTurn | null {
  try {
    if (choice.kind === "call") {
      const body = modelCallBody(choice.call);
      return body ? { id, kind: "tool", body } : null;
    }
    if (choice.kind === "card") {
      if (!askToolContext()) return null;
      return { id, kind: "card", card: cardBodyFor({ tool: choice.card, args: choice.args }) };
    }
  } catch {
    return null;
  }
  return null;
}

/** Tests only. */
export function __resetModelTurnForTests(): void {
  if (live) for (const off of live.off) off();
  live = null;
}
