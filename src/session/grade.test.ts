import { describe, expect, it } from "vitest";
import type { Exercise } from "../paths/format";
import { CLEAN_TEMPO_MIN_BARS, gradeTake, takeBarsOf } from "./grade";
import type { TakeMeasures } from "./takeMeasures";
import { MIN_HEARD_NOTES, measureTake } from "./takeMeasures";
import type { ScorerReport } from "./takeMeasures";
import type { ScorerTakeGrade } from "../ipc";
import { ALT } from "./testKit";
import type { ScorerPassResult } from "../ipc";
import { buildTake } from "./take";

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
  it("is whole passes, at least the clean-tempo minimum", () => {
    for (const step of ALT.steps) {
      for (const ex of step.exercises) {
        const bars = takeBarsOf(ex);
        expect(bars).toBeGreaterThanOrEqual(CLEAN_TEMPO_MIN_BARS);
        expect(bars % ex.bars).toBe(0);
      }
    }
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
});

describe("a Take's length", () => {
  it("covers the longest stretch a pass bar asks for", () => {
    const stamina = ALT.steps
      .flatMap((s) => s.exercises)
      .find((e) => e.id === "stamina-minute.chromatic-minute")!;
    expect(takeBarsOf(stamina)).toBe(16);
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
