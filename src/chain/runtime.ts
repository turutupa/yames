/**
 * The chain runtime — what happens next, and when.
 *
 * Free of React and of Tauri so the decisions can be tested directly. It is
 * a reducer: feed it beats, get back a state and a list of effects for
 * whoever owns the engine to carry out.
 *
 * The rule the whole file is built around is U9.3. `engine.rs` resets
 * `measure_beat` to 0 the instant `beat_groups` changes, so applying a step
 * anywhere but on a downbeat cuts the bar in half — in 7/8, wherever the
 * trigger happened to land. So a fired trigger does not switch. It *arms* a
 * switch, and the switch lands on the next downbeat.
 *
 * That is why `armed` is a phase and not a boolean tucked inside an effect
 * handler: the gap between "the trigger fired" and "the step changed" is
 * real time, up to a whole bar of it, during which the transport still has
 * to say something true and a second trigger must not fire.
 *
 *     running ──trigger fires──▶ armed ──downbeat──▶ switching ──▶ running
 *                                  └──rest bars──▶ resting ──▶ switching
 *                                  └──last pass──▶ finished
 */
import type { Chain, ChainStep, ChainTrigger } from "../types";

export type ChainPhase =
  /** Not started, or stopped. */
  | "idle"
  /** Playing a step; no trigger has fired. */
  | "running"
  /** A trigger has fired. Waiting for the downbeat to switch on. (U9.3) */
  | "armed"
  /** Between steps, counting out a `rest` transition's bars. */
  | "resting"
  /** A step was entered by the event just reduced; its config is due now. */
  | "switching"
  /** The chain ran out of passes. (U9.6) */
  | "finished";

export type ChainRunState = {
  phase: ChainPhase;
  /** Index into `chain.steps`. */
  stepIndex: number;
  /** Passes completed so far. 0 while the first time through. (U9.6) */
  pass: number;
  /** Downbeats counted since this step's own first downbeat. */
  barsInStep: number;
  /** Wall seconds since this step began. */
  secondsInStep: number;
  /** Run-clock reading at which this step began; `secondsInStep`'s origin. */
  stepStartedAt: number;
  /** Rest bars still owed before the armed switch may land. */
  restBarsLeft: number;
  /**
   * False between `start` and the first downbeat. A chain started mid-bar
   * belongs to no bar yet, and counting the half bar it landed in as bar one
   * would make the first step a bar shorter than every other.
   */
  anchored: boolean;
  /** Where the armed switch is headed. Null unless armed or resting. */
  pending: ChainNext | null;
};

/** What follows the current step once its gap has elapsed. */
export type ChainNext =
  | { kind: "step"; index: number; pass: number }
  | { kind: "end" };

export type ChainEvent =
  | { kind: "start"; seconds: number }
  /** One engine beat. `seconds` is the run clock, from wall time. */
  | { kind: "beat"; isDownbeat: boolean; seconds: number }
  /** A manual trigger, or the transport's skip-ahead. (U9.2, U9.7) */
  | { kind: "advance" }
  | { kind: "stop" };

export type ChainEffect =
  /** Apply this step's configuration to the engine, now. */
  | { kind: "applyStep"; index: number; step: ChainStep }
  /** Go quiet for `bars` bars before the next step. */
  | { kind: "rest"; bars: number }
  /**
   * Count the player into the step just applied. Emitted after `applyStep`
   * and never before it: the beats have to sound at the tempo you are about
   * to play, which is the whole point of a count-in (U9.2).
   */
  | { kind: "countIn"; beats: number }
  /** The chain is over. Stop playback. (U9.6) */
  | { kind: "finished" };

export type ChainReduction = { state: ChainRunState; effects: ChainEffect[] };

export const IDLE_CHAIN_RUN: ChainRunState = {
  phase: "idle",
  stepIndex: 0,
  pass: 0,
  barsInStep: 0,
  secondsInStep: 0,
  stepStartedAt: 0,
  restBarsLeft: 0,
  anchored: false,
  pending: null,
};

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * Has the gap after this step come due?
 *
 * A non-positive or non-finite count never fires. A `bars: 0` step would
 * otherwise switch on its own first downbeat and then on the next one, and
 * a chain of them would run through itself in a single bar.
 */
export function triggerFired(
  trigger: ChainTrigger,
  barsInStep: number,
  secondsInStep: number,
): boolean {
  switch (trigger.kind) {
    case "manual":
      return false;
    case "bars":
      return Number.isFinite(trigger.bars) && trigger.bars > 0 && barsInStep >= trigger.bars;
    case "seconds":
      return (
        Number.isFinite(trigger.seconds) &&
        trigger.seconds > 0 &&
        secondsInStep >= trigger.seconds
      );
  }
}

/**
 * The step after this one, honouring `repeat` (U9.6).
 *
 * `repeat` 1 means once through, N means N times, 0 means until stopped.
 * `pass` counts completed passes, so leaving the last step completes
 * `pass + 1` of them.
 */
export function resolveNext(chain: Chain, stepIndex: number, pass: number): ChainNext {
  if (chain.steps.length === 0) return { kind: "end" };
  if (stepIndex + 1 < chain.steps.length) {
    return { kind: "step", index: stepIndex + 1, pass };
  }
  const completed = pass + 1;
  if (chain.repeat === 0) return { kind: "step", index: 0, pass: completed };
  // A repeat below 1 that is not 0 is nonsense; read it as once through
  // rather than as a chain that ends before it starts.
  const passes = Math.max(1, Math.floor(chain.repeat));
  if (completed >= passes) return { kind: "end" };
  return { kind: "step", index: 0, pass: completed };
}

/**
 * What the transport should count down. (U9.7)
 *
 * `secondsInStep` can be overridden with a live wall-clock reading: the
 * reduced state only moves on beats, and a seconds gap has to tick between
 * them or the number on screen stalls at 40 bpm.
 */
export function stepRemaining(
  chain: Chain,
  state: ChainRunState,
  secondsInStep: number = state.secondsInStep,
):
  | { kind: "manual" }
  | { kind: "bars"; bars: number }
  | { kind: "seconds"; seconds: number }
  | null {
  if (state.phase === "idle" || state.phase === "finished") return null;
  const step = chain.steps[state.stepIndex];
  if (!step) return null;
  // Once armed the countdown is over; what is left is the wait for the
  // downbeat, which is not a number the user can be given in advance.
  if (state.phase === "armed" || state.phase === "resting") return { kind: "bars", bars: 0 };
  switch (step.trigger.kind) {
    case "manual":
      return { kind: "manual" };
    case "bars":
      return { kind: "bars", bars: Math.max(0, step.trigger.bars - state.barsInStep) };
    case "seconds":
      return { kind: "seconds", seconds: Math.max(0, step.trigger.seconds - secondsInStep) };
  }
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function chainReduce(
  chain: Chain,
  state: ChainRunState,
  event: ChainEvent,
): ChainReduction {
  switch (event.kind) {
    case "start":
      return start(chain, event.seconds);
    case "stop":
      return { state: IDLE_CHAIN_RUN, effects: [] };
    case "advance":
      return advance(chain, state);
    case "beat":
      return beat(chain, state, event.isDownbeat, event.seconds);
  }
}

function start(chain: Chain, seconds: number): ChainReduction {
  if (chain.steps.length === 0) {
    return { state: { ...IDLE_CHAIN_RUN, phase: "finished" }, effects: [{ kind: "finished" }] };
  }
  return {
    state: {
      ...IDLE_CHAIN_RUN,
      phase: "switching",
      stepStartedAt: seconds,
      // The first downbeat anchors step one; until then no bar has elapsed.
      anchored: false,
    },
    effects: [{ kind: "applyStep", index: 0, step: chain.steps[0] }],
  };
}

function advance(chain: Chain, state: ChainRunState): ChainReduction {
  // Arming twice is not two switches, and a rest already under way is
  // committed — a second press must not shorten it.
  if (state.phase !== "running" && state.phase !== "switching") {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      phase: "armed",
      pending: resolveNext(chain, state.stepIndex, state.pass),
    },
    effects: [],
  };
}

function beat(
  chain: Chain,
  state: ChainRunState,
  isDownbeat: boolean,
  seconds: number,
): ChainReduction {
  if (state.phase === "idle" || state.phase === "finished") return { state, effects: [] };

  // `switching` lasts exactly as long as the event that produced it; by the
  // next beat the step's config is on the engine and the step is running.
  let next: ChainRunState =
    state.phase === "switching" ? { ...state, phase: "running" } : { ...state };

  if (isDownbeat) {
    // The armed switch lands here, whatever else this downbeat would have
    // meant. This is U9.3 in one line.
    if (next.phase === "armed") return land(chain, next, seconds);
    if (next.phase === "resting") {
      const restBarsLeft = next.restBarsLeft - 1;
      if (restBarsLeft <= 0) return enterStep(chain, next, seconds);
      return { state: { ...next, restBarsLeft }, effects: [] };
    }
    if (!next.anchored) {
      // Bar one of the step starts here. Seconds start here too: a step
      // that began halfway through a bar did not really begin there.
      return {
        state: { ...next, anchored: true, barsInStep: 0, secondsInStep: 0, stepStartedAt: seconds },
        effects: [],
      };
    }
    next.barsInStep += 1;
  } else if (!next.anchored) {
    return { state: next, effects: [] };
  }

  next.secondsInStep = seconds - next.stepStartedAt;
  if (next.phase !== "running") return { state: next, effects: [] };

  const step = chain.steps[next.stepIndex];
  if (step && triggerFired(step.trigger, next.barsInStep, next.secondsInStep)) {
    next.phase = "armed";
    next.pending = resolveNext(chain, next.stepIndex, next.pass);
    // A bars trigger comes due *on* a downbeat, so the wait U9.3 asks for is
    // already over — arm and land in the same breath rather than giving the
    // step an extra bar it did not ask for.
    if (isDownbeat) return land(chain, next, seconds);
  }
  return { state: next, effects: [] };
}

/** The armed switch has reached a downbeat. Rest first, or enter the step. */
function land(chain: Chain, state: ChainRunState, seconds: number): ChainReduction {
  const pending = state.pending ?? resolveNext(chain, state.stepIndex, state.pass);
  if (pending.kind === "end") {
    return {
      state: { ...state, phase: "finished", pending: null, restBarsLeft: 0 },
      effects: [{ kind: "finished" }],
    };
  }

  const transition = chain.steps[state.stepIndex]?.transition;

  // A count-in enters the step and then asks to be counted into it, in that
  // order — the beats must sound at the tempo you are about to play.
  if (transition?.kind === "countIn" && Number.isFinite(transition.bars) && transition.bars > 0) {
    const entered = enterStep(chain, { ...state, pending }, seconds);
    const beats = countInBeats(chain, pending, transition.bars);
    return beats > 0
      ? { ...entered, effects: [...entered.effects, { kind: "countIn", beats }] }
      : entered;
  }

  if (transition?.kind === "rest" && Number.isFinite(transition.bars) && transition.bars > 0) {
    return {
      state: {
        ...state,
        phase: "resting",
        pending,
        restBarsLeft: Math.floor(transition.bars),
        barsInStep: 0,
      },
      effects: [{ kind: "rest", bars: Math.floor(transition.bars) }],
    };
  }
  return enterStep(chain, { ...state, pending }, seconds);
}

/**
 * Bars of count-in, in beats.
 *
 * The transition is written in bars because that is how a musician counts one
 * in; the engine counts beats. The bar comes from the step being entered, not
 * the one being left — you are being counted into the new meter.
 *
 * Capped at the engine's own limit of 8, so a two-bar count-in of 7/8 asks for
 * something the engine will honour rather than something it will silently
 * clamp behind our back.
 */
const MAX_COUNT_IN_BEATS = 8;

function countInBeats(chain: Chain, pending: ChainNext, bars: number): number {
  if (pending.kind === "end") return 0;
  const step = chain.steps[pending.index];
  if (!step) return 0;
  const perBar = step.beatGroups.reduce((sum, n) => sum + n, 0) || 4;
  return Math.min(MAX_COUNT_IN_BEATS, Math.max(1, Math.floor(bars) * perBar));
}

function enterStep(chain: Chain, state: ChainRunState, seconds: number): ChainReduction {
  const pending = state.pending;
  if (!pending || pending.kind === "end") {
    return {
      state: { ...state, phase: "finished", pending: null, restBarsLeft: 0 },
      effects: [{ kind: "finished" }],
    };
  }
  const step = chain.steps[pending.index];
  if (!step) {
    // The chain was edited out from under a run. Stopping is the only
    // honest answer; guessing at a replacement step would be worse.
    return {
      state: { ...state, phase: "finished", pending: null, restBarsLeft: 0 },
      effects: [{ kind: "finished" }],
    };
  }
  return {
    state: {
      phase: "switching",
      stepIndex: pending.index,
      pass: pending.pass,
      barsInStep: 0,
      secondsInStep: 0,
      stepStartedAt: seconds,
      restBarsLeft: 0,
      // This downbeat is bar one of the new step — nothing left to anchor.
      anchored: true,
      pending: null,
    },
    effects: [{ kind: "applyStep", index: pending.index, step }],
  };
}
