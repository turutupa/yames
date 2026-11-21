/**
 * The practice reminder as a screen reads it (leg rem2): the stored value
 * (only once its key is read; null while loading or unreadable, which says
 * nothing), and the days with a Session, read from the store once when the
 * screen mounts and once more at the reminder's time if that is later today.
 * One `setTimeout`, no interval, nothing per beat; nothing is read at all
 * while the reminder is off.
 *
 * "A Session" (judgement call 21): a stored Path Take, or a saved tool run.
 * A read that fails leaves `practised` null, and a null says nothing: the
 * line is not shown when the app cannot tell whether the player has played.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { getSessionHistory, listPathTakes } from "../ipc";
import { TAKES_TO_READ } from "../containers/session/hooks/useSessionRun";
import { practisedFrom, reminderDueLaterToday, type Practised } from "./reminder";
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

export function useReminderPractised(reminder: CoachReminder | null): { practised: Practised | null; now: number } {
  const [seen, setSeen] = useState<{ practised: Practised | null; now: number }>(() => ({ practised: null, now: Date.now() }));
  useEffect(() => {
    if (!reminder?.on) return;
    let live = true;
    const read = () => {
      Promise.all([listPathTakes(TAKES_TO_READ), getSessionHistory()]).then(
        ([takes, runs]) => {
          if (!live) return;
          setSeen({
            now: Date.now(),
            practised: practisedFrom([
              { at: takes.map((t) => t.startedAt), full: takes.length >= TAKES_TO_READ },
              { at: runs.map((r) => r.timestamp), full: runs.length >= TOOL_RUNS_READ },
            ]),
          });
        },
        () => {
          if (live) setSeen({ now: Date.now(), practised: null });
        },
      );
    };
    read();
    const due = reminderDueLaterToday(reminder, Date.now());
    const timer = due === null ? null : window.setTimeout(read, due - Date.now() + AFTER_MS);
    return () => {
      live = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [reminder]);
  return seen;
}
