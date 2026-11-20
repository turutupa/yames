/**
 * The note's brain against one fixture Take per finding kind, a variant, the
 * Takes it must make no claim about, the pass that still holds last Take's
 * slipped bar (REVIEW row 1), and the three rows of the repeat table (DESIGN
 * 4.2). Every fixture is built from the real types: a real pack Exercise, its
 * real Take plan (score and schedule), the scorer's own result shapes, and
 * `gradeTake` deciding the verdict.
 */
import { describe, expect, it } from "vitest";
import type { PathTakeRow, ScorerPassResult } from "../ipc";
import type { Exercise } from "../paths/format";
import { gradeTake } from "../session/grade";
import type { TakeFacts } from "../session/progress";
import type { TakeOutcome } from "../session/runner";
import { buildTake, withVariant } from "../session/take";
import type { TakeMeasures } from "../session/takeMeasures";
import { ALT, NOW, take as row } from "../session/testKit";
import type { Finding, FindingKind, NoteVerdict, OnsetResult } from "../songs/types";
import { biasThresholdMs, takeNote, tuningSuspected } from "./takeNote";
import type { TakeNote, TakeReview } from "./takeNote";

const EXERCISES = ALT.steps.flatMap((s) => s.exercises);
/** "A tune on the B string": four bars, so a ten-bar Take is three rounds (mocks 06 and 07). */
const TUNE = EXERCISES.find((e) => e.id === "other-strings.b-string-tune")!;
/** Four variants of four bars. */
const ARPS = EXERCISES.find((e) => e.id === "cross-string-runs.picked-arpeggios")!;
const BPM = 90;
const SESSION = NOW - 3_600_000;

type Shape = {
  exercise?: Exercise;
  variantSeed?: number | null;
  /** Played bars (from 0) that slipped. */
  slipped?: number[];
  /** Below the pass mark on this metric; passed without one. */
  failOn?: "timingEvenness" | "notesHeard" | "extraNotes";
  extras?: number;
  evenness?: number;
  findings?: Finding[];
  /** Deviation per played bar, ms; null leaves the segment without per-note results. */
  deviation?: ((bar: number) => number) | null;
  cleanBefore?: number | null;
  takeNumber?: number;
  bpm?: number;
};

function finding(kind: FindingKind, bars: [number, number], evidence: Partial<Finding["evidence"]> = {}): Finding {
  return {
    kind,
    bars,
    noteIds: [],
    severity: 0.5,
    evidence: {
      onsets: 24,
      hits: 22,
      hitRate: 22 / 24,
      meanDeviationMs: 0,
      deviationBeats: 0,
      spreadMs: 12,
      passes: 1,
      passesAffected: 1,
      ...evidence,
    },
  };
}

function scorerPass(exercise: Exercise, shape: Shape, heldBars: number): ScorerPassResult {
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
        bar.metric === "timingEvenness"
          ? (shape.evenness ?? (failed === "timingEvenness" ? 0.79 : 0.9))
          : bar.metric === "notesHeard"
            ? failed === "notesHeard"
              ? 0.8
              : 1
            : bar.metric === "extraNotes"
              ? (shape.extras ?? 0)
              : 0.97;
      const held = bar.max !== undefined ? value <= bar.max : value >= (bar.min ?? 0);
      return { ...bar, measured: value, held };
    }),
    notAssessed: [],
    notes: { status: "measured", right: 56, wrong: 2, octave: 0, unpitched: 0 },
  };
}

/** A graded Take of `shape`, with its review: the parts `takeNote` reads. */
function graded(shape: Shape = {}) {
  const base = shape.exercise ?? TUNE;
  const exercise = withVariant(base, shape.variantSeed ?? null);
  const bpm = shape.bpm ?? BPM;
  const plan = buildTake(ALT, base, bpm, shape.variantSeed ?? null);
  const slipped = new Set(shape.slipped ?? []);
  const perBar = Array.from({ length: plan.bars }, (_u, bar) => ({
    due: 6,
    heard: shape.failOn === "notesHeard" && slipped.has(bar) ? 3 : 6,
    evenness: slipped.has(bar) ? 0.6 : 0.95,
  }));
  const clean = plan.bars - (shape.slipped?.length ?? 0);
  const pass = scorerPass(base, shape, Math.min(8, clean));
  const measures: TakeMeasures = {
    expected: 60,
    heard: shape.failOn === "notesHeard" ? 48 : 60,
    extras: shape.extras ?? 0,
    evenness: shape.evenness ?? 0.9,
    accent: null,
    noteIdentity: 0.97,
    barsPlayed: plan.bars,
    barEvenness: perBar.map((b) => b.evenness),
    perBar,
    caught: true,
    pass,
  };
  const grade = gradeTake(base, bpm, measures);
  const outcome: TakeOutcome = {
    stepId: "block-1",
    exerciseId: base.id,
    title: base.title,
    bpm,
    takeNumber: shape.takeNumber ?? 2,
    measures,
    grade,
    previousValue: null,
    cleanBefore: shape.cleanBefore ?? null,
    takeId: "now",
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
  return { outcome, review, exercise, measures };
}

/** A stored earlier Take on the same Exercise, as `useSessionRun` writes it. */
function stored(
  slipped: number[],
  fields: { bpm?: number; value?: number; passed?: boolean; session?: number; variantSeed?: number; ago?: number; exercise?: Exercise; facts?: TakeFacts } = {},
): PathTakeRow {
  const exercise = fields.exercise ?? TUNE;
  const set = new Set(slipped);
  const perBar = Array.from({ length: 10 }, (_u, bar) => ({ due: 6, heard: 6, evenness: set.has(bar) ? 0.6 : 0.95 }));
  return row(exercise.id, {
    bpm: fields.bpm ?? BPM,
    startedAt: NOW - (fields.ago ?? 60_000),
    passed: fields.passed ?? false,
    ...(fields.variantSeed === undefined ? {} : { variantSeed: fields.variantSeed }),
    facts: {
      verdict: fields.passed ? "passed" : "belowBar",
      headlineMetric: "timingEvenness",
      headlineValue: fields.value ?? 0.79,
      headlineMin: 0.85,
      session: fields.session ?? SESSION,
      measures: { perBar, barsPlayed: 10 },
      ...fields.facts,
    },
  });
}

function note(shape: Shape, earlier: PathTakeRow[] = [], context: { session?: number; noteVerdicts?: NoteVerdict[] } = {}): TakeNote {
  const { outcome, review, exercise } = graded(shape);
  return takeNote(outcome, review, earlier, exercise, { variantSeed: shape.variantSeed ?? null, session: SESSION, ...context });
}

/** Every key the note would hand the locale files. */
function keysOf(n: TakeNote): string[] {
  return [
    n.lead,
    n.hint,
    n.findingLine,
    n.placeLine,
    n.lastTakeLine,
    n.directionLine,
    ...n.historyLines,
    n.repeatLine,
    ...n.facts.map((f) => f.line),
    n.strip?.label,
    n.ungraded?.notListening,
    n.ungraded?.question,
    n.ungraded?.tryLine,
  ]
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => l.key);
}

describe("takeNote: one fixture Take per finding kind", () => {
  it("ConsistentMiss: the tune's first bar, on two rounds of three", () => {
    const n = note({ failOn: "timingEvenness", slipped: [0, 4], findings: [finding("consistentMiss", [0, 0])] });
    expect(n.kind).toBe("result");
    expect(n.finding).toBe("consistentMiss");
    // Leads with what decided the verdict, worded by takeLine.
    expect(n.deciding?.metric).toBe("timingEvenness");
    expect(n.lead.key).toBe("session.coach.below.even");
    expect(n.place).toMatchObject({ shape: "bar", patternBars: [1], slipped: 2, of: 3, before: null, key: "-:1" });
    expect(n.placeLine).toEqual({
      key: "session.note.place.slipped.bar",
      values: { bar: 1, from: 1, to: 1, slipped: 2, count: 2, of: 3 },
    });
    // The strip: rounds set apart, the slipped cells marked as the spot.
    expect(n.strip?.label).toEqual({ key: "session.note.strip.roundEvery", values: { count: 4 } });
    expect(n.strip?.cells.filter((c) => c.spot).map((c) => [c.n, c.round, c.patternBar])).toEqual([
      [1, 1, 1],
      [5, 2, 1],
    ]);
    // No direction: the notes sat where the rest of the Take did.
    expect(n.direction).toBeNull();
    expect(n.repeat).toBe(1);
  });

  it("Rushing: the place, and early from the notes, relative to the rest of the Take", () => {
    const n = note({
      failOn: "timingEvenness",
      slipped: [0, 4],
      findings: [finding("rushing", [0, 4], { meanDeviationMs: -25 })],
      // The whole Take 30 ms late (the lag correction's business), the first bar 35 ms ahead of that.
      deviation: (bar) => (bar % 4 === 0 ? -5 : 30),
    });
    expect(n.finding).toBe("rushing");
    expect(n.place?.patternBars).toEqual([1]);
    expect(n.direction).toMatchObject({ way: "early", source: "notes", ms: -35 });
    // Mostly one note, so it is named with the direction.
    expect(n.directionLine?.key).toMatch(/^session\.note\.direction\.early(Open|Note)?$/);
  });

  it("Dragging: with no per-note results, the engine's dragging at that place says late", () => {
    const n = note({
      failOn: "timingEvenness",
      slipped: [1, 5],
      findings: [finding("dragging", [1, 5], { meanDeviationMs: 30 })],
      deviation: null,
    });
    expect(n.place?.patternBars).toEqual([2]);
    expect(n.direction).toEqual({ way: "late", source: "finding", ms: null, note: null });
    expect(n.directionLine).toEqual({ key: "session.note.direction.late", values: {} });
  });

  it("Dragging over the whole Take is the lean the lag correction hides: no direction", () => {
    const n = note({
      failOn: "timingEvenness",
      slipped: [1, 5],
      findings: [finding("dragging", [0, 9], { meanDeviationMs: 30 })],
      deviation: null,
    });
    expect(n.direction).toBeNull();
  });

  it("AfterShift: the bar after the jump, folded", () => {
    const n = note({ failOn: "timingEvenness", slipped: [2, 6], findings: [finding("afterShift", [2, 2])] });
    expect(n.place).toMatchObject({ shape: "bar", patternBars: [3], slipped: 2, of: 2 });
  });

  it("FallsApart: from a round on, not a bar of the tune", () => {
    const n = note({ failOn: "timingEvenness", slipped: [6, 7, 8, 9], findings: [finding("fallsApart", [6, 9])] });
    expect(n.place).toMatchObject({ shape: "fromRound", round: 2, of: 3, before: null });
    expect(n.placeLine?.key).toBe("session.note.place.slipped.fromRound");
    expect(n.placeLine?.values.round).toBe(2);
    expect(n.direction).toBeNull();
  });

  it("Extras: the deciding check is the extras, then where", () => {
    const n = note({ failOn: "extraNotes", extras: 5, slipped: [1, 5], findings: [finding("extras", [1, 1], { extras: 5 })] });
    expect(n.deciding?.metric).toBe("extraNotes");
    expect(n.lead.key).toBe("session.coach.below.extras");
    expect(n.place?.patternBars).toEqual([2]);
    expect(n.facts.find((f) => f.kind === "extras")).toEqual({
      kind: "extras",
      mark: "cross",
      line: { key: "session.note.fact.extras", values: { count: 5 } },
    });
  });

  it("Uneven: spread with nowhere to point, so no place is named", () => {
    const n = note({ failOn: "timingEvenness", findings: [finding("uneven", [0, 9])] });
    expect(n.finding).toBe("uneven");
    expect(n.place).toBeNull();
    expect(n.placeLine).toBeNull();
    expect(n.lead.key).toBe("session.coach.below.even");
  });

  it("TempoCeiling: the band it holds and breaks at, as measured", () => {
    const n = note({
      failOn: "timingEvenness",
      slipped: [3, 7],
      findings: [finding("tempoCeiling", [0, 9], { bpmBand: [80, 90] })],
    });
    expect(n.findingLine).toEqual({ key: "session.note.finding.ceiling", values: { holds: 80, breaks: 90 } });
    expect(n.place?.patternBars).toEqual([4]);
  });

  it("Improved: a pass, praise from the engine, nothing slipped, nothing overclaimed", () => {
    const n = note({ findings: [finding("improved", [0, 9])] }, [stored([0, 4])]);
    expect(n.verdict).toBe("passed");
    expect(n.finding).toBe("improved");
    expect(n.place).toBeNull();
    expect(n.onceMoreHere).toBe(false);
    expect(n.strip?.label).toEqual({ key: "session.note.strip.held", values: { count: 8 } });
  });

  it("Clean: a pass that raised the clean tempo says so", () => {
    const n = note({ findings: [finding("clean", [0, 9])], cleanBefore: 80 });
    expect(n.finding).toBe("clean");
    expect(n.place).toBeNull();
    expect(n.history.newClean).toBe(true);
    expect(n.historyLines).toContainEqual({ key: "session.note.history.newClean", values: { bpm: BPM } });
    expect(n.facts.map((f) => [f.kind, f.mark])).toEqual([
      ["heard", "check"],
      ["extras", "check"],
      ["rightNotes", "check"],
    ]);
    expect(n.facts[2].line).toEqual({ key: "session.note.fact.rightNotes", values: { value: 97, base: 58 } });
  });
});

describe("takeNote: variants, and the Takes it makes no claim about", () => {
  it("compares only the same notes: another variant's slipped bar is not 'last Take'", () => {
    const earlier = [stored([0, 4], { exercise: ARPS, variantSeed: 0 })];
    const other = note({ exercise: ARPS, variantSeed: 1, failOn: "timingEvenness", slipped: [0, 4] }, earlier);
    expect(other.place).toMatchObject({ patternBars: [1], before: null, key: "1:1" });
    expect(other.lastTakeLine).toBeNull();
    expect(other.history.sameSpot).toBe(false);
    const same = note({ exercise: ARPS, variantSeed: 0, failOn: "timingEvenness", slipped: [0, 4] }, earlier);
    expect(same.place).toMatchObject({ before: 2, key: "0:1" });
    expect(same.history.sameSpot).toBe(true);
  });

  it("notCaught: what it heard and why, no place, no facts, no history", () => {
    const { outcome, review, exercise } = graded();
    const measures: TakeMeasures = { ...outcome.measures, caught: false, heard: 5, noCatchReason: "tooFewHeard" };
    const lost: TakeOutcome = { ...outcome, measures, grade: gradeTake(TUNE, BPM, measures) };
    const n = takeNote(lost, review, [stored([0, 4])], exercise, { session: SESSION });
    expect(n.kind).toBe("notCaught");
    expect(n.lead.key).toBe("session.coach.heardLittle");
    expect(n.hint).toEqual({ key: "session.noCatch.hintQuiet", values: {} });
    expect([n.place, n.direction, n.strip, n.placeLine]).toEqual([null, null, null, null]);
    expect(n.facts).toEqual([]);
    expect(n.historyLines).toEqual([]);
  });

  it("ungraded: one thing to listen for, 'I'm not listening' once a Session, the question, no claim", () => {
    const { outcome, review, exercise } = graded();
    const free: TakeOutcome = {
      ...outcome,
      grade: { ...outcome.grade, verdict: "ungraded", checks: [], headline: null, cleanBpm: null, passesExercise: false },
      ungraded: "chosen",
    };
    const first = takeNote(free, review, [], exercise, { session: SESSION });
    expect(first.kind).toBe("ungraded");
    expect(first.lead.key).toBe("session.coach.ungraded");
    expect(first.ungraded?.listenFor).toEqual({ source: "coachLine" });
    expect(first.ungraded?.notListening).toEqual({ key: "session.note.ungraded.notListening", values: {} });
    expect(first.ungraded?.question.key).toBe("session.note.ungraded.didThey");
    expect([first.place, first.strip, first.direction]).toEqual([null, null, null]);
    expect(first.facts).toEqual([]);
    const answered = (heardIt: "yes" | "notYet", ago: number) =>
      row(TUNE.id, { caught: false, startedAt: NOW - ago, facts: { session: SESSION, verdict: "ungraded", ungraded: "chosen", heardIt } });
    // Said once: the second ungraded Take in the Session does not say it again.
    const notYet = takeNote(free, review, [answered("notYet", 1), answered("notYet", 2)], exercise, { session: SESSION });
    expect(notYet.ungraded?.notListening).toBeNull();
    expect(notYet.ungraded).toMatchObject({ streak: { answer: "notYet", count: 2 }, loopFirst: true, tryBpm: null });
    const yes = takeNote(free, review, [answered("yes", 1), answered("yes", 2)], exercise, { session: SESSION });
    expect(yes.ungraded).toMatchObject({ loopFirst: false, tryBpm: 100 });
    expect(yes.ungraded?.tryLine).toEqual({ key: "session.note.ungraded.tryFaster", values: { bpm: 100 } });
  });
});

describe("takeNote: a pass is not oversold (REVIEW row 1)", () => {
  it("a pass that still holds last Take's slipped bar: caught you on one round of three; last Take it was two", () => {
    const earlier = [stored([0, 4])];
    const n = note({ slipped: [8], findings: [finding("clean", [0, 7])] }, earlier);
    expect(n.verdict).toBe("passed");
    expect(n.place).toMatchObject({ shape: "bar", patternBars: [1], slipped: 1, of: 3, before: 2 });
    expect(n.placeLine).toEqual({
      key: "session.note.place.caught.bar",
      values: { bar: 1, from: 1, to: 1, slipped: 1, count: 1, of: 3 },
    });
    expect(n.lastTakeLine).toEqual({ key: "session.note.place.lastTake", values: { before: 2, count: 2 } });
    expect(n.history.sameSpot).toBe(true);
    // P1's condition, reported for the Session to read.
    expect(n.onceMoreHere).toBe(true);
    // Never "held" about the place, never "fixed".
    expect(keysOf(n).filter((k) => /lastTakeHeld|fixed/.test(k))).toEqual([]);
    expect(n.strip?.cells.filter((c) => c.spot).map((c) => c.n)).toEqual([9]);
  });

  it("a pass whose slipped bar did not slip last Take is not P1", () => {
    const n = note({ slipped: [9] }, [stored([0, 4])]);
    expect(n.place?.patternBars).toEqual([2]);
    expect(n.lastTakeLine).toEqual({ key: "session.note.place.lastTakeHeld", values: {} });
    expect(n.onceMoreHere).toBe(false);
  });
});

describe("takeNote: the repeat table", () => {
  const miss = { failOn: "timingEvenness" as const, slipped: [0, 4], findings: [finding("consistentMiss", [0, 0])] };

  it("first time at this spot and tempo", () => {
    const n = note(miss, [stored([2, 6])]);
    expect(n.repeat).toBe(1);
    expect(n.repeatLine).toBeNull();
  });

  it("second time", () => {
    const n = note(miss, [stored([0, 4]), stored([2, 6], { ago: 120_000 })]);
    expect(n.repeat).toBe(2);
    expect(n.repeatLine).toBeNull();
  });

  it("third time: leave it for today", () => {
    const n = note(miss, [stored([0, 4], { value: 0.7 }), stored([0], { ago: 120_000, value: 0.7 })]);
    expect(n.repeat).toBe(3);
    expect(n.repeatLine).toEqual({ key: "session.note.repeat.leaveIt", values: {} });
  });

  it("another tempo, or another Session, starts the count again", () => {
    expect(note(miss, [stored([0, 4], { bpm: 80 }), stored([0, 4], { bpm: 80, ago: 120_000 })]).repeat).toBe(1);
    expect(note(miss, [stored([0, 4], { session: SESSION - 86_400_000 })]).repeat).toBe(1);
  });

  it("three Takes falling counts as the third row", () => {
    const n = note({ ...miss, evenness: 0.7 }, [stored([2]), stored([3], { value: 0.82, ago: 120_000 })]);
    expect(n.history.goingDown).toBe(true);
    expect(n.repeat).toBe(3);
  });
});

describe("takeNote: what only history knows", () => {
  const below = { failOn: "timingEvenness" as const, slipped: [0, 4] };

  it("closer: up three points or more at the same tempo", () => {
    const n = note({ ...below, evenness: 0.79 }, [stored([], { value: 0.76 })]);
    expect(n.history.closer).toEqual({ from: 76, to: 79 });
    expect(n.historyLines).toContainEqual({ key: "session.note.history.closer", values: { from: 76, to: 79 } });
    expect(note({ ...below, evenness: 0.78 }, [stored([], { value: 0.76 })]).history.closer).toBeNull();
    expect(note({ ...below, evenness: 0.79 }, [stored([], { value: 0.76, bpm: 80 })]).history.closer).toBeNull();
  });

  it("stuck: three Takes at one tempo within two points", () => {
    const n = note({ ...below, evenness: 0.8 }, [stored([], { value: 0.79 }), stored([], { value: 0.81, ago: 120_000 })]);
    expect(n.history.stuck).toBe(true);
    expect(n.history.goingDown).toBe(false);
    expect(n.historyLines).toContainEqual({ key: "session.note.history.stuck", values: { bpm: BPM } });
  });

  it("tooEasy: passed on the first Take with eight to spare, twice running", () => {
    const yesterday = SESSION - 86_400_000;
    const opener = stored([], {
      passed: true,
      value: 0.95,
      session: yesterday,
      ago: 86_400_000,
      facts: { headlineMin: 0.85 },
    });
    const easy = { evenness: 0.95, takeNumber: 1 };
    // The yesterday row's checks are its headline alone: 10 points to spare.
    const n = note(easy, [opener]);
    // Today's tightest margin is right notes, 0.97 against 0.9: seven points, so not easy.
    expect(n.history.tooEasy).toBe(false);
    const roomy = graded(easy);
    const loose: TakeOutcome = {
      ...roomy.outcome,
      grade: {
        ...roomy.outcome.grade,
        checks: roomy.outcome.grade.checks.map((c) => (c.metric === "noteIdentity" ? { ...c, value: 1 } : c)),
      },
    };
    const m = takeNote(loose, roomy.review, [opener], roomy.exercise, { session: SESSION });
    expect(m.history.tooEasy).toBe(true);
    expect(m.historyLines).toContainEqual({ key: "session.note.history.tooEasy", values: { bpm: BPM } });
    // Not the first Take of today's Session: no.
    const again = takeNote(loose, roomy.review, [stored([], { passed: true, value: 0.95 }), opener], roomy.exercise, {
      session: SESSION,
    });
    expect(again.history.tooEasy).toBe(false);
  });
});

describe("takeNote: what it never says", () => {
  it("tuning: kept as a fact when most wrong notes are off the same way, never a line", () => {
    const sharp = (n: number): NoteVerdict => ({
      noteId: n,
      onsetId: n,
      expectedMidi: 59,
      heardMidi: 59.4,
      centsOff: 40,
      state: "wrong",
      confidence: 0.9,
    });
    const verdicts = [sharp(1), sharp(2), sharp(3), { ...sharp(4), centsOff: -30 }];
    expect(tuningSuspected(verdicts)).toBe(true);
    expect(tuningSuspected(verdicts.slice(0, 2))).toBe(false);
    expect(tuningSuspected([sharp(1), { ...sharp(2), centsOff: -40 }, sharp(3), { ...sharp(4), centsOff: -40 }])).toBe(false);
    const n = note({ failOn: "timingEvenness", slipped: [0] }, [], { noteVerdicts: verdicts });
    expect(n.tuningSuspected).toBe(true);
    expect(keysOf(n).filter((k) => /tun/i.test(k))).toEqual([]);
  });

  it("couldn't tell is a dash with its reason, never a cross", () => {
    const { outcome, review, exercise } = graded();
    const pass = { ...outcome.measures.pass!, notes: { status: "tooFast" as const, right: 0, wrong: 0, octave: 0, unpitched: 0 } };
    const measures: TakeMeasures = { ...outcome.measures, noteIdentity: null, pass };
    const n = takeNote({ ...outcome, measures }, review, [], exercise);
    expect(n.facts.find((f) => f.kind === "notesUnchecked")).toEqual({
      kind: "notesUnchecked",
      mark: "dash",
      line: { key: "session.note.fact.notesUnchecked.tooFast", values: {} },
    });
  });

  it("a direction needs the finding engine's own threshold", () => {
    expect(biasThresholdMs(90)).toBe(16);
    expect(biasThresholdMs(600)).toBe(8);
    // 10 ms off the rest of the Take at 90 BPM is inside it: no direction.
    const n = note({ failOn: "timingEvenness", slipped: [0, 4], deviation: (bar) => (bar % 4 === 0 ? 10 : 0) });
    expect(n.direction).toBeNull();
  });
});
