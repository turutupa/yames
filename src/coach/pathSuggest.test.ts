/**
 * The Path suggestion (`pathSuggest.ts`, DESIGN 6.4): the curriculum's own
 * reason, one Path, never one started, never the player's own exercises; shown
 * unasked only after a finished Level; asked, answered for anyone.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { PathTakeRow } from "../ipc";
import type { Exercise, Level, PathDoc, Step } from "../paths/format";
import { NO_PROGRESS } from "../session/progress";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import { ALT, DAY, NOW, progress, SWEEP, take } from "../session/testKit";
import { isCard } from "./ask/cards";
import { pathSuggestionNow, rememberPaths, suggestPath, suggestPathCard, suggestionLines } from "./pathSuggest";

/** Sweep with nothing to meet first: two Paths ready at once. */
const SWEEP_OPEN: PathDoc = { ...SWEEP, prerequisites: { paths: [], skills: [] } };

afterEach(() => rememberPaths([]));

describe("suggestPath", () => {
  it("a player with nothing started: the first ready Path in the curriculum's order", () => {
    const s = suggestPath(NO_PROGRESS, [ALT, SWEEP], null)!;
    // Sweep waits for Alternate Picking through Intermediate; Alternate Picking's own prerequisite is not in this list.
    expect(s.path.id).toBe(ALT.id);
    expect(s.reason).toEqual({ key: "next", values: { path: ALT.title } });
    expect(s.goal).toBeNull();
  });

  it("an earlier unstarted Path that is not ready is passed over: the pick is the first READY one, not the next unstarted", () => {
    // Alternate Picking started, not through Intermediate: Sweep (earlier in the
    // curriculum's order, not started) is not ready. A later Path with nothing to
    // meet first is the pick, and the sentence says "first ... with everything it
    // builds on in place", never "the next you have not started" (Sweep is that).
    // A runnable id (the suggestion offers only Paths the app can run).
    const later: PathDoc = { ...SWEEP_OPEN, id: "legato", title: "Legato" };
    const p = progress({ states: [{ pathId: ALT.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY }] });
    const s = suggestPath(p, [ALT, SWEEP, later], null)!;
    expect(s.path.id).toBe(later.id);
    expect(s.reason).toEqual({ key: "next", values: { path: later.title } });
    expect(s.goal).toBeNull();
  });

  it("names what it builds on, and the Level the player is through", () => {
    const top = ALT.levels![ALT.levels!.length - 1];
    const p = progress({ states: [{ pathId: ALT.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY, level: top.id }] });
    const s = suggestPath(p, [ALT, SWEEP], null)!;
    expect(s.path.id).toBe(SWEEP.id);
    const intermediate = ALT.levels!.find((l) => l.id === "intermediate")!;
    expect(s.reason).toEqual({ key: "buildsOnLevel", values: { path: SWEEP.title, on: ALT.title, level: intermediate.title } });
  });

  it("never a Path started, never the player's own exercises; null when nothing is ready", () => {
    const p = progress({ states: [{ pathId: ALT.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY }] });
    // Alternate Picking started but not through Intermediate: Sweep is not ready either.
    expect(suggestPath(p, [ALT, SWEEP], null)).toBeNull();
    const mine: PathDoc = { ...SWEEP_OPEN, id: MY_EXERCISES_PATH_ID };
    expect(suggestPath(NO_PROGRESS, [mine], null)).toBeNull();
  });

  it("a goal set orders the ready Paths, and is quoted", () => {
    expect(suggestPath(NO_PROGRESS, [ALT, SWEEP_OPEN], null)!.path.id).toBe(ALT.id);
    const goal = { text: "Sweep picking at 140", at: NOW - DAY };
    const s = suggestPath(NO_PROGRESS, [ALT, SWEEP_OPEN], goal)!;
    expect(s.path.id).toBe(SWEEP.id);
    expect(s.goal).toEqual(goal);
    // Review c4b3 H1: Sweep is not the next in the curriculum's order (Alternate
    // Picking is): it is said to match the goal, never to be "the next".
    expect(s.reason).toEqual({ key: "readyGoal", values: { path: SWEEP.title } });
    expect(suggestionLines(s).map((l) => l.key)).toEqual(["companion.pathSuggest.readyGoal", "companion.pathSuggest.goal"]);
  });

  it("a goal that leaves the first ready Path first: \"the next\", and the goal not quoted", () => {
    // "picking" is in both titles: a tie, so the curriculum's order stands.
    const s = suggestPath(NO_PROGRESS, [ALT, SWEEP_OPEN], { text: "picking", at: NOW - DAY })!;
    expect(s.path.id).toBe(ALT.id);
    expect(s.reason.key).toBe("next");
    expect(s.goal).toBeNull();
  });

  it("common words and parts of words decide nothing (review c4b3 L6)", () => {
    for (const text of ["I want to play guitar better", "sweeping", "a sweepstake"]) {
      const s = suggestPath(NO_PROGRESS, [ALT, SWEEP_OPEN], { text, at: NOW - DAY })!;
      expect(s.path.id, text).toBe(ALT.id);
      expect(s.goal, text).toBeNull();
    }
    // A plural is the same word.
    expect(suggestPath(NO_PROGRESS, [ALT, SWEEP_OPEN], { text: "sweeps", at: NOW - DAY })!.path.id).toBe(SWEEP.id);
  });
});

describe("pathSuggestionNow: unasked, only after a finished Level", () => {
  const base = ALT.steps[0];
  const ex = (id: string): Exercise => ({ ...base.exercises[0], id, title: id, grading: "graded", tempo: { ...base.exercises[0].tempo, passAtBpm: 100 } });
  const step = (id: string): Step => ({ ...base, id, title: id, exercises: [ex(`${id}a`)] });
  const level: Level = { id: "beginner", title: "Beginner", summary: "", entry: "open", placement: { startHereIf: [] }, stepIds: ["s1", "s2"], warmups: [] };
  const DONE: PathDoc = { ...ALT, id: "done-path", title: "Done Path", steps: [step("s1"), step("s2"), step("s3")], levels: [level] };
  const clean = (exId: string, session: number, fair = true): PathTakeRow =>
    take(exId, {
      pathId: DONE.id,
      bpm: 100,
      startedAt: NOW - (10 - session) * DAY,
      passed: true,
      facts: { verdict: "passed", newClean: true, session, ...(fair ? {} : { fair: "no" as const }) },
    });
  const prog = (takes: PathTakeRow[]) =>
    progress({
      takes,
      ceilings: takes.map((t) => ({ exerciseKey: `${DONE.id}/${t.exerciseId}`, cleanBpm: 100, lastPracticed: t.startedAt })),
      states: [{ pathId: DONE.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY }],
    });

  it("suggests after the last Session finished a Level", () => {
    const s = pathSuggestionNow(prog([clean("s1a", 1), clean("s2a", 9)]), [DONE, SWEEP_OPEN], null, NOW, true);
    expect(s?.path.id).toBe(SWEEP.id);
  });

  it("says nothing without a finished Level, with grading off, or when a Take marked not fair is what finished it", () => {
    expect(pathSuggestionNow(prog([clean("s1a", 9)]), [DONE, SWEEP_OPEN], null, NOW, true)).toBeNull();
    expect(pathSuggestionNow(prog([clean("s1a", 1), clean("s2a", 9)]), [DONE, SWEEP_OPEN], null, NOW, false)).toBeNull();
    expect(pathSuggestionNow(prog([clean("s1a", 1), clean("s2a", 9, false)]), [DONE, SWEEP_OPEN], null, NOW, true)).toBeNull();
  });
});

describe("suggestPathCard (asked)", () => {
  it("says so when the Paths are not loaded yet", () => {
    const out = suggestPathCard(NO_PROGRESS, null);
    expect(!isCard(out) && out.line.key).toBe("companion.pathSuggest.notLoaded");
  });

  it("names a Path from the curriculum, as the Path's own source", () => {
    rememberPaths([ALT, SWEEP]);
    const out = suggestPathCard(NO_PROGRESS, null);
    expect(isCard(out) && out.lines).toEqual([{ key: "companion.pathSuggest.next", values: { path: ALT.title } }]);
  });

  it("says when none is ready", () => {
    rememberPaths([ALT]);
    const p = progress({ states: [{ pathId: ALT.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY }] });
    const out = suggestPathCard(p, null);
    expect(!isCard(out) && out.line.key).toBe("companion.pathSuggest.none");
  });
});
