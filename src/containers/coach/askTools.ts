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
import { exerciseGenerator, loadExerciseGenerator } from "../../coach/tools/make";
import { findTool } from "../../coach/tools/registry";
import { resolvePath, wholeTitleWords } from "../../coach/tools/resolve";
import {
  chipPressable,
  confirmCoachTool,
  dismissProposal,
  pressCoachChip,
  proposalOpen,
  retireUndo,
  runCoachTool,
  runCoachUndo,
  undoStillGood,
} from "../../coach/tools/run";
import { line, takeRunning, type Line, type Proposal, type Refusal, type RunOutcome, type ToolCall, type ToolChoice, type ToolResult } from "../../coach/tools/types";
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
  /**
   * live: offered. gone: no longer offered. settling: pressed, and the app is
   * still finding out (the store's write; no "Undone." yet). done: pressed, and
   * it worked. refused: pressed, and the app said no.
   */
  state: "live" | "gone" | "settling" | "done" | "refused";
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
  /** When it was issued (ms since the epoch; a chip's Undo only): `noteAskUndos` leaves a young one alone. */
  issued?: number;
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
      /** Where to go next (`ToolDone.next`, leg t2c: "Open Paths"). */
      next?: readonly ToolChoice[];
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
      /** The model chose it (leg c3b2a): labelled as the model's reading of the question. */
      via?: "model";
      /** Why the last press did nothing, while it stays pressable (something sounds now: c3b2ab, M2). */
      note?: Line;
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
  jamTakeHold = null;
  keyRepeating = false;
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

/** The coach's context now, as the tools read it (the fact cards read it too, leg c2b1a); null without one. */
export function askToolContext(): CoachContext | null {
  try {
    return contextOf?.() ?? null;
  } catch {
    return null;
  }
}

/** The tools' host now, or null (leg c3b2a: what sounds, and the jams' and presets' names, for the model's turn). */
export function askToolHost(): CoachToolHost | null {
  try {
    return hostOf();
  } catch {
    return null;
  }
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
  return chip ? { ...undo, until: null, chip: true, step: chip.step, issued: now } : undo;
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
    ...(outcome.next && outcome.next.length > 0 ? { next: outcome.next } : {}),
    // The step as `useAskHost` says it to `noteAskToolView`: null outside a running Session.
    undo: undoOf(outcome, host, Date.now(), chip ? { step: ctx.run && ctx.run.phase !== "idle" ? ctx.run.stepIndex : null } : undefined),
  };
}

/**
 * The Undos whose receipt's `later` decides whether there is anything to undo
 * (leg t2c: the store's answer to an add). Only these are hidden while the
 * receipt settles and withdrawn when it settles as a refusal (review t2c,
 * finding 7): another tool's Undo with a `later` joins this list on purpose.
 */
const UNDO_AFTER_LATER: ReadonlySet<string> = new Set(["undo_make_exercise"]);

/** Whether a receipt's Undo waits for, and may be withdrawn by, the receipt's `later`. */
export function laterDecidesUndo(undo: UndoState | null): boolean {
  return !!undo && UNDO_AFTER_LATER.has(undo.call.tool);
}

/** A receipt the app learns the end of a moment later: say so when it does (held during a Take). */
function followLater(id: string, outcome: RunOutcome): void {
  if (!outcome.ok || "proposal" in outcome || !outcome.later) return;
  void outcome.later.then((settled) => {
    // Only the settled line, applied to the turn as it is when written (it may be
    // held through a Take, and the turn may have changed meanwhile).
    settleAskTurn(id, (turn) => {
      if (turn.kind !== "tool" || turn.body.kind !== "receipt") return null;
      // It settled as a refusal (leg t2c: the store did not keep it): nothing to undo, nowhere to go.
      if (settled.key.startsWith("coachTools.why.") && laterDecidesUndo(turn.body.undo) && turn.body.undo) {
        retireUndo(turn.body.undo.call);
        return { ...turn, body: { ...turn.body, next: undefined, receipt: settled, settling: false, undo: { ...turn.body.undo, state: "gone", note: undefined } } };
      }
      return { ...turn, body: { ...turn.body, receipt: settled, settling: false } };
    });
  });
}

/**
 * A `make_exercise` call (leg t2c) waits for the generator, which is not in the
 * shell's first load: loaded once, then the call runs as it would have. Any
 * other call runs at once.
 */
function withGenerator(call: ToolCall, run: () => void): boolean {
  if (call.tool !== "make_exercise" || exerciseGenerator()) return false;
  void loadExerciseGenerator().then(run, run);
  return true;
}

/** A newer `make_exercise` proposal replaces the open one (a variant chip, a recipe typed again): it is retired through the runner. */
function retireOlderMakes(outcome: RunOutcome): void {
  if (!outcome.ok || !("proposal" in outcome) || outcome.proposal.tool !== "make_exercise") return;
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "proposal" || turn.body.state !== "open") continue;
    if (turn.body.proposal.tool !== "make_exercise") continue;
    dismissProposal(turn.body.proposal);
    setBody(turn.id, { ...turn.body, state: "expired" });
  }
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
  if (withGenerator(call, () => runAskCallAs(id, call))) return id;
  runAskCallAs(id, call);
  return id;
}

function runAskCallAs(id: string, call: ToolCall): void {
  const at = where();
  if (!at) {
    appendAskTurn({ id, kind: "tool", body: unavailable() });
    return;
  }
  writeOutcome(id, runCoachTool(call, at.host, at.ctx), at);
}

/**
 * The model's call (leg c3b2a), as the body of the turn it replaces, or null
 * for nothing to add. Through the runner as the model's (`via: "model"`): the
 * shape check with `audience: "player"`, the context, and every `go` or
 * `confirm` tool a proposal labelled as the model's reading. A `read` tool's
 * receipt is shown at once (it changes nothing). A refusal, or a receipt from
 * anything but a `read` tool, adds nothing: the rule-made answer stands.
 */
export function modelCallBody(call: ToolCall): ToolBody | null {
  const at = where();
  if (!at) return null;
  const outcome = runCoachTool(call, at.host, at.ctx, undefined, { via: "model" });
  if (!outcome.ok) return null;
  if ("proposal" in outcome) return { ...(bodyOf(outcome, at.host, at.ctx) as ToolBody & { kind: "proposal" }), via: "model" };
  return findTool(call.tool)?.kind === "read" ? bodyOf(outcome, at.host, at.ctx) : null;
}

/** A Take, a count-in or a jam take's recording starting: who must stop (the model's turn, leg c3b2a). */
const takeStartListeners = new Set<() => void>();

export function onAskTakeStart(fn: () => void): () => void {
  takeStartListeners.add(fn);
  return () => takeStartListeners.delete(fn);
}

/** A Take runs where the tools look (the context's run), or a jam take is being written: nothing of the model starts. */
export function askTakeNow(): boolean {
  if (jamTakeHold !== null) return true;
  const at = where();
  if (!at) return false;
  try {
    return takeRunning(at.ctx) || at.host.jamTakeRunning();
  } catch {
    return true;
  }
}

function tellTakeStart(): void {
  for (const fn of [...takeStartListeners]) {
    try {
      fn();
    } catch {
      // A listener's failure is not the Take's.
    }
  }
}

function writeOutcome(id: string, outcome: RunOutcome, at: { host: CoachToolHost; ctx: CoachContext }): void {
  retireOlderMakes(outcome);
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
 * separate press of the same thing retires the earlier receipt's Undo; when
 * it moved on from exactly the value that press left, its own Undo carries
 * the run's start (leg chip1b, review M1: "Slower, Slower, Slower, Undo" puts
 * back the tempo before the run, and the live receipt says the whole change).
 */
export function pressChip(call: ToolCall, said: string): string {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  const id = askTurnId();
  const at = where();
  if (!at) {
    appendAskTurn({ id, kind: "tool", body: unavailable() });
    return id;
  }
  const outcome = pressCoachChip(call, at.host, at.ctx, undefined, liveChipUndoFor(call)?.call);
  const changed = outcome.ok && !("proposal" in outcome) && chipPressable(findTool(call.tool));
  if (changed && outcome.undo) retireSameUndos(outcome.undo);
  appendAskTurn({ id, kind: "tool", body: bodyOf(outcome, at.host, at.ctx, changed) });
  followLater(id, outcome);
  return id;
}

/** The newest live chip Undo of the same tool (and, a setting, the same key) as `call`. */
function liveChipUndoFor(call: ToolCall): UndoState | null {
  const turns = getAskState().turns;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (undo?.chip && undo.state === "live" && undo.call.tool === call.tool && undo.call.args.key === call.args.key) return undo;
  }
  return null;
}

/**
 * The same setting's earlier Undo, live: the same tool and (a setting) the
 * same key. Retired by name, not by reading the value: right after a press
 * the host's reads still give the value from before it until the engine's
 * echo comes back over IPC (`useMetronome`'s state event; more than one
 * render), so a value check here would retire the Undo just issued.
 */
function retireSameUndos(next: ToolCall, keepStacked = false): void {
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo || undo.state !== "live" || undo.kind !== "confirm" || undo.call.tool !== next.tool) continue;
    if (undo.call.args.key !== next.args.key) continue;
    // `next` puts back exactly the value this chip's Undo guards: kept, the second step back (`stackedBehind`).
    if (keepStacked && undo.chip && undo.call.args.at !== undefined && undo.call.args.at === undoValueOf(next)) continue;
    retire(turn.id, turn.body, undo);
  }
}

function retire(id: string, body: ToolBody & { kind: "receipt" }, undo: UndoState): void {
  retireUndo(undo.call);
  if (jamTakeHold) {
    jamTakeHold.push({ id, call: undo.call });
    return;
  }
  setBody(id, { ...body, undo: { ...undo, state: "gone" } });
}

/**
 * A chip's Undo is offered until the value it changed is changed again, by
 * anyone: asked of the runner (`undoStillGood`, which changes nothing)
 * whenever the host says the panel opened or the screen, the step, the
 * Exercise or the run's phase moved (`useAskHost`). A change made again
 * through Ask retires it by name at that press (`retireSameUndos`). One that
 * would no longer put back what its receipt changed is retired; the receipt
 * stays as a plain line. Pressed in between, the undo's own guard refuses it
 * (the runner's `at`), so it never changes anything else.
 *
 * The host's tempo and subdivision are the engine's echo (`useMetronome`'s
 * state event over IPC), so for a moment after a press they still read the
 * value from before it. An Undo younger than `CHIP_UNDO_SETTLE_MS` is left
 * alone here (leg chip1b, review L1): a look in that moment would retire the
 * Undo just issued. The runner's guard still holds at its press.
 * Under the Settings overlay nothing is asked (the player has not left the
 * screen, and the runner's place is the screen under it).
 */
export function noteAskUndos(): void {
  const at = where();
  if (at && viewOf(at.host) === "settings") return;
  const now = Date.now();
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo?.chip || undo.state !== "live") continue;
    if (undo.issued !== undefined && now - undo.issued < CHIP_UNDO_SETTLE_MS) continue;
    if (at && undoStillGood(undo.call, at.host, at.ctx)) continue;
    if (at && stackedBehind(undo.call, turn.id, at, now)) continue;
    retire(turn.id, turn.body, undo);
  }
}

/** The one argument an undo puts back (`bpm`, `subdivision`, `value`): not its `at` guard, not a setting's key. */
function undoValueOf(call: ToolCall): unknown {
  const names = Object.keys(call.args).filter((name) => name !== "at" && name !== "key");
  return names.length === 1 ? call.args[names[0]] : undefined;
}

/**
 * Whether a newer live Undo of the same thing (a confirmed proposal's, with
 * its clock) puts back exactly the value `older`'s `at` guards (leg chip1c,
 * review chip1b LOW 2). Then `older` is the second step of the way back to
 * where the player started: pressing the newer one makes it good again, so
 * it is kept. A Session has one rung per nudge and no Undo that spans two.
 */
function stackedBehind(older: ToolCall, olderId: string, at: { host: CoachToolHost; ctx: CoachContext }, now: number): boolean {
  if (older.args.at === undefined) return false;
  const turns = getAskState().turns;
  const from = turns.findIndex((t) => t.id === olderId);
  for (let i = turns.length - 1; i > from; i--) {
    const turn = turns[i];
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const newer = turn.body.undo;
    if (!newer || newer.kind !== "confirm" || !undoLive(newer, now)) continue;
    if (newer.call.tool !== older.tool || newer.call.args.key !== older.args.key) continue;
    if (undoValueOf(newer.call) !== older.args.at) continue;
    return undoStillGood(newer.call, at.host, at.ctx);
  }
  return false;
}

/** How long a chip's new Undo is left alone by `noteAskUndos` (the IPC echo's round trip, with room). */
export const CHIP_UNDO_SETTLE_MS = 400;

/**
 * A Take started: no chip's Undo outlives it (the receipt stays, as a plain
 * line). The runner spends it now; the card is written when the Take ends
 * (`settleAskTurn` holds it), because nothing of Ask commits during a Take.
 */
export function noteAskTake(): void {
  tellTakeStart();
  retireAskChipUndos();
}

/**
 * The values a chip's Undo would put back were replaced by another route
 * (leg chip1b, review L2): a preset, a jam or a setlist entry loaded, or a
 * loop started in a Session; or moved with no press (leg chip1c, review chip1b
 * LOW 4): the jam tempo trainer's step and its revert on Stop
 * (`useJamSession`), a speed ramp's start (`useCoachToolHost`). A hand change
 * and back is left to the runner's value guard (`at`): the Undo is then good
 * again and puts back the value before the chip's press, which the player
 * had. A value that went away and came back must not
 * be overwritten by a stale Undo, so every live chip Undo goes (the receipts
 * stay as plain lines). Called from the load paths and by `useAskHost`,
 * never per beat; does nothing when no chip Undo is live.
 */
export function noteAskLoad(): void {
  retireAskChipUndos();
}

function retireAskChipUndos(): void {
  for (const turn of getAskState().turns) {
    if (turn.kind !== "tool" || turn.body.kind !== "receipt") continue;
    const undo = turn.body.undo;
    if (!undo?.chip || undo.state !== "live") continue;
    retireUndo(undo.call);
    if (jamTakeHold) jamTakeHold.push({ id: turn.id, call: undo.call });
    else drawGone(turn.id, undo.call);
  }
}

/** A spent Undo drawn as a plain line (held, like an answer, while a Session's Take runs). */
function drawGone(id: string, call: ToolCall): void {
  settleAskTurn(id, (now) =>
    now.kind === "tool" && now.body.kind === "receipt" && now.body.undo?.call === call && now.body.undo.state === "live"
      ? { ...now, body: { ...now.body, undo: { ...now.body.undo, state: "gone" } } }
      : null,
  );
}

/**
 * Receipts whose Undo the runner spent while a jam take was being written,
 * drawn as plain lines when it ends; null while no jam take is running.
 */
let jamTakeHold: Array<{ id: string; call: ToolCall }> | null = null;

/**
 * A jam take started or ended (leg chip1c, review chip1b MEDIUM): the owner's
 * rule counts a jam take being written as a Take, so no Undo of a chip
 * outlives its start, as with a Session's (`noteAskTake`). The runner spends
 * them at once; nothing of Ask is drawn while the take is written (the jam
 * take does not hold Ask's answers the way a Session's Take does), so the
 * receipts become plain lines when it ends. Pressed in between, an Undo drawn
 * live is refused by the runner (spent, and its backstop: no `confirm` undo
 * runs while a jam take is written). Called by `useCoachToolHost` when
 * `jamTakeRunning` flips, never per beat.
 */
export function noteAskJamTake(running: boolean): void {
  if (running) {
    tellTakeStart();
    if (jamTakeHold === null) jamTakeHold = [];
    retireAskChipUndos();
    return;
  }
  if (jamTakeHold === null) return;
  const held = jamTakeHold;
  jamTakeHold = null;
  for (const { id, call } of held) drawGone(id, call);
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
  // `make_exercise` names nothing by title, so it is always the answer: run once the generator is in.
  if (withGenerator(call, () => runTypedCall(call, said))) return true;
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
 * `detail` 0 and counts once: a held Enter or Space fires a click on every
 * auto-repeat, and those are not presses (leg chip1b, review M1). The
 * button's `onKeyDown` is `noKeyRepeat`, which marks a repeat and stops its
 * default; a click with `detail` 0 that follows a marked repeat is dropped.
 */
export function onePress(fn: () => void): (event: { detail: number }) => void {
  return (event) => {
    if (event.detail > 1) return;
    if (event.detail === 0 && keyRepeating) {
      keyRepeating = false;
      return;
    }
    fn();
  };
}

/** A held Enter or Space is repeating (set by `noKeyRepeat`, read by `onePress`). One keyboard, one flag. */
let keyRepeating = false;

/** A tool button's `onKeyDown`: the auto-repeat of a held Enter or Space is not a press. */
export function noKeyRepeat(event: { key: string; repeat: boolean; preventDefault: () => void }): void {
  const activates = event.key === "Enter" || event.key === " ";
  if (activates && event.repeat) {
    keyRepeating = true;
    watchKeyRepeat();
    event.preventDefault();
    return;
  }
  keyRepeating = false;
}

/**
 * The flag is one for the whole window, so it must not outlive the held key
 * (leg chip1c, review chip1b LOW 5): a button replaced while Enter is held
 * never sees its keyup, and the flag would swallow the next `detail` 0 click
 * (a screen reader's activation). Any keyup, a blur or a pointer press
 * anywhere clears it. Installed once, the first time a repeat is marked.
 */
let keyRepeatWatched = false;
function watchKeyRepeat(): void {
  if (keyRepeatWatched || typeof window === "undefined") return;
  keyRepeatWatched = true;
  const clear = (): void => {
    keyRepeating = false;
  };
  window.addEventListener("keyup", clear, true);
  window.addEventListener("blur", clear, true);
  window.addEventListener("pointerdown", clear, true);
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
  // Not now (it would stop what started sounding since it was shown): it stays, and says why.
  if (!result.ok && result.why === "notNow" && proposalOpen(turn.body.proposal)) {
    setBody(id, { ...turn.body, note: result.line });
    return;
  }
  // The same thing changed again: a chip's earlier Undo for it is not this one's to keep,
  // unless this one's Undo puts back exactly the value it guards (leg chip1c, review chip1b
  // LOW 2: in a Session a second chip press is this proposal, and a nudge's Undo is one rung,
  // so the first chip Undo stays live behind it as the second step back to the start).
  if (result.ok && result.undo) retireSameUndos(result.undo, true);
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
  // Nothing to undo before the store has said it kept the add (review t2c, finding 4): not offered yet.
  if (body.settling && laterDecidesUndo(undo)) return;
  // Already pressed (settling, done, refused) or gone: a second press changes nothing (review t2cb, LOW 4).
  if (undo.state !== "live") return;
  if (!undoLive(undo, Date.now())) {
    setBody(id, { ...body, undo: { ...undo, state: "gone" } });
    return;
  }
  const at = where();
  if (!at) return;
  const result = runCoachUndo(undo.call, at.host, at.ctx);
  if (result.ok) {
    // An Undo the app finishes a moment later (leg t2c: the store's write) says it is at it, and
    // "Undone." only when the store answers (review t2c, finding 4); its note says how it went.
    setBody(id, { ...body, undo: { ...undo, state: result.later ? "settling" : "done", note: result.receipt } });
    void result.later?.then((settled) =>
      settleAskTurn(id, (turn) =>
        turn.kind === "tool" && turn.body.kind === "receipt" && turn.body.undo
          ? { ...turn, body: { ...turn.body, undo: { ...turn.body.undo, state: settled.key.startsWith("coachTools.why.") ? "refused" : "done", note: settled } } }
          : null,
      ),
    );
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
    // A next chip to the screen now on screen has nothing left to do ("Open Paths" on Paths; leg t2g,
    // t2d's open point 5): it goes, and does not come back.
    let body = turn.body;
    const next = body.next?.filter((c) => !(c.call.tool === "go_to" && c.call.args.screen === view));
    if (body.next && next && next.length < body.next.length) {
      body = { ...body, next: next.length > 0 ? next : undefined };
      setBody(turn.id, body);
    }
    const undo = body.undo;
    if (!undo || undo.state !== "live") continue;
    if (undo.chip) {
      // A chip's Undo: only on its screen and, in a Session, its step (leg chip1). The Settings
      // overlay is not another screen: it stops nothing and the player comes back to the same
      // place (leg chip1b, review L2 d); back from it, the view and the step are checked again.
      if (view === "settings") continue;
      const stepMoved = step !== undefined && (undo.step ?? null) !== step;
      if (undo.view === null || undo.view !== view || stepMoved) retire(turn.id, body, undo);
      continue;
    }
    if (undo.view === null || undo.view === view) continue;
    // An add's Undo still on its clock (its own "Open Paths" chip moves the view): the receipt says
    // it ended (it does not come back) and what does the same job, rather than losing it silently
    // (review t2c, finding 3; review t2cb, MEDIUM 1).
    const said = laterDecidesUndo(undo) && undoLive(undo, Date.now()) ? { note: line("coachTools.make.undoLeft") } : {};
    setBody(turn.id, { ...body, undo: { ...undo, state: "gone", ...said } });
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
