/**
 * Test-only: fixture Takes for the fact cards' table tests, built the way
 * `takeNote.test.ts` builds them (a real Exercise of Alternate Picking, a real
 * Take plan, `gradeTake` for the grade), and a coach context around one.
 */
import type { NoCatchReason, ScorerPassResult } from "../../ipc";
import type { SongAttemptReview } from "../../containers/songs/review/useSongAttempt";
import type { Exercise } from "../../paths/format";
import { gradeTake } from "../../session/grade";
import type { TakeFacts } from "../../session/progress";
import type { TakeOutcome, UngradedWhy } from "../../session/runner";
import { buildTake } from "../../session/take";
import type { TakeMeasures } from "../../session/takeMeasures";
import { ALT, NOW, take as row } from "../../session/testKit";
import type { Finding, FindingKind, OnsetResult } from "../../songs/types";
import type { CoachContext } from "../context";
import type { TakeReview } from "../takeNote";
import { toolCtx } from "../tools/fakeHost";
import { runIn } from "../tools/testPaths";

const EXERCISES = ALT.steps.flatMap((s) => s.exercises);
/** "A tune on the B string": four bars, so a ten-bar Take is about three rounds (mocks 08 and 15). */
export const TUNE = EXERCISES.find((e) => e.id === "other-strings.b-string-tune")!;
export const BPM = 90;

export type FixtureShape = {
  exercise?: Exercise;
  /** Played bars (from 0) that slipped. */
  slipped?: number[];
  failOn?: "timingEvenness" | "notesHeard";
  /** Deviation per played bar, ms; null: no per-note results at all. */
  deviation?: ((bar: number) => number) | null;
  findings?: Finding[];
  takeNumber?: number;
  verdict?: "notCaught" | "tooShort";
  /** The scorer's reason for a Take not caught (absent: none given). */
  noCatchReason?: NoCatchReason;
  /** Heard and extra notes, when the fixture needs other counts than its own. */
  heard?: number;
  extras?: number;
  ungraded?: UngradedWhy;
  /** What the stored row of this Take keeps (`fair`, `lean`); absent: no stored row. */
  stored?: TakeFacts;
};

export function finding(kind: FindingKind, bars: [number, number]): Finding {
  return {
    kind,
    bars,
    noteIds: [],
    severity: 0.5,
    evidence: { onsets: 24, hits: 22, hitRate: 22 / 24, meanDeviationMs: 0, deviationBeats: 0, spreadMs: 12, passes: 1, passesAffected: 1 },
  };
}

function scorerPass(exercise: Exercise, shape: FixtureShape, heldBars: number): ScorerPassResult {
  const failed = shape.failOn;
  return {
    verdict: failed ? "failed" : "passed",
    windowBars: 4,
    finishedBars: 10,
    heldBars,
    ...(heldBars > 0 ? { heldFromBar: 0 } : {}),
    countsForCleanTempo: !failed && heldBars >= 8,
    windowFromBar: 0,
    checks: exercise.passBars.map((bar) => {
      const value =
        bar.metric === "timingEvenness" ? (failed === "timingEvenness" ? 0.79 : 0.9) : bar.metric === "notesHeard" ? (failed === "notesHeard" ? 0.8 : 1) : bar.metric === "extraNotes" ? 0 : 0.97;
      const held = bar.max !== undefined ? value <= bar.max : value >= (bar.min ?? 0);
      return { ...bar, measured: value, held };
    }),
    notAssessed: [],
    notes: { status: "measured", right: 56, wrong: 2, octave: 0, unpitched: 0 },
  };
}

/** A fixture Take, its review and a context on the Session's result screen around it. */
export function fixture(shape: FixtureShape = {}, over: Partial<CoachContext> = {}) {
  const exercise = shape.exercise ?? TUNE;
  const plan = buildTake(ALT, exercise, BPM, null);
  const slipped = new Set(shape.slipped ?? []);
  const perBar = Array.from({ length: plan.bars }, (_u, bar) => ({
    due: 6,
    heard: shape.failOn === "notesHeard" && slipped.has(bar) ? 3 : 6,
    evenness: slipped.has(bar) ? 0.6 : 0.95,
  }));
  const pass = scorerPass(exercise, shape, Math.min(8, plan.bars - slipped.size));
  const notCaught = shape.verdict === "notCaught";
  const measures: TakeMeasures = {
    expected: 60,
    heard: shape.heard ?? (notCaught ? 9 : shape.failOn === "notesHeard" ? 48 : 60),
    extras: shape.extras ?? 0,
    ...(shape.noCatchReason ? { noCatchReason: shape.noCatchReason } : {}),
    evenness: 0.9,
    accent: null,
    noteIdentity: 0.97,
    barsPlayed: shape.verdict === "tooShort" ? 2 : plan.bars,
    barEvenness: perBar.map((b) => b.evenness),
    perBar,
    caught: !notCaught,
    pass,
  };
  let grade = gradeTake(exercise, BPM, measures);
  if (shape.verdict) grade = { ...grade, verdict: shape.verdict, cleanBpm: null };
  if (shape.ungraded) grade = { ...grade, verdict: "ungraded", cleanBpm: null };
  const outcome: TakeOutcome = {
    stepId: "block-1",
    exerciseId: exercise.id,
    title: exercise.title,
    bpm: BPM,
    takeNumber: shape.takeNumber ?? 2,
    measures,
    grade,
    previousValue: null,
    cleanBefore: null,
    takeId: "now",
    ...(shape.ungraded ? { ungraded: shape.ungraded } : {}),
  };
  const barTicks = plan.score.bars[0].lengthTicks;
  const deviation = shape.deviation === undefined ? () => 0 : shape.deviation;
  const onsetResults: OnsetResult[] | undefined =
    deviation === null
      ? undefined
      : plan.schedule.onsets.map((o) => ({
          id: o.id,
          state: "hit",
          deviationMs: deviation(Math.floor((o.beat * plan.score.ticksPerQuarter) / barTicks)),
          pass: 0,
        }));
  const review: TakeReview = {
    score: plan.score,
    schedule: plan.schedule,
    findings: shape.findings ?? [],
    segment: onsetResults ? { onsetResults } : {},
  };
  const takes = shape.stored ? [{ ...row(exercise.id, { bpm: BPM, startedAt: NOW, facts: shape.stored }), id: "now" }] : [];
  const ctx = toolCtx({
    screen: "session",
    run: runIn("result"),
    exercise,
    variantSeed: null,
    lastTake: outcome,
    ...(deviation === null ? {} : { review: review as unknown as SongAttemptReview }),
    progress: { states: [], takes, ceilings: [] },
    ...over,
  });
  return { ctx, outcome, review, exercise };
}

/** A line in English, for the table's "answer" column: the key with its values, as the test reads it. */
export function said(l: { key: string; values: Readonly<Record<string, string | number>> }): string {
  const values = Object.entries(l.values)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(",");
  return values ? `${l.key}(${values})` : l.key;
}
