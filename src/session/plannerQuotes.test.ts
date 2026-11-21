/**
 * nf1b M2: a plan reason that quotes a clean tempo as a fact ("your clean N",
 * "Last time it was N") quotes the one the app shows (`shownCleanTempoOf`),
 * so it is the number Progress and the recap show beside it. The planner's own
 * arithmetic (where a part starts, the ceiling, parking) stays on the stored
 * ceiling: every test here also checks that the tempo is the one the same
 * history plans with nothing marked.
 */
import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../paths/format";
import type { PathTakeRow } from "../ipc";
import { edgeStep, planSession, tempoFor, warmupTempo } from "./planner";
import type { PlanStep } from "./planner";
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

describe("plan reasons quote the shown clean tempo; the tempo stays on the ceiling", () => {
  it("Find my edge: 'Last time it was 90', starting where it always did", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100);
    expect(cleanTempoOf(marked, ALT.id, OPEN)).toBe(100);
    expect(shownCleanTempoOf(marked, ALT.id, OPEN)).toBe(90);
    const step = edgeStep(pickOf(OPEN), marked);
    const before = edgeStep(pickOf(OPEN), unmarked);
    expect(step.why).toEqual({ code: "edgeCheck", values: { clean: 90 } });
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

  it("a warm-up 'under your clean tempo of 90', at the tempo the ceiling gives", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100);
    const t = warmupTempo(ALT, exercise(OPEN), marked);
    const u = warmupTempo(ALT, exercise(OPEN), unmarked);
    expect(t.clean).toBe(90);
    expect(u.clean).toBe(100);
    expect(t.bpm).toBe(u.bpm);
  });

  it("the plan's own warm-up quotes the shown tempo too", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100, 2 * DAY);
    const run = (p: PlayerProgress) => planSession({ minutes: 15, now: NOW, paths: [ALT], progress: p }).steps;
    const warm = run(marked).find((s) => s.kind === "metronome" && s.id === "warmup");
    const warmBefore = run(unmarked).find((s) => s.kind === "metronome" && s.id === "warmup");
    expect(warm?.why).toMatchObject({ code: "warmUpClean" });
    expect(warmBefore?.why).toMatchObject({ code: "warmUpClean" });
    const quoted = (warm?.why.values as { clean?: number }).clean;
    const quotedBefore = (warmBefore?.why.values as { clean?: number }).clean;
    // Whichever Exercise the warm-up reads, it quotes that Exercise's shown tempo.
    expect(quoted === quotedBefore || (quoted === 90 && quotedBefore === 100)).toBe(true);
    expect(warm?.kind === "metronome" && warm.bpm).toBe(warmBefore?.kind === "metronome" && warmBefore.bpm);
  });

  it("'You've passed this at N' quotes the shown tempo; the next tempo is the ceiling's", () => {
    const passAt = exercise(OPEN).tempo.passAtBpm!;
    const { marked, unmarked } = histories(OPEN, passAt, passAt + 10);
    const t = tempoFor(ALT, exercise(OPEN), marked);
    const u = tempoFor(ALT, exercise(OPEN), unmarked);
    expect(t.why).toMatchObject({ code: "passedKeepGoing", values: { bpm: passAt } });
    expect(u.why).toMatchObject({ code: "passedKeepGoing", values: { bpm: passAt + 10 } });
    expect(t.bpm).toBe(u.bpm);
  });

  it("back after a break: 'your clean 90', eased from where the ceiling puts it", () => {
    const { marked, unmarked } = histories(OPEN, 90, 100, 20 * DAY);
    const run = (p: PlayerProgress) => stepOn(planSession({ minutes: 5, now: NOW, paths: [ALT], progress: p }).steps, OPEN);
    const step = run(marked);
    const before = run(unmarked);
    expect(step.why).toMatchObject({ code: "backEased", values: { clean: 90 } });
    expect(before.why).toMatchObject({ code: "backEased", values: { clean: 100 } });
    expect(step.bpm).toBe(before.bpm);
  });

  it("a new Exercise 'about 80% of your clean 90 on' its sibling, at the tempo the ceiling gives", () => {
    const { marked, unmarked } = histories(OPEN, 90, 110);
    const t = tempoFor(ALT, exercise(FOUR), marked);
    const u = tempoFor(ALT, exercise(FOUR), unmarked);
    expect(u.why).toMatchObject({ code: "newFromSibling", values: { clean: 110 } });
    expect(t.why).toMatchObject({ code: "newFromSibling", values: { clean: 90 } });
    expect(t.bpm).toBe(u.bpm);
  });
});
