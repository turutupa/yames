/**
 * The coach's tools in Ask's thread (DESIGN 13 "In the Ask panel", TOOLS 2.3;
 * leg t1b1). Everything a press does goes through here, and everything here
 * goes through the runner (`src/coach/tools/run.ts`): a chip or a choice is
 * `runCoachTool`, a proposal's button is `confirmCoachTool`, "Not now" is
 * `dismissProposal`, Undo is `runCoachUndo`. Nothing here changes the app by
 * itself, and nothing here writes a sentence: a turn holds the runner's
 * `Line`s, and the panel words them (`toolWords.ts`).
 *
 * The four things a tool turn can be:
 *
 * - **receipt**: what the app did, with its way back while that is good.
 *   A `go` tool's way back ("Back to Today") is good until the player moves
 *   to another screen by hand (`noteAskToolView`); a confirmed change's Undo
 *   for `UNDO_MS` (TOOLS 2.3: "for a few seconds"), and only on the screen it
 *   was issued on (the runner refuses it anywhere else, and spends it).
 * - **proposal**: what will happen, a tonal button with a verb, "Not now".
 *   The press replaces it with what came of it: the receipt, or the
 *   runner's refusal ("That one has gone; ask again") when the context moved on.
 * - **refusal**: why not, and "Which one?"'s choices, each a full call.
 * - **yours**: a never-list item: one line, and a "show me" that only navigates.
 */
import type { CoachContext } from "../../coach/context";
import type { ResolvedBlock } from "../../coach/blocks/resolve";
import { getCoachToolHost, type CoachToolHost } from "../../coach/tools/host";
import { findTool } from "../../coach/tools/registry";
import { confirmCoachTool, dismissProposal, runCoachTool, runCoachUndo } from "../../coach/tools/run";
import { line, type Line, type Proposal, type RunOutcome, type ToolCall, type ToolChoice, type ToolResult } from "../../coach/tools/types";
import type { MainView } from "../main-window/MainHeader";
import { appendAskTurn, askTurnId, getAskState, settleAskTurn, updateAskTurn, type AskTurn } from "./askStore";
import { NEVER_LIST, type NeverItem } from "./neverList";
import { toolChipsFor, type ToolChip } from "./toolChips";

/** How long a confirmed change's Undo is offered (TOOLS 2.3, "a few seconds"). */
export const UNDO_MS = 10_000;

export type UndoState = {
  /** The very object the runner issued: only that one runs, once. */
  call: ToolCall;
  /** "Back to Today", or "Undo". */
  label: Line;
  /** `go`: a way back, good until the player moves by hand. `confirm`: an Undo, good for `UNDO_MS`. */
  kind: "go" | "confirm";
  /** The screen it is good on. */
  view: MainView | null;
  /** A confirmed change's Undo is offered until then (ms since the epoch); a way back has no end. */
  until: number | null;
  /** live: offered. gone: no longer offered. done: pressed, and it worked. refused: pressed, and the app said no. */
  state: "live" | "gone" | "done" | "refused";
  /** What came of the press: the undo's own receipt, or why it could not. */
  note?: Line;
};

export type ToolBody =
  | {
      kind: "receipt";
      receipt: Line;
      /** The app is still finding out (a preset being re-read): the receipt says it is at it. */
      settling?: boolean;
      blocks?: readonly ResolvedBlock[];
      undo: UndoState | null;
    }
  | { kind: "proposal"; proposal: Proposal; state: "open" | "dismissed" }
  | { kind: "refusal"; line: Line; choices: readonly ToolChoice[] }
  | { kind: "yours"; item: NeverItem };

// ---------------------------------------------------------------------------
// Where the runner's context comes from
// ---------------------------------------------------------------------------

let contextOf: (() => CoachContext) | null = null;
let hostOf: () => CoachToolHost | null = getCoachToolHost;

/** The host (`useAskHost`) says how to build the coach's context; read at each press. */
export function registerAskToolContext(fn: (() => CoachContext) | null): () => void {
  contextOf = fn;
  return () => {
    if (contextOf === fn) contextOf = null;
  };
}

/** Tests: a fake host and a fixed context. */
export function __setAskToolsForTests(host: CoachToolHost | null, ctx: CoachContext | (() => CoachContext) | null): void {
  hostOf = host ? () => host : getCoachToolHost;
  contextOf = ctx === null ? null : typeof ctx === "function" ? ctx : () => ctx;
}

function where(): { host: CoachToolHost; ctx: CoachContext } | null {
  const host = hostOf();
  const ctx = contextOf?.();
  return host && ctx ? { host, ctx } : null;
}

/** The chips for where the player is now (none without a host or a context). */
export function askToolChips(): ToolChip[] {
  const at = where();
  if (!at) return [];
  try {
    return toolChipsFor(at.host, at.ctx);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// A result, as a turn
// ---------------------------------------------------------------------------

/** The screen a `go` tool's receipt left the player on: its way back is good there. */
function goTarget(receipt: Line): MainView | null {
  switch (receipt.key) {
    case "coachTools.receipt.goTo":
      return typeof receipt.values.screen === "string" ? (receipt.values.screen as MainView) : null;
    case "coachTools.receipt.openPath":
    case "coachTools.receipt.openStep":
      return "paths";
    case "coachTools.receipt.openSettings":
      return "settings";
    default:
      return null;
  }
}

function undoOf(result: ToolResult & { ok: true }, host: CoachToolHost, now: number): UndoState | null {
  const call = result.undo;
  if (!call) return null;
  const tool = findTool(call.tool);
  if (tool?.kind === "go") {
    const screen = typeof call.args.screen === "string" ? call.args.screen : "today";
    return { call, label: line("coachTools.undo.returnTo", { screen }), kind: "go", view: goTarget(result.receipt), until: null, state: "live" };
  }
  // The receipt of a confirmed change is written where it was made: the host's view.
  let view: MainView | null = null;
  try {
    view = host.view();
  } catch {
    view = null;
  }
  return { call, label: line("coachTools.undo.generic"), kind: "confirm", view, until: now + UNDO_MS, state: "live" };
}

function bodyOf(outcome: RunOutcome, host: CoachToolHost): ToolBody {
  if (!outcome.ok) return { kind: "refusal", line: outcome.line, choices: outcome.choices ?? [] };
  if ("proposal" in outcome) return { kind: "proposal", proposal: outcome.proposal, state: "open" };
  return {
    kind: "receipt",
    receipt: outcome.receipt,
    ...(outcome.later ? { settling: true } : {}),
    ...(outcome.blocks ? { blocks: outcome.blocks } : {}),
    undo: undoOf(outcome, host, Date.now()),
  };
}

/** A receipt the app learns the end of a moment later: say so when it does (held during a Take). */
function followLater(id: string, outcome: RunOutcome): void {
  if (!outcome.ok || "proposal" in outcome || !outcome.later) return;
  void outcome.later.then((settled) => {
    const turn = turnOf(id);
    if (!turn || turn.body.kind !== "receipt") return;
    settleAskTurn(id, { ...turn, body: { ...turn.body, receipt: settled, settling: false } });
  });
}

function turnOf(id: string): (AskTurn & { kind: "tool" }) | null {
  const turn = getAskState().turns.find((x) => x.id === id);
  return turn && turn.kind === "tool" ? turn : null;
}

function setBody(id: string, body: ToolBody): void {
  updateAskTurn(id, { id, kind: "tool", body });
}

const unavailable = (): ToolBody => ({ kind: "refusal", line: line("coachTools.why.notWiredYet", { tool: "" }), choices: [] });

// ---------------------------------------------------------------------------
// Presses
// ---------------------------------------------------------------------------

/**
 * A chip, a choice or (leg t1b2) a typed command: the player's words as their
 * turn, then the call through the runner, then what came of it.
 */
export function runAskCall(call: ToolCall, said: string): string {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  const id = askTurnId();
  const at = where();
  if (!at) {
    appendAskTurn({ id, kind: "tool", body: unavailable() });
    return id;
  }
  const outcome = runCoachTool(call, at.host, at.ctx);
  appendAskTurn({ id, kind: "tool", body: bodyOf(outcome, at.host) });
  followLater(id, outcome);
  return id;
}

/** The proposal's button: the runner checks it is still good, then does it. */
export function pressProposal(id: string): void {
  const turn = turnOf(id);
  if (!turn || turn.body.kind !== "proposal" || turn.body.state !== "open") return;
  const at = where();
  if (!at) {
    setBody(id, unavailable());
    return;
  }
  const result = confirmCoachTool(turn.body.proposal, at.host, at.ctx);
  setBody(id, bodyOf(result, at.host));
  followLater(id, result);
}

/** "Not now": the proposal can never be confirmed, and nothing happens. */
export function notNowProposal(id: string): void {
  const turn = turnOf(id);
  if (!turn || turn.body.kind !== "proposal" || turn.body.state !== "open") return;
  dismissProposal(turn.body.proposal);
  setBody(id, { ...turn.body, state: "dismissed" });
}

/** Whether a receipt's way back is still offered now. */
export function undoLive(undo: UndoState | null, now: number): boolean {
  return !!undo && undo.state === "live" && (undo.until === null || now < undo.until);
}

/** The receipt's Undo, or its way back: once, and only while it is good. */
export function pressUndo(id: string): void {
  const turn = turnOf(id);
  if (!turn || turn.body.kind !== "receipt" || !turn.body.undo) return;
  const body = turn.body;
  const undo = body.undo!;
  if (!undoLive(undo, Date.now())) {
    setBody(id, { ...body, undo: { ...undo, state: "gone" } });
    return;
  }
  const at = where();
  if (!at) return;
  const result = runCoachUndo(undo.call, at.host, at.ctx);
  if (result.ok) {
    setBody(id, { ...body, undo: { ...undo, state: "done", note: result.receipt } });
    return;
  }
  // Not now (a Take, the click still playing): it stays good, and says why.
  if (result.why === "notNow") {
    setBody(id, { ...body, undo: { ...undo, note: result.line } });
    return;
  }
  setBody(id, { ...body, undo: { ...undo, state: "refused", note: line("coachTools.ui.undoGone") } });
}

/**
 * The view changed. A way back is good only on the screen its receipt left the
 * player on, and an Undo only on the screen it was issued on: anywhere else
 * neither is offered any more (the runner would refuse a confirmed change's
 * Undo there anyway). Called by the host when the view changes, never per beat.
 */
export function noteAskToolView(view: MainView): void {
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo || undo.state !== "live" || undo.view === null || undo.view === view) continue;
    setBody(turn.id, { ...turn.body, undo: { ...undo, state: "gone" } });
  }
}

/** "That one is yours": the line, and its "show me". Performs nothing. */
export function askYours(item: NeverItem, said = ""): string {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  const id = askTurnId();
  appendAskTurn({ id, kind: "tool", body: { kind: "yours", item } });
  return id;
}

/** How long Settings takes to scroll to a section (`useCoachToolHost`'s last nudge), and a little more. */
const POINT_AFTER_MS = 700;
const POINT_FOR_MS = 2400;

/**
 * "Show me": the never-list item's navigating call through the runner, then
 * a moment's mark on the control when the app has an element for it.
 */
export function showMeYours(item: NeverItem, said: string): void {
  const entry = NEVER_LIST[item];
  const id = runAskCall(entry.show, said);
  const turn = turnOf(id);
  if (!entry.point || !turn || turn.body.kind !== "receipt") return;
  pointAt(entry.point);
}

/** Mark an element for a moment (`[data-coach-point]` in `ask.css`): theme tokens, no layout read. */
export function pointAt(elementId: string): void {
  if (typeof document === "undefined") return;
  window.setTimeout(() => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.setAttribute("data-coach-point", "");
    window.setTimeout(() => el.removeAttribute("data-coach-point"), POINT_FOR_MS);
  }, POINT_AFTER_MS);
}
