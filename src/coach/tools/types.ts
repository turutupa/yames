/**
 * The coach's tools: the shapes every tool, call, result and proposal share.
 *
 * DESIGN 13 and TOOLS 2.1. A tool is a small typed description plus a
 * function, and the same list serves a chip, a typed command and (later) a
 * model. This file holds the shapes; `registry.ts` holds the list and
 * re-exports these, so a reader can start there.
 *
 * ## The rule the shapes keep
 *
 * The coach never changes anything uninvited, and never starts, stores or
 * spends without the player's press (BRIEF, owner decisions). So a tool is one
 * of three kinds, and the kind decides how it runs:
 *
 * - `go`: at once. The player asked, it is reversible in one tap, nothing
 *   sounds, nothing is stored. Returns a receipt and the call that undoes it.
 * - `confirm`: one press. It starts sound, changes what is practised, or
 *   stores something. The runner returns a `Proposal`; nothing happens until
 *   `confirmCoachTool(proposal, ...)` is called from a press.
 * - `read`: reading, not acting (show a scale, explain a screen).
 *
 * The fourth sort, **never**, is not a kind: those are not tools at all, and
 * the host (`host.ts`) has no member that could reach them.
 *
 * ## Plain data first
 *
 * `ToolSpec` is the plain-data half of a tool (name, kind, arguments, notes),
 * in the style of `blocks/spec.ts`, so a JSON schema and a grammar can be
 * generated from it later (`ToolCatalogue` is that generator's input). The
 * functions (`when`, `run`, `propose`, `commit`) sit beside it on `CoachTool`.
 *
 * ## No sentence is assembled in code
 *
 * A receipt, a refusal, a choice's label and a proposal's summary are a
 * `Line`: a locale key and the values to fill it with, the values being what
 * the app actually did (a Path's title as the player reads it, a Step's
 * number). The strings land in the locales with the UI (leg t1b).
 */

import type { CoachContext } from "../context";
import type { ResolvedBlock } from "../blocks/resolve";
import type { CoachToolHost } from "./host";
import type { SessionPlan } from "../../session/planner";
import type { CustomSummary } from "../../paths/custom";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * What one argument may hold. Closed sets and numbers, and the player's own
 * words (`query`) where a thing is named: a player-facing tool never takes an
 * id. `appId` exists only for the app's own calls (an undo the runner minted)
 * and `registry.test.ts` fails if a player-facing tool declares one.
 */
export type ArgType =
  /** One of a fixed set of words. */
  | { kind: "enum"; values: readonly string[] }
  /** A whole number, inclusive both ends. Snapped by the tool, not here. */
  | { kind: "integer"; min: number; max: number }
  /** The player's words naming a thing. The app resolves them (`resolve.ts`). */
  | { kind: "query"; maxLength: number }
  /** A chord as the app writes it (`blocks/schema.ts`'s pattern). */
  | { kind: "chordName" }
  /** An id the app minted itself. Only on `audience: "app"` tools. */
  | { kind: "appId"; maxLength: number };

export type ArgField = {
  name: string;
  type: ArgType;
  /** Left out, the argument must be there. */
  optional?: true;
  /** What it means, in one line. The `description` in a generated schema. */
  note: string;
};

export type ArgSpec = readonly ArgField[];

/** What a validated argument holds. */
export type ArgValue = string | number;

export type ToolArgs = Readonly<Record<string, ArgValue>>;

/** One call: a tool's name and its arguments, as a chip, a command or a model writes it. */
export type ToolCall = { tool: string; args: ToolArgs };

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** A sentence the UI draws: a locale key and what to fill it with. Never a sentence. */
export type Line = { key: string; values: Readonly<Record<string, string | number>> };

/** A "Which one?" chip: what it says and the call it makes. */
export type ToolChoice = { label: Line; call: ToolCall };

export type ToolKind = "read" | "go" | "confirm";

/**
 * Why nothing happened.
 *
 * - `notFound`: the words named nothing the app has (or several: then
 *   `choices` holds them, "Which one?").
 * - `notNow`: not in this context (a Take is running, a Session is open, the
 *   tool is for another screen).
 * - `refused`: the call itself is wrong (an unknown tool, a bad argument), or
 *   the app said no (four Paths at most).
 * - `notWiredYet`: typed and listed, waiting on a later leg. Said out loud
 *   rather than doing nothing quietly (as `runCoachAction` does).
 */
export type RefusalReason = "notFound" | "notNow" | "refused" | "notWiredYet";

export type Refusal = {
  ok: false;
  why: RefusalReason;
  /** What to tell the player. */
  line: Line;
  /** "Which one?": each a full call the app made, not a guess. */
  choices?: readonly ToolChoice[];
  /** For the debug log, never shown. */
  detail?: string;
};

export type ToolDone = {
  ok: true;
  /** What the app did, from what it actually did. */
  receipt: Line;
  /**
   * The call that puts the app back where it was. Every `go` that changed
   * something has one. Hand back this very object to `runCoachUndo`: the
   * runner remembers the undos it handed out and runs each once.
   */
  undo?: ToolCall;
  /** What a `read` tool shows, resolved against the app's own data. */
  blocks?: readonly ResolvedBlock[];
  /**
   * The jam on the Jam screen when the blocks were drawn, by id: a "Pin this
   * shape" among them pins to that jam and no other (review c5a1 L3).
   */
  forJam?: string;
  /**
   * The receipt as it turned out, when the app only learns that a moment
   * later (a preset is re-read from the store before it is applied). Until it
   * settles, `receipt` says the app is at it, never that it is done (leg t1b1).
   * When it also decides whether there is anything to undo (an add the store
   * may refuse), name the Undo's tool in `askTools.ts`'s `UNDO_AFTER_LATER`:
   * that Undo is then hidden until `later` settles and withdrawn when it
   * settles as a refusal. Any other Undo is left as it is (review t2c, 7).
   */
  later?: Promise<Line>;
  /** Where to go next, offered under the receipt as chips ("Open Paths", leg t2c). Each a full call. */
  next?: readonly ToolChoice[];
};

/**
 * What `make_exercise` would make (leg t2c), drawn above its proposal: the
 * generator's facts (never words), one pass of the notes in the order they
 * are played (the first is the first note), and the variant chips, each a
 * full `make_exercise` call that proposes again.
 */
export type ExercisePreview = {
  readonly summary: CustomSummary;
  readonly notes: readonly { readonly string: number; readonly fret: number }[];
  readonly variants: readonly ToolChoice[];
};

export type ToolResult = ToolDone | Refusal;

/**
 * What a `confirm` tool would do, shown before it does it.
 *
 * Plain data the UI draws (`line`). What the tool resolved stays inside the
 * runner, which alone hands it back to the tool's `commit`: nothing a caller
 * does to this object can change what the press does. A proposal is minted
 * by `runCoachTool` and accepted once by `confirmCoachTool`; one built by
 * hand, or confirmed twice, does nothing.
 */
export type Proposal = {
  readonly tool: string;
  /** The call as made (after the shape check). */
  readonly args: ToolArgs;
  /** Exactly what will happen, as a line ("Start today at part 3: …"). */
  readonly line: Line;
  /** Today's plan as it would be (`set_minutes`, `set_focus`): drawn under the proposal. */
  readonly plan?: SessionPlan;
  /**
   * Confirmed, this cannot be undone from the receipt (`follow_path`: leaving
   * a Path is the player's, never a tool). The UI says so before the press.
   */
  readonly noUndo?: true;
  /** `make_exercise`: the Exercise it would add, drawn before the press (leg t2c). */
  readonly preview?: ExercisePreview;
};

export type Proposed = { ok: true; proposal: Proposal };

/**
 * What `runCoachTool` returns: a result, or a proposal (a `confirm` tool, or
 * a `go` tool that would stop something sounding).
 */
export type RunOutcome = ToolResult | Proposed;

/** What a `confirm` tool's `propose` returns. */
export type ProposeResult<R = unknown> =
  | { ok: true; line: Line; resolved: R; plan?: SessionPlan; noUndo?: true; preview?: ExercisePreview }
  | Refusal;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * Who may call a tool. `player`: a chip, a typed command, a model. `app`: only
 * the app itself, for an undo it minted (`runCoachUndo`); never in the
 * catalogue a grammar or a command matcher is built from.
 */
export type ToolAudience = "player" | "app";

/** The plain-data half of a tool. */
export type ToolSpec = {
  name: string;
  kind: ToolKind;
  audience: ToolAudience;
  args: ArgSpec;
  /** What it does, in one line. */
  note: string;
  /**
   * It changes the screen (or opens a Session), and the app stops a playing
   * click, band or song when it does. A `go` tool marked so is not "at once"
   * while something sounds: the runner returns a proposal that says what
   * stops. A `confirm` tool's proposal names what stops.
   */
  leaves?: true;
  /**
   * A suggestion chip's own press is the press (the owner's decision on the
   * 1k questions, item 1; leg chip1): the runner confirms the proposal at once
   * (`pressCoachChip`) and the receipt carries Undo. Set only in the
   * registry's `CHIP_PRESS` table, never at a call site, and only on a
   * `confirm` tool that changes one value, has an undo that puts back exactly
   * what was there, starts and stops no sound and does not navigate;
   * `chipPress.test.ts` walks every flagged tool and proves it. A typed
   * command, a "Which one?" choice, a model's call and the
   * `accept-suggestion` binding never read it: they keep the proposal.
   */
  chipPress?: true;
};

type ToolFunctions = {
  /**
   * Whether the tool can be offered in this context. False while a Take runs,
   * for every tool (`registry.test.ts` walks the list); the runner checks that
   * too, before `when`.
   */
  when: (ctx: CoachContext) => boolean;
};

export type ActTool = ToolSpec &
  ToolFunctions & {
    kind: "go" | "read";
    run: (args: ToolArgs, host: CoachToolHost, ctx: CoachContext) => ToolResult;
  };

export type ConfirmTool = ToolSpec &
  ToolFunctions & {
    kind: "confirm";
    /** Resolve the call and say what would happen. Must not change anything. */
    propose: (args: ToolArgs, host: CoachToolHost, ctx: CoachContext) => ProposeResult;
    /** Do it: called only by `confirmCoachTool`, with what `propose` resolved. */
    commit: (resolved: unknown, host: CoachToolHost, ctx: CoachContext) => ToolResult;
  };

export type CoachTool = ActTool | ConfirmTool;

/**
 * A `confirm` tool, typed by what its `propose` resolves, erased to the list's
 * type. t1a2 writes its tools with this.
 */
export function defineConfirmTool<R>(tool: ToolSpec &
  ToolFunctions & {
    kind: "confirm";
    propose: (args: ToolArgs, host: CoachToolHost, ctx: CoachContext) => ProposeResult<R>;
    commit: (resolved: R, host: CoachToolHost, ctx: CoachContext) => ToolResult;
  }): ConfirmTool {
  return tool as unknown as ConfirmTool;
}

/** The generator's input: what a JSON schema and a grammar are built from (later). */
export type ToolCatalogue = {
  /** Bumped when a change is not backwards compatible. */
  version: number;
  tools: readonly ToolSpec[];
};

// ---------------------------------------------------------------------------
// Small helpers every tool uses
// ---------------------------------------------------------------------------

/** A Take is running: count-in, playing, or being scored. Nothing runs then. */
export function takeRunning(ctx: CoachContext): boolean {
  const phase = ctx.run?.phase;
  return phase === "playing" || phase === "listening";
}

/** A Session is open (any phase but idle): leaving it is the player's (Exit). */
export function inSession(ctx: CoachContext): boolean {
  return ctx.screen === "session" || (ctx.run !== undefined && ctx.run.phase !== "idle");
}

export function line(key: string, values: Record<string, string | number> = {}): Line {
  return { key, values };
}

export function refuse(
  why: RefusalReason,
  key: string,
  values: Record<string, string | number> = {},
  extra: { choices?: readonly ToolChoice[]; detail?: string } = {},
): Refusal {
  return { ok: false, why, line: line(key, values), ...extra };
}

/** The honest "not yet" (`runCoachAction`'s `"notWiredYet"`, as a result). */
export function notWiredYet(tool: string): Refusal {
  return refuse("notWiredYet", "coachTools.why.notWiredYet", { tool });
}

/** A string argument the runner has already checked. */
export function argString(args: ToolArgs, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
}

/** A number argument the runner has already checked. */
export function argNumber(args: ToolArgs, name: string): number | undefined {
  const value = args[name];
  return typeof value === "number" ? value : undefined;
}
