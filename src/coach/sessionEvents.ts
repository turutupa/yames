/**
 * A Session's dispatches, heard by the coach (DESIGN 9.2, first row).
 *
 * The five Session events are moments of the run's reducer: a step's ready
 * screen comes up from half a dozen events (start, jump, next, again, back,
 * a placement's insert), a timed block ends on a clock tick, the recap opens
 * on the last Next. Publishing beside each of those dispatches would scatter a
 * dozen lines through `useSessionRun.ts`, and miss the next door somebody
 * adds. So the hook's `dispatch` is wrapped once: each event goes to React as
 * before, and is reduced a second time against a mirror of the state, here,
 * synchronously, so the coach hears exactly the transition it caused. Two
 * dispatches in one commit are two transitions, never one merged state, which
 * is the loss the design names when it rules out watching React state.
 *
 * `runReducer` is pure (every event carries its own clock), so the mirror and
 * React's state are the same sequence of values. The cost is one extra
 * reduction per dispatch; the busiest dispatcher is the Session's one-second
 * tick. Nothing here runs per beat.
 *
 * A dispatch the reducer ignores (a `takeResult` that arrives after a cancel)
 * changes nothing and publishes nothing.
 */
import { useCallback, useRef } from "react";
import type { SongAttemptReview } from "../containers/songs/review/useSongAttempt";
import { IDLE, currentStep, runReducer, type RunEvent, type RunState } from "../session/runner";
import { publish, type CoachEvent } from "./bus";

/**
 * The coach event one transition is, or null. `review` is the analysis of the
 * pass a `takeResult` judged, when the dispatcher has one.
 */
export function sessionEventFor(
  before: RunState,
  after: RunState,
  event: RunEvent,
  review: SongAttemptReview | null = null,
): CoachEvent | null {
  if (before === after) return null;

  if (event.type === "takeStarted" && before.phase === "ready" && after.phase === "playing") {
    return {
      type: "takeStarted",
      at: event.now,
      stepIndex: after.stepIndex,
      bpm: after.bpm,
      takeNumber: after.takes + 1,
    };
  }

  if (event.type === "takeResult" && before.phase === "listening" && after.phase === "result") {
    // Ungraded, nothing analysed the pass: a review lying about from an
    // earlier one is not this Take's.
    return { type: "takeResult", at: event.now, outcome: event.outcome, review: event.outcome.ungraded ? null : review };
  }

  if (after.phase === "recap" && before.phase !== "recap") {
    return {
      type: "sessionRecap",
      at: after.now,
      plan: after.plan,
      outcomes: after.outcomes,
      done: after.done,
      skipped: after.skipped,
      startedAt: after.startedAt,
    };
  }

  if (after.phase === "ready" || after.phase === "timedReady") {
    const fresh = before.phase !== after.phase || before.stepIndex !== after.stepIndex;
    const step = currentStep(after);
    if (fresh && step) {
      return {
        type: "stepReady",
        at: after.now,
        stepIndex: after.stepIndex,
        step,
        bpm: after.bpm,
        takes: after.takes,
        timed: after.phase === "timedReady",
      };
    }
    return null;
  }

  if (after.phase === "timed" && after.ended && !(before.phase === "timed" && before.ended)) {
    const step = currentStep(after);
    return step ? { type: "timedEnded", at: after.now, stepIndex: after.stepIndex, step } : null;
  }

  return null;
}

/** The run's `dispatch`, with a review riding along on a graded `takeResult`. */
export type PublishingDispatch = (event: RunEvent, review?: SongAttemptReview | null) => void;

/**
 * Wrap `useReducer(runReducer, IDLE)`'s dispatch so each transition is
 * published on the coach's bus. Stable for the life of the component, like the
 * dispatch it wraps.
 */
export function useCoachPublishingDispatch(dispatch: (event: RunEvent) => void): PublishingDispatch {
  const mirror = useRef<RunState>(IDLE);
  return useCallback(
    (event: RunEvent, review?: SongAttemptReview | null) => {
      dispatch(event);
      const before = mirror.current;
      const after = runReducer(before, event);
      mirror.current = after;
      const heard = sessionEventFor(before, after, event, review ?? null);
      if (heard) publish(heard);
    },
    [dispatch],
  );
}
