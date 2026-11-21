/**
 * The runner: one place a tool call becomes something the app does.
 *
 * TOOLS 2.3. Grown from `runCoachAction` (`blocks/actions.ts`), which stays
 * the block buttons' door; `runBlockAction` below sends a block's action to
 * the same host members a tool uses, so the button and the tool end at one
 * place.
 *
 * Every call is checked three times before anything runs:
 *
 * 1. **Its shape**, against the registry: a known tool a player may call,
 *    every argument known, present when required and of its type (a closed
 *    set, a number in range, the player's words of a bounded length).
 * 2. **The context**: never while a Take runs (checked here for every tool,
 *    whatever its `when` says), then the tool's own `when(ctx)`.
 * 3. **Resolution against real data**, inside the tool: the Path exists, the
 *    Step exists, the tempo is a rung. Several matches come back as choices.
 *
 * Then by kind: a `go` or `read` tool runs at once and returns its receipt
 * (and, for a `go`, the call that undoes it); a `confirm` tool returns a
 * proposal and nothing happens until `confirmCoachTool(proposal)` is called
 * from a press.
 */

import { runCoachAction, type CoachActionOutcome } from "../blocks/actions";
import type { CoachAction } from "../blocks/types";
import type { CoachContext } from "../context";
import { chordNamePattern } from "../blocks/schema";
import type { MainView } from "../../containers/main-window/MainHeader";
import type { CoachToolHost, HostOutcome, Sounding } from "./host";
import { COACH_TOOLS } from "./registry";
import {
  line,
  refuse,
  takeRunning,
  type ActTool,
  type ArgType,
  type ArgValue,
  type CoachTool,
  type Proposal,
  type Proposed,
  type Refusal,
  type RunOutcome,
  type ToolArgs,
  type ToolAudience,
  type ToolCall,
  type ToolResult,
} from "./types";

const CHORD_NAME = new RegExp(chordNamePattern());

type Checked<T> = { ok: true; value: T } | { ok: false; detail: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One argument against its type. A whole number written as digits is a number. */
function checkArg(type: ArgType, value: unknown, where: string): Checked<ArgValue> {
  switch (type.kind) {
    case "enum":
      return typeof value === "string" && type.values.includes(value)
        ? { ok: true, value }
        : { ok: false, detail: `${where} is not one of ${type.values.join(", ")}` };
    case "integer": {
      const number =
        typeof value === "number" && Number.isInteger(value)
          ? value
          : typeof value === "string" && /^-?\d+$/.test(value.trim())
            ? Number(value.trim())
            : null;
      if (number === null) return { ok: false, detail: `${where} is not a whole number` };
      if (number < type.min || number > type.max)
        return { ok: false, detail: `${where} is ${number}, outside ${type.min} to ${type.max}` };
      return { ok: true, value: number };
    }
    case "query":
    case "appId": {
      if (typeof value !== "string") return { ok: false, detail: `${where} is not text` };
      const text = value.trim();
      if (text.length === 0 || text.length > type.maxLength)
        return { ok: false, detail: `${where} is not 1 to ${type.maxLength} characters` };
      return { ok: true, value: text };
    }
    case "chordName": {
      if (typeof value !== "string") return { ok: false, detail: `${where} is not a chord name` };
      const name = value.trim();
      return CHORD_NAME.test(name) ? { ok: true, value: name } : { ok: false, detail: `${where} is not a chord the app writes` };
    }
  }
}

export type CheckedCall = { tool: CoachTool; args: ToolArgs };

/**
 * Check 1: the call's shape. `audience` is who is calling: a player's call
 * (a chip, a command, a model) can never reach an `app` tool.
 */
export function checkCall(
  call: unknown,
  registry: readonly CoachTool[] = COACH_TOOLS,
  audience: ToolAudience = "player",
): { ok: true; call: CheckedCall } | Refusal {
  const bad = (detail: string) => refuse("refused", "coachTools.why.refused.shape", {}, { detail });
  if (!isPlainObject(call) || typeof call.tool !== "string") return bad("not a tool call");
  const tool = registry.find((t) => t.name === call.tool);
  if (!tool || (tool.audience === "app" && audience !== "app")) return bad(`no tool "${call.tool}"`);
  const raw = call.args === undefined ? {} : call.args;
  if (!isPlainObject(raw)) return bad(`${tool.name}: args is not an object`);
  const known = new Set(tool.args.map((field) => field.name));
  for (const name of Object.keys(raw)) if (!known.has(name)) return bad(`${tool.name}: no argument "${name}"`);
  const args: Record<string, ArgValue> = {};
  for (const field of tool.args) {
    const value = raw[field.name];
    if (value === undefined || value === null) {
      if (field.optional) continue;
      return bad(`${tool.name}: ${field.name} is missing`);
    }
    const checked = checkArg(field.type, value, `${tool.name}.${field.name}`);
    if (!checked.ok) return bad(checked.detail);
    args[field.name] = checked.value;
  }
  return { ok: true, call: { tool, args } };
}

/** Check 2: the context. A Take running stops every tool, whatever its `when`. */
function checkContext(tool: CoachTool, ctx: CoachContext): Refusal | null {
  if (takeRunning(ctx)) return refuse("notNow", "coachTools.why.notNow.take");
  if (!tool.when(ctx)) return refuse("notNow", "coachTools.why.notNow.here", { tool: tool.name });
  return null;
}

/** A host or a tool that throws is a refusal with a reason in the log, never a crash in the panel. */
function guarded<T extends RunOutcome>(name: string, run: () => T): T | Refusal {
  try {
    return run();
  } catch (error) {
    return refuse("refused", "coachTools.why.failed", { tool: name }, { detail: String(error) });
  }
}

/**
 * The proposals this runner minted and nobody has confirmed yet, each with
 * what its tool resolved. That stays here, out of the caller's reach: the
 * proposal it hands out carries no `resolved`, so nothing a caller does to the
 * object it holds can change what the press does (review finding 6).
 */
const issued = new WeakMap<Proposal, unknown>();

function mint(
  tool: CoachTool,
  args: ToolArgs,
  proposed: Omit<Proposal, "tool" | "args"> & { resolved: unknown },
): Proposed {
  const proposal: Proposal = Object.freeze({
    tool: tool.name,
    args: Object.freeze({ ...args }),
    line: proposed.line,
    ...(proposed.plan ? { plan: proposed.plan } : {}),
    ...(proposed.noUndo ? { noUndo: true as const } : {}),
  });
  issued.set(proposal, proposed.resolved);
  return { ok: true, proposal };
}

/**
 * The undos this runner handed out and nobody has pressed yet. `runCoachUndo`
 * runs only one of these, once: a call made up by a caller, an app-only tool
 * named from outside, or an Undo pressed twice does nothing (review finding 5).
 */
const undos = new WeakMap<ToolCall, string>();

/**
 * Where an undo was handed out: the view and, in a Session, the Exercise
 * (its block and id). An undo is a plain call (`set_setting {countIn: off}`,
 * `set_tempo {bpm, at}`) that names no screen, so a `confirm` undo pressed
 * anywhere else would change that screen's count-in or tempo instead
 * (review t1a2b, finding A). `runCoachUndo` compares this with where the app
 * is at the press.
 */
function placeOf(host: CoachToolHost, ctx: CoachContext): string {
  const exercise = host.sessionActive() ? `${String(ctx.run?.stepIndex ?? "")}:${ctx.exercise?.id ?? ""}` : "";
  return `${host.view()}|${exercise}`;
}

/** A result as it leaves the runner: its undo, if any, frozen and remembered with where it was issued. */
function issue<T extends RunOutcome>(outcome: T, host: CoachToolHost, ctx: CoachContext): T {
  if (!outcome.ok || !("receipt" in outcome) || !outcome.undo) return outcome;
  const undo: ToolCall = Object.freeze({ tool: outcome.undo.tool, args: Object.freeze({ ...outcome.undo.args }) });
  undos.set(undo, placeOf(host, ctx));
  return { ...outcome, undo } as T;
}

/**
 * A `go` tool run dry: every read as it is, and the three doors a `go` tool
 * moves the app through shut. What the tool returns is then exactly what it
 * would do, nothing has moved, and `target` is the view it would show (null:
 * it would show none).
 */
function dryRun(tool: ActTool, args: ToolArgs, host: CoachToolHost, ctx: CoachContext): { dry: ToolResult; target: MainView | null } {
  let target: MainView | null = null;
  const dryHost: CoachToolHost = {
    ...host,
    setView: (view) => {
      target = view;
    },
    movePaths: () => {},
    openSettingsSection: () => {
      target = "settings";
    },
  };
  const dry = tool.run(args, dryHost, ctx);
  return { dry, target };
}

/**
 * What a navigating `go` tool would stop by going where it goes: nothing for
 * Settings (an overlay) or for the mode already playing, which the host
 * knows (`sounding(target)`, review findings 7 and 8).
 */
function leavingStops(tool: ActTool, args: ToolArgs, host: CoachToolHost, ctx: CoachContext): { dry: ToolResult; stops: Sounding | null } {
  const { dry, target } = dryRun(tool, args, host, ctx);
  return { dry, stops: dry.ok && target !== null ? host.sounding(target) : null };
}

/**
 * A `go` tool that leaves the screen while something sounds, and would stop
 * it, is not "at once" (the owner's rule: nothing sounds or stops sounding).
 * What it would do comes back as a proposal (the receipt's key under
 * `coachTools.propose.`, with what stops). Anything else runs as it is.
 */
function runGo(tool: ActTool, args: ToolArgs, host: CoachToolHost, ctx: CoachContext): RunOutcome {
  if (tool.kind !== "go" || !tool.leaves) return tool.run(args, host, ctx);
  const { dry, stops } = leavingStops(tool, args, host, ctx);
  if (!stops) return tool.run(args, host, ctx);
  if (!dry.ok || !dry.undo) return dry;
  const key = dry.receipt.key.replace(/^coachTools\.receipt\./, "coachTools.propose.");
  return mint(tool, args, { line: line(key, { ...dry.receipt.values, stops }), resolved: Object.freeze({ ...args }) });
}

function run(checked: CheckedCall, host: CoachToolHost, ctx: CoachContext): RunOutcome {
  const { tool, args } = checked;
  const wrong = checkContext(tool, ctx);
  if (wrong) return wrong;
  if (tool.kind !== "confirm") return guarded(tool.name, () => issue(runGo(tool, args, host, ctx), host, ctx));
  return guarded(tool.name, (): RunOutcome => {
    const proposed = tool.propose(args, host, ctx);
    if (!proposed.ok) return proposed;
    // A Session about to open says what it stops.
    const stops = tool.leaves ? host.sounding() : null;
    const said = stops ? line(proposed.line.key, { ...proposed.line.values, stops }) : proposed.line;
    return mint(tool, args, { ...proposed, line: said });
  });
}

/**
 * Run a player's call (a chip, a typed command, a model's pick). A `go` or
 * `read` tool acts now; a `confirm` tool returns a proposal and does nothing.
 */
export function runCoachTool(
  call: unknown,
  host: CoachToolHost,
  ctx: CoachContext,
  registry: readonly CoachTool[] = COACH_TOOLS,
): RunOutcome {
  const checked = checkCall(call, registry, "player");
  if (!checked.ok) return checked;
  return run(checked.call, host, ctx);
}

/**
 * The press on a proposal's button. Only a proposal this runner minted, only
 * once, and only if the context still allows it (a Take may have started
 * since it was shown).
 */
export function confirmCoachTool(
  proposal: Proposal,
  host: CoachToolHost,
  ctx: CoachContext,
  registry: readonly CoachTool[] = COACH_TOOLS,
): ToolResult {
  if (!issued.has(proposal)) return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "not a live proposal" });
  const resolved = issued.get(proposal);
  issued.delete(proposal);
  const tool = registry.find((t) => t.name === proposal.tool);
  if (!tool || !(tool.kind === "confirm" || (tool.kind === "go" && tool.leaves))) {
    return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "no such confirm tool" });
  }
  const wrong = checkContext(tool, ctx);
  if (wrong) return wrong;
  // A `go` tool's proposal holds its checked arguments: run it for real now.
  if (tool.kind !== "confirm") return guarded(tool.name, () => issue(tool.run(resolved as ToolArgs, host, ctx), host, ctx));
  return guarded(tool.name, () => issue(tool.commit(resolved, host, ctx), host, ctx));
}

/** Drop a proposal the player turned down ("Not now"), so it can never be confirmed. */
export function dismissProposal(proposal: Proposal): void {
  issued.delete(proposal);
}

/**
 * The press on a receipt's Undo: the `undo` this runner handed out with a
 * result, the very object, and once (a made-up call, or the same Undo
 * pressed twice, is refused and runs nothing). May reach the app's own tools
 * (`return_to`). An undo that is a `confirm` tool runs at once, because the
 * Undo press is the press. A `confirm` undo pressed anywhere but the view
 * (and, in a Session, the Exercise) it was issued on is refused and spent.
 * Refused as `notNow` (a Take, a click still playing), it stays good for a
 * later press, on that same screen.
 */
export function runCoachUndo(
  undo: unknown,
  host: CoachToolHost,
  ctx: CoachContext,
  registry: readonly CoachTool[] = COACH_TOOLS,
): ToolResult {
  if (!isPlainObject(undo) || !undos.has(undo as ToolCall)) {
    return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "not a live undo" });
  }
  const issuedUndo = undo as ToolCall;
  const place = undos.get(issuedUndo) ?? "";
  undos.delete(issuedUndo);
  // A `confirm` undo puts back a screen's own setting: anywhere else it would change
  // another screen's, so it is refused and spent. A `go` undo moves the view by design.
  const tool = registry.find((t) => t.name === issuedUndo.tool);
  if (tool?.kind === "confirm") {
    let here: string | null = null;
    try {
      here = placeOf(host, ctx);
    } catch {
      // A host that cannot say where it is cannot be where the undo was issued.
    }
    if (here !== place) {
      return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "the undo was issued on another screen" });
    }
  }
  const outcome = runIssuedUndo(issuedUndo, host, ctx, registry);
  if (!outcome.ok && outcome.why === "notNow") undos.set(issuedUndo, place);
  return outcome;
}

function runIssuedUndo(undo: ToolCall, host: CoachToolHost, ctx: CoachContext, registry: readonly CoachTool[]): ToolResult {
  const checked = checkCall(undo, registry, "app");
  if (!checked.ok) return checked;
  // Undo is not a press on "this stops the click": going back waits until it has stopped.
  const { tool, args } = checked.call;
  if (tool.kind === "go" && tool.leaves && !takeRunning(ctx)) {
    let stops: Sounding | null = null;
    try {
      stops = leavingStops(tool, args, host, ctx).stops;
    } catch {
      // A tool that throws is reported by `run` below, as a refusal.
    }
    if (stops) return refuse("notNow", "coachTools.why.notNow.sounding", { stops });
  }
  const outcome = run(checked.call, host, ctx);
  if (!("proposal" in outcome)) return outcome;
  return confirmCoachTool(outcome.proposal, host, ctx, registry);
}

/**
 * A block's button (`CoachAction`) through the tools' host: the same members
 * the `load_jam`, `load_preset` and `click_subdivision` tools call, with the
 * host's honest "not wired yet" passed on. `runCoachAction` does the mapping,
 * so a block action behaves here exactly as it does there; `ramp`, `comeBack`
 * and `loopBars` (whose block names a score the host's loop does not take)
 * stay `"notWiredYet"` as they are today.
 */
export function runBlockAction(action: CoachAction, host: CoachToolHost): CoachActionOutcome {
  let outcome: HostOutcome = "done";
  const result = runCoachAction(action, {
    // The block's button goes through the same gate as the library's; its question is the app's own.
    loadPreset: (id) => {
      const out = host.loadPreset(id);
      outcome = out === "asked" ? "done" : out;
    },
    loadJam: (id) => {
      const out = host.loadJam(id);
      outcome = out === "asked" ? "done" : out;
    },
    setClickSubdivision: (subdivision) => {
      outcome = host.setClickSubdivision(subdivision);
    },
  });
  return result === "done" ? outcome : result;
}
