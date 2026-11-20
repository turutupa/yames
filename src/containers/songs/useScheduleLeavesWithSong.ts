import { useEffect, useRef } from "react";
import { clearScoreSchedule } from "../../ipc";

/**
 * Songs hands the engine a song's schedule whenever one is open and not
 * playing (`SongsView`'s `pushSchedule` effect), and only a finished attempt
 * used to clear it. Leaving Songs, or closing the song, left the schedule
 * loaded: the next screen's click then ran against a song nobody was playing,
 * and a jam's key and chord reading stayed paused as if for a Take.
 *
 * So the schedule goes when the song does: when `open` turns false, and when
 * the screen unmounts. Changing from one song to another clears nothing (the
 * next schedule replaces this one).
 *
 * Not under a pass that is still playing: Settings opens over Songs and
 * unmounts this screen, and the schedule under a running pass is not ours to
 * pull. (Should that pass end elsewhere, `harmony_start` clears what it
 * finds: `TimingAnalyzer::forget_stale_schedule`.)
 */
export function useScheduleLeavesWithSong(open: boolean, isPlaying: boolean): void {
  const playing = useRef(isPlaying);
  playing.current = isPlaying;
  useEffect(() => {
    if (!open) return;
    return () => {
      if (playing.current) return;
      clearScoreSchedule().catch(() => {});
    };
  }, [open]);
}
