import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../paths/format";
import {
  BREAK_DAYS,
  EDGE_MINUTES,
  MIN_BLOCK_MINUTES,
  PLAN_MINUTES,
  TEST_OUT_MINUTES,
  planSession,
  rungsToDrop,
  tempoFor,
  testOutRetests,
  testOutSteps,
  warmupBpm,
} from "./planner";
import type { PlanMinutes, PlanStep, SessionPlan } from "./planner";
import { pickVariantSeed } from "./variants";
import { RUNNABLE_PATH_IDS, findExercise, isRunnable, laterWhyKey } from "./packs";
import { buildTake, takeSecondsOf } from "./take";
import { isGradable } from "./progress";
import { NO_PROGRESS } from "./progress";
import { ALT, DAY, NOW, SWEEP, ceiling, missed, passed, progress, state, take } from "./testKit";

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

  it("more time adds blocks, and only twenty ends on the band", () => {
    // Two Paths: a lead, one block for the other, then reviews or the lead again.
    const two = (m: PlanMinutes) => plan(m, progress({ states: [state(), state({ pathId: SWEEP.id })] }), [ALT, SWEEP]);
    expect(two(10).steps.map((s) => s.kind)).toEqual(["metronome", "exercise", "exercise"]);
    expect(two(15).steps.map((s) => s.kind)).toEqual(["metronome", "exercise", "exercise", "exercise"]);
    expect(two(20).steps.map((s) => s.kind)).toEqual([
      "metronome",
      "exercise",
      "exercise",
      "exercise",
      "jam",
    ]);
  });

  it("with one Path, the lead is one long block of 8 or 9 minutes (UX audit TODAY-4)", () => {
    expect(plan(10).steps.map((s) => [s.kind, s.minutes])).toEqual([["metronome", 2], ["exercise", 8]]);
    expect(plan(15).steps.map((s) => s.minutes)).toEqual([2, 9, 4]);
    expect(plan(20).steps.map((s) => s.minutes)).toEqual([2, 9, 5, 4]);
    expect(plan(20).steps[plan(20).steps.length - 1].kind).toBe("jam");
  });

  it("with more than one Path: warm 2, then 4 4 / 5 4 4 / 6 4 4 4", () => {
    const two = (m: PlanMinutes) => plan(m, progress({ states: [state(), state({ pathId: SWEEP.id })] }), [ALT, SWEEP]);
    expect(two(10).steps.map((s) => s.minutes)).toEqual([2, 4, 4]);
    expect(two(15).steps.map((s) => s.minutes)).toEqual([2, 5, 4, 4]);
    expect(two(20).steps.map((s) => s.minutes)).toEqual([2, 6, 4, 4, 4]);
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
  it("a first Session is placement: a climb through 75%, 100% and 120% of the pass tempo (UX audit TODAY-3)", () => {
    const [focus] = exerciseSteps(plan(5, { ...NO_PROGRESS }));
    expect(focus.exerciseId).toBe(OPEN);
    expect(focus.role).toBe("placement");
    // Pass 100: rungs 60..120 by ten. 75 -> 70, 100, 120 -> 120.
    expect(focus.bpm).toBe(70);
    expect(focus.placement?.ladder).toEqual([70, 100, 120]);
    expect(focus.why.code).toBe("placement");
    expect(focus.placement?.passAtBpm).toBe(100);
  });

  it("a first Take on a Path already started (no placement) says it is the first", () => {
    const p = progress({ takes: [take("even-sixteenths.gear-change", { caught: false })] });
    const [focus] = exerciseSteps(plan(5, { ...p, takes: [] }));
    expect(focus.role).toBe("placement");
    const after = exerciseSteps(plan(5, p))[0];
    expect(after.role).toBe("focus");
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
    // Passed a day ago: their first review (1 day) has come, and takes the time.
    expect(steps[1].role).toBe("review");
    expect(steps[1].why.code).toBe("reviewDue");
    // With no review due, the next Step.
    const fresh = progress({
      takes: ids.slice(0, 3).map((id) => passed(id, 100, 0.87, 60_000)),
      ceilings: ids.slice(0, 3).map((id) => ceiling(id, 100)),
    });
    const later = exerciseSteps(plan(15, fresh));
    expect(later[0].exerciseId).toBe(ids[3]);
    expect(later[1].stepId).toBe(ALT.steps[1].id);
    expect(later[1].why.code).toBe("newStep");
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
    expect(steps.map((s) => s.pathId).slice(0, 2)).toEqual(["other", ALT.id]);
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
    const played = steps.filter((x) => again.takes.some((t) => t.exerciseId === x.exerciseId));
    expect(played.length).toBeGreaterThan(1);
    for (const step of played) expect(step.why.code).toBe("backEased");
  });

  it("something never played starts at its first rung, with nothing to ease", () => {
    const steps = exerciseSteps(plan(15, away));
    const fresh = steps.find((x) => x.why.code === "nextInStep")!;
    expect(fresh.bpm).toBe(exercise(fresh.exerciseId).tempo.rungs[0].bpm);
  });

  it("never goes below the first rung", () => {
    const p = progress({ takes: [missed(OPEN, 60, 0.8, 60 * DAY)] });
    expect(exerciseSteps(plan(5, p))[0].bpm).toBe(60);
  });

  it("warms up on the recap and gives the focus less", () => {
    const again = progress({
      takes: [missed(FOUR, 90, 0.8, 20 * DAY), missed(OPEN, 90, 0.8, 21 * DAY)],
    });
    const s = plan(10, again);
    const focus = exerciseSteps(s).find((x) => x.role === "focus");
    expect(s.steps[0]).toMatchObject({ kind: "exercise", role: "recap", minutes: 3 });
    // One Path: the long lead, a minute shorter for the recap.
    expect(focus?.minutes).toBe(7);
  });
});

describe("warm-ups", () => {
  // The pack's beginner warm-up reads "Four fingers" and starts at 60% of it.
  it("starts at the pack's share of its reference Exercise's clean tempo", () => {
    const FOUR = "even-eighths.four-fingers";
    const p = progress({ takes: [missed(OPEN, 100, 0.8)], ceilings: [ceiling(FOUR, 100)] });
    const warm = plan(10, p).steps[0];
    expect(warm.kind).toBe("metronome");
    if (warm.kind !== "metronome") return;
    expect(warm.exerciseId).toBe("warmup-beginner.one-string-climb");
    expect(warm.bpm).toBe(60);
    expect(warm.why).toEqual({ code: "warmUpClean", values: { bpm: 60, clean: 100 } });
  });

  it("may go under the first rung, since it is not graded", () => {
    expect(warmupBpm(exercise(OPEN), 60)).toBe(50);
    expect(warmupBpm(exercise(OPEN), 40)).toBe(40);
  });

  it("uses the pack's own tempo with no clean tempo to go on", () => {
    const warm = plan(10, { ...NO_PROGRESS }).steps[0];
    expect(warm.why.code).toBe("warmUp");
    // The pack's fallback: no faster than its reference's first rung (60), audit TODAY-5.
    if (warm.kind === "metronome") expect(warm.bpm).toBe(60);
  });

  it("finds a Level's warm-up, which lives on the Level and not on a Step", () => {
    const found = findExercise(ALT, "warmup-beginner.one-string-climb");
    expect(found?.exercise.id).toBe("warmup-beginner.one-string-climb");
    expect(found?.step.exercises.some((e) => e.id === "even-eighths.four-fingers")).toBe(true);
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

describe("two runnable Paths", () => {
  it("the Mechanics and Theory Paths all run; an unknown one says why it waits", () => {
    expect([...RUNNABLE_PATH_IDS].sort()).toEqual(["alternate-picking", "blues-pentatonics", "classic-rock", "legato", "metal-rhythm", "rhythm-foundations", "shred", "sweep-picking"]);
    expect(isRunnable(SWEEP.id)).toBe(true);
    expect(isRunnable("blues-pentatonics")).toBe(true);
    expect(isRunnable("classic-rock")).toBe(true);
    expect(laterWhyKey("blues-pentatonics")).toBe("session.paths.laterWhy");
    expect(laterWhyKey("some-future-path")).toBe("session.paths.laterWhy");
  });

  const both = (takes = [missed(OPEN, 80, 0.78)]) =>
    progress({
      states: [state(), state({ pathId: SWEEP.id })],
      takes,
    });

  it("a Session for a player on both mixes them, the one played longest ago first", () => {
    const s = plan(15, both(), [ALT, SWEEP]);
    const steps = exerciseSteps(s);
    expect(steps.map((x) => x.pathId).slice(0, 2)).toEqual([SWEEP.id, ALT.id]);
    // Sweep has never been played: placement on its first Exercise, from about
    // 75% of its pass tempo (UX audit TODAY-3).
    const first = SWEEP.steps[0].exercises[0];
    expect(steps[0]).toMatchObject({ exerciseId: first.id, role: "placement" });
    expect(steps[0].bpm).toBe(steps[0].placement!.ladder![0]);
    expect(steps[0].bpm).toBeLessThanOrEqual(0.75 * first.tempo.passAtBpm!);
    expect(steps[0].why.code).not.toBe("firstEver");
  });

  it("five minutes is still one thing, from one Path", () => {
    const steps = exerciseSteps(plan(5, both(), [ALT, SWEEP]));
    expect(steps.length).toBe(1);
  });

  it("every Exercise the planner hands out from either Path becomes a Take to grade", () => {
    for (const minutes of PLAN_MINUTES) {
      for (const takes of [[], [missed(OPEN, 80, 0.78)]]) {
        const s = plan(minutes, both(takes), [ALT, SWEEP]);
        for (const step of exerciseSteps(s)) {
          const path = step.pathId === SWEEP.id ? SWEEP : ALT;
          const found = findExercise(path, step.exerciseId);
          expect(found, step.exerciseId).not.toBeNull();
          const t = buildTake(path, found!.exercise, step.bpm, step.variantSeed);
          expect(t.schedule.onsets.length, step.exerciseId).toBeGreaterThan(0);
          expect(t.pitches.length).toBe(t.score.notes.length);
          expect(t.exercise.passBars.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("a player who has only started Sweep Picking gets Sweep Picking", () => {
    const p = progress({ states: [state({ pathId: SWEEP.id })], takes: [] });
    const steps = exerciseSteps(plan(10, p, [SWEEP]));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((x) => x.pathId === SWEEP.id)).toBe(true);
  });
});

describe("Test out (QA 2026-11-17 #18)", () => {
  const step = ALT.steps[0];
  const gradable = step.exercises.filter((e) => e.grading === "graded" && e.tempo.passAtBpm !== null);
  const passAt = (e: Exercise) => e.tempo.passAtBpm!;

  it("skips the Exercises already passed, each other one a Take at its pass tempo", () => {
    const first = gradable[0];
    const p = progress({ ceilings: [ceiling(first.id, passAt(first))] });
    const steps = testOutSteps(ALT, step, p);
    expect(steps.map((s) => s.kind === "exercise" && s.exerciseId)).toEqual(gradable.slice(1).map((e) => e.id));
    for (const s of steps) {
      if (s.kind !== "exercise") throw new Error("not an exercise");
      expect(s.role).toBe("test");
      expect(s.bpm).toBe(passAt(gradable.find((e) => e.id === s.exerciseId)!));
    }
    expect(testOutRetests(ALT, step, p)).toBe(false);
  });

  it("with every one passed, re-tests them all, and says so", () => {
    const p = progress({ ceilings: gradable.map((e) => ceiling(e.id, passAt(e))) });
    expect(testOutSteps(ALT, step, p)).toHaveLength(gradable.length);
    expect(testOutRetests(ALT, step, p)).toBe(true);
  });
});

describe("a Take fits the minutes it is given", () => {
  // Every pack, every graded Exercise, at the slowest rung a Session plays it
  // at: Takes are two bars longer since 2026-11-17 (`grade.ts` TAKE_SLACK_BARS).
  const packs = Object.values(import.meta.glob("../paths/packs/*.json", { eager: true })).map(
    (m) => (m as { default: PathDoc }).default,
  );
  const graded = packs.flatMap((path) =>
    path.steps.flatMap((step) => step.exercises.filter(isGradable).map((exercise) => ({ path, exercise }))),
  );

  it("two Takes at the slowest rung fit the smallest block, and Find my edge's", () => {
    expect(graded.length).toBeGreaterThan(100);
    const smallest = Math.min(MIN_BLOCK_MINUTES, EDGE_MINUTES) * 60;
    for (const { path, exercise } of graded) {
      const slowest = Math.min(...exercise.tempo.rungs.map((r) => r.bpm));
      const one = takeSecondsOf(exercise, slowest);
      const name = `${path.id}/${exercise.id}`;
      if (exercise.passBars.some((b) => b.overBars >= 16)) {
        // A Stamina minute is long by design: one Take and a breath in the
        // smallest block, two in the four minutes a Session's blocks have.
        expect(one, name).toBeLessThanOrEqual(smallest - 30);
        expect(2 * one, name).toBeLessThanOrEqual(4 * 60);
      } else {
        expect(2 * one, name).toBeLessThanOrEqual(smallest);
      }
    }
  });

  it("one Take at the pass tempo fits Test out's minutes", () => {
    for (const { path, exercise } of graded) {
      const seconds = takeSecondsOf(exercise, exercise.tempo.passAtBpm!);
      expect(seconds, `${path.id}/${exercise.id}`).toBeLessThanOrEqual(TEST_OUT_MINUTES * 60);
    }
  });

  it("is the Take's own length: ten bars and a count-in for a one-bar drill", () => {
    const one = graded.find(({ exercise }) => exercise.bars === 1 && exercise.passBars.every((b) => b.overBars <= 8))!;
    const quarters = one.exercise.meter.numerator * (4 / one.exercise.meter.denominator);
    expect(takeSecondsOf(one.exercise, 60)).toBeCloseTo((10 + 1) * quarters, 6);
    expect(buildTake(one.path, one.exercise, 60).bars).toBe(10);
  });
});
