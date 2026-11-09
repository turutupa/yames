import { describe, expect, it } from "vitest";
import type { Exercise } from "../paths/format";
import { CLEAN_TEMPO_MIN_BARS, gradeTake, takeBarsOf } from "./grade";
import type { TakeMeasures } from "./takeMeasures";
import { MIN_HEARD_NOTES, measureTake } from "./takeMeasures";
import type { ScorerReport } from "./takeMeasures";
import { ALT } from "./testKit";

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

  it("a newer scorer's own fields slot in and win", () => {
    const m = measureTake(report(60, 4, { caughtEnough: false, barEvenness: [0.9, 0.8] }), {
      barsPlayed: 8,
    });
    expect(m.caught).toBe(false);
    expect(m.barEvenness).toEqual([0.9, 0.8]);
    expect(measureTake(report(3, 0, { caughtEnough: true }), { barsPlayed: 8 }).caught).toBe(true);
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
