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
 * ## Where that third number comes from, and why there are two of them
 *
 * **The take's own sidecar, when it has one.** The writer thread takes the
 * band as its clock, so its first chunk of band is the first sample of the
 * file, and the audio callback stamped where the transport was when it
 * rendered that chunk. `TakePosition.startOffsetMs` is that, to within one
 * output buffer, and it is what this hook uses.
 *
 * **The frontend's own measurement, otherwise.** `useSongTakes` reads
 * `performance.now()` either side of `start_take` — which misses the beat
 * event's crossing of the IPC boundary on the way in, and the wait for the
 * callback to pick the ring up on the way out, so it is optimistic by tens of
 * milliseconds. It is kept because every take recorded before this existed has
 * only that, and because a take begun with the transport stopped has no
 * musical position for the sidecar to record.
 */
import { useEffect, useState } from "react";
import { analyzeTakePitch } from "../../../ipc";
import { rangeTempoSteps } from "../../../songs/schedule";
import type { TakePosition } from "../../../jam/types";
import type { NoteVerdict } from "../../../songs/types";
import type { SongAttemptReview } from "./useSongAttempt";

/** A recording of the pass this review is about. */
export type SongTake = {
  takeId: string;
  /** The take shelf is keyed by jam; a song's takes ride on the same shelf. */
  jamId: string;
  /**
   * Where the first beat of the played range sits inside the dry stem, in ms
   * from the instant the file starts, as the FRONTEND measured it. A count-in
   * is part of that distance. The fallback — see the header.
   */
  startOffsetMs: number;
  /** What the take's own sidecar says, when it says anything. Preferred. */
  position?: TakePosition;
};

/**
 * The offset to analyse against: the engine's, when the take recorded one.
 *
 * A jam's position has no `startOffsetMs` — there is no beat 0 of a range to
 * measure from — so this falls through to the estimate there too.
 */
export function startOffsetOf(take: SongTake): number {
  const measured = take.position?.startOffsetMs;
  return typeof measured === "number" && Number.isFinite(measured)
    ? measured
    : take.startOffsetMs;
}

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
    startOffsetMs: startOffsetOf(take),
  }).catch(() => []);
}
