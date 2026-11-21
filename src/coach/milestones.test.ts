/**
 * Milestones (`milestones.ts`, DESIGN 6.5): each earned by the last Session
 * and said from the numbers the app shows. Owner decision 3: a Take marked not
 * fair counts for no milestone, so every milestone has a test in which such a
 * Take alone would have earned it, and it is not earned.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ExerciseCeilingRow, PathTakeRow } from "../ipc";
import type { Exercise, Level, PathDoc, Step } from "../paths/format";
import { ALT, DAY, NOW, progress, take } from "../session/testKit";
import { heldCleanTempo, shownCleanTempoOf, type TakeFacts } from "../session/progress";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import { MILESTONE_FRESH_DAYS, milestonesNow } from "./milestones";
import { companionFor, resetCompanion } from "./companion";

const BASE_STEP = ALT.steps[0];
const BASE_EX = BASE_STEP.exercises[0];
const PASS_AT = 100;

function ex(id: string): Exercise {
  return { ...BASE_EX, id, title: `Exercise ${id}`, grading: "graded", tempo: { ...BASE_EX.tempo, passAtBpm: PASS_AT } };
}
function step(id: string, ids: string[]): Step {
  return { ...BASE_STEP, id, title: `Step ${id}`, payoff: `You can hear ${id}.`, exercises: ids.map(ex) };
}
function level(id: Level["id"], stepIds: string[]): Level {
  return { id, title: `Level ${id}`, summary: "", entry: "open", placement: { startHereIf: [] }, stepIds, warmups: [] };
}
function pathOf(id: string): PathDoc {
  return {
    ...ALT,
    id,
    title: `Path ${id}`,
    steps: [step("s1", ["a", "b", "c", "d"]), step("s2", ["e"]), step("s3", ["f"])],
    levels: [level("beginner", ["s1", "s2"]), level("intermediate", ["s3"])],
  };
}
const P = pathOf("p");

/** Session 1 is the oldest; the last Session is `LAST`, yesterday. */
const LAST = 50;
const at = (session: number) => NOW - (LAST - session + 1) * DAY;

function clean(exId: string, bpm: number, session: number, facts: TakeFacts = {}, pathId = P.id): PathTakeRow {
  return take(exId, {
    pathId,
    stepId: "",
    bpm,
    startedAt: at(session),
    passed: true,
    facts: { verdict: "passed", newClean: true, session, ...facts },
  });
}
const notFair = (exId: string, bpm: number, session: number, pathId = P.id) => clean(exId, bpm, session, { fair: "no" }, pathId);

/** The ceilings the store would keep: the highest clean tempo ever, Takes marked not fair included. */
function ceilingsOf(takes: readonly PathTakeRow[]): ExerciseCeilingRow[] {
  const best = new Map<string, number>();
  for (const t of takes) {
    if (!heldCleanTempo(t)) continue;
    const key = `${t.pathId}/${t.exerciseId}`;
    best.set(key, Math.max(best.get(key) ?? 0, t.bpm));
  }
  return [...best].map(([exerciseKey, cleanBpm]) => ({ exerciseKey, cleanBpm, lastPracticed: NOW - DAY }));
}
function prog(takes: PathTakeRow[], pathId = P.id) {
  return progress({ takes, ceilings: ceilingsOf(takes), states: [{ pathId, startedAt: NOW - 60 * DAY, updatedAt: NOW - DAY }] });
}
const now = (takes: PathTakeRow[], paths: PathDoc[] = [P], graded = true) => milestonesNow(prog(takes), paths, NOW, graded);
const kinds = (takes: PathTakeRow[]) => now(takes).map((m) => m.kind);

/** A Step 1 finished before the last Session: three of four passed. */
const s1Done = () => [clean("a", 100, 1), clean("b", 100, 2), clean("c", 100, 3)];
const s2Done = () => [clean("e", 100, 4)];

describe("milestonesNow", () => {
  it("the first Exercise passed, quoting the clean tempo Progress shows and its pass mark", () => {
    const out = now([clean("a", 90, 10), clean("a", 105, LAST)]);
    expect(out).toEqual([
      {
        kind: "firstPassed",
        key: `firstPassed:${P.id}/a`,
        at: at(LAST),
        line: { key: "firstPassed", values: { exercise: "Exercise a", bpm: 105, passAt: PASS_AT } },
        payoff: null,
      },
    ]);
  });

  it("first Exercise passed: a Take marked not fair alone never earns it", () => {
    expect(now([clean("a", 90, 10), notFair("a", 105, LAST)])).toEqual([]);
  });

  it("first Exercise passed: quotes the clean tempo shown, not the one a Take marked not fair set", () => {
    const takes = [clean("a", 102, LAST), notFair("a", 120, LAST)];
    expect(shownCleanTempoOf(prog(takes), P.id, "a")).toBe(102);
    expect(now(takes)[0].line.values.bpm).toBe(102);
  });

  it("first Exercise passed: not said when another was passed before, or when the Takes in memory do not reach a pass", () => {
    expect(kinds([clean("b", 100, 5), clean("a", 100, LAST)])).toEqual([]);
    // b is passed by its ceiling only: when, the Takes do not say, so a is not known to be the first.
    const takes = [clean("a", 100, LAST)];
    const p = progress({ takes, ceilings: [...ceilingsOf(takes), { exerciseKey: `${P.id}/b`, cleanBpm: 110, lastPracticed: NOW - 90 * DAY }] });
    expect(milestonesNow(p, [P], NOW, true)).toEqual([]);
  });

  it("a Step finished: three of four passed, the next Step named, the fourth left in reviews", () => {
    const out = now([clean("a", 100, 1), clean("b", 100, 2), clean("c", 100, LAST)]);
    expect(out.map((m) => [m.kind, m.line])).toEqual([
      ["stepDone", { key: "stepDoneRest", values: { step: "Step s1", passed: 3, count: 4, next: "Step s2" } }],
    ]);
  });

  it("Step finished: a Take marked not fair alone never earns it", () => {
    expect(kinds([clean("a", 100, 1), clean("b", 100, 2), notFair("c", 100, LAST)])).toEqual([]);
  });

  it("a Level finished, with the Path's own words for its last Step", () => {
    const out = now([...s1Done(), clean("e", 100, LAST)]);
    expect(out.map((m) => [m.kind, m.line, m.payoff])).toEqual([
      ["levelDone", { key: "levelDone", values: { level: "Level beginner", path: "Path p" } }, "You can hear s2."],
    ]);
  });

  it("Level finished: a Take marked not fair alone never earns it", () => {
    expect(kinds([...s1Done(), notFair("e", 100, LAST)])).toEqual([]);
  });

  it("a Path finished: one milestone, the largest, with its last Step's words", () => {
    const out = now([...s1Done(), ...s2Done(), clean("f", 100, LAST)]);
    expect(out.map((m) => [m.kind, m.key, m.payoff])).toEqual([["pathDone", `pathDone:${P.id}`, "You can hear s3."]]);
  });

  it("a Path finished from a chosen Level, the Steps below it skipped: says from where (review c4b3 M1)", () => {
    const withLevel = (takes: PathTakeRow[]) =>
      progress({ takes, ceilings: ceilingsOf(takes), states: [{ pathId: P.id, startedAt: NOW - 60 * DAY, updatedAt: NOW - DAY, level: "intermediate" }] });
    const skipped = milestonesNow(withLevel([clean("f", 100, LAST)]), [P], NOW, true);
    // (f is also the player's first Exercise passed.)
    expect(skipped.filter((m) => m.kind === "pathDone").map((m) => m.line)).toEqual([
      { key: "pathDoneFrom", values: { path: "Path p", level: "Level intermediate" } },
    ]);
    // Every Step below finished too: the whole Path is done, and it says so.
    const all = milestonesNow(withLevel([...s1Done(), ...s2Done(), clean("f", 100, LAST)]), [P], NOW, true);
    expect(all.map((m) => m.line)).toEqual([{ key: "pathDone", values: { path: "Path p" } }]);
  });

  it("first Exercise passed: not said after an earlier pass on the player's own exercise, or a clean tempo on a Path not loaded (review c4b3 L2)", () => {
    const mine = pathOf(MY_EXERCISES_PATH_ID);
    const own = [clean("a", 100, 5, {}, MY_EXERCISES_PATH_ID), clean("a", 100, LAST)];
    expect(milestonesNow(prog(own), [P, mine], NOW, true).map((m) => m.kind)).toEqual([]);
    const takes = [clean("a", 100, LAST)];
    const gone = progress({ takes, ceilings: [...ceilingsOf(takes), { exerciseKey: "gone-path/x", cleanBpm: 120, lastPracticed: NOW - 90 * DAY }] });
    expect(milestonesNow(gone, [P], NOW, true)).toEqual([]);
    // With neither, it is said.
    expect(milestonesNow(prog(takes), [P, mine], NOW, true).map((m) => m.kind)).toEqual(["firstPassed"]);
  });

  it("a Step finished: no \"the others stay in your reviews\" when the planner counts one more passed (review c4b3 L3)", () => {
    // d's clean tempo is held by a Take marked not fair: the planner counts it passed, the fair count does not.
    const out = now([clean("a", 100, 1), clean("b", 100, 2), notFair("d", 100, 3), clean("c", 100, LAST)]);
    expect(out.map((m) => m.line)).toEqual([{ key: "stepDone", values: { step: "Step s1", passed: 3, count: 4, next: "Step s2" } }]);
  });

  it("Path finished: a Take marked not fair alone never earns it", () => {
    expect(kinds([...s1Done(), ...s2Done(), notFair("f", 100, LAST)])).toEqual([]);
  });

  it("the benchmark improved: the two numbers, on the same Take", () => {
    const bench = (dayN: number, even: number, session: number, facts: TakeFacts = {}) =>
      take("d", {
        pathId: P.id,
        bpm: 60,
        startedAt: at(session),
        facts: { verdict: "belowBar", newClean: false, session, benchmark: { day: dayN, exerciseId: "d", bpm: 60 }, measures: { evenness: even }, ...facts },
      });
    const out = now([bench(1, 0.74, 40), bench(7, 0.86, LAST)]);
    expect(out.map((m) => [m.kind, m.line])).toEqual([
      ["benchmark", { key: "benchmark", values: { exercise: "Exercise d", bpm: 60, fromDay: 1, toDay: 7, from: 74, to: 86 } }],
    ]);
    // Benchmark: a Take marked not fair alone never earns it.
    expect(kinds([bench(1, 0.74, 40), bench(7, 0.99, LAST, { fair: "no" })])).toEqual([]);
    // Not improved: nothing.
    expect(kinds([bench(1, 0.86, 40), bench(7, 0.8, LAST)])).toEqual([]);
  });

  it("is only the last Session's: the next Session ends it", () => {
    expect(kinds([clean("a", 100, 10), clean("a", 90, LAST)])).toEqual([]);
  });

  it("is not offered past MILESTONE_FRESH_DAYS", () => {
    const takes = [clean("a", 100, LAST)];
    expect(milestonesNow(prog(takes), [P], at(LAST) + MILESTONE_FRESH_DAYS * DAY, true)).toEqual([]);
    expect(milestonesNow(prog(takes), [P], at(LAST) + MILESTONE_FRESH_DAYS * DAY - 1, true)).toHaveLength(1);
  });

  it("says nothing with grading off, and nothing for the player's own exercises", () => {
    expect(now([clean("a", 100, LAST)], [P], false)).toEqual([]);
    const mine = pathOf(MY_EXERCISES_PATH_ID);
    const takes = [clean("a", 100, LAST, {}, MY_EXERCISES_PATH_ID)];
    expect(milestonesNow(prog(takes, MY_EXERCISES_PATH_ID), [mine], NOW, true)).toEqual([]);
  });
});

describe("companionFor: a milestone comes first in the budget", () => {
  beforeEach(() => resetCompanion());

  it("offers the newest milestone first", () => {
    const takes = [clean("a", 100, 1), clean("b", 100, 2), clean("c", 100, LAST)];
    const { milestone, offers } = companionFor(prog(takes), [P], true, 1, NOW);
    expect(milestone?.kind).toBe("stepDone");
    expect(offers[0]).toEqual({ kind: "milestone", key: `stepDone:${P.id}/s1` });
  });

  it("offers none for a Take marked not fair", () => {
    const { milestone, offers } = companionFor(prog([notFair("a", 100, LAST)]), [P], true, 1, NOW);
    expect(milestone).toBeNull();
    expect(offers.some((o) => o.kind === "milestone")).toBe(false);
  });
});
