import { useEffect } from "react";
import { clearScoreSchedule } from "../../ipc";
import { scheduleHeld } from "../../songs/scheduleHold";

/**
 * Songs hands the engine a song's schedule whenever one is open and not
 * playing (`SongsView`'s `pushSchedule` effect), and only a finished attempt
 * used to clear it. Leaving Songs, or closing the song, left the schedule
 * loaded: the next mode's click then ran against a song nobody was playing,
 * and a jam's key and chord reading stayed paused as if for a Take.
 *
 * So the schedule goes when the song does. `open`: the app is in Songs and a
 * song is open. It is called from the window, not from `SongsView`: Settings
 * opens over Songs and unmounts that screen while the mode, the song and
 * perhaps a pass go on. Changing from one song to another clears nothing (the
 * next schedule replaces this one).
 *
 * Never ahead of a stop's grade: a stop still being graded holds the schedule
 * (`src/songs/scheduleHold.ts`) and clears it itself when the grade is read,
 * so while it holds, this clear is skipped. A stop and a leave within the
 * 600 ms a stop waits for its last segment used to clear first and lose the
 * grade.
 *
 * One case is left: the song closing in the very commit the transport stops
 * (deleting the song being played). React runs this cleanup before the stop's
 * effect takes the hold, so that clear lands first; the song is gone with it.
 */
export function useScheduleLeavesWithSong(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    return () => {
      if (scheduleHeld()) return;
      clearScoreSchedule().catch(() => {});
    };
  }, [open]);
}
