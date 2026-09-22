/**
 * Then and now: the same bars, a month apart, ready to play side by side.
 *
 * `W21-CAMERA.md` addendum 11, `plans/ECHORA.md` A2 (the single-player
 * progress reel — "works with an audience of zero, costs no hosting, needs no
 * moderation") and `COACH_UX.md` C3, which says the coach volunteers a
 * before-and-after **only when it is real and it is big**. This hook is the
 * "is it real" half: it finds the pair, or it finds nothing and the block is
 * never emitted.
 *
 * ## Which two
 *
 * The EARLIEST kept run at these bars against the one that has just happened.
 * Earliest and not "the worst", because the story a player wants is the one
 * they lived — where they started and where they are — and a chart that
 * quietly picked their worst evening to flatter them is a chart nobody should
 * trust. A run with a picture wins over one with sound alone at the same
 * remove, because two pictures is the comparison worth watching; sound alone
 * still works and is what most players will have.
 *
 * ## What it takes to draw one
 *
 * More than the `progress` block needs, and that is why this is a second hook
 * rather than a field on the first. Each side wants the pass ITSELF — every
 * expected onset's verdict, the extras, the range, the tempo it was played at
 * — so that the older take gets a real tape rather than a number, and it
 * wants the recording, which lives on the take shelf and not in the store.
 * Two reads, joined on the take's own path.
 *
 * Nothing here reports a failure. A store or a shelf that will not answer
 * means there is no pair, so no `compare` block is emitted and the coach says
 * the rest of what it had — which is C3's rule anyway.
 */
import { useEffect, useMemo, useState } from "react";
import { listTakes, queryAttempts, scoreTimingBands } from "../../../ipc";
import type { Attempt, TimingBands } from "../../../ipc";
import type { JamTake } from "../../../jam/types";
import { buildSchedule, rangeTempo } from "../../../songs/schedule";
import type { BarRange } from "../../../songs/schedule";
import type { OnsetResult, ScoreSchedule, SongScore } from "../../../songs/types";
import type { ReviewTakeVideo } from "../camera/TakeVideoView";
import type { SongAttemptReview } from "./useSongAttempt";

/** One side of the comparison: a pass, its recording, and how to draw it. */
export type CompareSide = {
  attemptId: string;
  startedAt: number;
  range: BarRange;
  tempoPercent: number;
  /** The tempo the click was running at, which is what the clip's caption says. */
  bpm: number;
  score: number;
  schedule: ScoreSchedule;
  results: OnsetResult[];
  extras: { beat: number; pass: number }[];
  bands: TimingBands | null;
  /** The mix. Absent means there is nothing to play, and no side. */
  path: string;
  /** The picture, when the camera was on for that one. */
  videoPath: string | null;
  videoOffsetMs: number;
  startOffsetMs: number;
};

export type SongCompare = {
  older: CompareSide;
  newer: CompareSide;
};

/**
 * Onsets as the store wrote them, as the review's own verdicts.
 *
 * `AttemptOnset` and `OnsetResult` are the same four fields under two names —
 * the store's row and the wire's — and the conversion is here so that
 * `buildTape` sees one shape whether the pass happened a minute ago or in
 * March.
 */
function resultsOf(attempt: Attempt): OnsetResult[] {
  return (attempt.onsets ?? []).map((onset) => ({
    id: onset.id,
    state: onset.state,
    deviationMs: onset.deviationMs,
    pass: onset.pass,
    ...(onset.accentHeard === undefined ? {} : { accentHeard: onset.accentHeard }),
  }));
}

/**
 * The take an attempt was recorded to, by the path the store kept.
 *
 * The store writes the WAV's absolute path and the shelf lists the same one,
 * so they join on it. Compared case-insensitively and with separators
 * normalised because the two came from different round trips through Rust and
 * a Windows path can differ in neither the file nor the folder and still not
 * be `===`.
 */
function takeFor(attempt: Attempt, takes: readonly JamTake[]): JamTake | undefined {
  const wanted = attempt.takePath;
  if (!wanted) return undefined;
  const key = (path: string) => path.replace(/\\/g, "/").toLowerCase();
  return takes.find((take) => key(take.path) === key(wanted));
}

/** Everything one side needs, or null when the pieces are not all there. */
function sideOf(
  score: SongScore,
  attempt: Attempt,
  take: JamTake | undefined,
  bands: TimingBands | null,
): CompareSide | null {
  if (!take) return null;
  const range: BarRange = { startBar: attempt.rangeStartBar, endBar: attempt.rangeEndBar };
  // `loops` is what decides whether the schedule wraps, and an attempt with
  // more than one pass in it was looping by definition.
  const schedule = buildSchedule(score, range, { loops: attempt.passes > 1 });
  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    range,
    tempoPercent: attempt.tempoPercent,
    bpm: Math.round(rangeTempo(score, range, attempt.tempoPercent)),
    score: attempt.score,
    schedule,
    results: resultsOf(attempt),
    extras: (attempt.extraOnsets ?? []).map((extra) => ({ beat: extra.beat, pass: extra.pass })),
    bands,
    path: take.path,
    videoPath: take.videoPath ?? null,
    videoOffsetMs: take.videoOffsetMs ?? 0,
    startOffsetMs: take.position?.startOffsetMs ?? 0,
  };
}

/**
 * Pick the older side.
 *
 * Kept runs at these bars, oldest first; a picture wins a tie. "A tie" is
 * deliberately generous — anything within the same day — because a player who
 * filmed themselves in the afternoon and not in the morning should get the
 * film, and neither is meaningfully "where they started" against the other.
 */
const SAME_DAY_MS = 24 * 60 * 60 * 1000;

function oldestWorthShowing(
  rows: readonly { attempt: Attempt; take: JamTake }[],
): { attempt: Attempt; take: JamTake } | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) => a.attempt.startedAt - b.attempt.startedAt);
  const first = sorted[0];
  const filmed = sorted.find(
    (row) => row.take.videoPath && row.attempt.startedAt - first.attempt.startedAt < SAME_DAY_MS,
  );
  return filmed ?? first;
}

/** Tonight's side, straight off the review — no round trip needed. */
function sideOfReview(review: SongAttemptReview, take: ReviewTakeVideo): CompareSide {
  return {
    attemptId: review.attemptId,
    startedAt: review.startedAt,
    range: review.range,
    tempoPercent: review.tempoPercent,
    bpm: review.bpm,
    score: review.facts.score,
    schedule: review.schedule,
    results: [...review.facts.results],
    extras: [...review.facts.extras],
    bands: review.bands,
    path: take.path,
    videoPath: take.videoPath,
    videoOffsetMs: take.videoOffsetMs ?? 0,
    startOffsetMs: take.startOffsetMs ?? 0,
  };
}

export function useSongCompare(
  review: SongAttemptReview | null,
  /** The song's id on the take shelf, which is the song's id in the library. */
  songId: string | null,
  /**
   * The recording of the pass that has just finished.
   *
   * Handed in rather than looked up: the review already has it, and the store
   * row for tonight's attempt may not carry its take path yet — the take is
   * filed by the engine while the row is being written, and the two settle in
   * their own time. With no take there is nothing to compare and no block.
   */
  take: ReviewTakeVideo | undefined,
): SongCompare | undefined {
  const [found, setFound] = useState<SongCompare | undefined>(undefined);

  const scoreId = review?.scoreId ?? "";
  const attemptId = review?.attemptId;
  const startBar = review?.range.startBar ?? 0;
  const endBar = review?.range.endBar ?? 0;

  const takeId = take?.takeId;

  useEffect(() => {
    if (!review || !scoreId || !songId || !take) {
      setFound(undefined);
      return;
    }
    let alive = true;
    void (async () => {
      const [rows, takes] = await Promise.all([
        queryAttempts({
          scoreId,
          barRange: { startBar, endBar },
          // The whole point is a tape of the old pass, and a tape is the
          // per-onset verdicts. This is the one place in the app that asks
          // for them about somebody else's evening, and it asks once.
          includeOnsets: true,
        }).catch(() => [] as Attempt[]),
        listTakes(songId).catch(() => [] as JamTake[]),
      ]);
      if (!alive) return;

      const kept = rows
        .filter((row) => row.id !== review.attemptId)
        .map((attempt) => ({ attempt, take: takeFor(attempt, takes) }))
        .filter((row): row is { attempt: Attempt; take: JamTake } => row.take !== undefined);
      const older = oldestWorthShowing(kept);
      if (!older) {
        setFound(undefined);
        return;
      }

      // The old pass was played at its own tempo, so its colour boundaries
      // are its own too: the scorer judged it against a window derived from
      // the schedule's smallest gap at THAT speed, and colouring it with
      // tonight's boundaries would paint a note green the pass itself called
      // merely "ok" (`review/marks.ts` says the same thing from the front).
      const oldSchedule = buildSchedule(
        review.score,
        { startBar: older.attempt.rangeStartBar, endBar: older.attempt.rangeEndBar },
        { loops: older.attempt.passes > 1 },
      );
      const oldBpm = rangeTempo(
        review.score,
        { startBar: older.attempt.rangeStartBar, endBar: older.attempt.rangeEndBar },
        older.attempt.tempoPercent,
      );
      const oldBands = await scoreTimingBands(oldSchedule, 60_000 / Math.max(1, oldBpm)).catch(
        () => null,
      );
      if (!alive) return;

      const olderSide = sideOf(review.score, older.attempt, older.take, oldBands);
      setFound(olderSide ? { older: olderSide, newer: sideOfReview(review, take) } : undefined);
    })();
    return () => {
      alive = false;
    };
    // One read per attempt, like the progress hook's: the range the pass was
    // played over cannot change underneath a finished review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId, songId, attemptId, takeId]);

  return useMemo(() => found, [found]);
}
