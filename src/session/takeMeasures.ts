/**
 * What a Take measured, in one shape, whatever the scorer's report looks like.
 *
 * A thin adapter on purpose. The scorer's own `TakeGrade` (`score.rs`, W1 of the
 * revamp wave) carries missed notes, its own "didn't catch enough" and evenness
 * per bar; when a report has one, it is the authority and this only renames it.
 * A report without one, from a build before it, is read the old way, from the
 * onset verdicts. Everything downstream reads `TakeMeasures` either way.
 *
 * It never invents a number. A value the report does not carry is `null`, and
 * `grade.ts` treats `null` as "not measured", never as zero and never as a pass.
 */
import { getTakeGradeWithNotes } from "../ipc";
import type {
  NoCatchReason,
  PracticeSegmentEndedPayload,
  ScorerPassResult,
  ScorerTakeGrade,
} from "../ipc";

export type ScorerReport = Pick<
  PracticeSegmentEndedPayload,
  "componentScores" | "onsetResults" | "extraOnsets" | "accentAgreement" | "takeGrade"
>;

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
  /**
   * Right notes, 0 to 1: of the heard notes that had a pitch, the share that
   * were the written one, in the window the scorer judged. Null when the pitch
   * pass did not run or could not be believed (`pass.notes.status`).
   */
  noteIdentity: number | null;
  /** Bars the transport got through. */
  barsPlayed: number;
  /** Evenness per bar, when the scorer reports it. */
  barEvenness: number[] | null;
  /** Enough was heard to give a grade at all. */
  caught: boolean;
  /** Why not, when the scorer said. Absent from a build that does not say. */
  noCatchReason?: NoCatchReason;
  /**
   * The scorer's own judgement against the Exercise's pass bars
   * (`score/pass.rs`), when the schedule was loaded with them. When present it
   * decides the verdict; `grade.ts` only falls back to its own reading without.
   */
  pass?: ScorerPassResult;
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

/**
 * Evenness per bar, or null when any bar cannot be read.
 *
 * A bar the Exercise asked three or more notes of and that came back with no
 * evenness was not played evenly: it is 0, not skipped, or a window of good
 * bars could be stitched across a bad one. A bar with fewer notes due than
 * evenness needs says nothing either way, and then only the whole Take is read.
 */
function barsOf(grade: ScorerTakeGrade): number[] | null {
  if (grade.bars.length === 0) return null;
  const out: number[] = [];
  for (const bar of grade.bars) {
    if (bar.evenness !== null) out.push(bar.evenness);
    else if (bar.due >= 3) out.push(0);
    else return null;
  }
  return out;
}

/** The scorer's right-notes value, when it measured one. */
function noteIdentityOf(pass: ScorerPassResult | undefined): number | null {
  if (pass?.notes?.status !== "measured") return null;
  return pass.checks.find((c) => c.metric === "noteIdentity")?.measured ?? null;
}

/**
 * How long a Take's result waits for right notes. The pitch pass takes well
 * under a second for a Take in a release build; this is the end of the
 * "mid-session report" tier (`AGENTS.md`, 3 to 8 s) less the time the timing
 * grade already took, and past it the timing grade stands.
 */
export const NOTES_WAIT_MS = 5000;

/**
 * The grade a Take's result should read: the timing grade as it came, or, when
 * it said the pitch pass was still running, the grade with right notes in it.
 * The timing numbers are the same in both; only `pass` gains `noteIdentity`.
 * A build without the command, a pass that is not done in time, or one that
 * failed all leave the timing grade, `noteIdentity` not assessed.
 */
export async function withRightNotes(
  grade: ScorerTakeGrade | null,
  fetch: (timeoutMs: number) => Promise<ScorerTakeGrade | null> = getTakeGradeWithNotes,
): Promise<ScorerTakeGrade | null> {
  if (!grade?.notesPending) return grade;
  const withNotes = await fetch(NOTES_WAIT_MS).catch(() => null);
  // Only the pass this Take started: a grade for another Take is no answer.
  const same = withNotes?.notesSerial !== undefined && withNotes.notesSerial === grade.notesSerial;
  if (!withNotes?.pass || !same) return { ...grade, notesPending: false };
  return { ...grade, pass: withNotes.pass, notesPending: false };
}

function fromGrade(
  grade: ScorerTakeGrade,
  report: ScorerReport | null,
  context: { barsPlayed: number },
): TakeMeasures {
  const caught = grade.verdict === "graded";
  return {
    expected: grade.due,
    heard: grade.heard,
    extras: grade.extra,
    evenness: caught ? grade.evenness : null,
    accent: typeof report?.accentAgreement === "number" ? report.accentAgreement : null,
    noteIdentity: caught ? noteIdentityOf(grade.pass) : null,
    barsPlayed: context.barsPlayed,
    barEvenness: caught ? barsOf(grade) : null,
    caught,
    ...(grade.noCatchReason ? { noCatchReason: grade.noCatchReason } : {}),
    ...(grade.pass ? { pass: grade.pass } : {}),
  };
}

/**
 * What a Take measured. `grade` is the scorer's answer for a Take no segment
 * reported (a silent one); a grade on the report itself wins over it.
 */
export function measureTake(
  report: ScorerReport | null,
  context: { barsPlayed: number; grade?: ScorerTakeGrade | null },
): TakeMeasures {
  const grade = report?.takeGrade ?? context.grade ?? null;
  if (grade) return fromGrade(grade, report, context);
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
  const caught = enough;

  return {
    expected,
    heard,
    extras: report?.extraOnsets?.length ?? 0,
    evenness: caught && typeof evenness === "number" ? evenness : null,
    accent: typeof report?.accentAgreement === "number" ? report.accentAgreement : null,
    noteIdentity: null,
    barsPlayed: context.barsPlayed,
    barEvenness: null,
    caught,
  };
}
