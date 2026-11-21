// "Add to today" (leg t2e, TOOLS 2.4): the player's own exercises in Today's
// plan. The planner puts them after the warm-up, the minutes still add up, it
// never chooses one by itself, and with none chosen the plan is what it was.
import { describe, expect, it } from "vitest";
import type { PathDoc } from "../paths/format";
import { buildCustomExercise, customPathDoc } from "../paths/custom";
import type { Recipe } from "../paths/custom";
import {
  CHOSEN_MINUTES,
  MAX_GRADED,
  MIN_BLOCK_MINUTES,
  PLAN_MINUTES,
  planSession,
} from "./planner";
import type { ChosenExercise, PlannerInput, SessionPlan } from "./planner";
import { MY_EXERCISES_PATH_ID } from "./myExercises";
import { ALT, DAY, NOW, SWEEP, passed, progress, state, take } from "./testKit";
import type { PlayerProgress } from "./progress";

const BLUES_PACK = import.meta.glob("../paths/packs/blues-pentatonics.json", { eager: true });
const BLUES = (Object.values(BLUES_PACK)[0] as { default: unknown }).default as PathDoc;

const total = (p: SessionPlan) => p.steps.reduce((sum, s) => sum + s.minutes, 0);
const graded = (p: SessionPlan) => p.steps.filter((s) => s.kind === "exercise").length;
const mine = (p: SessionPlan) => p.steps.filter((s) => "pathId" in s && s.pathId === MY_EXERCISES_PATH_ID);

const RECIPES: Recipe[] = [
  { v: 1, shape: "box", root: "A", scale: "minorPentatonic", position: 5, subdivision: "eighths", bars: 3, direction: "upAndBack" },
  { v: 1, shape: "chromatic", position: 5, subdivision: "eighths", bars: 6, direction: "up" },
  { v: 1, shape: "box", root: "E", scale: "minorPentatonic", position: "root", subdivision: "eighths", bars: 3, direction: "upAndBack" },
  { v: 1, shape: "box", root: "G", scale: "minorPentatonic", position: "root", subdivision: "eighths", bars: 3, direction: "upAndBack" },
];

function chosenOf(recipe: Recipe): ChosenExercise {
  const built = buildCustomExercise(recipe);
  if (!built.ok) throw new Error(`does not build: ${JSON.stringify(built.why)}`);
  return { path: customPathDoc(built.exercise), exercise: built.exercise };
}
const CHOSEN = RECIPES.map(chosenOf);

/** The scenes the planner's own tests are built from, as inputs without `chosen`. */
function fixtures(): Array<{ name: string; input: PlannerInput }> {
  const returning = (paths: PathDoc[]): PlayerProgress =>
    progress({
      states: paths.map((path, i) => state({ pathId: path.id, startedAt: NOW - 30 * DAY + i })),
      takes: paths.map((path, i) =>
        take(path.steps[0].exercises[0].id, {
          pathId: path.id,
          stepId: path.steps[0].id,
          startedAt: NOW - (i + 1) * DAY,
          facts: { session: NOW - (i + 1) * DAY, role: "focus", verdict: "belowBar" },
        }),
      ),
    });
  const scenes: Array<{ name: string; paths: PathDoc[]; progress: PlayerProgress; focused?: boolean; ungraded?: boolean }> = [
    { name: "first ever", paths: [ALT], progress: progress({ states: [] }) },
    { name: "one Path, returning", paths: [ALT], progress: progress({ takes: [passed(ALT.steps[0].exercises[0].id, 60)] }) },
    { name: "after a break", paths: [ALT], progress: progress({ takes: [passed(ALT.steps[0].exercises[0].id, 60, 0.87, 20 * DAY)] }) },
    { name: "three Paths", paths: [ALT, SWEEP, BLUES], progress: returning([ALT, SWEEP, BLUES]) },
    { name: "three Paths, ungraded", paths: [ALT, SWEEP, BLUES], progress: returning([ALT, SWEEP, BLUES]), ungraded: true },
    { name: "one Path focused", paths: [BLUES], progress: returning([ALT, SWEEP, BLUES]), focused: true },
    { name: "a new Path beside one played", paths: [ALT, SWEEP], progress: returning([ALT]) },
    { name: "no Paths", paths: [], progress: progress({ states: [] }) },
  ];
  return scenes.flatMap((s) =>
    PLAN_MINUTES.map((minutes) => ({
      name: `${s.name}, ${minutes} min`,
      input: {
        minutes,
        now: NOW,
        paths: s.paths,
        progress: s.progress,
        ...(s.focused ? { focused: true } : {}),
        ...(s.ungraded ? { ungraded: true } : {}),
      },
    })),
  );
}

describe("nothing chosen: the plan as it always was", () => {
  it("absent or empty, every fixture plans byte for byte the same", () => {
    for (const { name, input } of fixtures()) {
      const before = JSON.stringify(planSession(input));
      expect(JSON.stringify(planSession({ ...input, chosen: [] })), name).toBe(before);
      expect(JSON.stringify(planSession({ ...input, chosen: undefined })), name).toBe(before);
    }
  });

  it("the planner never chooses one by itself, even when one was played yesterday", () => {
    const own = CHOSEN[0].exercise;
    const p = progress({
      takes: [
        take(own.id, { pathId: MY_EXERCISES_PATH_ID, stepId: "my", startedAt: NOW - DAY }),
        passed(ALT.steps[0].exercises[0].id, 60, 0.87, 2 * DAY),
      ],
    });
    for (const minutes of PLAN_MINUTES) {
      expect(mine(planSession({ minutes, now: NOW, paths: [ALT], progress: p }))).toEqual([]);
    }
  });

  it("a block is as long as any block", () => {
    expect(CHOSEN_MINUTES).toBe(MIN_BLOCK_MINUTES);
  });
});

describe("with chosen exercises", () => {
  it("every fixture, one to four chosen: the minutes add up, at most four graded, none lost unsaid", () => {
    for (const { name, input } of fixtures()) {
      for (let n = 1; n <= CHOSEN.length; n += 1) {
        const plan = planSession({ ...input, chosen: CHOSEN.slice(0, n) });
        const label = `${name}, ${n} chosen`;
        expect(total(plan), label).toBe(input.minutes);
        expect(graded(plan), label).toBeLessThanOrEqual(MAX_GRADED);
        expect(mine(plan).length + (plan.chosenLeftOut ?? 0), label).toBe(n);
        expect(plan.minutes, label).toBe(input.minutes);
        for (const step of plan.steps) expect(step.minutes, label).toBeGreaterThan(0);
      }
    }
  });

  it("comes right after the warm-up, says the player chose it, and plays its own Exercise", () => {
    const base = planSession({ minutes: 20, now: NOW, paths: [ALT], progress: progress({ takes: [passed(ALT.steps[0].exercises[0].id, 60)] }) });
    const plan = planSession({
      minutes: 20,
      now: NOW,
      paths: [ALT],
      progress: progress({ takes: [passed(ALT.steps[0].exercises[0].id, 60)] }),
      chosen: [CHOSEN[0]],
    });
    expect(plan.steps[0]).toEqual(base.steps[0]); // the warm-up, untouched
    const part = plan.steps[1];
    expect(part.kind).toBe("exercise");
    if (part.kind !== "exercise") return;
    expect(part).toMatchObject({
      id: "mine-1",
      pathId: MY_EXERCISES_PATH_ID,
      stepId: "my",
      exerciseId: CHOSEN[0].exercise.id,
      minutes: CHOSEN_MINUTES,
      context: { code: "chosenToday", values: {} },
    });
    // The first rung, as any Exercise never played.
    expect(part.bpm).toBe(CHOSEN[0].exercise.tempo.rungs[0].bpm);
    // The lead keeps its place after it.
    expect(plan.steps[2].id).toBe("focus");
    expect(plan.chosenLeftOut).toBeUndefined();
  });

  it("twenty minutes on one Path: the last block makes room first, the lead keeps its time", () => {
    const p = progress({ takes: [passed(ALT.steps[0].exercises[0].id, 60)] });
    const base = planSession({ minutes: 20, now: NOW, paths: [ALT], progress: p });
    const plan = planSession({ minutes: 20, now: NOW, paths: [ALT], progress: p, chosen: [CHOSEN[0]] });
    const lead = (x: SessionPlan) => x.steps.find((s) => s.id === "focus")!;
    // warm-up 2, lead 9, 5, last 4: the last block (4) goes, its extra minute to the lead.
    expect(base.steps.map((s) => s.minutes)).toEqual([2, 9, 5, 4]);
    expect(plan.steps.map((s) => s.minutes)).toEqual([2, 3, 10, 5]);
    expect(lead(plan).exerciseId).toBe(lead(base).exerciseId);
  });

  it("five minutes: the chosen one is the Session, a second is counted as left out", () => {
    const p = progress({ takes: [passed(ALT.steps[0].exercises[0].id, 60)] });
    const plan = planSession({ minutes: 5, now: NOW, paths: [ALT], progress: p, chosen: CHOSEN.slice(0, 2) });
    expect(plan.steps.map((s) => [s.id, s.minutes])).toEqual([["mine-1", 5]]);
    expect(plan.chosenLeftOut).toBe(1);
    // The Path that gave its time says so, as any Path with nothing today.
    expect(plan.skipped?.map((s) => s.pathId)).toEqual([ALT.id]);
    expect(plan.focusPathId).toBeNull();
  });

  it("the same exercise twice is one block", () => {
    const plan = planSession({ minutes: 15, now: NOW, paths: [ALT], progress: progress(), chosen: [CHOSEN[0], CHOSEN[0]] });
    expect(mine(plan)).toHaveLength(1);
    expect(plan.chosenLeftOut).toBeUndefined();
  });

  it("after a break its tempo eases like the rest", () => {
    const own = CHOSEN[1].exercise;
    const rungs = own.tempo.rungs.map((r) => r.bpm);
    const top = rungs[rungs.length - 1];
    const p = progress({
      takes: [
        passed(own.id, top, 0.9, 20 * DAY),
      ].map((t) => ({ ...t, pathId: MY_EXERCISES_PATH_ID, stepId: "my" })),
      ceilings: [{ exerciseKey: `${MY_EXERCISES_PATH_ID}/${own.id}`, cleanBpm: top, lastPracticed: NOW - 20 * DAY }],
    });
    const plan = planSession({ minutes: 10, now: NOW, paths: [ALT], progress: p, chosen: [CHOSEN[1]] });
    expect(plan.mood).toBe("back");
    const part = mine(plan)[0];
    expect(part.kind === "exercise" && part.why.code).toBe("backEased");
  });

  it("with no Paths at all, the chosen ones share the time", () => {
    const plan = planSession({ minutes: 10, now: NOW, paths: [], progress: progress({ states: [] }), chosen: CHOSEN.slice(0, 2) });
    expect(plan.steps.map((s) => [s.id, s.minutes])).toEqual([
      ["mine-1", 3],
      ["mine-2", 7],
    ]);
  });
});
