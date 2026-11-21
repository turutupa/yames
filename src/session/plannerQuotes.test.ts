/**
 * nf1c (the orchestrator's rule for nf1b review M1 / M2): a plan reason quotes
 * a clean tempo ONLY when the ceiling the planner computed from is also the
 * clean tempo the app shows (`quotableCleanTempoOf`), so the sentence is true
 * and agrees with Progress and the tempo beside it. When a Take marked not
 * fair holds the ceiling, or nothing is shown, the reason takes its variant
 * that names no clean tempo. The planner's own arithmetic (where a part
 * starts, which Exercise, parking, rotation, minutes) stays on the stored
 * ceiling: the marked plan equals the unmarked one field by field, except the
 * reason's code and values.
 */
import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../paths/format";
import type { PathTakeRow } from "../ipc";
import { reasonLine } from "./coachWords";
import { edgeStep, planSession, tempoFor, warmupTempo } from "./planner";
import type { PlanStep, SessionPlan } from "./planner";
import { cleanTempoOf, shownCleanTempoOf, type PlayerProgress, type TakeFacts } from "./progress";
import { ALT, DAY, NOW, ceiling, progress, take } from "./testKit";

const OPEN = "even-eighths.open-string";
const FOUR = "even-eighths.four-fingers";

function exercise(id: string): Exercise {
  for (const step of ALT.steps) {
    const found = step.exercises.find((e) => e.id === id);
    if (found) return found;
  }
  throw new Error(id);
}

function pickOf(id: string): { path: PathDoc; step: PathDoc["steps"][number]; exercise: Exercise } {
  const step = ALT.steps.find((s) => s.exercises.some((e) => e.id === id))!;
  return { path: ALT, step, exercise: exercise(id) };
}

/** A clean Take that raised the ceiling, as `useSessionRun` saves it. */
function raised(id: string, bpm: number, ago: number, more: TakeFacts = {}): PathTakeRow {
  return take(id, {
    bpm,
    passed: true,
    startedAt: NOW - ago,
    facts: { verdict: "passed", newClean: true, measures: { pass: { countsForCleanTempo: true } }, ...more } as TakeFacts,
  });
}

/** The same history twice: the fastest Take marked not fair, and nothing marked. */
function histories(id: string, fair: number, notFair: number, ago = DAY): { marked: PlayerProgress; unmarked: PlayerProgress } {
  const build = (fairMark: "no" | undefined) =>
    progress({
      takes: [raised(id, fair, ago + 2 * DAY), raised(id, notFair, ago, fairMark ? { fair: fairMark } : {})],
      ceilings: [ceiling(id, notFair)],
    });
  return { marked: build("no"), unmarked: build(undefined) };
}

function stepOn(steps: readonly PlanStep[], id: string): Extract<PlanStep, { kind: "exercise" }> {
  return steps.find((s): s is Extract<PlanStep, { kind: "exercise" }> => s.kind === "exercise" && s.exerciseId === id)!;
}

describe("plan reasons quote a clean tempo only when it is the one shown; the tempo stays on the ceiling", () => {
  it("Find my edge: no 'Last time it was N' when a Take marked not fair holds the ceiling", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100);
    expect(cleanTempoOf(marked, ALT.id, OPEN)).toBe(100);
    expect(shownCleanTempoOf(marked, ALT.id, OPEN)).toBe(90);
    const step = edgeStep(pickOf(OPEN), marked);
    const before = edgeStep(pickOf(OPEN), unmarked);
    // The stored reason code becomes `edgeFirst` (read only by the export).
    expect(step.why).toEqual({ code: "edgeFirst", values: { bpm: 100 } });
    expect(before.why).toEqual({ code: "edgeCheck", values: { clean: 100 } });
    // The arithmetic is not changed: it starts at the ceiling either way.
    expect(step.kind === "exercise" && step.bpm).toBe(100);
    expect(before.kind === "exercise" && before.bpm).toBe(100);
  });

  it("Find my edge with only Takes marked not fair: a first look, no 'last time'", () => {
    const only = progress({
      takes: [raised(OPEN, 100, DAY, { fair: "no" })],
      ceilings: [ceiling(OPEN, 100)],
    });
    const step = edgeStep(pickOf(OPEN), only);
    expect(step.why).toEqual({ code: "edgeFirst", values: { bpm: 100 } });
  });

  it("a warm-up names no clean tempo when the ceiling is not the shown one, at the tempo the ceiling gives", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100);
    const t = warmupTempo(ALT, exercise(OPEN), marked);
    const u = warmupTempo(ALT, exercise(OPEN), unmarked);
    expect(t.clean).toBeNull();
    expect(u.clean).toBe(100);
    expect(t.bpm).toBe(u.bpm);
  });

  it("the plan's own warm-up: 'warmUp', not 'under your clean N'", () => {
    // Under the pass tempo, so the focus stays on this Exercise and warms up on it.
    const { marked, unmarked } = histories(OPEN, 50, 55, 2 * DAY);
    const run = (p: PlayerProgress) => planSession({ minutes: 15, now: NOW, paths: [ALT], progress: p }).steps;
    const warm = run(marked).find((s) => s.kind === "metronome" && s.id === "warmup");
    const warmBefore = run(unmarked).find((s) => s.kind === "metronome" && s.id === "warmup");
    expect(warmBefore?.why).toMatchObject({ code: "warmUpClean", values: { clean: 55 } });
    expect(warm?.why.code).toBe("warmUp");
    expect(warm?.why.values.clean).toBeUndefined();
    expect(warm?.kind === "metronome" && warm.bpm).toBe(warmBefore?.kind === "metronome" && warmBefore.bpm);
  });

  it("'You've passed this' with no number when the shown tempo is under the pass mark (review M2)", () => {
    const passAt = exercise(OPEN).tempo.passAtBpm!;
    const { marked, unmarked } = histories(OPEN, passAt - 10, passAt + 20);
    const t = tempoFor(ALT, exercise(OPEN), marked);
    const u = tempoFor(ALT, exercise(OPEN), unmarked);
    expect(t.why.code).toBe("passedKeepGoing");
    expect(t.why.values.bpm).toBeUndefined();
    expect(reasonLine(t.why).key).toBe("session.why.passedKeepGoingNoClean");
    expect(u.why).toMatchObject({ code: "passedKeepGoing", values: { bpm: passAt + 20 } });
    expect(reasonLine(u.why).key).toBe("session.why.passedKeepGoing");
    expect(t.bpm).toBe(u.bpm);
  });

  it("'You've passed this' never quotes the not-fair Take itself (no shown tempo, with or without a ceiling row)", () => {
    const passAt = exercise(OPEN).tempo.passAtBpm!;
    for (const ceilings of [[ceiling(OPEN, passAt + 20)], []]) {
      const only = progress({ takes: [raised(OPEN, passAt + 20, DAY, { fair: "no" })], ceilings });
      const fair = progress({ takes: [raised(OPEN, passAt + 20, DAY)], ceilings });
      const t = tempoFor(ALT, exercise(OPEN), only);
      const u = tempoFor(ALT, exercise(OPEN), fair);
      expect(t.why.code).toBe("passedKeepGoing");
      expect(t.why.values.bpm).toBeUndefined();
      expect(u.why.values.bpm).toBe(passAt + 20);
      expect(t.bpm).toBe(u.bpm);
    }
  });

  it("back after a break: 'backEasedNoClean', eased from where the ceiling puts it", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100, 20 * DAY);
    const run = (p: PlayerProgress) => stepOn(planSession({ minutes: 5, now: NOW, paths: [ALT], progress: p }).steps, OPEN);
    const step = run(marked);
    const before = run(unmarked);
    expect(step.why.code).toBe("backEased");
    expect(step.why.values.clean).toBeUndefined();
    expect(reasonLine(step.why).key).toBe("session.why.backEasedNoClean");
    expect(before.why).toMatchObject({ code: "backEased", values: { clean: 100 } });
    expect(step.bpm).toBe(before.bpm);
  });

  it("a new Exercise from its sibling names no clean tempo when the sibling's ceiling is not shown", () => {
    const { marked, unmarked } = histories(OPEN, 90, 110);
    const t = tempoFor(ALT, exercise(FOUR), marked);
    const u = tempoFor(ALT, exercise(FOUR), unmarked);
    expect(u.why).toMatchObject({ code: "newFromSibling", values: { clean: 110 } });
    expect(t.why.code).toBe("newFromSibling");
    expect(t.why.values.clean).toBeUndefined();
    expect(reasonLine(t.why).key).toBe("session.why.newFromSiblingNoClean");
    expect(t.bpm).toBe(u.bpm);
  });

  it("a review names no clean tempo unless its bpm is the shown one; slipped and left-over keep theirs", () => {
    expect(reasonLine({ code: "reviewDue", values: { days: 3 } }).key).toBe("session.why.reviewDueNoClean");
    expect(reasonLine({ code: "reviewDue", values: { days: 3, bpm: 90 } }).key).toBe("session.why.reviewDue");
    expect(reasonLine({ code: "reviewDue", values: { days: 3, bpm: 85, slipped: 1 } }).key).toBe(
      "session.why.reviewDueSlipped",
    );
  });
});

/** A plan with every reason's code and values taken out: what must not change. */
function withoutWords(plan: SessionPlan): unknown {
  return {
    ...plan,
    steps: plan.steps.map((s) => ({ ...s, why: null })),
    skipped: plan.skipped?.map((s) => ({ ...s, why: null })),
  };
}

const CLEAN_QUOTING = new Set([
  "session.why.warmUpClean",
  "session.why.edgeCheck",
  "session.why.backEased",
  "session.why.newFromSibling",
  "session.why.passedKeepGoing",
  "session.why.reviewDue",
]);

describe("marking a Take not fair changes a plan's words, never the plan", () => {
  // The review's history: a fair clean Take under the pass mark and a not-fair
  // one over it holding the ceiling, moved over a range so the planned tempo
  // lands above, on and below the shown one.
  const passAt = exercise(OPEN).tempo.passAtBpm!;
  const seen = { above: 0, equal: 0, below: 0 };
  const cases: Array<[number, number, number, number]> = [];
  for (const fair of [passAt - 30, passAt - 20, passAt - 10, passAt - 5, passAt, passAt + 5]) {
    for (const ago of [DAY, 2 * DAY, 4 * DAY, 9 * DAY, 20 * DAY]) {
      for (const minutes of [5, 10, 15, 20]) cases.push([fair, passAt + 20, ago, minutes]);
    }
  }

  it.each(cases)("fair %i, not fair %i, %i ms ago, %i minutes", (fair, notFair, ago, minutes) => {
    const { marked, unmarked } = histories(OPEN, fair, notFair, ago);
    const plan = (p: PlayerProgress) =>
      planSession({ minutes: minutes as SessionPlan["minutes"], now: NOW, paths: [ALT], progress: p });
    const m = plan(marked);
    const u = plan(unmarked);
    expect(withoutWords(m)).toEqual(withoutWords(u));
    // No sentence of the marked plan names a clean tempo: the ceiling is held
    // by the not-fair Take, so it is never the one shown.
    // (Only OPEN has a history, so this holds for every step.)
    for (const step of m.steps) expect(CLEAN_QUOTING.has(reasonLine(step.why).key)).toBe(false);
    const shown = shownCleanTempoOf(marked, ALT.id, OPEN)!;
    for (const step of m.steps) {
      if (!("bpm" in step) || !("exerciseId" in step) || step.exerciseId !== OPEN) continue;
      if (step.bpm > shown) seen.above += 1;
      else if (step.bpm === shown) seen.equal += 1;
      else seen.below += 1;
    }
  });

  it("covered a planned tempo above, on and below the shown one", () => {
    expect(seen.above).toBeGreaterThan(0);
    expect(seen.equal).toBeGreaterThan(0);
    expect(seen.below).toBeGreaterThan(0);
  });
});
