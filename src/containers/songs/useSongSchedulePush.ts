import { useEffect, useRef } from "react";
import { onScheduleFree, scheduleHeld } from "../../songs/scheduleHold";

/**
 * Songs hands the engine the open song's schedule whenever what it describes
 * changes and no pass is running over it: the song, the range, the loop, and
 * the stop of a pass, which is what readies the next one.
 *
 * Not while a stop is being graded (`src/songs/scheduleHold.ts`). A schedule
 * loaded then is a fresh run in the analyzer, and the stop's close would grade
 * that instead of the pass; and the stop's own clear, coming after, would
 * leave the next pass with nothing loaded. So the push waits for the hold to
 * go, then is made: stopped, as always; playing too, when the player pressed
 * play again before the stop was graded (a retry), as a seek does.
 *
 * `push` is `useSongsSession`'s `pushSchedule`. The hold is read inside the
 * effect, not from render: the stop's hold is taken in `useSongAttempt`'s
 * effect, in the same commit, just before this one runs.
 */
export function useSongSchedulePush(open: boolean, isPlaying: boolean, push: () => Promise<unknown>): void {
  const latest = useRef({ open, push });
  latest.current = { open, push };

  useEffect(() => {
    if (!open || isPlaying || scheduleHeld()) return;
    void push();
  }, [open, isPlaying, push]);

  useEffect(
    () =>
      onScheduleFree(() => {
        if (latest.current.open) void latest.current.push();
      }),
    [],
  );
}
