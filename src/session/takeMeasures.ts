/**
 * What a Take measured, in one shape, whatever the scorer's report looks like.
 *
 * A thin adapter on purpose: the scorer is being worked on elsewhere
 * (`plans/tasks/revamp/BRIEF.md`, W1) and gains missed-note scoring, latency
 * calibration, its own "didn't catch enough" and per-bar evenness. Everything
 * downstream reads `TakeMeasures`, so each of those arrives by reading one more
 * optional field here and changes nothing else. `ScorerExtras` is where they
 * go, and a report without them behaves as it does today.
 *
 * It never invents a number. A value the report does not carry is `null`, and
 * `grade.ts` treats `null` as "not measured", never as zero and never as a pass.
 */
import type { PracticeSegmentEndedPayload } from "../ipc";

/** Optional fields a newer scorer may put on the report. Absent today. */
export type ScorerExtras = {
  /** Evenness of each bar played, 0 to 1. */
  barEvenness?: number[];
  /** The scorer's own judgement that it heard too little to grade. */
  caughtEnough?: boolean;
};

export type ScorerReport = Pick<
  PracticeSegmentEndedPayload,
  "componentScores" | "onsetResults" | "extraOnsets" | "accentAgreement"
> &
  ScorerExtras;

export type TakeMeasures = {
  /** Notes that were due while the transport ran. */
  expected: number;
  /** Of those, how many were heard. */
  heard: number;
  /** Onsets that matched no written note. */
  extras: number;
  /** Timing evenness, 0 to 1. Null when too little was heard to say. */
  evenness: number | null;
  /** Whether marked accents came out louder, 0 to 1, when that could be told. */
  accent: number | null;
  /** Right notes, 0 to 1. Pitch is not wired to Exercises yet, so null. */
  noteIdentity: number | null;
  /** Bars the transport got through. */
  barsPlayed: number;
  /** Evenness per bar, when the scorer reports it. */
  barEvenness: number[] | null;
  /** Enough was heard to give a grade at all. */
  caught: boolean;
};

/**
 * Fewer hits than this and no grade is given, whatever the ratio.
 *
 * The same floor `songs/attempt.ts` keeps, for its reason: below it, a passage
 * cannot show anything.
 */
export const MIN_HEARD_NOTES = 8;

/**
 * Hear less than this share of the notes due and the take is not graded.
 *
 * A design value; no real-guitar test exists. It splits two things that read
 * alike and mean opposite things: a player who dropped a third of the notes is
 * being told something true by a low score, and a take where two thirds went
 * unheard is far more likely the microphone than the hands. The cost of the
 * wrong call is one "play it again" against a false verdict, so it leans to
 * the honest side.
 */
export const MIN_HEARD_RATIO = 0.4;

export function measureTake(
  report: ScorerReport | null,
  context: { barsPlayed: number },
): TakeMeasures {
  const results = report?.onsetResults ?? [];
  let heard = 0;
  let expected = 0;
  for (const result of results) {
    // A soft onset that never arrived was never due.
    if (result.state === "softAbsent") continue;
    expected += 1;
    if (result.state === "hit") heard += 1;
  }

  const evenness = report?.componentScores?.intervalConsistency;
  const enough = heard >= MIN_HEARD_NOTES && expected > 0 && heard / expected >= MIN_HEARD_RATIO;
  const caught = report?.caughtEnough ?? enough;

  return {
    expected,
    heard,
    extras: report?.extraOnsets?.length ?? 0,
    evenness: caught && typeof evenness === "number" ? evenness : null,
    accent: typeof report?.accentAgreement === "number" ? report.accentAgreement : null,
    noteIdentity: null,
    barsPlayed: context.barsPlayed,
    barEvenness: report?.barEvenness ?? null,
    caught,
  };
}
