// Levels do something (owner, 2026-11-17).
//
// Picking Intermediate on a Path used to store the choice and change nothing:
// the Path page still said Step 1 and Today still planned Step 1. Now the
// Steps below the chosen Level are skipped, the way a Test out or a placement
// skips a Step: the planner starts at the Level, the leftovers and the
// self-checked items under it stay out of the plan, and choosing Beginner
// again brings them back. Nothing is locked: a skipped Step is still played
// from its page.
import { describe, expect, it } from "vitest";
import { planSession } from "./planner";
import type { PlanStep, SessionPlan } from "./planner";
import {
  chosenLevelOf,
  currentStepOf,
  isStepSkipped,
  levelEntryStep,
  levelOfStep,
  levelStartIndex,
} from "./progress";
import { dueReviews, placementPicks } from "./rotation";
import { ALT, DAY, NOW, ceiling, passed, progress, state } from "./testKit";

const level = (id: string) => ALT.levels!.find((l) => l.id === id)!;
const stepAt = (id: string) => ALT.steps.findIndex((s) => s.id === id);
const stepIdsOf = (plan: SessionPlan) =>
  plan.steps.flatMap((s: PlanStep) => (s.kind === "exercise" && s.pathId === ALT.id ? [s.stepId] : []));

describe("the Levels the pack offers", () => {
  it("are Beginner from Step 1, Intermediate from Step 7, Advanced from Step 10", () => {
    expect(ALT.levels!.map((l) => [l.id, levelStartIndex(ALT, l) + 1])).toEqual([
      ["beginner", 1],
      ["intermediate", 7],
      ["advanced", 10],
    ]);
    expect(levelOfStep(ALT, "accents")?.id).toBe("beginner");
    expect(levelOfStep(ALT, "crossing")?.id).toBe("intermediate");
  });

  it("an id the Path does not offer is no Level at all", () => {
    expect(chosenLevelOf(progress({ states: [state({ level: "expert" })] }), ALT)).toBeNull();
    expect(currentStepOf(progress({ states: [state({ level: "expert" })] }), ALT).id).toBe("even-eighths");
  });
});

describe("the Step a player is on", () => {
  it("is the Level's first Step when they chose a Level and no Step", () => {
    const p = progress({ states: [state({ level: "intermediate" })] });
    expect(currentStepOf(p, ALT).id).toBe("crossing");
  });

  it("is never below the Level, even on a row written before Levels did anything", () => {
    const p = progress({ states: [state({ level: "advanced", currentStepId: "even-eighths" })] });
    expect(currentStepOf(p, ALT).id).toBe("speed-bursts");
  });

  it("is a later Step the player chose, inside or above the Level", () => {
    const p = progress({ states: [state({ level: "intermediate", currentStepId: "three-per-string" })] });
    expect(currentStepOf(p, ALT).id).toBe("three-per-string");
  });

  it("starting a Level lands on its first Step not passed yet", () => {
    expect(levelEntryStep(progress(), ALT, level("intermediate")).id).toBe("crossing");
    const crossingPassed = progress({
      ceilings: ALT.steps[stepAt("crossing")].exercises.map((e) => ceiling(e.id, 300)),
    });
    expect(levelEntryStep(crossingPassed, ALT, level("intermediate")).id).toBe("pentatonic-patterns");
  });
});

describe("the Steps below the Level", () => {
  const at = (lvl: string) => progress({ states: [state({ level: lvl })] });

  it("are skipped at Intermediate, and only those", () => {
    const skipped = ALT.steps.filter((s) => isStepSkipped(at("intermediate"), ALT, s)).map((s) => s.id);
    expect(skipped).toEqual(["even-eighths", "other-strings", "even-sixteenths", "mixed-rhythms", "accents", "one-string-tunes"]);
  });

  it("are all back at Beginner, and with no Level chosen", () => {
    expect(ALT.steps.some((s) => isStepSkipped(at("beginner"), ALT, s))).toBe(false);
    expect(ALT.steps.some((s) => isStepSkipped(progress(), ALT, s))).toBe(false);
  });

  it("a Step already passed is passed, not skipped", () => {
    const p = progress({
      states: [state({ level: "intermediate" })],
      ceilings: ALT.steps[0].exercises.map((e) => ceiling(e.id, 300)),
    });
    expect(isStepSkipped(p, ALT, ALT.steps[0])).toBe(false);
    expect(isStepSkipped(p, ALT, ALT.steps[1])).toBe(true);
  });

  it("send nothing back as leftovers", () => {
    // Placed at Step 4 by the Level, three Takes there yesterday: nothing in
    // Steps 1-3 was played, so none of it is "left behind".
    const p = progress({
      states: [state({ level: "intermediate" })],
      takes: [passed("crossing.outside-shuttle", 80, 0.9, 2 * DAY)],
    });
    const due = dueReviews([ALT], p, NOW);
    expect(due.filter((d) => d.kind === "leftover" && stepAt(d.step.id) < 3)).toEqual([]);
  });
});

describe("Today's plan for the Path", () => {
  const plan = (p: ReturnType<typeof progress>, minutes: 5 | 10 | 15 | 20 = 10) =>
    planSession({ minutes, now: NOW, paths: [ALT], progress: p });

  it("places a new player at the Level's first Step", () => {
    const p = progress({ states: [state({ level: "intermediate" })] });
    expect(placementPicks(ALT, p)[0].step.id).toBe("crossing");
    const ids = stepIdsOf(plan(p));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids[0]).toBe("crossing");
    expect(ids.every((id) => stepAt(id) >= stepAt("crossing"))).toBe(true);
  });

  it("starts a returning player at Advanced's first Step, whatever Step 1 still holds", () => {
    const p = progress({
      states: [state({ level: "advanced", currentStepId: "even-eighths" })],
      takes: [passed("even-eighths.open-string", 70, 0.9, DAY)],
    });
    for (const minutes of [5, 10, 15, 20] as const) {
      const ids = stepIdsOf(plan(p, minutes));
      expect(ids.length, `${minutes} min`).toBeGreaterThan(0);
      expect(ids.every((id) => stepAt(id) >= stepAt("speed-bursts")), `${minutes} min: ${ids}`).toBe(true);
    }
  });

  it("comes back to Step 1 when the player goes back to Beginner", () => {
    // What `chooseLevel` stores for Beginner: the Level and its entry Step.
    const entry = levelEntryStep(progress(), ALT, level("beginner"));
    const p = progress({ states: [state({ level: "beginner", currentStepId: entry.id })] });
    expect(stepIdsOf(plan(p))[0]).toBe("even-eighths");
  });
});
