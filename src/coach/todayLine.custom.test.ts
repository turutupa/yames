/**
 * Today's line and the Step page's line with Takes of My exercises in the
 * history (t2bb, the orchestrator's decision): they speak from the last Path
 * Take as if the custom Takes were not there, and never name a custom Exercise.
 */
import { describe, expect, it } from "vitest";
import alt from "../paths/packs/alternate-picking.json";
import i18n from "../i18n";
import type { PathDoc } from "../paths/format";
import type { PathTakeRow } from "../ipc";
import type { PlanStep } from "../session/planner";
import { findExercise } from "../session/packs";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import { stepLine, todayLine, todayLineText } from "./todayLine";
import type { TodayLineInput } from "./todayLine";

const PATHS = [alt] as unknown as PathDoc[];
const PATH = "alternate-picking";
const TUNE = "other-strings.b-string-tune";
const tune = findExercise(PATHS[0], TUNE)!.exercise;
const BARS = Math.max(1, tune.bars);
const DAY = 86_400_000;
const NOW = new Date(2026, 10, 19, 12, 0, 0).getTime();

/** Bar 1 of the tune slipped on two of three rounds. */
const perBar = Array.from({ length: BARS * 3 }, (_u, i) => ({
  due: 8,
  heard: 8,
  evenness: i % BARS === 0 && i < BARS * 2 ? 0.4 : 0.99,
}));

function pathTake(daysAgo: number): PathTakeRow {
  const startedAt = NOW - daysAgo * DAY;
  return {
    id: `p${daysAgo}`,
    pathId: PATH,
    stepId: "other-strings",
    exerciseId: TUNE,
    startedAt,
    bpm: 90,
    bars: BARS * 3,
    caught: true,
    passed: false,
    facts: {
      verdict: "belowBar",
      headlineMetric: "timingEvenness",
      headlineValue: 0.79,
      session: startedAt - 60_000,
      measures: { perBar, barsPlayed: BARS * 3 },
    },
  } as PathTakeRow;
}

/** A graded Take of a custom Exercise, `minutesAgo` before now: newer than every Path Take. */
function customTake(minutesAgo: number, verdict: string): PathTakeRow {
  const startedAt = NOW - minutesAgo * 60_000;
  return {
    id: `c${minutesAgo}`,
    pathId: MY_EXERCISES_PATH_ID,
    stepId: "my",
    exerciseId: "my.v1-box-a-minorPentatonic-5",
    startedAt,
    bpm: 100,
    bars: 6,
    caught: verdict !== "ungraded",
    passed: verdict === "passed",
    facts: { verdict, session: startedAt - 60_000, measures: { barsPlayed: 6 } },
  } as PathTakeRow;
}

const STEP: PlanStep = {
  kind: "exercise",
  id: "s1",
  role: "focus",
  pathId: PATH,
  stepId: "other-strings",
  exerciseId: TUNE,
  title: tune.title,
  bpm: 90,
  minutes: 8,
  variantSeed: null,
  why: { code: "belowBar", values: { bpm: 90 } },
} as PlanStep;

function input(takes: PathTakeRow[]): TodayLineInput {
  return {
    plan: { minutes: 15, mood: "returning", daysAway: 0, steps: [STEP] },
    progress: { states: [], takes, ceilings: [] },
    paths: PATHS,
    now: NOW,
    grading: "on",
    takesRead: 500,
  };
}

const t = i18n.getFixedT("en");
const say = (i: TodayLineInput) => {
  const line = todayLine(i);
  return line ? todayLineText(t, line) : null;
};

describe("Today's line with custom Takes", () => {
  const pathOnly = say(input([pathTake(1)]));

  it("says what the last Path Session said, as if the custom Session were not there", () => {
    expect(pathOnly).toMatch(/slipped/);
    for (const verdict of ["passed", "belowBar", "ungraded"]) {
      const takes = [customTake(30, verdict), customTake(40, verdict), pathTake(1)];
      expect(say(input(takes))).toBe(pathOnly);
    }
  });

  it("never names a custom Exercise, and says nothing when only custom Takes were played", () => {
    expect(say(input([customTake(30, "passed")]))).toBeNull();
  });

  // c5a2b, the orchestrator's decision: the due Songs passage is gated on the
  // RAW history, so a player whose only Takes are My-exercises Takes (not on
  // their first day) still hears it; the Path's part stays silent.
  it("a player with only custom Takes still gets the due Songs passage, alone", () => {
    const songDue = { song: "Blackbird", from: 9, to: 12 };
    expect(say({ ...input([customTake(30, "passed")]), songDue })).toBe("Bars 9 to 12 of Blackbird are due.");
    // With a Path Take too, after the Path's line, which ignores the custom Take.
    expect(say({ ...input([customTake(30, "passed"), pathTake(1)]), songDue })).toBe(`${pathOnly} Bars 9 to 12 of Blackbird are due.`);
    // Nothing played at all: still the first day, still not said.
    expect(say({ ...input([]), songDue })).toBeNull();
  });

  it("the Step page's line reads the last Path Session too", () => {
    const base = { paths: PATHS, pathId: PATH, exerciseIds: [TUNE], now: NOW, grading: "on" as const };
    const plain = stepLine({ ...base, progress: { states: [], takes: [pathTake(1)], ceilings: [] } });
    expect(plain).not.toBeNull();
    const withCustom = stepLine({
      ...base,
      progress: { states: [], takes: [customTake(30, "belowBar"), pathTake(1)], ceilings: [] },
    });
    expect(withCustom).toEqual(plain);
  });
});
