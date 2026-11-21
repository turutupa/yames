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
 *                                                 ▲
 *                                      timedStart │
 *                                            timedReady
 * ```
 *
 * The two rules from the brief are the shape of it. **Lessons wait for the
 * player:** an Exercise sits in `ready` and in `result` until told otherwise, and
 * running over its minutes only changes what the big action offers. **Timed steps
 * move on:** a metronome or a jam is left by the clock, through `tick`.
 *
 * A timed step starts the way a Take does, though: it waits in `timedReady`,
 * its clock held at full, until the player presses Start (`timedStart`). The
 * warm-up used to begin the instant the Session opened, click and countdown
 * and all, before anyone had read what it was (owner, 2026-11-17).
 *
 * **Find my edge** is an Exercise step with the role `edge`, and the same states:
 * only the big action differs. It climbs a rung after every pass, holds after a
 * slip, and is done at the second slip on one rung or the top of the ladder.
 * What it found is `edgeOf`: the fastest rung passed over eight bars in a row, which is
 * exactly a clean tempo, so it moves the same number an Exercise does.
 *
 * Any state can `cancel`. That goes to `idle` from wherever it is and the effects
 * hook tears down whatever was running; there is no state it has to wait for.
 */
import type { Exercise } from "../paths/format";
import { takeBarsOf, type TakeGrade } from "./grade";
import { hasRungAbove, hasRungBelow, rungAbove, rungBelow } from "./ladder";
import type { LoopStep, PlanStep, SessionPlan } from "./planner";
import type { TakeMeasures } from "./takeMeasures";
import { withVariant } from "./take";

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
  /** A metronome, a jam or a drill is up, waiting for the player to start it. */
  | "timedReady"
  /** A metronome, a jam or a drill is running against the clock. */
  | "timed"
  /**
   * A bar or two of the Exercise on repeat, slow and ungraded, until the
   * player stops it (`RunState.loop`). Back to `ready` after.
   */
  | "looping"
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
  /**
   * The clean tempo before this Take, as the app shows it (`shownCleanTempoOf`:
   * a Take marked not fair left out). What it quotes as "before", not what
   * decided whether this Take raised the stored ceiling.
   */
  cleanBefore: number | null;
  /** The stored row's id, so an answer to "was this fair?" can be kept on it. */
  takeId?: string;
  /**
   * Played with nothing listening, on purpose: why it was not graded. Its
   * grade is `ungraded` and it moved nothing (owner, 2026-11-18).
   */
  ungraded?: UngradedWhy;
  /**
   * What the coach's note measured about where this Take slipped, kept for
   * the rules that read it (P1, P2 and the loop's button). Absent when the
   * note named no place and found no repeat.
   */
  spot?: TakeSpot;
};

/**
 * Where a Take slipped, and how often it has before (`takeNote`'s `place`,
 * `repeat` and `onceMoreHere`). Facts only: `bigAction` decides with them.
 */
export type TakeSpot = {
  /** Pattern bars the note named, from 1, the compared one first. Empty: no bar to name. */
  patternBars: number[];
  /** First, second or third time at the same spot and tempo; 3 also for three Takes falling. */
  repeat: 1 | 2 | 3;
  /** A pass that still holds the pattern bar that slipped in the Take before. */
  onceMoreHere: boolean;
};

/**
 * What a loop heard, when it was graded and something was measured: rounds
 * played whole, the rounds with no note missed, and how many of those came
 * last in a row.
 */
export type LoopHeard = { rounds: number; landed: number; lastRun: number };

/**
 * Why a Take is played without grading. `gradingOff`: the player's choice in
 * Settings or the wizard. `chosen`: asked at the ready screen, they picked
 * "Just play". `inputOff`: graded, but the input would not come on and they
 * played this one anyway.
 */
export type UngradedWhy = "inputOff" | "gradingOff" | "chosen" | "eyes";

/**
 * "This one is for your eyes" (DESIGN 4.2, "Watch your pick"): on an
 * Exercise where pick direction matters, which the app cannot hear, every
 * fifth Take is offered as one ungraded Take to watch the pick, with one
 * question after it. The honest line was said once already; this is not it.
 */
export const EYES_EVERY = 5;

/**
 * Whether the result on screen offers that Take: graded, on an Exercise whose
 * picking matters, and the next Take on it would be the fifth, tenth, ...
 */
export function eyesOffer(state: RunState, pickMatters: boolean): boolean {
  if (state.phase !== "result" || state.ungraded || !pickMatters) return false;
  const step = currentStep(state);
  if (step?.kind !== "exercise" || step.role === "test" || step.role === "placement") return false;
  const last = state.outcomes[state.outcomes.length - 1];
  if (!last || last.stepId !== step.id || last.ungraded !== undefined) return false;
  return (state.takes + 1) % EYES_EVERY === 0;
}

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
  /**
   * A running timed step is paused: the click is off, the clock holds, the
   * picture stays where it was (owner, beta 5). Only `timed` sets it.
   */
  paused: boolean;
  /**
   * Counts the times a timed step's sound was started: its Start, every
   * Resume and every Restart. The effects hook starts the engine again when it
   * moves, so a Restart from the top is a new run, not a toggle.
   */
  runs: number;
  /** Counts Restarts alone, so the picture knows a run is from the top, not a Resume. */
  restarts: number;
  /**
   * A timed step's clock ran out. It no longer moves on by itself (UX audit
   * SES-1): the sound stops and the player chooses Again or Next.
   */
  ended: boolean;
  /** Steps left before they were played out: shown as skipped, never as done. */
  skipped: string[];
  /**
   * Steps played out: a Take heard and judged, or a timed block run to its
   * end. Kept by id rather than read off `stepIndex`, because the bar's
   * blocks can be jumped to in any order (owner, 2026-11-18).
   */
  done: string[];
  /**
   * The rest of this Session is played without grading: grading is off, the
   * player chose "Just play", or the input would not come on. Null: graded.
   */
  ungraded: UngradedWhy | null;
  /**
   * Started from a Step's page (Play this, Find my edge, Test out): no
   * countdown (UX audit SES-11). Its Exercise waits for the player however
   * long it takes, so time never turns "Go again" into "Next".
   */
  untimed: boolean;
  /** The loop running now (`looping`), on the Exercise at `stepIndex`. */
  loop: LoopStep | null;
  /**
   * The last loop on this Exercise, once it stopped, and what it heard: the
   * ready screen's one line about it. Gone when the next Take starts.
   */
  afterLoop: { loop: LoopStep; heard: LoopHeard | null } | null;
};

/** A warm-up's or a jam's tempo, one press of - or +: not graded, so any tempo is fine. */
export const TIMED_BPM_STEP = 5;
export const TIMED_BPM_MIN = 30;
export const TIMED_BPM_MAX = 300;

/** The tempo one press away, held to a sane range. */
export function timedBpm(bpm: number, delta: number): number {
  const next = Math.round((bpm + delta) / TIMED_BPM_STEP) * TIMED_BPM_STEP;
  return Math.max(TIMED_BPM_MIN, Math.min(TIMED_BPM_MAX, next));
}

/**
 * A timed step whose tempo the player may set: a warm-up, a jam with one, or
 * a loop. Not a ramp, which moves it.
 */
export function timedTempoAdjustable(step: PlanStep | null): boolean {
  return !!step && (step.kind === "metronome" || step.kind === "loop" || (step.kind === "jam" && !!step.bpm));
}

/** A timed step whose tempo may move while it plays: a warm-up's click. */
export function timedTempoLive(step: PlanStep | null): boolean {
  return !!step && step.kind === "metronome";
}

export type RunEvent =
  | {
      type: "start";
      plan: SessionPlan;
      now: number;
      untimed?: boolean;
      /** Begin at this block rather than the first (Today's rows, 2026-11-18). */
      at?: number;
      ungraded?: UngradedWhy | null;
    }
  /**
   * To block `index`'s ready screen, before or after this one: the bar's
   * blocks and Previous. Never while a Take runs or is being scored.
   */
  | { type: "jump"; index: number; now: number }
  /** Graded or not, for the rest of this Session. */
  | { type: "setUngraded"; why: UngradedWhy | null }
  | { type: "takeStarted"; now: number }
  /** A timed step's Start was pressed: its clock begins now. */
  | { type: "timedStart"; now: number }
  | { type: "takeStopped"; now: number }
  | { type: "takeResult"; outcome: TakeOutcome; now: number }
  /** Go again, at the tempo the result proposes. */
  | { type: "again"; bpm?: number; now: number }
  | { type: "slower"; exercise: Exercise; now: number }
  | { type: "faster"; exercise: Exercise; now: number }
  /** On to the next step, or the recap after the last. `insert` is played first (placement's next try). */
  | { type: "next"; now: number; insert?: PlanStep }
  /** The clock moved. Only a timed step cares. */
  | { type: "tick"; now: number }
  /** Reached from a result: a step played next, then back to the plan. */
  | { type: "insertStep"; step: PlanStep; now: number }
  /** The steps after this one, planned again (placement moved the player). */
  | { type: "replaceRest"; steps: PlanStep[] }
  /** Leave. From any state. */
  | { type: "cancel" }
  /** The recap has been read. */
  | { type: "close" }
  /** A running timed step: hold it where it is. */
  | { type: "pause"; now: number }
  /** A paused timed step: on from where it was. */
  | { type: "resume"; now: number }
  /** A running or paused timed step: from the top, its clock full again. */
  | { type: "restart"; now: number }
  /** A timed step, ready or paused: play it at this tempo. */
  | { type: "setBpm"; bpm: number; now: number }
  /**
   * The ready screen's key chooser (card #93): this Exercise in another of its
   * variants, chosen by the player. Only on a ready screen, only an Exercise.
   */
  | { type: "setVariant"; seed: number }
  /**
   * Before anything on this step has been played: back to the timed step
   * before it, ready to start again (the warm-up once more, without Exit).
   */
  | { type: "back"; now: number }
  /**
   * From a ready screen or a result: a bar or two of this Exercise on repeat
   * (`loopOffer`). Back to this Exercise's ready screen when it stops.
   */
  | { type: "loop"; loop: LoopStep; now: number }
  /** The loop was stopped, with what it heard when it was graded and heard something. */
  | { type: "loopStopped"; heard: LoopHeard | null; now: number };

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
  paused: false,
  runs: 0,
  restarts: 0,
  ended: false,
  skipped: [],
  done: [],
  ungraded: null,
  untimed: false,
  loop: null,
  afterLoop: null,
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
  const base = {
    ...state,
    stepIndex: index,
    stepStartedAt: now,
    takes: 0,
    now,
    paused: false,
    ended: false,
    loop: null,
    afterLoop: null,
  };
  if (step.kind === "exercise") return { ...base, phase: "ready", bpm: step.bpm };
  return {
    ...base,
    phase: "timedReady",
    bpm:
      step.kind === "drill"
        ? step.startBpm
        : step.kind === "metronome"
          ? step.bpm
          : (step.bpm ?? 0),
    // Once each: a warm-up played again is still one warm-up.
    timedSteps: state.timedSteps.some((s) => s.id === step.id) ? state.timedSteps : [...state.timedSteps, step],
  };
}

/** Whether the step on screen counts as played out if it is left now. */
function playedOutHere(state: RunState): boolean {
  const step = currentStep(state);
  return (
    (state.phase === "timed" && state.ended) ||
    state.phase === "result" ||
    (!!step && state.outcomes.some((o) => o.stepId === step.id))
  );
}

/** Leave the step on screen: played out, it is done; otherwise skipped, unless it already was done. */
function leaving(state: RunState): Pick<RunState, "done" | "skipped"> {
  const step = currentStep(state);
  if (!step) return { done: state.done, skipped: state.skipped };
  if (playedOutHere(state)) {
    return {
      done: state.done.includes(step.id) ? state.done : [...state.done, step.id],
      skipped: state.skipped.filter((id) => id !== step.id),
    };
  }
  if (state.done.includes(step.id) || state.skipped.includes(step.id)) {
    return { done: state.done, skipped: state.skipped };
  }
  return { done: state.done, skipped: [...state.skipped, step.id] };
}

/** The phases a block can be jumped from: nothing running, nothing being scored. */
export function canJump(state: RunState): boolean {
  return (
    state.phase === "ready" ||
    state.phase === "result" ||
    state.phase === "timedReady" ||
    state.phase === "timed" ||
    // A loop has nothing in it to lose: it stops and the block opens.
    state.phase === "looping"
  );
}

/** Jumping away from here stops something running, so the player is asked first. */
export function jumpNeedsAsking(state: RunState): boolean {
  return (
    state.phase === "playing" ||
    state.phase === "listening" ||
    (state.phase === "timed" && !state.ended && !state.paused)
  );
}

/** Previous: the block before this one, if there is one. */
export function hasPrevious(state: RunState): boolean {
  return state.phase !== "idle" && state.phase !== "recap" && state.stepIndex > 0 && !!state.plan;
}

/** To block `index`: what is left here is marked, the block opens on its ready screen. */
function jumpTo(state: RunState, index: number, now: number): RunState {
  const steps = state.plan?.steps ?? [];
  if (!canJump(state) || index < 0 || index >= steps.length || index === state.stepIndex) return state;
  // Back to an earlier block, this one is still ahead and still to come: it
  // is not "skipped" unless it is passed by later (acceptance 5, P2-5). Played
  // out, it is done either way.
  const back = index < state.stepIndex;
  const left = leaving(state);
  const step = currentStep(state);
  const marked = {
    ...state,
    ...(back && step && !state.skipped.includes(step.id) ? { done: left.done, skipped: left.skipped.filter((id) => id !== step.id) } : left),
  };
  const target = steps[index];
  // A block jumped back to is being played again: no longer "skipped".
  return enter({ ...marked, skipped: marked.skipped.filter((id) => id !== target.id) }, index, now);
}

export function runReducer(state: RunState, event: RunEvent): RunState {
  if (event.type === "cancel") return IDLE;
  if (event.type === "jump") return jumpTo(state, event.index, event.now);
  if (event.type === "setUngraded") {
    if (state.phase === "idle" || state.phase === "recap") return state;
    return state.ungraded === event.why ? state : { ...state, ungraded: event.why };
  }
  if (event.type === "replaceRest") {
    if (!state.plan || state.phase === "idle" || state.phase === "recap") return state;
    const steps = [...state.plan.steps.slice(0, state.stepIndex + 1), ...event.steps];
    return { ...state, plan: { ...state.plan, steps } };
  }

  switch (state.phase) {
    case "idle":
      if (event.type !== "start") return state;
      if (event.plan.steps.length === 0) return state;
      return enter(
        {
          ...IDLE,
          plan: event.plan,
          startedAt: event.now,
          now: event.now,
          untimed: event.untimed === true,
          ungraded: event.ungraded ?? null,
        },
        Math.max(0, Math.min(event.plan.steps.length - 1, event.at ?? 0)),
        event.now,
      );

    case "ready":
      switch (event.type) {
        case "takeStarted":
          return { ...state, phase: "playing", afterLoop: null, now: event.now };
        case "loop":
          return startLoop(state, event.loop, event.now);
        case "slower":
          return { ...state, bpm: rungBelow(event.exercise, state.bpm), now: event.now };
        case "faster":
          return { ...state, bpm: rungAbove(event.exercise, state.bpm), now: event.now };
        case "next":
          // Skip this. With `insert`, that step is played next (from a Step's
          // page, the next Exercise there: UX audit TODAY-2).
          return onward(state, event.now, event.insert);
        case "back":
          return backOf(state, event.now);
        case "tick":
          return { ...state, now: event.now };
        case "setVariant": {
          const at = state.plan?.steps[state.stepIndex];
          if (!state.plan || at?.kind !== "exercise" || at.variantSeed === event.seed) return state;
          const steps = state.plan.steps.slice();
          steps[state.stepIndex] = { ...at, variantSeed: event.seed };
          return { ...state, plan: { ...state.plan, steps } };
        }
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
        case "next": {
          const plan = state.plan;
          const marked = { ...state, ...leaving(state) };
          if (!event.insert || !plan) return enter(marked, state.stepIndex + 1, event.now);
          const steps = [...plan.steps];
          steps.splice(state.stepIndex + 1, 0, event.insert);
          return enter({ ...marked, plan: { ...plan, steps } }, state.stepIndex + 1, event.now);
        }
        case "insertStep": {
          // Find my edge from a result: what is left of this step goes with it,
          // so the Session gets exactly the inserted step's minutes longer, as
          // the offer says ("Adds 3 minutes", QA 2026-11-17 #17).
          const plan = state.plan;
          if (!plan) return state;
          const carried = Math.round(stepRemainingMs({ ...state, now: event.now }) / 1000) / 60;
          const steps = [...plan.steps];
          steps.splice(state.stepIndex + 1, 0, { ...event.step, minutes: event.step.minutes + carried });
          return enter({ ...state, ...leaving(state), plan: { ...plan, steps } }, state.stepIndex + 1, event.now);
        }
        case "loop":
          return startLoop(state, event.loop, event.now);
        case "tick":
          return { ...state, now: event.now };
        default:
          return state;
      }

    case "looping":
      switch (event.type) {
        case "loopStopped": {
          // Back to this Exercise's ready screen, at the Take's own tempo:
          // the loop moved nothing, and counts as no Take.
          const loop = state.loop;
          return {
            ...state,
            phase: "ready",
            loop: null,
            afterLoop: loop ? { loop, heard: event.heard } : null,
            now: event.now,
          };
        }
        case "setBpm":
          // The loop's own tempo, never the Take's.
          return state.loop ? { ...state, loop: { ...state.loop, bpm: timedBpm(event.bpm, 0) }, now: event.now } : state;
        case "tick":
          return { ...state, now: event.now };
        default:
          return state;
      }

    case "timedReady":
      if (event.type === "timedStart") {
        return { ...state, phase: "timed", stepStartedAt: event.now, now: event.now, paused: false, runs: state.runs + 1 };
      }
      if (event.type === "next") return onward(state, event.now);
      if (event.type === "back") return backOf(state, event.now);
      if (event.type === "setBpm") {
        return timedTempoAdjustable(currentStep(state)) ? { ...state, bpm: event.bpm, now: event.now } : state;
      }
      // The clock is held at full until Start: the step's minutes are all still to come.
      if (event.type === "tick") return { ...state, stepStartedAt: event.now, now: event.now };
      return state;

    case "timed":
      if (event.type === "next") return onward(state, event.now);
      if (event.type === "pause") {
        return state.paused || state.ended ? state : { ...state, paused: true, now: event.now };
      }
      if (event.type === "resume") {
        return state.paused ? { ...state, paused: false, runs: state.runs + 1, now: event.now } : state;
      }
      if (event.type === "restart") {
        return {
          ...state,
          paused: false,
          ended: false,
          runs: state.runs + 1,
          restarts: state.restarts + 1,
          stepStartedAt: event.now,
          now: event.now,
        };
      }
      if (event.type === "setBpm") {
        // A jam between runs only: a tempo change mid-run would move the band
        // under the player. A warm-up's click any time: nothing in it is
        // graded, and slowing down to learn the pattern is the point of it
        // (acceptance pass 2: the arrows did nothing while one played).
        if (!timedTempoAdjustable(currentStep(state))) return state;
        if (!(state.paused || state.ended) && !timedTempoLive(currentStep(state))) return state;
        return { ...state, bpm: event.bpm, now: event.now };
      }
      // Paused, the clock holds: the step's start moves with the time that passes.
      if (event.type === "tick" && state.paused) {
        return { ...state, stepStartedAt: state.stepStartedAt + (event.now - state.now), now: event.now };
      }
      if (event.type === "tick") {
        if (state.ended) return { ...state, now: event.now };
        const step = currentStep(state);
        const ends = state.stepStartedAt + (step?.minutes ?? 0) * 60_000;
        // Played out: it holds there, Again or Next (SES-1), rather than moving on under the player.
        if (event.now >= ends) return { ...state, ended: true, paused: false, now: event.now };
        return { ...state, now: event.now };
      }
      return state;

    case "recap":
      return event.type === "close" ? IDLE : state;
  }
}

/** On to the next step from here; this one is marked skipped if it was not played out. */
function onward(state: RunState, now: number, insert?: PlanStep): RunState {
  const marked = { ...state, ...leaving(state) };
  const plan = state.plan;
  if (!insert || !plan) return enter(marked, state.stepIndex + 1, now);
  const steps = [...plan.steps];
  steps.splice(state.stepIndex + 1, 0, insert);
  return enter({ ...marked, plan: { ...plan, steps } }, state.stepIndex + 1, now);
}

/** Into a loop of the Exercise on screen: only that Exercise's own. */
function startLoop(state: RunState, loop: LoopStep, now: number): RunState {
  const step = currentStep(state);
  if (step?.kind !== "exercise" || loop.exerciseId !== step.exerciseId || loop.pathId !== step.pathId) return state;
  if (loop.fromBar < 1 || loop.toBar < loop.fromBar || loop.bpm <= 0) return state;
  return { ...state, phase: "looping", loop, afterLoop: null, now };
}

/** A loop runs this many rungs under the Take's tempo (DESIGN 4.2). */
export const LOOP_RUNGS_DOWN = 2;
/** At most this many bars of the pattern: "the pattern bar (or two)". */
export const LOOP_MAX_BARS = 2;

/**
 * The bars a loop plays, from the bars the note named: the compared bar, with
 * the neighbour that slipped beside it when there was one.
 */
export function loopBars(patternBars: readonly number[], tuneBars: number): { fromBar: number; toBar: number } | null {
  const first = patternBars[0];
  if (first === undefined || first < 1) return null;
  const named = new Set(patternBars);
  const last = Math.max(1, tuneBars);
  if (LOOP_MAX_BARS > 1 && named.has(first + 1) && first + 1 <= last) return { fromBar: first, toBar: first + 1 };
  if (LOOP_MAX_BARS > 1 && named.has(first - 1)) return { fromBar: first - 1, toBar: first };
  return { fromBar: Math.min(first, last), toBar: Math.min(first, last) };
}

/**
 * "Loop the first bar", when the Session offers it: on a ready screen or a
 * result of an Exercise whose last Take here named a place (or, ungraded,
 * when the player answered "Not yet" twice). `front`: the second time at the
 * same spot and tempo, the button leads the tonal row (DESIGN 4.2's table).
 */
export function loopOffer(
  state: RunState,
  exercise: Exercise | null,
  options: { notYetTwice?: boolean } = {},
): { loop: LoopStep; front: boolean } | null {
  if (state.phase !== "ready" && state.phase !== "result") return null;
  const step = currentStep(state);
  if (step?.kind !== "exercise" || !exercise) return null;
  const mine = stepOutcomes(state);
  const last = mine[mine.length - 1];
  if (!last) return null;
  let bars: { fromBar: number; toBar: number } | null = null;
  let front = false;
  if (last.ungraded === undefined && last.spot && last.spot.patternBars.length > 0) {
    bars = loopBars(last.spot.patternBars, exercise.bars);
    front = last.spot.repeat >= 2;
  } else if (last.ungraded !== undefined && options.notYetTwice) {
    // Nothing was heard, so no bar was named: the tune's first.
    bars = { fromBar: 1, toBar: 1 };
    front = true;
  }
  if (!bars) return null;
  return { loop: loopStepOf(state, step, exercise, bars), front };
}

/** The loop of these pattern bars of the Exercise step on screen: two rungs under, no minutes. */
function loopStepOf(
  state: RunState,
  step: Extract<PlanStep, { kind: "exercise" }>,
  exercise: Exercise,
  bars: { fromBar: number; toBar: number },
): LoopStep {
  let bpm = state.bpm;
  for (let i = 0; i < LOOP_RUNGS_DOWN; i += 1) bpm = rungBelow(exercise, bpm);
  return {
    kind: "loop",
    id: `${step.id}#loop`,
    title: step.title,
    pathId: step.pathId,
    exerciseId: step.exerciseId,
    variantSeed: step.variantSeed,
    ...bars,
    bpm,
    minutes: 0,
    why: step.why,
  };
}

/**
 * Why a loop the player asked for cannot start (leg lb1):
 * - `notHere`: not on an Exercise's ready screen or result (a Take runs, a
 *   warm-up, the recap, no Session);
 * - `outsideTune`: a bar before 1 or past the last bar the Take prints;
 * - `backwards`: the last bar asked is before the first;
 * - `acrossRounds`: the two bars fall in different rounds of the pattern
 *   (bars 4 and 5 of a four-bar tune are its last bar and its first again);
 * - `oneBar`: a range of bars on an Exercise one bar long (lb1b L2).
 */
export type LoopRefusal = "notHere" | "outsideTune" | "backwards" | "acrossRounds" | "oneBar";

/**
 * The door behind `loop_bars` (leg lb1): the loop `loopOffer` would build,
 * for pattern bars the player chose. Only from an Exercise's ready screen or
 * its result, as the runner's `loop` event; a fresh step with no Take yet is
 * allowed (the tempo is still two rungs under the step's).
 *
 * A range the player asks for is honoured inside the pattern even past
 * `LOOP_MAX_BARS` (the orchestrator's decision, lb1b L3): that cap is the
 * coach's own offer, "the pattern bar (or two)"; this is the player's own
 * request, made in words and pressed. It stores nothing, moves no plan, writes
 * no Take, and costs no memory a two-bar loop does not (the schedule is built
 * once; the deviations are capped at `STRIP_NOTES`).
 */
export function loopAt(
  state: RunState,
  exercise: Exercise | null,
  fromBar: number,
  toBar: number,
): { loop: LoopStep } | { refused: LoopRefusal } {
  if (state.phase !== "ready" && state.phase !== "result") return { refused: "notHere" };
  const step = currentStep(state);
  if (step?.kind !== "exercise" || !exercise) return { refused: "notHere" };
  if (!Number.isInteger(fromBar) || !Number.isInteger(toBar)) return { refused: "outsideTune" };
  if (toBar < fromBar) return { refused: "backwards" };
  if (fromBar < 1 || toBar > Math.max(1, exercise.bars)) return { refused: "outsideTune" };
  return { loop: loopStepOf(state, step, exercise, { fromBar, toBar }) };
}

/**
 * Bars as the Session prints them, to the pattern's. The tab strip labels
 * every bar by its bar of the pattern (`tabStripModel.segmentPlace`) and the
 * coach names pattern bars ("Loop bar 3"), so a number up to the pattern's
 * length is a pattern bar. A number past it can only be a bar of the Take
 * (`takeBarsOf`: rounds of the pattern), folded onto its pattern bar as
 * `rounds.foldBar` does; past the Take's last bar it is outside the tune. Two
 * bars in different rounds are refused rather than guessed at.
 */
export function printedLoopBars(
  exercise: Exercise,
  fromBar: number,
  toBar: number,
): { fromBar: number; toBar: number } | { refused: LoopRefusal } {
  if (!Number.isInteger(fromBar) || !Number.isInteger(toBar)) return { refused: "outsideTune" };
  if (toBar < fromBar) return { refused: "backwards" };
  const own = Math.max(1, exercise.bars);
  // A one-bar Exercise: every Take bar is its bar 1, so a range is answered
  // with that, not with rounds or a bar the tune lacks (lb1b L2).
  if (own === 1 && fromBar >= 1 && fromBar !== toBar) return { refused: "oneBar" };
  if (fromBar < 1 || toBar > Math.max(own, takeBarsOf(exercise))) return { refused: "outsideTune" };
  if (toBar <= own) return { fromBar, toBar };
  const round = (bar: number) => Math.floor((bar - 1) / own);
  if (round(fromBar) !== round(toBar)) return { refused: "acrossRounds" };
  const fold = (bar: number) => ((bar - 1) % own) + 1;
  return { fromBar: fold(fromBar), toBar: fold(toBar) };
}

/** A bars argument, and not a click handler's event passed by `onClick={startLoop}`. */
export function isLoopBars(value: unknown): value is { fromBar: number; toBar: number } {
  if (typeof value !== "object" || value === null) return false;
  const { fromBar, toBar } = value as { fromBar?: unknown; toBar?: unknown };
  return typeof fromBar === "number" && typeof toBar === "number";
}

/** `printedLoopBars`, then `loopAt`: the loop "loop bars 3-4" starts, or why not. */
export function loopAsked(
  state: RunState,
  exercise: Exercise | null,
  fromBar: number,
  toBar: number,
): { loop: LoopStep } | { refused: LoopRefusal } {
  // Where the player is comes first: off an Exercise's screen no bar number matters.
  const here = loopAt(state, exercise, 1, 1);
  if (!exercise || "refused" in here) return here;
  // The Take as it was printed: a variant may ask for more bars than the
  // Exercise as written (`passBars`), and its Take bars are real (lb1b L1).
  const bars = printedLoopBars(withVariant(exercise, here.loop.variantSeed), fromBar, toBar);
  if ("refused" in bars) return bars;
  return loopAt(state, exercise, bars.fromBar, bars.toBar);
}

/** What a block of the Session bar shows: the one on screen, played out, skipped, or still to come. */
export type BlockState = "on" | "done" | "skipped" | "todo";

export function blockState(state: RunState, index: number): BlockState {
  const step = state.plan?.steps[index];
  if (!step) return "todo";
  if (index === state.stepIndex && state.phase !== "recap") return "on";
  if (state.done.includes(step.id)) return "done";
  if (state.skipped.includes(step.id)) return "skipped";
  return "todo";
}

/**
 * Whether leaving now loses something, so Escape and Exit ask first
 * (acceptance P2-1, P2-2): a Take in this Session, a Take running or being
 * scored, or a timed block running. A ready screen with nothing played and
 * the recap leave at once.
 */
export function leaveNeedsAsking(state: RunState): boolean {
  if (state.phase === "idle" || state.phase === "recap") return false;
  if (state.outcomes.length > 0) return true;
  return state.phase === "playing" || state.phase === "listening" || (state.phase === "timed" && !state.ended);
}

/**
 * Back to the timed step just before this one, when nothing has been played
 * here yet: a warm-up gone by on its own clock can be played again.
 */
export function canGoBack(state: RunState): boolean {
  if (state.phase !== "ready" && state.phase !== "timedReady") return false;
  if (state.takes > 0) return false;
  const before = state.plan?.steps[state.stepIndex - 1];
  return !!before && before.kind !== "exercise";
}

function backOf(state: RunState, now: number): RunState {
  if (!canGoBack(state)) return state;
  return enter(state, state.stepIndex - 1, now);
}

/** Milliseconds left on the current step, floored at zero. */
export function stepRemainingMs(state: RunState): number {
  const step = currentStep(state);
  if (!step) return 0;
  return Math.max(0, state.stepStartedAt + step.minutes * 60_000 - state.now);
}

/** Whether the current step still has time: always, on a Session with no countdown. */
export function hasTimeLeft(state: RunState): boolean {
  return state.untimed || stepRemainingMs(state) > 0;
}

/** Whole minutes left of the Session as planned, rounded up, floored at zero. */
export function minutesLeft(state: RunState): number {
  const plan = state.plan;
  if (!plan) return 0;
  // Every block still to play, wherever it is: the bar's blocks can be jumped
  // to in any order, so "later" is not "after this index". A block played out,
  // or skipped and behind, gives nothing back, so jumping back to one does not refill the
  // clock with the whole plan (owner, 2026-11-18: the budget keeps real time).
  const later = plan.steps
    // A skipped block still ahead is reached by Next again, so it still counts.
    .filter(
      (s, i) =>
        i !== state.stepIndex && !state.done.includes(s.id) && (i > state.stepIndex || !state.skipped.includes(s.id)),
    )
    .reduce((sum, s) => sum + s.minutes, 0);
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
  | { kind: "playTake"; bpm: number }
  /** Start a timed step's clock, and whatever it plays. */
  | { kind: "startTimed"; step: PlanStep }
  | { kind: "endTake" }
  /**
   * Go again; `up` when it is a rung faster than the Take just played.
   * `onceMore` (P1): a pass that still held the bar that slipped before, so
   * the same tempo once more, with the rung above (`up`) one tap away.
   */
  | { kind: "again"; bpm: number; up?: boolean; onceMore?: { up: number } }
  /**
   * `leaveIt` (P2): the same place three times at one tempo, or three Takes
   * falling there. On, rather than again; every other choice stays.
   */
  | { kind: "next"; step: PlanStep; insert?: boolean; leaveIt?: boolean }
  | { kind: "finish"; leaveIt?: boolean }
  | { kind: "close" }
  /** A loop is running: stop it, back to the ready screen. */
  | { kind: "endLoop" };

/** Slips on one rung that end Find my edge. One is a hold, not a verdict. */
export const EDGE_SLIPS = 2;

export type Edge = {
  /** The fastest rung passed over eight bars in a row on this step: the edge. */
  reached: number | null;
  /** The rung it slipped on last, when it has. */
  slippedAt: number | null;
  /** Every Take on this step, in order, for the climb to be drawn. */
  climb: Array<{ bpm: number; verdict: TakeGrade["verdict"] }>;
  /** Nothing further to climb: the second slip on a rung, or the top rung passed. */
  done: boolean;
};

function stepOutcomes(state: RunState): TakeOutcome[] {
  const step = currentStep(state);
  return step ? state.outcomes.filter((o) => o.stepId === step.id) : [];
}

export function isEdgeStep(step: PlanStep | null): boolean {
  return step?.kind === "exercise" && step.role === "edge";
}

/** What Find my edge has found on the current step. */
export function edgeOf(state: RunState, exercise: Exercise | null): Edge {
  const mine = stepOutcomes(state);
  let reached: number | null = null;
  let slippedAt: number | null = null;
  for (const o of mine) {
    if (o.grade.verdict === "passed" && o.grade.cleanBpm !== null) {
      reached = Math.max(reached ?? 0, o.grade.cleanBpm);
    }
    if (o.grade.verdict === "belowBar") slippedAt = o.bpm;
  }
  const last = mine[mine.length - 1];
  const slipsHere = last
    ? mine.filter((o) => o.bpm === last.bpm && o.grade.verdict === "belowBar").length
    : 0;
  const topPassed =
    !!last && last.grade.verdict === "passed" && (!exercise || !hasRungAbove(exercise, last.bpm));
  return {
    reached,
    slippedAt,
    climb: mine.map((o) => ({ bpm: o.bpm, verdict: o.grade.verdict })),
    done: slipsHere >= EDGE_SLIPS || topPassed,
  };
}

/** The big action on Find my edge, after a Take. */
function edgeAction(state: RunState, exercise: Exercise | null, onward: () => BigAction): BigAction {
  const last = state.outcomes[state.outcomes.length - 1];
  if (!last) return onward();
  const timeLeft = hasTimeLeft(state);
  switch (last.grade.verdict) {
    case "notCaught":
      return { kind: "again", bpm: state.bpm };
    case "ungraded":
      return onward();
    case "tooShort":
      return timeLeft ? { kind: "again", bpm: state.bpm } : onward();
    case "passed":
    case "belowBar": {
      if (!timeLeft || edgeOf(state, exercise).done) return onward();
      return last.grade.verdict === "passed" && exercise
        ? { kind: "again", bpm: rungAbove(exercise, state.bpm), up: true }
        : { kind: "again", bpm: state.bpm };
    }
  }
}

/** Takes a review gets: two at the stored clean tempo. */
export const REVIEW_TAKES = 2;

/**
 * The roles that decide in a Take or two rather than climbing: a review, a
 * benchmark, Test out and placement.
 */
function decidingAction(
  state: RunState,
  step: Extract<PlanStep, { kind: "exercise" }>,
  onward: () => BigAction,
): BigAction | null {
  const last = state.outcomes[state.outcomes.length - 1];
  if (!last) return onward();
  if (last.grade.verdict === "notCaught") return { kind: "again", bpm: state.bpm };
  const passed = last.grade.verdict === "passed";
  switch (step.role) {
    case "review":
      // Two Takes at the clean tempo; a pass on either is a pass.
      if (passed || state.takes >= REVIEW_TAKES) return onward();
      return { kind: "again", bpm: state.bpm };
    case "benchmark":
    case "test":
      return onward();
    case "placement": {
      // A climb, one Take a rung, stopping at the first miss (UX audit TODAY-3).
      const plan = step.placement;
      if (!passed || !plan) return onward();
      const ladder = plan.ladder ?? [plan.passAtBpm];
      const higher = ladder.find((bpm) => bpm > state.bpm);
      if (higher !== undefined) return { kind: "again", bpm: higher, up: true };
      return plan.then ? { kind: "next", step: plan.then, insert: true } : onward();
    }
    default:
      return null;
  }
}

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
      return { kind: "playTake", bpm: state.bpm };
    case "playing":
      return { kind: "endTake" };
    case "timedReady": {
      const here = currentStep(state);
      return here ? { kind: "startTimed", step: here } : onward();
    }
    case "timed":
      return onward();
    case "looping":
      return { kind: "endLoop" };
    case "recap":
      return { kind: "close" };
    case "result":
      break;
  }

  const here = currentStep(state);
  if (isEdgeStep(here)) return edgeAction(state, exercise, onward);
  if (here?.kind === "exercise") {
    const deciding = decidingAction(state, here, onward);
    if (deciding) return deciding;
  }
  const last = state.outcomes[state.outcomes.length - 1];
  if (!last) return onward();
  const timeLeft = hasTimeLeft(state);
  switch (last.grade.verdict) {
    case "notCaught":
      return { kind: "again", bpm: state.bpm };
    case "belowBar":
      // P2, leave it (owner, 2026-11-20): the same place a third time at this
      // tempo, or a third Take falling, and the Session moves on. Going again
      // stays one tap away.
      if (last.spot?.repeat === 3) return leaveIt(onward());
      return timeLeft ? { kind: "again", bpm: state.bpm } : onward();
    case "tooShort":
      return timeLeft ? { kind: "again", bpm: state.bpm } : onward();
    case "ungraded":
      return onward();
    case "passed": {
      if (last.grade.passesExercise || !timeLeft || !exercise) return onward();
      if (!hasRungAbove(exercise, state.bpm)) return onward();
      const up = rungAbove(exercise, state.bpm);
      // P1, once more here (owner, 2026-11-20): a pass that still held the
      // bar that slipped the Take before stays at this tempo once. Once: a
      // pass here already, and the next one goes up as it always did.
      if (onceMoreHere(state, last)) return { kind: "again", bpm: state.bpm, onceMore: { up } };
      return { kind: "again", bpm: up, up: true };
    }
  }
}

function leaveIt(action: BigAction): BigAction {
  return action.kind === "next" || action.kind === "finish" ? { ...action, leaveIt: true } : action;
}

/** P1's condition: this pass held the spot that slipped before, and no pass at this tempo came before it here. */
function onceMoreHere(state: RunState, last: TakeOutcome): boolean {
  if (!last.spot?.onceMoreHere) return false;
  const mine = stepOutcomes(state);
  return !mine.slice(0, -1).some((o) => o.bpm === last.bpm && o.grade.verdict === "passed");
}

/** Whether "slower" and "faster" mean anything right now. */
export function tempoNudges(state: RunState, exercise: Exercise | null) {
  // A Test out is a Take at the pass tempo, or it tests nothing (UX audit
  // PATH-5): its tempo is locked.
  const step = currentStep(state);
  const locked = step?.kind === "exercise" && step.role === "test";
  const can = !locked && (state.phase === "ready" || state.phase === "result");
  const below = !!exercise && hasRungBelow(exercise, state.bpm);
  const above = !!exercise && hasRungAbove(exercise, state.bpm);
  return {
    slower: can && below,
    faster: can && above,
    /**
     * Why one is off, so a disabled button can say (UX audit SES-13):
     * "locked" on a Test out, "floor" or "ceiling" at the ladder's ends.
     */
    slowerWhy: locked ? ("locked" as const) : can && !below ? ("floor" as const) : null,
    fasterWhy: locked ? ("locked" as const) : can && !above ? ("ceiling" as const) : null,
  };
}

/** Turn the big action into the event that performs it, or null to do nothing. */
export function eventForBigAction(action: BigAction, now: number): RunEvent | null {
  switch (action.kind) {
    case "again":
      return { type: "again", bpm: action.bpm, now };
    case "next":
      return action.insert ? { type: "next", now, insert: action.step } : { type: "next", now };
    case "finish":
      return { type: "next", now };
    case "close":
      return { type: "close" };
    case "startTimed":
      return { type: "timedStart", now };
    // Starting and stopping a Take are the engine's to do; its edge is the event.
    case "playTake":
    case "endTake":
    case "endLoop":
    case "none":
      return null;
  }
}
