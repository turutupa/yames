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
import { commandFacts, type CommandFacts } from "../../coach/ask/router";
import { getCoachToolHost, type CoachToolHost } from "../../coach/tools/host";
import { resolveStepCall } from "../../coach/tools/go";
import { findTool } from "../../coach/tools/registry";
import { resolvePath, wholeTitleWords } from "../../coach/tools/resolve";
import {
  chipPressable,
  confirmCoachTool,
  dismissProposal,
  pressCoachChip,
  retireUndo,
  runCoachTool,
  runCoachUndo,
  undoStillGood,
} from "../../coach/tools/run";
import { line, type Line, type Proposal, type Refusal, type RunOutcome, type ToolCall, type ToolChoice, type ToolResult } from "../../coach/tools/types";
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
  /**
   * A suggestion chip's change (leg chip1): the player saw no proposal, so
   * its Undo has no clock. It is offered until the value is changed again
   * (by anyone), the player leaves the screen (in a Session: the step or the
   * Exercise), or a Take starts (`noteAskUndos`, `retireSameUndos`,
   * `noteAskTake`, `noteAskToolView`).
   */
  chip?: true;
  /** The Session's step it was issued on, or null outside a Session (a chip's Undo only). */
  step?: number | null;
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
  | {
      kind: "proposal";
      proposal: Proposal;
      /** open: pressable. dismissed: "Not now". expired: the screen (or the Session's step) it was made on is gone. */
      state: "open" | "dismissed" | "expired";
      /** The screen it was made on (null: unknown, so any view change retires it). */
      view?: MainView | null;
      /** The Session's step it was made on, or null outside a Session. */
      step?: number | null;
    }
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

/**
 * What the typed-command router needs to know about where the player is now
 * (`commandFacts`, leg t1b2a), read at the press like everything here; null
 * without a host or a context. Leg t1b2b's wiring:
 * `routeCommand(text, commandTableFor(lng), askCommandFacts())`.
 */
export function askCommandFacts(): CommandFacts | null {
  const at = where();
  return at ? commandFacts(at.ctx, viewOf(at.host)) : null;
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

function undoOf(result: ToolResult & { ok: true }, host: CoachToolHost, now: number, chip?: { step: number | null }): UndoState | null {
  const call = result.undo;
  if (!call) return null;
  const tool = findTool(call.tool);
  if (tool?.kind === "go") {
    const screen = typeof call.args.screen === "string" ? call.args.screen : "today";
    return { call, label: line("coachTools.undo.returnTo", { screen }), kind: "go", view: goTarget(result.receipt), until: null, state: "live" };
  }
  // The receipt of a confirmed change is written where it was made: the host's view.
  const undo: UndoState = { call, label: line("coachTools.undo.generic"), kind: "confirm", view: viewOf(host), until: now + UNDO_MS, state: "live" };
  // A chip's change: no clock; it goes when the value, the screen or the step moves, or a Take starts.
  return chip ? { ...undo, until: null, chip: true, step: chip.step } : undo;
}

function viewOf(host: CoachToolHost): MainView | null {
  try {
    return host.view();
  } catch {
    return null;
  }
}

function bodyOf(outcome: RunOutcome, host: CoachToolHost, ctx: CoachContext, chip = false): ToolBody {
  if (!outcome.ok) return { kind: "refusal", line: outcome.line, choices: outcome.choices ?? [] };
  if ("proposal" in outcome) {
    return { kind: "proposal", proposal: outcome.proposal, state: "open", view: viewOf(host), step: ctx.run?.stepIndex ?? null };
  }
  return {
    kind: "receipt",
    receipt: outcome.receipt,
    ...(outcome.later ? { settling: true } : {}),
    ...(outcome.blocks ? { blocks: outcome.blocks } : {}),
    // The step as `useAskHost` says it to `noteAskToolView`: null outside a running Session.
    undo: undoOf(outcome, host, Date.now(), chip ? { step: ctx.run && ctx.run.phase !== "idle" ? ctx.run.stepIndex : null } : undefined),
  };
}

/** A receipt the app learns the end of a moment later: say so when it does (held during a Take). */
function followLater(id: string, outcome: RunOutcome): void {
  if (!outcome.ok || "proposal" in outcome || !outcome.later) return;
  void outcome.later.then((settled) => {
    // Only the settled line, applied to the turn as it is when written (it may be
    // held through a Take, and the turn may have changed meanwhile).
    settleAskTurn(id, (turn) =>
      turn.kind === "tool" && turn.body.kind === "receipt" ? { ...turn, body: { ...turn.body, receipt: settled, settling: false } } : null,
    );
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
  writeOutcome(id, runCoachTool(call, at.host, at.ctx), at);
  return id;
}

function writeOutcome(id: string, outcome: RunOutcome, at: { host: CoachToolHost; ctx: CoachContext }): void {
  appendAskTurn({ id, kind: "tool", body: bodyOf(outcome, at.host, at.ctx) });
  followLater(id, outcome);
}

/**
 * A suggestion chip's press (leg chip1; the owner's decision: the chip's own
 * press IS the press for a reversible one-step change, always with Undo).
 * Only Ask's suggestion chips call this (`AskPanel`'s chip row); a "Which
 * one?" choice, a typed command and the `accept-suggestion` binding do not.
 * The runner decides (`pressCoachChip`): a tool flagged in the registry runs
 * through the same checks a proposal's press makes and comes back as a
 * receipt whose Undo has no clock; anything else comes back as it would from
 * `runAskCall` (a proposal for an unflagged `confirm` tool). A second,
 * separate press is a second change with its own Undo, and the earlier
 * receipt's Undo for the same thing is retired.
 */
export function pressChip(call: ToolCall, said: string): string {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  const id = askTurnId();
  const at = where();
  if (!at) {
    appendAskTurn({ id, kind: "tool", body: unavailable() });
    return id;
  }
  const outcome = pressCoachChip(call, at.host, at.ctx);
  const changed = outcome.ok && !("proposal" in outcome) && chipPressable(findTool(call.tool));
  if (changed && outcome.undo) retireSameUndos(outcome.undo);
  appendAskTurn({ id, kind: "tool", body: bodyOf(outcome, at.host, at.ctx, changed) });
  followLater(id, outcome);
  return id;
}

/**
 * The same setting's earlier Undo, live: the same tool and (a setting) the
 * same key. Retired by name, not by reading the value: right after a press
 * the host's reads still give the value from before it until the app has
 * rendered, so a value check here would retire the Undo just issued.
 */
function retireSameUndos(next: ToolCall): void {
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo || undo.state !== "live" || undo.kind !== "confirm" || undo.call.tool !== next.tool) continue;
    if (undo.call.args.key !== next.args.key) continue;
    retire(turn.id, turn.body, undo);
  }
}

function retire(id: string, body: ToolBody & { kind: "receipt" }, undo: UndoState): void {
  retireUndo(undo.call);
  setBody(id, { ...body, undo: { ...undo, state: "gone" } });
}

/**
 * A chip's Undo is offered until the value it changed is changed again, by
 * anyone: asked of the runner (`undoStillGood`, which changes nothing)
 * whenever the host says the panel opened or the screen, the step, the
 * Exercise or the run's phase moved (`useAskHost`, after the app has
 * rendered, so the reads are current). A change made again through Ask
 * retires it by name at that press (`retireSameUndos`). One that would no
 * longer put back what its receipt changed is retired; the receipt stays as
 * a plain line. Pressed in between, the undo's own guard refuses it (the
 * runner's `at`), so it never changes anything else.
 */
export function noteAskUndos(): void {
  const at = where();
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo?.chip || undo.state !== "live") continue;
    if (at && undoStillGood(undo.call, at.host, at.ctx)) continue;
    retire(turn.id, turn.body, undo);
  }
}

/**
 * A Take started: no chip's Undo outlives it (the receipt stays, as a plain
 * line). The runner spends it now; the card is written when the Take ends
 * (`settleAskTurn` holds it), because nothing of Ask commits during a Take.
 */
export function noteAskTake(): void {
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo?.chip || undo.state !== "live") continue;
    retireUndo(undo.call);
    settleAskTurn(turn.id, (now) =>
      now.kind === "tool" && now.body.kind === "receipt" && now.body.undo?.call === undo.call && now.body.undo.state === "live"
        ? { ...now, body: { ...now.body, undo: { ...now.body.undo, state: "gone" } } }
        : null,
    );
  }
}

/** The arguments a tool resolves by title from the player's words. */
const NAMED = ["path", "query", "exercise", "jam", "preset"] as const;

/**
 * A refusal that says a typed NAME named nothing ("no Path called …"): every
 * such line carries the name as `query`. "No Step 12 there" carries a number
 * and is an answer (review t1b2c, finding 2).
 */
function nameNotFound(outcome: Refusal): boolean {
  return outcome.why === "notFound" && (outcome.choices ?? []).length === 0 && typeof outcome.line.values.query === "string";
}

/**
 * A typed command (leg t1b2c): as `runAskCall`, except that a call whose
 * typed name named nothing the app has (`notFound`, no choices) writes
 * nothing and returns false, so Ask goes on to its next answerer and the
 * model: "コースを開くと固まる" is a sentence, not a Path called "固まる"
 * (review t1b2b, finding 2). A refusal about a number ("no Step 12 there")
 * is still the answer (review t1b2c, finding 2).
 */
export function runTypedCall(call: ToolCall, said: string): boolean {
  const at = where();
  if (!at) {
    runAskCall(call, said);
    return true;
  }
  const outcome = runCoachTool(call, at.host, at.ctx);
  const named = NAMED.some((k) => typeof call.args[k] === "string");
  if (!outcome.ok && named && nameNotFound(outcome)) return false;
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  writeOutcome(askTurnId(), outcome, at);
  return true;
}

/**
 * What a typed `go` by name (`open_path`, `open_step` with a Path or a Step
 * named) would open, found before anything is written (review t1b2c,
 * findings 1 and 5):
 *
 * - `none`: the name names nothing; the sentence is not answered here.
 * - `one`: exactly one thing, as the choice a press runs, labelled and called
 *   by its resolved title (never the typed leftover); `whole` when the typed
 *   name matched the title's whole words (`wholeTitleWords`), the only case
 *   typed text may open at once.
 * - `runner`: several matches, or a Step number the Path lacks: the runner's
 *   own answer, which is choices or a refusal and never opens anything.
 * - null: not a named `go` (or no host): this says nothing about it.
 *
 * Reads the host's Paths; changes nothing.
 */
export type TypedGo = { kind: "none" } | { kind: "one"; choice: ToolChoice; whole: boolean } | { kind: "runner" };

export function typedGo(call: ToolCall): TypedGo | null {
  const RUNNER: TypedGo = { kind: "runner" };
  const pathName = typeof call.args.path === "string" ? call.args.path : undefined;
  const query = typeof call.args.query === "string" ? call.args.query : undefined;
  const named = call.tool === "open_path" ? pathName !== undefined : call.tool === "open_step" && (pathName !== undefined || query !== undefined);
  if (!named) return null;
  const at = where();
  if (!at) return null;
  if (call.tool === "open_path") {
    if (pathName === undefined) return null;
    const found = resolvePath(pathName, at.host.paths());
    if ("none" in found) return { kind: "none" };
    if ("several" in found) return RUNNER;
    const title = found.found.title;
    return {
      kind: "one",
      choice: { label: line("coachTools.choice.path", { path: title }), call: { tool: "open_path", args: { path: title } } },
      whole: wholeTitleWords(pathName, title),
    };
  }
  const found = resolveStepCall("open_step", call.args, at.host, at.ctx);
  if (!("step" in found)) return nameNotFound(found) ? { kind: "none" } : RUNNER;
  const { path, step } = found;
  return {
    kind: "one",
    choice: {
      label: line("coachTools.choice.step", { path: path.title, step: step.order, title: step.title }),
      call: { tool: "open_step", args: { path: path.title, step: step.order } },
    },
    whole: (pathName === undefined || wholeTitleWords(pathName, path.title)) && (query === undefined || wholeTitleWords(query, step.title)),
  };
}

/**
 * A press, for a tool button's `onClick`: the second click of a double-click
 * (`detail` 2 and up) is not a new press. Without this a double-click on a chip
 * ran its call twice, and the second click could land on a button drawn by the
 * first (the receipt's Undo where the proposal's button was). A key press has
 * `detail` 0 and always counts.
 */
export function onePress(fn: () => void): (event: { detail: number }) => void {
  return (event) => {
    if (event.detail > 1) return;
    fn();
  };
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
  // The same thing changed again: a chip's earlier Undo for it is not this one's to keep.
  if (result.ok && result.undo) retireSameUndos(result.undo);
  setBody(id, bodyOf(result, at.host, at.ctx));
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
 * Undo there anyway). An open proposal does not outlive the screen it was made
 * on, nor (in a Session) the step: it is dismissed through the runner and its
 * card says that has changed, so no live button is left whose "what stops" was
 * written for another moment (review t1b1 S1). Called by the host when the view
 * or the Session's step changes (`step` given: the step now, null outside a
 * Session; omitted: not known), never per beat.
 */
export function noteAskToolView(view: MainView, step?: number | null): void {
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool") continue;
    if (turn.body.kind === "proposal") {
      const body = turn.body;
      if (body.state !== "open") continue;
      const viewMoved = body.view == null || body.view !== view;
      const stepMoved = step !== undefined && body.step != null && step !== body.step;
      if (!viewMoved && !stepMoved) continue;
      dismissProposal(body.proposal);
      setBody(turn.id, { ...body, state: "expired" });
      continue;
    }
    if (turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo || undo.state !== "live") continue;
    if (undo.chip) {
      // A chip's Undo: only on its screen and, in a Session, its step (leg chip1).
      const stepMoved = step !== undefined && (undo.step ?? null) !== step;
      if (undo.view === null || undo.view !== view || stepMoved) retire(turn.id, turn.body, undo);
      continue;
    }
    if (undo.view === null || undo.view === view) continue;
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
