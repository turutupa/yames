/**
 * A stop that is still being graded holds the engine's schedule.
 *
 * Between a stop and its grade there is up to `SEGMENT_CLOSE_DEADLINE_MS`
 * (600 ms) of waiting for the analyzer's last segment, then `getTakeGrade`.
 * Both read the schedule the pass was played against. Two other things touch
 * that schedule in the same moment, and either one, landing first, loses the
 * player's grade:
 *
 * - the clear when the app leaves Songs or the song closes
 *   (`useScheduleLeavesWithSong`): with nothing loaded there is no grade;
 * - Songs' push of the next schedule (`useSongSchedulePush`): a schedule
 *   loaded before the close is a fresh run, and the close grades that.
 *
 * So `useSongAttempt` takes a hold at the stop, before anything is awaited,
 * and lets go only after its own `clearScoreSchedule`. While a hold is out the
 * leaving clear is skipped (the attempt's own clear does it) and the push
 * waits; when the last hold goes, the push is made (`onScheduleFree`).
 *
 * Module state, not React state: the hold must outlive the screen that took
 * it (Settings over Songs unmounts `SongsView` while its stop is graded).
 */

let holds = 0;
const listeners = new Set<() => void>();

/** Whether a stop is still being graded against the loaded schedule. */
export function scheduleHeld(): boolean {
  return holds > 0;
}

/**
 * Take a hold. Returns its release, which is safe to call more than once
 * (only the first call counts).
 */
export function holdSchedule(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (holds > 0) return;
    for (const fn of [...listeners]) fn();
  };
}

/** Called each time the last hold is let go. Returns the unsubscribe. */
export function onScheduleFree(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tests only: forget every hold and listener. */
export function __resetScheduleHoldForTests(): void {
  holds = 0;
  listeners.clear();
}
