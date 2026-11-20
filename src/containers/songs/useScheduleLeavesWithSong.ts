import { useEffect } from "react";
import { clearScoreSchedule } from "../../ipc";

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
 */
export function useScheduleLeavesWithSong(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    return () => {
      clearScoreSchedule().catch(() => {});
    };
  }, [open]);
}
