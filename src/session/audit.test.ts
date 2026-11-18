// The planner and runner items of the UX audit (2026-11-17): TODAY-2, TODAY-3,
// TODAY-4, TODAY-5 and PATH-5. Each block names its item.
import { describe, expect, it } from "vitest";
import {
  notesPerSecond,
  placementLadder,
  planSession,
  replanRest,
  tempoFor,
} from "./planner";
import type { PlanStep } from "./planner";
import { IDLE, bigAction, currentStep, eventForBigAction, runReducer, tempoNudges } from "./runner";
import type { RunState, TakeOutcome } from "./runner";
import { followingExercise } from "../containers/session/hooks/useSessionRun";
import { ALT, DAY, NOW, SWEEP, ceiling, missed, passed, progress, state } from "./testKit";
import type { Exercise } from "../paths/format";

type ExStep = Extract<PlanStep, { kind: "exercise" }>;
const ex = (id: string, path = ALT): Exercise =>
  path.steps.flatMap((s) => s.exercises).find((e) => e.id === id)!;

function outcome(verdict: TakeOutcome["grade"]["verdict"], bpm: number): TakeOutcome {
  return {
    stepId: "s",
    exerciseId: "e",
    title: "t",
    bpm,
    takeNumber: 1,
    measures: {} as TakeOutcome["measures"],
    grade: { verdict, passesExercise: verdict === "passed" } as TakeOutcome["grade"],
    previousValue: null,
    cleanBefore: null,
  };
}
const take = (r: RunState, verdict: TakeOutcome["grade"]["verdict"]) =>
  [
    { type: "takeStarted", now: NOW } as const,
    { type: "takeStopped", now: NOW } as const,
    { type: "takeResult", now: NOW, outcome: outcome(verdict, r.bpm) } as const,
  ].reduce(runReducer, r);

describe("TODAY-4: a new Exercise starts near a sibling's clean tempo", () => {
  it("about 80% of the clean tempo of the sibling practised last, on a graded rung", () => {
    // Open string clean at 110: Four fingers (same grid) starts at the rung at or under 88.
    const p = progress({ takes: [passed("even-eighths.open-string", 110)], ceilings: [ceiling("even-eighths.open-string", 110)] });
    const tempo = tempoFor(ALT, ex("even-eighths.four-fingers"), p);
    expect(tempo.bpm).toBe(80);
    expect(tempo.why).toMatchObject({ code: "newFromSibling", values: { clean: 110, bpm: 80 } });
  });

  it("the first rung, as before, with no sibling clean yet", () => {
    const tempo = tempoFor(ALT, ex("even-eighths.four-fingers"), progress());
    expect(tempo).toMatchObject({ bpm: 60, why: { code: "newExercise" } });
  });

  it("never over the pass tempo", () => {
    const p = progress({ ceilings: [ceiling("even-eighths.open-string", 300)] });
    expect(tempoFor(ALT, ex("even-eighths.four-fingers"), p).bpm).toBe(100);
  });
});

describe("TODAY-5: the warm-up", () => {
  it("is the focus Exercise at 80% of its clean tempo once it has one", () => {
    const p = progress({ takes: [passed("even-eighths.open-string", 90)], ceilings: [ceiling("even-eighths.open-string", 90)] });
    const s = planSession({ minutes: 10, now: NOW, paths: [ALT], progress: p });
    const focus = s.steps.find((x): x is ExStep => x.kind === "exercise")!;
    const warm = s.steps[0];
    expect(warm.kind).toBe("metronome");
    if (warm.kind !== "metronome") return;
    expect(focus.exerciseId).toBe("even-eighths.open-string");
    expect(warm.exerciseId).toBe("even-eighths.open-string");
    // 80% of 90 is 72: the warm-up's own rounding, to 70.
    expect(warm.bpm).toBe(70);
  });

  it("is never much busier than the block it warms up, on any Path at its first Session", () => {
    // The rule, not one case: Sweep Beginner's old warm-up (triplets at 60 for a
    // Step under one note a second) is what it caught first; the Sweep rework
    // changed that content, so check every Path instead.
    for (const path of [SWEEP, ALT]) {
      const p = progress({ states: [state({ pathId: path.id })] });
      const s = planSession({ minutes: 10, now: NOW, paths: [path], progress: p });
      const warm = s.steps[0];
      const focus = s.steps.find((x): x is ExStep => x.kind === "exercise")!;
      expect(warm.kind).toBe("metronome");
      if (warm.kind !== "metronome") continue;
      const all = [...path.steps.flatMap((st) => st.exercises), ...(path.levels ?? []).flatMap((l) => l.warmups)];
      const warmEx = all.find((e) => e.id === warm.exerciseId);
      const focusEx = all.find((e) => e.id === focus.exerciseId);
      expect(warmEx, `${path.id} warm-up ${warm.exerciseId}`).toBeDefined();
      expect(focusEx, `${path.id} focus ${focus.exerciseId}`).toBeDefined();
      if (!warmEx || !focusEx) continue;
      const warmRate = notesPerSecond(warmEx, warm.bpm);
      const focusRate = notesPerSecond(focusEx, focus.bpm);
      if (warmRate !== null && focusRate !== null) expect(warmRate, path.id).toBeLessThanOrEqual(focusRate * 1.25);
    }
  });

  it("a pack warm-up carries a variant seed, which changes from Session to Session", () => {
    // Intermediate Sweep, never played: the Level's own warm-up (it has variants).
    const at = (sessions: number) => {
      const takes = Array.from({ length: sessions }, (_, i) =>
        missed("qualities.minor-major", 60, 0.8, (i + 2) * DAY),
      ).map((t, i) => ({ ...t, pathId: SWEEP.id, facts: { ...t.facts, session: NOW - (i + 2) * DAY } }));
      const p = progress({ states: [state({ pathId: SWEEP.id, level: "intermediate" })], takes });
      return planSession({ minutes: 10, now: NOW, paths: [SWEEP], progress: p }).steps[0];
    };
    const seeds = [0, 1, 2].map((n) => {
      const w = at(n);
      return w.kind === "metronome" ? w.variantSeed : "not a warm-up";
    });
    expect(seeds).toEqual([0, 1, 2]);
  });
});

describe("TODAY-3: Find my level climbs", () => {
  it("through about 75%, 100% and 120% of the pass tempo, on graded rungs", () => {
    expect(placementLadder(ex("even-eighths.open-string"), 100)).toEqual([70, 100, 120]);
    // A ladder that stops at the pass tempo has no third Take.
    const short = { ...ex("even-eighths.open-string"), tempo: { ...ex("even-eighths.open-string").tempo, rungs: ex("even-eighths.open-string").tempo.rungs.filter((r) => r.bpm <= 100) } };
    expect(placementLadder(short, 100)).toEqual([70, 100]);
  });

  it("stops at the first miss, at any rung", () => {
    const s = planSession({ minutes: 5, now: NOW, paths: [ALT], progress: progress({ states: [state()] }) });
    let r = runReducer(IDLE, { type: "start", plan: s, now: NOW });
    const e = ex("even-eighths.open-string");
    r = take(r, "passed");
    expect(bigAction(r, e)).toEqual({ kind: "again", bpm: 100 });
    r = runReducer(r, eventForBigAction(bigAction(r, e), NOW)!);
    r = take(r, "belowBar");
    // Missed at the pass tempo: placement is over, the plan goes on.
    expect(bigAction(r, e).kind).not.toBe("again");
    expect(bigAction(r, e)).not.toMatchObject({ insert: true });
  });

  it("the rest of the Session follows the player to where placement put them", () => {
    const s = planSession({ minutes: 15, now: NOW, paths: [ALT], progress: progress({ states: [state()] }) });
    const rest = s.steps.slice(2);
    // Placement passed Step 1: the player is on Step 2 now.
    const moved = progress({ states: [state({ currentStepId: "even-sixteenths" })], takes: [passed("even-eighths.open-string", 100)] });
    const again = replanRest(rest, ALT, moved, NOW, new Set(["even-eighths.open-string"]));
    for (const step of again) {
      if (step.kind === "exercise" && (step.role === "next" || step.role === "focus")) {
        expect(step.stepId).not.toBe("even-eighths");
      }
    }
    expect(again.map((x) => x.minutes)).toEqual(rest.map((x) => x.minutes));
  });

  it("a later block of the Path's next work is re-picked; a review is left alone", () => {
    const review: ExStep = {
      kind: "exercise", id: "block-1", role: "review", pathId: ALT.id, stepId: "even-eighths",
      exerciseId: "even-eighths.open-string", title: "", bpm: 100, minutes: 4, variantSeed: null,
      why: { code: "reviewDue", values: {} },
    };
    const next: ExStep = { ...review, id: "block-2", role: "next" };
    const moved = progress({ states: [state({ currentStepId: "accents" })] });
    const [r1, r2] = replanRest([review, next], ALT, moved, NOW) as ExStep[];
    expect(r1).toBe(review);
    expect(r2.stepId).toBe("accents");
  });
});

describe("TODAY-2: Skip this, and N from a Step", () => {
  const chosen: ExStep = {
    kind: "exercise", id: "chosen", role: "focus", pathId: ALT.id, stepId: "even-eighths",
    exerciseId: "even-eighths.open-string", title: "", bpm: 60, minutes: 5, variantSeed: null,
    why: { code: "chosen", values: { step: "" } },
  };

  it("skipping from a Take's ready screen plays the step given next", () => {
    let r = runReducer(IDLE, { type: "start", plan: { minutes: 5, mood: "returning", daysAway: null, steps: [chosen] }, now: NOW });
    expect(r.phase).toBe("ready");
    r = runReducer(r, { type: "next", now: NOW, insert: { ...chosen, id: "chosen-1", exerciseId: "even-eighths.four-fingers" } });
    expect(r.phase).toBe("ready");
    expect(currentStep(r)).toMatchObject({ exerciseId: "even-eighths.four-fingers" });
  });

  it("the next Exercise after one on a Step is the next on that Step, then the next Step's first", () => {
    expect(followingExercise([ALT], ALT.id, "even-eighths.open-string")?.exercise.id).toBe("even-eighths.four-fingers");
    const lastOfStep1 = ALT.steps[0].exercises.filter((e) => e.grading === "graded").at(-1)!.id;
    expect(followingExercise([ALT], ALT.id, lastOfStep1)?.step.id).toBe("even-sixteenths");
    const lastOfPath = ALT.steps.at(-1)!.exercises.filter((e) => e.grading === "graded").at(-1)!.id;
    expect(followingExercise([ALT], ALT.id, lastOfPath)).toBeNull();
  });
});

describe("PATH-5: Test out", () => {
  it("locks the tempo: no Slower, no Faster", () => {
    const test: ExStep = {
      kind: "exercise", id: "test-0", role: "test", pathId: ALT.id, stepId: "even-eighths",
      exerciseId: "even-eighths.open-string", title: "", bpm: 100, minutes: 2, variantSeed: null,
      why: { code: "testOut", values: {} },
    };
    const r = runReducer(IDLE, { type: "start", plan: { minutes: 5, mood: "returning", daysAway: null, steps: [test] }, now: NOW });
    expect(tempoNudges(r, ex("even-eighths.open-string"))).toEqual({ slower: false, faster: false });
  });
});
