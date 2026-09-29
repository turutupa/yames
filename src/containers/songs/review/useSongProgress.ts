/**
 * The `progress` block's line, fetched once per review.
 *
 * `resolveCoachAnswer` asks `progressFor(score, fromBar, toBar)` while it is
 * resolving blocks, which is synchronous — so the store has to have been read
 * before the review is drawn, not while. That is the whole shape of this
 * hook: one `queryAttempts` when a review appears, held, and a pure function
 * over what came back (`src/songs/progress.ts`) for whatever bars a block
 * turns out to name.
 *
 * The query is the review's own range and the block's bars are always inside
 * it — `blocksFor` builds them from a finding, and a finding is about the
 * pass. `bar_range` selects attempts that OVERLAP, so anything overlapping
 * the block's passage overlaps the review's range too and nothing needed can
 * be dropped by asking the wider question.
 *
 * `includeOnsets` is false and stays false: per-onset verdicts are the
 * biggest thing in the store and a chart of a dozen points wants none of
 * them.
 *
 * Nothing here reports a failure. A store that will not answer means the
 * `progress` block resolves to nothing and the coach says the rest of what it
 * had — which is what C3 asks for anyway: the before-and-after is volunteered
 * only when it is real.
 */
import { useEffect, useMemo, useState } from "react";
import { queryAttempts } from "../../../ipc";
import { progressPoints } from "../../../songs/progress";
import type { ScoredAttempt } from "../../../songs/progress";
import type { CoachBlockContext } from "../../../coach/blocks";
import type { SongAttemptReview } from "./useSongAttempt";

/**
 * What the review hands `SongReview`, or `undefined`.
 *
 * `undefined` rather than a function that returns nothing, because
 * `blocksFor` asks whether a progress block is worth emitting at all
 * (`withProgress`) and a function that always answers "no story" would have
 * the coach build a block for the resolver to drop.
 */
export function useSongProgress(
  review: SongAttemptReview | null,
): CoachBlockContext["progressFor"] | undefined {
  const [attempts, setAttempts] = useState<readonly ScoredAttempt[]>([]);

  const scoreId = review?.scoreId ?? "";
  const startBar = review?.range.startBar ?? 0;
  const endBar = review?.range.endBar ?? 0;
  const attemptId = review?.attemptId;

  useEffect(() => {
    if (!scoreId) {
      setAttempts([]);
      return;
    }
    let alive = true;
    void queryAttempts({
      scoreId,
      barRange: { startBar, endBar },
      includeOnsets: false,
    })
      .then((rows) => {
        if (alive) setAttempts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (alive) setAttempts([]);
      });
    return () => {
      alive = false;
    };
    // One read per attempt. The range is the one the pass was played over and
    // cannot change underneath a finished review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId, attemptId]);

  return useMemo(() => {
    if (attempts.length === 0) return undefined;
    // A block counts its bars from 1; the store and the transport count from
    // 0. The conversion is here and nowhere else.
    return (_score: { id: string }, fromBar: number, toBar: number) =>
      progressPoints(attempts, fromBar - 1, toBar - 1);
  }, [attempts]);
}
