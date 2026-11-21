/**
 * The practice reminder as a screen reads it (leg rem2, rem2b): the stored
 * value (only once its key is read; null while loading or unreadable, which
 * says nothing), and the days the player practised in.
 *
 * What counts as practice (rem2b): a stored Path Take (My exercises and a
 * Take marked "not fair" included), a saved tool run, a stored Songs attempt.
 *
 * When it reads: once when the screen mounts (or the reminder is turned On),
 * again when its one timer fires (at the reminder's time today if still to
 * come, else at the next local midnight; then re-armed), and again when the
 * window becomes visible. A press on the row (a day, the time) re-arms the
 * timer but reads nothing. Today hands in the Takes its Session already holds
 * (`takes`), so they are not read twice. Nothing is read and no timer is
 * armed while the reminder is off, while the click sounds, or while a
 * Session is in progress (`coachHeld`, or `held` from the caller).
 *
 * A read that rejects leaves `practised` null, and a null says nothing; so do
 * Takes handed in as null (Today passes null until its Session's read of them
 * answered, and when that read failed: rem2c). Most of the practice store's
 * commands answer an empty list rather than reject when the store is
 * unavailable (`SharedPracticeStore::read_or`), but the Songs read here
 * (`listAttemptTimesSince`, rem2c) rejects, and it shares that store: with
 * the store unavailable, nothing is said. One case is left: a store that took
 * longer than `OPEN_WAIT` to open at launch and opened later, after Today's
 * Session had already read its Takes as empty; until the next launch, those
 * Takes look like none.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getSessionHistory, listAttemptTimesSince, listPathTakes } from "../ipc";
import { TAKES_TO_READ } from "../containers/session/hooks/useSessionRun";
import { coachHeld, subscribeCoachSessionBusy } from "../hooks/coachLoadGate";
import { practisedFrom, reminderNextCheck, reminderReadFrom, type Practised } from "./reminder";
import {
  coachKeyStates,
  coachStored,
  coachStoredLoaded,
  loadCoachStored,
  subscribeCoachStored,
  type CoachKeyState,
  type CoachReminder,
} from "./store";

/** `getSessionHistory` answers with the thirty newest saved tool runs. */
const TOOL_RUNS_READ = 30;
/** A timer a little after the minute, so the clock read when it fires is past it. */
const AFTER_MS = 500;

export function useStoredReminder(): { reminder: CoachReminder | null; state: CoachKeyState } {
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates, coachKeyStates);
  useEffect(() => {
    if (!coachStoredLoaded()) void loadCoachStored().catch(() => {});
  }, []);
  return { reminder: states.reminder === "read" ? stored.reminder : null, state: states.reminder };
}

type Read = { takes: number[] | null; runs: number[]; songs: number[] };

export type ReminderPractisedOptions = {
  /**
   * The Path Takes the caller already holds (Today: its Session's), newest
   * first, or null while they are still loading. Omitted: read them here.
   */
  takes?: ReadonlyArray<{ startedAt: number }> | null;
  /** The caller knows a Session is in progress (Today between Takes). */
  held?: boolean;
};

export function useReminderPractised(
  reminder: CoachReminder | null,
  options: ReminderPractisedOptions = {},
): { practised: Practised | null; now: number; held: boolean } {
  const on = reminder?.on === true;
  const held = useSyncExternalStore(subscribeCoachSessionBusy, coachHeld, coachHeld) || options.held === true;
  const ownTakes = options.takes === undefined;
  const [now, setNow] = useState(() => Date.now());
  // Bumped by the timer and by the window coming back: each bump is one read.
  const [tick, setTick] = useState(0);
  const [read, setRead] = useState<Read | null>(null);

  // The one timer: the reminder's time today or the next local midnight.
  // Re-armed when it fires (`now` moves) and on a change of the setting.
  const time = reminder?.time;
  const days = reminder?.days.join(",");
  useEffect(() => {
    if (!on || held || !reminder) return;
    const at = reminderNextCheck(reminder, Date.now());
    if (at === null) return;
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      setTick((n) => n + 1);
    }, Math.max(0, at - Date.now()) + AFTER_MS);
    return () => window.clearTimeout(timer);
    // `reminder` is read for its time and days only; a new object per press must not re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, held, time, days, now]);

  // The window coming back (a laptop opened, the app brought forward): look again.
  useEffect(() => {
    if (!on || held) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [on, held]);

  // The reads: on mount or On, on a tick, and when a Session or the click lets go.
  useEffect(() => {
    if (!on || held) return;
    let live = true;
    Promise.all([
      ownTakes ? listPathTakes(TAKES_TO_READ).then((takes) => takes.map((t) => t.startedAt)) : null,
      getSessionHistory().then((runs) => runs.map((r) => r.timestamp)),
      // rem2c: only the starts, only from the look-back's first midnight, every
      // song in one call (it rejects, rather than answering empty, when the
      // store is unavailable).
      listAttemptTimesSince(reminderReadFrom(Date.now())),
    ]).then(
      ([takes, runs, songs]) => {
        if (!live) return;
        setNow(Date.now());
        setRead({ takes, runs, songs });
      },
      () => {
        if (live) setRead(null);
      },
    );
    return () => {
      live = false;
    };
  }, [on, held, tick, ownTakes]);

  const given = options.takes;
  const practised = useMemo(() => {
    if (!read) return null;
    const takes = ownTakes ? read.takes : given ? given.map((t) => t.startedAt) : null;
    if (takes === null) return null;
    return practisedFrom([
      { at: takes, full: takes.length >= TAKES_TO_READ },
      { at: read.runs, full: read.runs.length >= TOOL_RUNS_READ },
      // Every attempt since `reminderReadFrom` is read: complete for every day
      // the line and the quiet rule look at, so not cut for them.
      { at: read.songs, full: false },
    ]);
  }, [read, ownTakes, given]);
  return { practised, now, held };
}
