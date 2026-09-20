/**
 * An attempt, from pressing play to reading the verdict.
 *
 * The lifecycle, and nothing else: the arithmetic is `src/songs/attempt.ts`,
 * the sentences are `src/songs/verdict.ts`, the drawing is `SongReview.tsx`.
 * What is here is the order things happen in, which is the part that is easy
 * to get subtly wrong and impossible to see when it is.
 *
 * ## The order, and why it is that order
 *
 * 1. **Play.** The schedule that was pushed is captured, the clock is noted,
 *    and the last review is cleared — the coach shows nothing while the
 *    transport runs (`COACH_UX.md` A3).
 * 2. **While playing**, every `practice-segment-ended` is kept, and each one
 *    REPLACES the last rather than adding to it. The analyzer's run
 *    accumulates from the moment the schedule was loaded, so a segment that
 *    closed because the player paused to tune carries the same pass with more
 *    in it (`src/songs/attempt.ts`).
 * 3. **Stop.** `closeOpenSegment` forces the last segment shut so the final
 *    run is reported at all; the event arrives on the Rust loop's own 5 ms
 *    tick, so there is a short wait for it. Then `clearScoreSchedule`, which
 *    is what makes the next press of play a NEW attempt rather than more of
 *    this one.
 * 4. **The floor.** Fewer than eight scored onsets and nothing is saved and
 *    nothing is said — a false start is not an attempt.
 * 5. **Then**, and only then: save the row, ask for the bands the colours
 *    come from, and ask `analyze_attempt` what it found. All three are
 *    post-session work (`AGENTS.md`): the pass is over and there are seconds
 *    to spend.
 *
 * Every call is guarded. A build whose Rust half is older than this branch
 * answers none of them, and the honest result of that is a review that says
 * it could not read the pass — never a Songs mode that throws when you stop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeAttempt,
  clearScoreSchedule,
  closeOpenSegment,
  onPracticeSegmentEnded,
  saveAttempt,
  scoreTimingBands,
} from "../../../ipc";
import type { PracticeSegmentEndedPayload, TimingBands } from "../../../ipc";
import {
  attemptFacts,
  attemptRecord,
  isAttemptWorthKeeping,
  newAttemptId,
  resultsFromSegment,
} from "../../../songs/attempt";
import type { AttemptFacts } from "../../../songs/attempt";
import { buildSchedule } from "../../../songs/schedule";
import type { BarRange } from "../../../songs/schedule";
import type { Finding, ScoreSchedule, SongScore } from "../../../songs/types";

/**
 * How long to wait for the forced segment close to come back.
 *
 * The Rust loop picks the flag up within 5 ms and `useSegmentCoach` has waited
 * 100 ms for the same thing since the mini-report shipped. This waits for the
 * EVENT rather than for the clock, and only falls back on the deadline — so a
 * quick machine is not delayed and a slow one is not cut off.
 */
const SEGMENT_CLOSE_DEADLINE_MS = 600;

/** Everything the review screen draws, gathered once when the pass ends. */
export type SongAttemptReview = {
  attemptId: string;
  scoreId: string;
  /** The song as it was when the pass was played. */
  score: SongScore;
  schedule: ScoreSchedule;
  range: BarRange;
  tempoPercent: number;
  /** The click's tempo for this pass, in BPM. */
  bpm: number;
  startedAt: number;
  facts: AttemptFacts;
  /** The scorer's own colour boundaries, or null when it would not say. */
  bands: TimingBands | null;
  /** Ranked, headline first. Empty when the judgement could not be asked. */
  findings: Finding[];
  /** Whether the row reached the store. A review still shows if it did not. */
  saved: boolean;
};

export type SongAttemptState = {
  /** The finished review, or null while playing and before the first pass. */
  review: SongAttemptReview | null;
  /** Between the stop and the verdict. */
  working: boolean;
  /** The last pass was too short to judge, and was not kept. */
  tooShort: boolean;
  /** Put the review away — the player is going again. */
  dismiss: () => void;
};

export type SongAttemptInput = {
  score: SongScore | null;
  /** The id the song has in the library, when it is in it. */
  scoreId: string | null;
  range: BarRange;
  loop: boolean;
  tempoPercent: number;
  /** The tempo the click is actually running at. */
  bpm: number;
  isPlaying: boolean;
};

export function useSongAttempt(input: SongAttemptInput): SongAttemptState {
  const [review, setReview] = useState<SongAttemptReview | null>(null);
  const [working, setWorking] = useState(false);
  const [tooShort, setTooShort] = useState(false);

  /** The last run the analyzer reported. Replaced, never appended to. */
  const runRef = useRef<PracticeSegmentEndedPayload | null>(null);
  /** Resolved by the next segment-ended event, so the stop can wait for one. */
  const waiterRef = useRef<(() => void) | null>(null);
  /** What the pass was played against, captured when it started. */
  const passRef = useRef<Pass | null>(null);
  const wasPlaying = useRef(false);
  /** Bumped by every stop, so a slow verdict for an old pass is dropped. */
  const generation = useRef(0);

  // Everything the falling edge needs, without making the effect depend on it
  // — a review that restarted because the tempo chip moved would be a review
  // of the wrong pass.
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    let stop: (() => void) | undefined;
    const unlisten = onPracticeSegmentEnded((payload) => {
      if (payload.onsetResults && payload.onsetResults.length > 0) {
        runRef.current = payload;
      }
      waiterRef.current?.();
      waiterRef.current = null;
    });
    void unlisten.then((fn) => {
      stop = fn;
    });
    return () => {
      void unlisten.then((fn) => fn());
      stop?.();
    };
  }, []);

  const dismiss = useCallback(() => {
    setReview(null);
    setTooShort(false);
  }, []);

  // Only the transport's edge runs this. Everything else the stop needs is
  // read off `latest`, because a review that restarted because the tempo chip
  // moved would be a review of the wrong pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const isPlaying = latest.current.isPlaying;
    const started = isPlaying && !wasPlaying.current;
    const stopped = !isPlaying && wasPlaying.current;
    wasPlaying.current = isPlaying;

    if (started) {
      const { score, scoreId, range, loop, tempoPercent, bpm } = latest.current;
      runRef.current = null;
      generation.current += 1;
      setReview(null);
      setTooShort(false);
      setWorking(false);
      passRef.current = score
        ? {
            score,
            scoreId,
            schedule: buildSchedule(score, range, { loops: loop }),
            range,
            tempoPercent,
            bpm,
            startedAt: Date.now(),
          }
        : null;
      return;
    }

    if (!stopped) return;
    const pass = passRef.current;
    passRef.current = null;
    if (!pass) return;

    const mine = ++generation.current;
    setWorking(true);
    void finishAttempt(pass, runRef, waiterRef).then((result) => {
      if (generation.current !== mine) return;
      setWorking(false);
      if (result.kind === "tooShort") {
        setTooShort(true);
        return;
      }
      if (result.kind === "nothing") return;
      setReview(result.review);
    });
  }, [input.isPlaying]);

  return { review, working, tooShort, dismiss };
}

// ---------------------------------------------------------------------------
// The stop, in one place so it can be read top to bottom
// ---------------------------------------------------------------------------

/** What a pass was played against, captured the moment it started. */
export type Pass = {
  score: SongScore;
  scoreId: string | null;
  schedule: ScoreSchedule;
  range: BarRange;
  tempoPercent: number;
  bpm: number;
  startedAt: number;
};

type FinishResult =
  | { kind: "review"; review: SongAttemptReview }
  | { kind: "tooShort" }
  | { kind: "nothing" };

async function finishAttempt(
  pass: Pass,
  runRef: { current: PracticeSegmentEndedPayload | null },
  waiterRef: { current: (() => void) | null },
): Promise<FinishResult> {
  // The last segment has to be closed before it is reported at all. Wait for
  // the event it produces rather than for a fixed delay; the deadline is only
  // there so a build that never answers does not hang the screen.
  await closeOpenSegment().catch(() => undefined);
  await waitForSegment(waiterRef, SEGMENT_CLOSE_DEADLINE_MS);

  const payload = runRef.current;
  runRef.current = null;
  // An attempt is play-to-stop: the run is cleared here and nowhere else.
  await clearScoreSchedule().catch(() => undefined);

  const run = payload ? resultsFromSegment(payload) : null;
  if (!run) return { kind: "nothing" };
  if (!isAttemptWorthKeeping(run.results)) return { kind: "tooShort" };

  const facts = attemptFacts(run);
  const attemptId = newAttemptId();
  let saved = false;
  if (pass.scoreId) {
    saved = await saveAttempt(
      attemptRecord({
        id: attemptId,
        scoreId: pass.scoreId,
        startedAt: pass.startedAt,
        range: pass.range,
        tempoPercent: pass.tempoPercent,
        facts,
      }),
    )
      .then(() => true)
      .catch(() => false);
  }

  // The colours, from the scorer's own rule — against the tempo the click ran
  // at, not the tempo the page is written in.
  const bands = await scoreTimingBands(pass.schedule, 60_000 / Math.max(1, pass.bpm)).catch(
    () => null,
  );

  const findings = await analyzeAttempt({
    ...(pass.scoreId ? { scoreId: pass.scoreId } : { score: pass.score }),
    schedule: pass.schedule,
    attempt: { results: facts.results, extras: facts.extras, tempoPercent: pass.tempoPercent },
    // What makes "improved" and the tempo ceiling possible. Only the store
    // can answer it, and only when the song is in the library.
    ...(pass.scoreId
      ? {
          earlierBars: { startBar: pass.range.startBar, endBar: pass.range.endBar },
          ...(saved ? { excludeAttemptId: attemptId } : {}),
        }
      : {}),
  }).catch(() => [] as Finding[]);

  return {
    kind: "review",
    review: {
      attemptId,
      scoreId: pass.scoreId ?? "",
      score: pass.score,
      schedule: pass.schedule,
      range: pass.range,
      tempoPercent: pass.tempoPercent,
      bpm: pass.bpm,
      startedAt: pass.startedAt,
      facts,
      bands,
      findings,
      saved,
    },
  };
}

/** Resolve on the next segment-ended event, or on the deadline. */
function waitForSegment(
  waiterRef: { current: (() => void) | null },
  deadlineMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      waiterRef.current = null;
      resolve();
    };
    const timer = setTimeout(finish, deadlineMs);
    waiterRef.current = finish;
  });
}

export { finishAttempt as __finishAttemptForTests };
