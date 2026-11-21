/**
 * The coach's ear on the app: one module-level emitter (DESIGN 9.2).
 *
 * The coach reacts to what happened (a step came up, a Take was judged, a
 * jam stopped), not to what React state looks like after it happened. Watching
 * state would be lossy, because two dispatches in one commit show only the
 * last, and it would add renders to a window that already renders on every
 * beat. So each place that already dispatches publishes one event here, and
 * the coach's surfaces read it with `useSyncExternalStore` (`useCoachEvent`).
 *
 * ## What it costs
 *
 * Nothing per beat: no event here is per beat, and none may become one.
 * `publish` with no subscriber is two property writes and an integer bump; the
 * snapshot handed to `useSyncExternalStore` is built lazily, on the first read
 * after a change, so a publish that nobody reads allocates nothing beyond the
 * event the caller already built. No React state, no timers, no queue.
 *
 * ## The snapshot
 *
 * The last event of each kind, which is all a surface needs: the note draws
 * the latest `takeResult`, the ready line the latest `stepReady`. A listener
 * that must see every event (a counter, a log) subscribes and is called
 * synchronously, in order, for each one. `seq` numbers events across kinds so
 * a surface can tell which of two kinds came last.
 *
 * Only the coach reads this. Nothing in the app may change what it does
 * because of an event here; the bus is a report, never a command.
 */
import type { SongAttemptReview } from "../containers/songs/review/useSongAttempt";
import type { HeardSummary } from "../ipc";
import type { LevelId } from "../paths/format";
import type { PlanStep, SessionPlan } from "../session/planner";
import type { TakeOutcome } from "../session/runner";
import type { SessionReport } from "../types";

/** Every event carries when it happened (ms, the publisher's clock); the bus adds its order (`seq`). */
type Stamp = { at: number };

/**
 * What the coach can hear, as one union. The Session's five are published by
 * `useSessionRun.ts` today; the rest are typed now and published by the legs
 * that build their surfaces (milestones after `savePathTake`, the jam in
 * `useJamSession.ts`, Songs in `useSongAttempt.ts`, the tools in
 * `useSegmentCoach.ts`, the app's opening in `MainWindow.tsx`).
 */
export type CoachEvent =
  // --- a Session (useSessionRun.ts) ---------------------------------------
  /** A step's ready screen is up: an Exercise waiting for a Take, or a timed block waiting for Start. */
  | (Stamp & {
      type: "stepReady";
      stepIndex: number;
      step: PlanStep;
      /** The tempo the step is at as it comes up. */
      bpm: number;
      /** Takes already played on this step (0 the first time it comes up). */
      takes: number;
      /** A warm-up, jam or drill (`timedReady`) rather than an Exercise (`ready`). */
      timed: boolean;
      /**
       * Go again (`again`: the button, R, "Up to N", the Take for the eyes):
       * this ready screen goes straight into the count-in, so nothing is said
       * on it (DESIGN section 8, Voice). Absent otherwise.
       */
      straight?: true;
    })
  /** A Take began (count-in included). From here until its result, the coach is quiet. */
  | (Stamp & { type: "takeStarted"; stepIndex: number; bpm: number; takeNumber: number })
  /**
   * A Take was judged, or played ungraded. `review` is the whole analysis of
   * the pass, findings included; null for an ungraded Take, which has none.
   */
  | (Stamp & { type: "takeResult"; outcome: TakeOutcome; review: SongAttemptReview | null })
  /** A timed block played out its minutes and holds there, Again or Next. */
  | (Stamp & { type: "timedEnded"; stepIndex: number; step: PlanStep })
  /** The Session is over and its recap is up. */
  | (Stamp & {
      type: "sessionRecap";
      plan: SessionPlan | null;
      outcomes: readonly TakeOutcome[];
      done: readonly string[];
      skipped: readonly string[];
      startedAt: number;
    })
  // --- milestones (useSessionRun.ts, after savePathTake; a later leg) -----
  | (Stamp & { type: "cleanTempoMoved"; pathId: string; exerciseId: string; from: number | null; to: number })
  | (Stamp & { type: "stepOpened"; pathId: string; stepId: string })
  | (Stamp & { type: "levelDone"; pathId: string; levelId: LevelId })
  | (Stamp & { type: "pathDone"; pathId: string })
  // --- elsewhere (later legs) --------------------------------------------
  /** `useJamSession.ts`, where `harmonyStop()` returns. */
  | (Stamp & { type: "jamStopped"; heard?: HeardSummary })
  /** `useSongAttempt.ts`, when a pass settles. */
  | (Stamp & { type: "songPassReviewed"; review: SongAttemptReview })
  /** `useSegmentCoach.ts`. */
  | (Stamp & { type: "toolRunEnded"; report: SessionReport })
  /** `MainWindow.tsx`, once. Null on the first day. */
  | (Stamp & { type: "appOpened"; daysAway: number | null });

export type CoachEventType = CoachEvent["type"];
export type CoachEventOf<K extends CoachEventType> = Extract<CoachEvent, { type: K }>;

/** An event as delivered: the published one plus its place in the order. */
export type Delivered<E extends CoachEvent = CoachEvent> = E & { readonly seq: number };

export type CoachListener = (event: Delivered) => void;

/** What `useSyncExternalStore` reads: the last event of each kind. Immutable. */
export type CoachBusSnapshot = {
  readonly seq: number;
  readonly last: { readonly [K in CoachEventType]?: Delivered<CoachEventOf<K>> };
};

const listeners = new Set<CoachListener>();
let last: { [K in CoachEventType]?: Delivered<CoachEventOf<K>> } = {};
let seq = 0;
/** Rebuilt on the first read after a change; null means "stale". */
let snapshot: CoachBusSnapshot | null = null;

/**
 * Tell the coach something happened. Synchronous; returns nothing and throws
 * nothing: a listener that fails is logged and the others still hear it, and
 * the publisher, which is the Session's own code, never sees the failure.
 */
export function publish(event: CoachEvent): void {
  seq += 1;
  // The event is stamped in place: it was built for this call and nobody else
  // holds it, so stamping it costs no copy.
  const delivered = event as Delivered;
  (delivered as { seq: number }).seq = seq;
  (last as Record<string, Delivered>)[event.type] = delivered;
  snapshot = null;
  if (listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(delivered);
    } catch (err) {
      console.warn("[yames] a coach listener failed", err);
    }
  }
}

/** Hear every event from now on. Returns the unsubscribe, as `useSyncExternalStore` wants. */
export function subscribe(listener: CoachListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last event of each kind. The same object until the next publish. */
export function getSnapshot(): CoachBusSnapshot {
  if (snapshot === null) snapshot = { seq, last: { ...last } };
  return snapshot;
}

/**
 * The last event of one kind, or null. Stable between publishes of that kind,
 * so a `useSyncExternalStore` that reads it re-renders only when it changes.
 */
export function lastEvent<K extends CoachEventType>(type: K): Delivered<CoachEventOf<K>> | null {
  return (last[type] as Delivered<CoachEventOf<K>> | undefined) ?? null;
}

/** How many listeners there are. For tests, and for a publisher that wants to skip building an expensive event. */
export function listenerCount(): number {
  return listeners.size;
}

/** Forget everything. Tests only. */
export function resetCoachBus(): void {
  listeners.clear();
  last = {};
  seq = 0;
  snapshot = null;
}
