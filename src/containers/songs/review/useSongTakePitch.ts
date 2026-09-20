/**
 * Which note was that — when there is a recording to ask.
 *
 * `analyze_take_pitch` reads the take's DRY stem (`SONGS.md` A8: you alone,
 * without the band) and answers per note of the score. It is post-session
 * work by definition — the pass is over, the player is reading the timing
 * score, and a thirty-second take is most of a second of FFTs
 * (`AGENTS.md`'s tiers).
 *
 * ## Three numbers it will not work without
 *
 * 1. **The tempo map, not one BPM.** `rangeTempoSteps` gives the CLICK's
 *    tempo across the range, stepping where the score steps. Without it a
 *    song that goes from 100 to 140 at bar nine has every note after the step
 *    read out of the wrong part of the audio — at 100 a quarter is 600 ms and
 *    at 140 it is 429, so eight bars later the window is seconds adrift. That
 *    failure does not look like a clock error; it looks like a tracker that
 *    cannot hear.
 * 2. **The extras.** They get no verdict — they are not notes of the score —
 *    but they are where the tracker is CUT. An extra note left out is one
 *    that gets folded into the written note before it and drags its median
 *    off.
 * 3. **`startOffsetMs`.** Where the first beat of the range sits inside the
 *    stem. Wrong, and every note moves by the same amount.
 *
 * ## Nothing in Songs starts a take yet
 *
 * The engine can record one over a song (W9), and `start_take` is the door —
 * but it takes a jam id and the Songs stage has no record button on it. So
 * this hook is built, tested and wired into the review, and `take` is
 * `undefined` until somebody puts that button on the stage. The review says
 * nothing about which notes were played in the meantime, which is the honest
 * state rather than a guess (`SONGS.md` S0.5).
 */
import { useEffect, useState } from "react";
import { analyzeTakePitch } from "../../../ipc";
import { rangeTempoSteps } from "../../../songs/schedule";
import type { NoteVerdict } from "../../../songs/types";
import type { SongAttemptReview } from "./useSongAttempt";

/** A recording of the pass this review is about. */
export type SongTake = {
  takeId: string;
  /** The take shelf is keyed by jam; a song's takes ride on the same shelf. */
  jamId: string;
  /**
   * Where the first beat of the played range sits inside the dry stem, in ms
   * from the instant the file starts. A count-in is part of that distance.
   */
  startOffsetMs: number;
};

/**
 * The verdicts, or an empty list.
 *
 * Never throws and never reports a failure to the player: a take that cannot
 * be read means the review says nothing about which notes were played, which
 * is what it says anyway when there is no take at all.
 */
export function useSongTakePitch(
  review: SongAttemptReview | null,
  take: SongTake | undefined,
): readonly NoteVerdict[] {
  const [verdicts, setVerdicts] = useState<readonly NoteVerdict[]>([]);

  const attemptId = review?.attemptId;
  const takeId = take?.takeId;

  useEffect(() => {
    if (!review || !take) {
      setVerdicts([]);
      return;
    }
    let alive = true;
    void takePitchFor(review, take).then((found) => {
      if (alive) setVerdicts(found);
    });
    return () => {
      alive = false;
    };
    // One run per (review, take). Everything else it reads is on the review,
    // which does not change once it exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, takeId]);

  return verdicts;
}

/** The call itself, so it can be tested without a component. */
export async function takePitchFor(
  review: SongAttemptReview,
  take: SongTake,
): Promise<NoteVerdict[]> {
  return analyzeTakePitch({
    takeId: take.takeId,
    jamId: take.jamId,
    ...(review.scoreId ? { scoreId: review.scoreId } : { score: review.score }),
    schedule: review.schedule,
    results: review.facts.results,
    extras: review.facts.extras,
    bpm: review.bpm,
    tempoMap: rangeTempoSteps(review.score, review.range, review.tempoPercent),
    startOffsetMs: take.startOffsetMs,
  }).catch(() => []);
}
