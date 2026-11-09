/**
 * The Session runner: an explicit, cancellable state machine.
 *
 * A pure reducer in the style of `src/setlist/runtime.ts`. It decides what the
 * Session is doing and what the one big next action is; `useSessionRun` is the
 * part that talks to the engine and to `useSession`. Every state a Session can
 * be in is named here, so "what happens if the player stops during the count-in"
 * is a line in a table rather than a race between effects.
 *
 * ```
 *            start
 *   idle ─────────────▶ ready ──takeStarted──▶ playing ──takeStopped──▶ listening
 *    ▲                    ▲                                                 │
 *    │                    │ again / slower / faster                  takeResult
 *    │ close              └────────────────── result ◀──────────────────────┘
 *    │                                          │ next
 *  recap ◀── (no steps left) ───────────────────┤
 *    ▲                                          ▼
 *    └── next, tick when time is up ─────────  timed  (a metronome, a jam, a drill)
 * ```
 *
 * The two rules from the brief are the shape of it. **Lessons wait for the
 * player:** an Exercise sits in `ready` and in `result` until told otherwise, and
 * running over its minutes only changes what the big action offers. **Timed steps
 * move on:** a metronome or a jam is left by the clock, through `tick`.
 *
 * Any state can `cancel`. That goes to `idle` from wherever it is and the effects
 * hook tears down whatever was running; there is no state it has to wait for.
 */
import type { Exercise } from "../paths/format";
import type { TakeGrade } from "./grade";
import { hasRungAbove, hasRungBelow, rungAbove, rungBelow } from "./ladder";
import type { PlanStep, SessionPlan } from "./planner";
import type { TakeMeasures } from "./takeMeasures";

export type RunPhase =
  /** No Session. */
  | "idle"
  /** An Exercise is up, waiting for the player to start a Take. */
  | "ready"
  /** A Take is running, count-in included. */
  | "playing"
  /** The Take stopped and the scorer is being asked. */
  | "listening"
  /** A Take has been graded, or could not be. Waits for the player. */
  | "result"
  /** A metronome, a jam or a drill is running against the clock. */
  | "timed"
  /** The Session is over, and says what moved. */
  | "recap";

/** One Take, as the Session remembers it. */
export type TakeOutcome = {
  stepId: string;
  exerciseId: string;
  title: string;
  bpm: number;
  takeNumber: number;
  measures: TakeMeasures;
  grade: TakeGrade;
  /** The same number on the last Take heard, to show it move. Null: first. */
  previousValue: number | null;
  /** The clean tempo before this Take. */
  cleanBefore: number | null;
};

export type RunState = {
  phase: RunPhase;
  plan: SessionPlan | null;
  stepIndex: number;
  /** The tempo the current Exercise is at. */
  bpm: number;
  /** Takes so far on the current step, from 0. */
  takes: number;
  /** When the Session began, and when this step did. */
  startedAt: number;
  stepStartedAt: number;
  /** The clock, as of the last event that carried it. */
  now: number;
  /** Every Take this Session, oldest first. */
  outcomes: TakeOutcome[];
  /** A timed step skipped or run. Kept so the recap can say what was not graded. */
  timedSteps: PlanStep[];
};

export type RunEvent =
  | { type: "start"; plan: SessionPlan; now: number }
  | { type: "takeStarted"; now: number }
  | { type: "takeStopped"; now: number }
  | { type: "takeResult"; outcome: TakeOutcome; now: number }
  /** Go again, at the tempo the result proposes. */
  | { type: "again"; bpm?: number; now: number }
  | { type: "slower"; exercise: Exercise; now: number }
  | { type: "faster"; exercise: Exercise; now: number }
  /** On to the next step, or the recap after the last. */
  | { type: "next"; now: number }
  /** The clock moved. Only a timed step cares. */
  | { type: "tick"; now: number }
  /** Reached from a result: Ramp up, then back to the plan. */
  | { type: "insertDrill"; step: Extract<PlanStep, { kind: "drill" }>; now: number }
  /** Leave. From any state. */
  | { type: "cancel" }
  /** The recap has been read. */
  | { type: "close" };

export const IDLE: RunState = {
  phase: "idle",
  plan: null,
  stepIndex: 0,
  bpm: 0,
  takes: 0,
  startedAt: 0,
  stepStartedAt: 0,
  now: 0,
  outcomes: [],
  timedSteps: [],
};

export function currentStep(state: RunState): PlanStep | null {
  return state.plan?.steps[state.stepIndex] ?? null;
}

export function nextStep(state: RunState): PlanStep | null {
  return state.plan?.steps[state.stepIndex + 1] ?? null;
}

/** Walk to step `index`, or the recap if there is none. */
function enter(state: RunState, index: number, now: number): RunState {
  const step = state.plan?.steps[index];
  if (!step) return { ...state, phase: "recap", stepIndex: index, now };
  const base = { ...state, stepIndex: index, stepStartedAt: now, takes: 0, now };
  if (step.kind === "exercise") return { ...base, phase: "ready", bpm: step.bpm };
  return {
    ...base,
    phase: "timed",
    bpm: step.kind === "drill" ? step.startBpm : step.kind === "metronome" ? step.bpm : 0,
    timedSteps: [...state.timedSteps, step],
  };
}

export function runReducer(state: RunState, event: RunEvent): RunState {
  if (event.type === "cancel") return IDLE;

  switch (state.phase) {
    case "idle":
      if (event.type !== "start") return state;
      if (event.plan.steps.length === 0) return state;
      return enter(
        { ...IDLE, plan: event.plan, startedAt: event.now, now: event.now },
        0,
        event.now,
      );

    case "ready":
      switch (event.type) {
        case "takeStarted":
          return { ...state, phase: "playing", now: event.now };
        case "slower":
          return { ...state, bpm: rungBelow(event.exercise, state.bpm), now: event.now };
        case "faster":
          return { ...state, bpm: rungAbove(event.exercise, state.bpm), now: event.now };
        case "next":
          return enter(state, state.stepIndex + 1, event.now);
        case "tick":
          return { ...state, now: event.now };
        default:
          return state;
      }

    case "playing":
      if (event.type === "takeStopped") return { ...state, phase: "listening", now: event.now };
      if (event.type === "tick") return { ...state, now: event.now };
      return state;

    case "listening":
      if (event.type === "takeResult") {
        return {
          ...state,
          phase: "result",
          takes: state.takes + 1,
          outcomes: [...state.outcomes, event.outcome],
          now: event.now,
        };
      }
      if (event.type === "tick") return { ...state, now: event.now };
      return state;

    case "result":
      switch (event.type) {
        case "again":
          return {
            ...state,
            phase: "ready",
            bpm: event.bpm ?? state.bpm,
            now: event.now,
          };
        case "slower":
          return {
            ...state,
            phase: "ready",
            bpm: rungBelow(event.exercise, state.bpm),
            now: event.now,
          };
        case "faster":
          return {
            ...state,
            phase: "ready",
            bpm: rungAbove(event.exercise, state.bpm),
            now: event.now,
          };
        case "next":
          return enter(state, state.stepIndex + 1, event.now);
        case "insertDrill": {
          const plan = state.plan;
          if (!plan) return state;
          const steps = [...plan.steps];
          steps.splice(state.stepIndex + 1, 0, event.step);
          return enter({ ...state, plan: { ...plan, steps } }, state.stepIndex + 1, event.now);
        }
        case "tick":
          return { ...state, now: event.now };
        default:
          return state;
      }

    case "timed":
      if (event.type === "next") return enter(state, state.stepIndex + 1, event.now);
      if (event.type === "tick") {
        const step = currentStep(state);
        const ends = state.stepStartedAt + (step?.minutes ?? 0) * 60_000;
        if (event.now >= ends) return enter(state, state.stepIndex + 1, event.now);
        return { ...state, now: event.now };
      }
      return state;

    case "recap":
      return event.type === "close" ? IDLE : state;
  }
}

/** Milliseconds left on the current step, floored at zero. */
export function stepRemainingMs(state: RunState): number {
  const step = currentStep(state);
  if (!step) return 0;
  return Math.max(0, state.stepStartedAt + step.minutes * 60_000 - state.now);
}

/** Whole minutes left of the Session as planned, rounded up, floored at zero. */
export function minutesLeft(state: RunState): number {
  const plan = state.plan;
  if (!plan) return 0;
  const later = plan.steps.slice(state.stepIndex + 1).reduce((sum, s) => sum + s.minutes, 0);
  return Math.ceil(stepRemainingMs(state) / 60_000) + later;
}

/**
 * The one big next action.
 *
 * What the big button says and what a pedal tap does, in one place, so the two
 * cannot disagree. `result` is the only state with a judgement in it:
 *
 * - Not heard: play it again. It did not count, so nothing else makes sense.
 * - Below the bar or stopped short: go again, same tempo, while there is time.
 * - Bar met below the pass rung: go up a rung, while there is time.
 * - Exercise passed, or this step's minutes are gone: on to the next thing.
 *
 * Time only ever changes the offer: nobody is cut off mid-Take, and "go again"
 * is still one tap away as the second button.
 */
export type BigAction =
  | { kind: "none" }
  | { kind: "startTake"; bpm: number }
  | { kind: "stopTake" }
  | { kind: "again"; bpm: number }
  | { kind: "next"; step: PlanStep }
  | { kind: "finish" }
  | { kind: "close" };

export function bigAction(state: RunState, exercise: Exercise | null): BigAction {
  const onward = (): BigAction => {
    const step = nextStep(state);
    return step ? { kind: "next", step } : { kind: "finish" };
  };
  switch (state.phase) {
    case "idle":
    case "listening":
      return { kind: "none" };
    case "ready":
      return { kind: "startTake", bpm: state.bpm };
    case "playing":
      return { kind: "stopTake" };
    case "timed":
      return onward();
    case "recap":
      return { kind: "close" };
    case "result":
      break;
  }

  const last = state.outcomes[state.outcomes.length - 1];
  if (!last) return onward();
  const timeLeft = stepRemainingMs(state) > 0;
  switch (last.grade.verdict) {
    case "notCaught":
      return { kind: "again", bpm: state.bpm };
    case "belowBar":
    case "tooShort":
      return timeLeft ? { kind: "again", bpm: state.bpm } : onward();
    case "ungraded":
      return onward();
    case "passed": {
      if (last.grade.passesExercise || !timeLeft || !exercise) return onward();
      return hasRungAbove(exercise, state.bpm)
        ? { kind: "again", bpm: rungAbove(exercise, state.bpm) }
        : onward();
    }
  }
}

/** Whether "slower" and "faster" mean anything right now. */
export function tempoNudges(state: RunState, exercise: Exercise | null) {
  const can = state.phase === "ready" || state.phase === "result";
  return {
    slower: can && !!exercise && hasRungBelow(exercise, state.bpm),
    faster: can && !!exercise && hasRungAbove(exercise, state.bpm),
  };
}

/** Turn the big action into the event that performs it, or null to do nothing. */
export function eventForBigAction(action: BigAction, now: number): RunEvent | null {
  switch (action.kind) {
    case "again":
      return { type: "again", bpm: action.bpm, now };
    case "next":
    case "finish":
      return { type: "next", now };
    case "close":
      return { type: "close" };
    // Starting and stopping a Take are the engine's to do; its edge is the event.
    case "startTake":
    case "stopTake":
    case "none":
      return null;
  }
}
