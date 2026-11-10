import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../paths/format";
import {
  BREAK_DAYS,
  PLAN_MINUTES,
  planSession,
  rungsToDrop,
  tempoFor,
  warmupBpm,
} from "./planner";
import type { PlanMinutes, PlanStep, SessionPlan } from "./planner";
import { pickVariantSeed } from "./variants";
import { NO_PROGRESS } from "./progress";
import { ALT, DAY, NOW, ceiling, missed, passed, progress, state, take } from "./testKit";

const OPEN = "even-eighths.open-string";
const FOUR = "even-eighths.four-fingers";

function plan(minutes: PlanMinutes, p = progress(), paths: PathDoc[] = [ALT], now = NOW): SessionPlan {
  return planSession({ minutes, now, paths, progress: p });
}
function exerciseSteps(s: SessionPlan) {
  return s.steps.filter((x): x is Extract<PlanStep, { kind: "exercise" }> => x.kind === "exercise");
}
function exercise(id: string): Exercise {
  for (const step of ALT.steps) {
    const found = step.exercises.find((e) => e.id === id);
    if (found) return found;
  }
  throw new Error(id);
}

describe("how the minutes are spent", () => {
  it.each(PLAN_MINUTES)("%i minutes adds up to %i, first time", (m) => {
    const s = plan(m, { ...NO_PROGRESS });
    expect(s.steps.reduce((sum, x) => sum + x.minutes, 0)).toBe(m);
  });

  it.each(PLAN_MINUTES)("%i minutes adds up, returning", (m) => {
    const s = plan(m, progress({ takes: [missed(OPEN, 80, 0.78)] }));
    expect(s.steps.reduce((sum, x) => sum + x.minutes, 0)).toBe(m);
  });

  it.each(PLAN_MINUTES)("%i minutes adds up, after a break", (m) => {
    const s = plan(m, progress({ takes: [missed(OPEN, 80, 0.78, 20 * DAY)] }));
    expect(s.steps.reduce((sum, x) => sum + x.minutes, 0)).toBe(m);
  });

  it("five minutes is one thing, not two thin slices", () => {
    expect(plan(5).steps.map((s) => s.kind)).toEqual(["exercise"]);
  });

  it("more time adds steps, and only twenty brings a band", () => {
    expect(plan(10).steps.map((s) => s.kind)).toEqual(["metronome", "exercise"]);
    expect(plan(15).steps.map((s) => s.kind)).toEqual(["metronome", "exercise", "exercise"]);
    expect(plan(20).steps.map((s) => s.kind)).toEqual(["metronome", "exercise", "exercise", "jam"]);
  });

  it("gives no Session with no Path that can be graded", () => {
    expect(plan(10, progress(), []).steps).toEqual([]);
    const ungraded: PathDoc = {
      ...ALT,
      steps: ALT.steps.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) => ({ ...e, grading: "practiceOnly" as const })),
      })),
    };
    expect(plan(10, progress(), [ungraded]).steps).toEqual([]);
  });

  it("is deterministic: same input, same Session", () => {
    const p = progress({ takes: [missed(OPEN, 80, 0.78)] });
    expect(plan(15, p)).toEqual(plan(15, p));
  });
});

describe("the mood", () => {
  it("is first with no Takes, whatever else is stored", () => {
    expect(plan(10, progress()).mood).toBe("first");
    expect(plan(10, progress()).daysAway).toBeNull();
  });

  it("is returning inside a week", () => {
    const s = plan(10, progress({ takes: [missed(OPEN, 80, 0.78, (BREAK_DAYS - 1) * DAY)] }));
    expect(s.mood).toBe("returning");
    expect(s.daysAway).toBe(BREAK_DAYS - 1);
  });

  it("is back at a week", () => {
    const s = plan(10, progress({ takes: [missed(OPEN, 80, 0.78, BREAK_DAYS * DAY)] }));
    expect(s.mood).toBe("back");
    expect(s.daysAway).toBe(BREAK_DAYS);
  });

  it("drops more rungs the longer the break", () => {
    expect(rungsToDrop(BREAK_DAYS - 1)).toBe(0);
    expect(rungsToDrop(BREAK_DAYS)).toBe(1);
    expect(rungsToDrop(14)).toBe(2);
    expect(rungsToDrop(30)).toBe(3);
    expect(rungsToDrop(400)).toBe(3);
  });
});

describe("what gets chosen", () => {
  it("a first Session starts the first Exercise at its first rung, and says so", () => {
    const [focus] = exerciseSteps(plan(5, { ...NO_PROGRESS }));
    expect(focus.exerciseId).toBe(OPEN);
    expect(focus.bpm).toBe(60);
    expect(focus.why.code).toBe("firstEver");
  });

  it("the worked example: evenness was 78% at 80, the bar is 85%", () => {
    const [focus] = exerciseSteps(plan(5, progress({ takes: [missed(OPEN, 80, 0.78)] })));
    expect(focus.bpm).toBe(80);
    expect(focus.why).toEqual({
      code: "belowBar",
      values: expect.objectContaining({ metric: "timingEvenness", value: 78, bar: 85, bpm: 80 }),
    });
  });

  it("the stored Step is where it starts", () => {
    const p = progress({ states: [state({ currentStepId: "even-sixteenths" })] });
    expect(exerciseSteps(plan(5, p))[0].exerciseId).toBe("even-sixteenths.gear-change");
  });

  it("an Exercise already passed is skipped", () => {
    const p = progress({ takes: [passed(OPEN, 100)], ceilings: [ceiling(OPEN, 100)] });
    expect(exerciseSteps(plan(5, p))[0].exerciseId).toBe(FOUR);
  });

  it("a clean tempo under the pass rung does not count as passed", () => {
    const p = progress({ takes: [passed(OPEN, 80)], ceilings: [ceiling(OPEN, 80)] });
    expect(exerciseSteps(plan(5, p))[0].exerciseId).toBe(OPEN);
  });

  it("the second Exercise says it is next in the Step", () => {
    const steps = exerciseSteps(plan(15, { ...NO_PROGRESS }));
    expect(steps[1].exerciseId).toBe(FOUR);
    expect(steps[1].why.code).toBe("nextInStep");
  });

  it("carries on into the next Step when this one runs out", () => {
    const step = ALT.steps[0];
    const ids = step.exercises.map((e) => e.id);
    const p = progress({
      takes: ids.slice(0, 3).map((id) => passed(id, 100)),
      ceilings: ids.slice(0, 3).map((id) => ceiling(id, 100)),
    });
    const steps = exerciseSteps(plan(15, p));
    expect(steps[0].exerciseId).toBe(ids[3]);
    expect(steps[1].stepId).toBe(ALT.steps[1].id);
    expect(steps[1].why.code).toBe("newStep");
  });

  it("with everything passed, goes back over what was played longest ago", () => {
    const every = ALT.steps.flatMap((s) => s.exercises).filter((e) => e.grading === "graded");
    const p = progress({
      takes: every.map((e, i) => passed(e.id, 200, 0.9, (i + 1) * 60_000)),
      ceilings: every.map((e) => ceiling(e.id, 200)),
    });
    expect(exerciseSteps(plan(5, p))[0].exerciseId).toBe(every[every.length - 1].id);
  });

  it("two Paths: the one played longest ago goes first, and fifteen minutes has both", () => {
    const other: PathDoc = { ...ALT, id: "other" };
    const p = progress({ takes: [missed(OPEN, 80, 0.78)] });
    const steps = exerciseSteps(plan(15, p, [ALT, other]));
    expect(steps.map((s) => s.pathId)).toEqual(["other", ALT.id]);
    expect(exerciseSteps(plan(5, p, [ALT, other])).length).toBe(1);
  });
});

describe("the tempo", () => {
  const ex = exercise(OPEN);

  it("starts at the first rung", () => {
    expect(tempoFor(ALT, ex, progress()).bpm).toBe(60);
  });

  it("stays after one Take just below the bar", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [missed(OPEN, 80, 0.8)] }));
    expect(t.bpm).toBe(80);
    expect(t.why.code).toBe("belowBar");
  });

  it("comes down after a Take far below the bar", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [missed(OPEN, 80, 0.6)] }));
    expect(t.bpm).toBe(70);
    expect(t.why.code).toBe("easing");
    expect(t.why.values).toMatchObject({ bpm: 80, next: 70, value: 60, bar: 85 });
  });

  it("comes down after two misses in a row at one tempo", () => {
    const p = progress({
      takes: [missed(OPEN, 80, 0.8, DAY), missed(OPEN, 80, 0.81, 2 * DAY)],
    });
    const t = tempoFor(ALT, ex, p);
    expect(t.bpm).toBe(70);
    expect(t.why.values.count).toBe(2);
  });

  it("does not count a miss at another tempo towards the streak", () => {
    const p = progress({
      takes: [missed(OPEN, 80, 0.8, DAY), missed(OPEN, 70, 0.8, 2 * DAY)],
    });
    expect(tempoFor(ALT, ex, p).bpm).toBe(80);
  });

  it("cannot come down past the first rung", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [missed(OPEN, 60, 0.5)] }));
    expect(t.bpm).toBe(60);
    expect(t.why.code).toBe("belowBar");
  });

  it("climbs one rung after a pass", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [passed(OPEN, 70, 0.87)] }));
    expect(t.bpm).toBe(80);
    expect(t.why.code).toBe("climb");
  });

  it("clean results move on sooner: two rungs when the bar was cleared by a distance", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [passed(OPEN, 70, 0.95)] }));
    expect(t.bpm).toBe(90);
    expect(t.why).toEqual({
      code: "climbFast",
      values: expect.objectContaining({ bpm: 70, next: 90, value: 95 }),
    });
  });

  it("does not climb past the pass rung until it is passed", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [passed(OPEN, 90, 0.97)] }));
    expect(t.bpm).toBe(100);
  });

  it("a Take it could not hear changes nothing: same tempo, and it says why", () => {
    const p = progress({
      takes: [
        take(OPEN, { bpm: 80, caught: false, startedAt: NOW - DAY }),
        passed(OPEN, 70, 0.9, 2 * DAY),
      ],
    });
    const t = tempoFor(ALT, ex, p);
    expect(t.bpm).toBe(80);
    expect(t.why.code).toBe("notCaught");
  });

  it("a Take with no number on record still gets a tempo and no invented value", () => {
    const t = tempoFor(ALT, ex, progress({ takes: [take(OPEN, { bpm: 80 })] }));
    expect(t.bpm).toBe(80);
    expect(t.why.values.value).toBeUndefined();
  });
});

describe("coming back after a break", () => {
  const away = progress({
    takes: [missed(FOUR, 90, 0.8, 20 * DAY), passed(OPEN, 100, 0.9, 21 * DAY)],
    ceilings: [ceiling(OPEN, 100)],
  });

  it("recaps what was last played, slower, and says how long it has been", () => {
    const steps = exerciseSteps(plan(5, away));
    expect(steps).toHaveLength(1);
    expect(steps[0].role).toBe("recap");
    expect(steps[0].exerciseId).toBe(FOUR);
    expect(steps[0].bpm).toBe(70);
    expect(steps[0].why.code).toBe("backEased");
    expect(steps[0].why.values.days).toBe(20);
  });

  it("eases everything already played, not just the first", () => {
    const again = progress({
      takes: [
        missed(FOUR, 90, 0.8, 20 * DAY),
        missed(OPEN, 90, 0.8, 21 * DAY),
        missed("even-eighths.a-minor-one-string", 90, 0.8, 22 * DAY),
      ],
    });
    const steps = exerciseSteps(plan(15, again));
    expect(steps.length).toBeGreaterThan(1);
    for (const step of steps) expect(step.why.code).toBe("backEased");
  });

  it("something never played starts at its first rung, with nothing to ease", () => {
    const steps = exerciseSteps(plan(15, away));
    const fresh = steps[steps.length - 1];
    expect(fresh.why.code).toBe("nextInStep");
    expect(fresh.bpm).toBe(60);
  });

  it("never goes below the first rung", () => {
    const p = progress({ takes: [missed(OPEN, 60, 0.8, 60 * DAY)] });
    expect(exerciseSteps(plan(5, p))[0].bpm).toBe(60);
  });

  it("warms up on the recap and gives the focus less", () => {
    const s = plan(10, away);
    const focus = exerciseSteps(s).find((x) => x.role === "focus");
    expect(s.steps[0].minutes).toBe(3);
    expect(focus?.minutes).toBe(7);
  });
});

describe("warm-ups", () => {
  it("starts comfortably below the clean tempo", () => {
    const p = progress({ takes: [missed(OPEN, 100, 0.8)], ceilings: [ceiling(OPEN, 90)] });
    const warm = plan(10, p).steps[0];
    expect(warm.kind).toBe("metronome");
    if (warm.kind !== "metronome") return;
    expect(warm.bpm).toBe(70);
    expect(warm.why).toEqual({ code: "warmUpClean", values: { bpm: 70, clean: 90 } });
  });

  it("may go under the first rung, since it is not graded", () => {
    expect(warmupBpm(exercise(OPEN), 60)).toBe(50);
    expect(warmupBpm(exercise(OPEN), 40)).toBe(40);
  });

  it("uses the first rung with no clean tempo to go on", () => {
    const warm = plan(10, { ...NO_PROGRESS }).steps[0];
    expect(warm.why.code).toBe("warmUp");
    if (warm.kind === "metronome") expect(warm.bpm).toBe(60);
  });

  it("takes a pack's own warm-ups in turn, when it has them", () => {
    const first = exercise(OPEN);
    const withOwn = {
      ...ALT,
      levels: [
        {
          id: "beginner",
          title: "Beginner",
          summary: "",
          entry: "open",
          placement: { startHereIf: [] },
          stepIds: ALT.steps.map((s) => s.id),
          warmups: [
            { ...first, id: "w1", title: "One" },
            { ...first, id: "w2", title: "Two" },
          ],
        },
      ],
    } as PathDoc;
    const a = plan(10, progress({ takes: [missed(OPEN, 80, 0.8)] }), [withOwn]).steps[0];
    const b = plan(
      10,
      progress({ takes: [missed(OPEN, 80, 0.8, DAY), missed(OPEN, 80, 0.8, 2 * DAY)] }),
      [withOwn],
    ).steps[0];
    expect(a.title).not.toBe(b.title);
  });
});

/** An Exercise with `count` variants; only how many there are matters here. */
function withVariations(e: Exercise, count: number): Exercise {
  const variants = Array.from({ length: count }, (_, i) => ({ id: `v${i}` }));
  return {
    ...e,
    variation: { dimensions: ["key"], pooled: ["key"], notPooled: [], variants },
  } as unknown as Exercise;
}

describe("variants, when a pack has them", () => {
  const plain = exercise(OPEN);
  const varied = withVariations(plain, 3);

  it("a pack without them gets no seed", () => {
    expect(pickVariantSeed(plain, 4, undefined)).toBeNull();
    expect(exerciseSteps(plan(5, { ...NO_PROGRESS }))[0].variantSeed).toBeNull();
  });

  it("is deterministic from how many Takes there have been", () => {
    expect(pickVariantSeed(varied, 0, undefined)).toBe(0);
    expect(pickVariantSeed(varied, 1, undefined)).toBe(1);
    expect(pickVariantSeed(varied, 4, undefined)).toBe(1);
  });

  it("never the same notes twice in a row", () => {
    for (let n = 0; n < 12; n += 1) {
      for (let last = 0; last < 3; last += 1) {
        expect(pickVariantSeed(varied, n, last)).not.toBe(last);
      }
    }
  });

  it("the plan carries the seed through", () => {
    const withVariants: PathDoc = {
      ...ALT,
      steps: ALT.steps.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) => withVariations(e, 3)),
      })),
    };
    const p = progress({
      takes: [{ ...missed(OPEN, 80, 0.8), variantSeed: 1 }],
    });
    const seed = exerciseSteps(plan(5, p, [withVariants]))[0].variantSeed;
    expect(seed).toBe(2);
  });
});

describe("Find my edge in a plan", () => {
  it("twenty minutes checks the focus Exercise's clean tempo once it has one", () => {
    const p = progress({ takes: [missed(OPEN, 80, 0.8)], ceilings: [ceiling(OPEN, 70)] });
    const s = plan(20, p);
    const edge = exerciseSteps(s).find((x) => x.role === "edge");
    expect(edge?.exerciseId).toBe(OPEN);
    expect(edge?.bpm).toBe(70);
    expect(edge?.why).toEqual({ code: "edgeCheck", values: { clean: 70 } });
    expect(s.steps.reduce((sum, x) => sum + x.minutes, 0)).toBe(20);
  });

  it("not without a clean tempo, and not in a shorter Session", () => {
    const p = progress({ takes: [missed(OPEN, 80, 0.8)], ceilings: [ceiling(OPEN, 70)] });
    expect(exerciseSteps(plan(15, p)).some((x) => x.role === "edge")).toBe(false);
    const none = progress({ takes: [missed(OPEN, 80, 0.8)] });
    expect(exerciseSteps(plan(20, none)).some((x) => x.role === "edge")).toBe(false);
  });
});
