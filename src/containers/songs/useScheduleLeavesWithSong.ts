import { useEffect } from "react";
import { clearScoreSchedule } from "../../ipc";

/**
 * Songs hands the engine a song's schedule whenever one is open and not
 * playing (`SongsView`'s `pushSchedule` effect), and only a finished attempt
 * used to clear it. Leaving Songs, or closing the song, left the schedule
 * loaded: the next screen's click then ran against a song nobody was playing.
 *
 * So the schedule goes when the song does: when `open` turns false, and when
 * the screen unmounts. Changing from one song to another clears nothing (the
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
