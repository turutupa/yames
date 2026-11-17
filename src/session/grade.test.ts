import { describe, expect, it } from "vitest";
import type { Exercise } from "../paths/format";
import { CLEAN_TEMPO_MIN_BARS, TAKE_SLACK_BARS, gradeTake, takeBarsOf } from "./grade";
import type { TakeMeasures } from "./takeMeasures";
import { MIN_HEARD_NOTES, measureTake, withRightNotes } from "./takeMeasures";
import { takeLine } from "./coachWords";
import type { ScorerReport } from "./takeMeasures";
import type { ScorerTakeGrade } from "../ipc";
import { ALT } from "./testKit";
import type { ScorerPassResult } from "../ipc";
import { buildTake, writtenOut } from "./take";

const EX: Exercise = ALT.steps[0].exercises[0];
const WITH_PITCH: Exercise = ALT.steps[0].exercises[2];

function measures(fields: Partial<TakeMeasures> = {}): TakeMeasures {
  return {
    expected: 64,
    heard: 64,
    extras: 0,
    evenness: 0.9,
    accent: null,
    noteIdentity: null,
    barsPlayed: 8,
    barEvenness: null,
    caught: true,
    ...fields,
  };
}

function report(hits: number, misses: number, extra: Partial<ScorerReport> = {}): ScorerReport {
  const onsetResults = [
    ...Array.from({ length: hits }, (_, id) => ({
      id,
      state: "hit" as const,
      deviationMs: 1,
      pass: 0,
    })),
    ...Array.from({ length: misses }, (_, i) => ({
      id: hits + i,
      state: "miss" as const,
      deviationMs: null,
      pass: 0,
    })),
  ];
  return {
    componentScores: {
      intervalConsistency: 0.9,
      gridAlignment: 0.8,
      hitCompleteness: 1,
      onsetEfficiency: 1,
    } as ScorerReport["componentScores"],
    onsetResults,
    extraOnsets: [],
    ...extra,
  };
}

function scorerGrade(fields: Partial<ScorerTakeGrade> = {}): ScorerTakeGrade {
  return {
    verdict: "graded",
    score: 80,
    evenness: 0.88,
    evennessSigmaMs: 6,
    due: 64,
    heard: 60,
    missed: 4,
    extra: 0,
    notReached: 0,
    heardRatio: 0.94,
    confidence: 0.6,
    calibration: { offsetMs: 0, source: "none" },
    bpm: 80,
    bars: [
      { bar: 0, due: 8, heard: 8, missed: 0, extra: 0, evenness: 0.9, evennessSigmaMs: 4 },
      { bar: 1, due: 8, heard: 8, missed: 0, extra: 0, evenness: 0.86, evennessSigmaMs: 5 },
    ],
    ...fields,
  };
}

describe("the adapter", () => {
  it("reads today's report", () => {
    const m = measureTake(report(60, 4), { barsPlayed: 8 });
    expect(m).toMatchObject({ expected: 64, heard: 60, evenness: 0.9, caught: true, barsPlayed: 8 });
  });

  it("a soft note that never came was never due", () => {
    const r = report(10, 0);
    r.onsetResults = [
      ...(r.onsetResults ?? []),
      { id: 99, state: "softAbsent", deviationMs: null, pass: 0 },
    ];
    expect(measureTake(r, { barsPlayed: 8 }).expected).toBe(10);
  });

  it("no report at all is not caught, and no numbers appear", () => {
    const m = measureTake(null, { barsPlayed: 8 });
    expect(m).toMatchObject({ caught: false, heard: 0, expected: 0, evenness: null });
  });

  it("too few notes is not caught, whatever the ratio", () => {
    expect(measureTake(report(MIN_HEARD_NOTES - 1, 0), { barsPlayed: 8 }).caught).toBe(false);
    expect(measureTake(report(MIN_HEARD_NOTES, 0), { barsPlayed: 8 }).caught).toBe(true);
  });

  it("too small a share heard is not caught, and shows no evenness", () => {
    const m = measureTake(report(22, 106), { barsPlayed: 8 });
    expect(m.caught).toBe(false);
    expect(m.evenness).toBeNull();
    expect(m.heard).toBe(22);
  });

  it("the scorer's own grade is the authority when a report carries one", () => {
    const m = measureTake(report(60, 4, { takeGrade: scorerGrade({ heard: 50, due: 64, extra: 3 }) }), {
      barsPlayed: 8,
    });
    expect(m).toMatchObject({ expected: 64, heard: 50, extras: 3, evenness: 0.88, caught: true });
    expect(m.barEvenness).toEqual([0.9, 0.86]);
  });

  it("the scorer's \"didn't catch enough\" stands, with its reason and no numbers", () => {
    const grade = scorerGrade({
      verdict: "didntCatchEnough",
      noCatchReason: "tooFewHeard",
      heard: 19,
      evenness: null,
    });
    const m = measureTake(null, { barsPlayed: 8, grade });
    expect(m).toMatchObject({ caught: false, heard: 19, evenness: null, barEvenness: null });
    expect(m.noCatchReason).toBe("tooFewHeard");
  });

  it("a bar with notes due and no evenness counts as uneven, never as skipped", () => {
    const bars = [
      { bar: 0, due: 8, heard: 8, missed: 0, extra: 0, evenness: 0.9, evennessSigmaMs: 4 },
      { bar: 1, due: 8, heard: 2, missed: 6, extra: 0, evenness: null, evennessSigmaMs: null },
    ];
    const m = measureTake(null, { barsPlayed: 2, grade: scorerGrade({ bars }) });
    expect(m.barEvenness).toEqual([0.9, 0]);
    const sparse = [{ ...bars[1], due: 2, heard: 2, missed: 0 }];
    expect(measureTake(null, { barsPlayed: 1, grade: scorerGrade({ bars: sparse }) }).barEvenness).toBeNull();
  });
});

describe("a Take's length", () => {
  it("is the stretch it is judged over and two bars of slack, at least one whole pass", () => {
    for (const step of ALT.steps) {
      for (const ex of step.exercises) {
        const bars = takeBarsOf(ex);
        const asked = Math.max(CLEAN_TEMPO_MIN_BARS, ...ex.passBars.map((b) => b.overBars));
        expect(bars).toBe(Math.max(ex.bars, asked + TAKE_SLACK_BARS));
      }
    }
  });

  it("ends on a bar line inside the pattern rather than rounding up to whole passes", () => {
    const four = { ...EX, bars: 4, passBars: EX.passBars.map((b) => ({ ...b, overBars: 4 })) };
    expect(takeBarsOf(four)).toBe(10);
    expect(takeBarsOf({ ...four, bars: 12 })).toBe(12);
    const barTicks = 3840;
    const pattern: Exercise = {
      ...four,
      meter: { numerator: 4, denominator: 4 },
      notes: [0, 1, 2, 3].map((bar) => ({ ...EX.notes[0], tick: bar * barTicks, dur: 960 })),
      rests: [],
    };
    const out = writtenOut(pattern, 10);
    expect(out.bars).toBe(10);
    expect(out.notes.map((n) => n.tick / barTicks)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(writtenOut(pattern, 4)).toBe(pattern);
  });
});

describe("the pass rule", () => {
  it("meets every bar: passed, with a clean tempo", () => {
    const g = gradeTake(EX, 80, measures());
    expect(g.verdict).toBe("passed");
    expect(g.cleanBpm).toBe(80);
    expect(g.passesExercise).toBe(false);
  });

  it("passes the Exercise only at the pass rung or above", () => {
    expect(gradeTake(EX, 100, measures()).passesExercise).toBe(true);
    expect(gradeTake(EX, 110, measures()).passesExercise).toBe(true);
    expect(gradeTake(EX, 90, measures()).passesExercise).toBe(false);
  });

  it("evenness below the bar fails, and is what it talks about", () => {
    const g = gradeTake(EX, 80, measures({ evenness: 0.78 }));
    expect(g.verdict).toBe("belowBar");
    expect(g.cleanBpm).toBeNull();
    expect(g.headline).toMatchObject({ metric: "timingEvenness", value: 0.78, min: 0.85, met: false });
  });

  it("missing notes fails, which the headline score could never do", () => {
    const g = gradeTake(EX, 80, measures({ heard: 40 }));
    expect(g.verdict).toBe("belowBar");
    expect(g.headline?.metric).toBe("notesHeard");
  });

  it("the extra-note ceiling is per the bar's own bars, not per Take", () => {
    expect(gradeTake(EX, 80, measures({ extras: 4 })).verdict).toBe("passed");
    const g = gradeTake(EX, 80, measures({ extras: 5 }));
    expect(g.verdict).toBe("belowBar");
    expect(g.headline?.metric).toBe("extraNotes");
  });

  it("not caught is no grade at all, and earns nothing", () => {
    const g = gradeTake(EX, 100, measures({ caught: false, evenness: null, heard: 3 }));
    expect(g.verdict).toBe("notCaught");
    expect(g.checks).toEqual([]);
    expect(g.cleanBpm).toBeNull();
    expect(g.passesExercise).toBe(false);
  });

  it("stopped before the bar's bars is too short, whatever the numbers", () => {
    const g = gradeTake(EX, 100, measures({ barsPlayed: 3 }));
    expect(g.verdict).toBe("tooShort");
    expect(g.passesExercise).toBe(false);
  });

  it("passes its bar under eight bars, but earns no clean tempo", () => {
    const g = gradeTake(EX, 100, measures({ barsPlayed: 6 }));
    expect(g.verdict).toBe("passed");
    expect(g.cleanBpm).toBeNull();
    expect(g.passesExercise).toBe(false);
  });

  it("a metric this build cannot measure neither blocks nor counts, and is named", () => {
    const g = gradeTake(WITH_PITCH, 100, measures());
    expect(g.verdict).toBe("passed");
    expect(g.unmeasured).toEqual(["noteIdentity"]);
  });

  it("nothing measurable is never a pass", () => {
    const ex: Exercise = {
      ...EX,
      passBars: [{ metric: "noteIdentity", min: 0.9, overBars: 4 }],
    };
    expect(gradeTake(ex, 100, measures()).verdict).toBe("belowBar");
  });

  it("a self-checked Exercise or rung is not the app's to grade", () => {
    expect(gradeTake({ ...EX, grading: "selfChecked" }, 100, measures()).verdict).toBe("ungraded");
    const rung: Exercise = {
      ...EX,
      tempo: { ...EX.tempo, rungs: [{ bpm: 100, grading: "selfChecked" }] },
    };
    expect(gradeTake(rung, 100, measures()).verdict).toBe("ungraded");
  });

  it("with per-bar evenness, one bad bar does not sink a good stretch", () => {
    const bars = [0.5, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const g = gradeTake(EX, 80, measures({ evenness: 0.7, barEvenness: bars }));
    expect(g.verdict).toBe("passed");
  });
});

describe("the scorer's own verdict", () => {
  const pass = (fields: Partial<ScorerPassResult> = {}): ScorerPassResult => ({
    verdict: "passed",
    windowBars: 4,
    finishedBars: 8,
    heldBars: 8,
    heldFromBar: 0,
    countsForCleanTempo: true,
    windowFromBar: 0,
    checks: EX.passBars.map((bar) => ({ ...bar, measured: bar.max === undefined ? 0.9 : 0, held: true })),
    notAssessed: [],
    ...fields,
  });

  it("decides the verdict and the clean tempo when it is there", () => {
    const g = gradeTake(EX, 100, measures({ pass: pass() }));
    expect(g.verdict).toBe("passed");
    expect(g.cleanBpm).toBe(100);
    expect(g.passesExercise).toBe(true);
    expect(g.checks.map((c) => c.metric)).toEqual(EX.passBars.map((b) => b.metric));
  });

  it("does not give a clean tempo for a pass held under 8 bars", () => {
    const g = gradeTake(EX, 100, measures({ pass: pass({ heldBars: 6, countsForCleanTempo: false }) }));
    expect(g.verdict).toBe("passed");
    expect(g.cleanBpm).toBeNull();
    expect(g.passesExercise).toBe(false);
  });

  it("says which bar failed, overriding a reading that would pass", () => {
    const failed = pass({
      verdict: "failed",
      heldBars: 0,
      countsForCleanTempo: false,
      checks: EX.passBars.map((bar) =>
        bar.metric === "timingEvenness"
          ? { ...bar, measured: 0.7, held: false }
          : { ...bar, measured: bar.max === undefined ? 1 : 0, held: true },
      ),
    });
    const g = gradeTake(EX, 100, measures({ evenness: 0.95, pass: failed }));
    expect(g.verdict).toBe("belowBar");
    expect(g.headline).toMatchObject({ metric: "timingEvenness", value: 0.7, met: false });
  });

  it("maps too short and didn't catch enough", () => {
    expect(gradeTake(EX, 100, measures({ pass: pass({ verdict: "tooShort" }) })).verdict).toBe("tooShort");
    expect(gradeTake(EX, 100, measures({ pass: pass({ verdict: "didntCatchEnough" }) })).verdict).toBe(
      "notCaught",
    );
  });

  it("reaches the measures from the scorer's grade", () => {
    const m = measureTake(null, { barsPlayed: 8, grade: scorerGrade({ pass: pass() }) });
    expect(m.pass?.verdict).toBe("passed");
  });
});

describe("the fallback reading", () => {
  it("is only as even as the worst bar of its best window", () => {
    // Three good bars and a sloppy one in every window of four: an average
    // would read 0.87 and pass a bar of 0.85.
    const barEvenness = [0.95, 0.95, 0.95, 0.6, 0.95, 0.95, 0.95, 0.6];
    const g = gradeTake(EX, 100, measures({ barEvenness }));
    expect(g.verdict).toBe("belowBar");
    expect(g.headline).toMatchObject({ metric: "timingEvenness", value: 0.6, met: false });
  });

  it("leaves a fluffed first bar behind: eight clean bars after it earn the clean tempo", () => {
    const barEvenness = [0.4, ...Array<number>(9).fill(0.95)];
    const g = gradeTake(EX, 100, measures({ barEvenness, barsPlayed: 10 }));
    expect(g.verdict).toBe("passed");
    expect(g.cleanBpm).toBe(100);
    expect(g.passesExercise).toBe(true);
  });

  it("passes on a clean stretch of four, but no clean tempo without eight in a row", () => {
    const barEvenness = [0.95, 0.95, 0.95, 0.95, 0.4, 0.95, 0.95, 0.95, 0.95, 0.95];
    const g = gradeTake(EX, 100, measures({ barEvenness, barsPlayed: 10 }));
    expect(g.verdict).toBe("passed");
    expect(g.cleanBpm).toBeNull();
    expect(g.passesExercise).toBe(false);
  });
});

describe("a Take's length", () => {
  it("covers the longest stretch a pass bar asks for", () => {
    const stamina = ALT.steps
      .flatMap((s) => s.exercises)
      .find((e) => e.id === "stamina-minute.chromatic-minute")!;
    expect(takeBarsOf(stamina)).toBe(16 + TAKE_SLACK_BARS);
  });

  it("plays the variant the planner chose, under the Exercise's own id", () => {
    const varied = ALT.steps.flatMap((s) => s.exercises).find((e) => (e.variation?.variants.length ?? 0) > 1)!;
    const first = buildTake(ALT, varied, 80, 0);
    const second = buildTake(ALT, varied, 80, 1);
    expect(first.exercise.id).toBe(varied.id);
    expect(second.exercise.id).toBe(varied.id);
    expect(second.exercise.notes).toEqual(varied.variation!.variants[1].notes);
    // Variants move the notes, not the rhythm: the tab differs, the timing schedule need not.
    expect(new TextDecoder().decode(first.source)).not.toBe(new TextDecoder().decode(second.source));
  });
});

describe("right notes", () => {
  // The scorer's pass on the Exercise that names noteIdentity, every bar held
  // unless a test says otherwise.
  const scorerPass = (
    notes: ScorerPassResult["notes"],
    identity: { measured: number; held: boolean } | null,
  ): ScorerPassResult => {
    const timing = WITH_PITCH.passBars.filter((b) => b.metric !== "noteIdentity");
    const idBar = WITH_PITCH.passBars.find((b) => b.metric === "noteIdentity")!;
    return {
      verdict: identity && !identity.held ? "failed" : "passed",
      windowBars: 4,
      finishedBars: 8,
      heldBars: identity && !identity.held ? 0 : 8,
      heldFromBar: 0,
      countsForCleanTempo: !(identity && !identity.held),
      windowFromBar: 0,
      checks: [
        ...timing.map((bar) => ({ ...bar, measured: bar.max === undefined ? 0.95 : 0, held: true })),
        ...(identity ? [{ ...idBar, ...identity }] : []),
      ],
      notAssessed: identity ? [] : ["noteIdentity"],
      ...(notes ? { notes } : {}),
    };
  };
  const counts = { right: 60, wrong: 0, octave: 0, unpitched: 2 };

  it("a measured noteIdentity is in the checks and in the verdict", () => {
    const grade = scorerGrade({ pass: scorerPass({ status: "measured", ...counts }, { measured: 0.97, held: true }) });
    const m = measureTake(null, { barsPlayed: 8, grade });
    expect(m.noteIdentity).toBe(0.97);
    const g = gradeTake(WITH_PITCH, 100, m);
    expect(g.verdict).toBe("passed");
    expect(g.unmeasured).toEqual([]);
    expect(g.checks.find((c) => c.metric === "noteIdentity")).toMatchObject({ value: 0.97, met: true });
  });

  it("wrong notes fail the Take, and the coach says it was the notes", () => {
    const grade = scorerGrade({
      pass: scorerPass({ status: "measured", ...counts, right: 45, wrong: 15 }, { measured: 0.75, held: false }),
    });
    const m = measureTake(null, { barsPlayed: 8, grade });
    const g = gradeTake(WITH_PITCH, 100, m);
    expect(g.verdict).toBe("belowBar");
    expect(g.headline).toMatchObject({ metric: "noteIdentity", value: 0.75, met: false });
    expect(takeLine(g, m, 100).key).toBe("session.coach.below.notes");
  });

  it("notes the pitch pass could not believe are named as not measured, and decide nothing", () => {
    const grade = scorerGrade({ pass: scorerPass({ status: "notesRing", ...counts, right: 10, unpitched: 50 }, null) });
    const m = measureTake(null, { barsPlayed: 8, grade });
    expect(m.noteIdentity).toBeNull();
    const g = gradeTake(WITH_PITCH, 100, m);
    expect(g.verdict).toBe("passed");
    expect(g.unmeasured).toEqual(["noteIdentity"]);
  });

  it("waits for the grade with right notes only when the scorer said it is coming", async () => {
    const timed = scorerGrade({
      notesPending: true,
      notesSerial: 7,
      pass: scorerPass({ status: "notRun", ...counts }, null),
    });
    const full = scorerGrade({
      score: 1, // only `pass` is taken from it
      notesSerial: 7,
      pass: scorerPass({ status: "measured", ...counts }, { measured: 1, held: true }),
    });
    const asked: number[] = [];
    const merged = await withRightNotes(timed, async (ms) => {
      asked.push(ms);
      return full;
    });
    expect(asked.length).toBe(1);
    expect(merged?.notesPending).toBe(false);
    expect(merged?.score).toBe(timed.score);
    expect(merged?.pass?.notes?.status).toBe("measured");

    const plain = scorerGrade();
    expect(await withRightNotes(plain, () => Promise.reject(new Error("never asked")))).toBe(plain);
    expect(await withRightNotes(null)).toBeNull();
  });

  it("does not take another Take's right notes for this one's", async () => {
    const timed = scorerGrade({
      notesPending: true,
      notesSerial: 8,
      pass: scorerPass({ status: "notRun", ...counts }, null),
    });
    const other = scorerGrade({
      notesSerial: 7,
      pass: scorerPass({ status: "measured", ...counts }, { measured: 0.5, held: false }),
    });
    const got = await withRightNotes(timed, async () => other);
    expect(got?.pass).toBe(timed.pass);
    expect(got?.notesPending).toBe(false);
  });

  it("keeps the timing grade when the right notes do not come in time", async () => {
    const timed = scorerGrade({ notesPending: true, pass: scorerPass({ status: "notRun", ...counts }, null) });
    const late = await withRightNotes(timed, async () => null);
    expect(late?.pass).toBe(timed.pass);
    expect(late?.notesPending).toBe(false);
    const broken = await withRightNotes(timed, () => Promise.reject(new Error("an older build")));
    expect(gradeTake(WITH_PITCH, 100, measureTake(null, { barsPlayed: 8, grade: broken })).unmeasured).toEqual([
      "noteIdentity",
    ]);
  });

  it("a Take carries the written pitches the scorer checks against", () => {
    const take = buildTake(ALT, WITH_PITCH, 100);
    expect(take.pitches.length).toBe(take.score.notes.length);
    expect(take.pitches[0]).toEqual({ id: take.score.notes[0].id, midi: take.score.notes[0].midi });
  });
});
