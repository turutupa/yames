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
import type { CoachToolHost, HostOutcome } from "./host";
import { COACH_TOOLS } from "./registry";
import {
  refuse,
  takeRunning,
  type ArgType,
  type ArgValue,
  type CoachTool,
  type Proposal,
  type Refusal,
  type RunOutcome,
  type ToolArgs,
  type ToolAudience,
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

/** The proposals this runner minted and nobody has confirmed yet. */
const issued = new WeakSet<Proposal>();

function run(checked: CheckedCall, host: CoachToolHost, ctx: CoachContext): RunOutcome {
  const { tool, args } = checked;
  const wrong = checkContext(tool, ctx);
  if (wrong) return wrong;
  if (tool.kind !== "confirm") return guarded(tool.name, () => tool.run(args, host, ctx));
  return guarded(tool.name, (): RunOutcome => {
    const proposed = tool.propose(args, host, ctx);
    if (!proposed.ok) return proposed;
    const proposal: Proposal = Object.freeze({
      tool: tool.name,
      args: Object.freeze({ ...args }),
      line: proposed.line,
      resolved: proposed.resolved,
    });
    issued.add(proposal);
    return { ok: true, proposal };
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
  issued.delete(proposal);
  const tool = registry.find((t) => t.name === proposal.tool);
  if (!tool || tool.kind !== "confirm") return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "no such confirm tool" });
  const wrong = checkContext(tool, ctx);
  if (wrong) return wrong;
  return guarded(tool.name, () => tool.commit(proposal.resolved, host, ctx));
}

/** Drop a proposal the player turned down ("Not now"), so it can never be confirmed. */
export function dismissProposal(proposal: Proposal): void {
  issued.delete(proposal);
}

/**
 * The press on a receipt's Undo: the call the tool returned as its `undo`.
 * May reach the app's own tools (`return_to`). An undo that is a `confirm`
 * tool runs at once, because the Undo press is the press.
 */
export function runCoachUndo(
  undo: unknown,
  host: CoachToolHost,
  ctx: CoachContext,
  registry: readonly CoachTool[] = COACH_TOOLS,
): ToolResult {
  const checked = checkCall(undo, registry, "app");
  if (!checked.ok) return checked;
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
    loadPreset: (id) => {
      outcome = host.loadPreset(id);
    },
    loadJam: (id) => {
      outcome = host.loadJam(id);
    },
    setClickSubdivision: (subdivision) => {
      outcome = host.setClickSubdivision(subdivision);
    },
  });
  return result === "done" ? outcome : result;
}
