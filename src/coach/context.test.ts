/**
 * The coach's context (DESIGN 9.1): built from getters only when asked, the
 * design's picks and nothing more, and its text for a model held under the
 * token cap however much there is to say, in any script.
 */
import { describe, expect, it, vi } from "vitest";
import type { SongAttemptReview } from "../containers/songs/review/useSongAttempt";
import type { PathTakeRow } from "../ipc";
import type { Exercise, PathDoc, Step } from "../paths/format";
import type { TakeGrade } from "../session/grade";
import type { PlanMinutes, SessionPlan } from "../session/planner";
import type { PlayerProgress } from "../session/progress";
import { IDLE, type RunState, type TakeOutcome } from "../session/runner";
import type { TakeMeasures } from "../session/takeMeasures";
import type { Finding } from "../songs/types";
import {
  TAKES_HERE,
  buildCoachContext,
  contextForModel,
  estimateTokens,
  type CoachContext,
  type CoachSources,
} from "./context";

const long = (word: string, times: number) => Array.from({ length: times }, () => word).join(" ");

const PATH = {
  id: "alternate-picking",
  title: "Alternate Picking",
  kind: "technique",
  goal: long("Pick every note down and up, evenly, at speed.", 6),
  gradingLimits: long("The app hears onsets, not which stroke made them.", 8),
  steps: [],
  orderRationale: "not for the coach",
} as unknown as PathDoc;

const STEP = {
  id: "step-2",
  order: 2,
  title: "Two strings",
  goal: "Cross strings without losing the stroke.",
  why: long("Crossing is where the hand loses its order.", 5),
  howTo: ["Small motion.", "Lead with the pick, not the arm."],
  payoff: "Runs across strings stay even.",
  prerequisites: ["not for the coach"],
  difficulty: 3,
  exercises: [],
} as unknown as Step;

const EXERCISE = {
  id: "ex-1",
  title: "Outside picking, two strings",
  purpose: "Cross outside the strings.",
  howTo: ["Keep the pick shallow."],
  notGraded: ["pickDirection"],
  variation: {
    variants: [
      { id: "a", purpose: "The first variant's purpose.", howTo: ["Variant A's how-to."] },
      { id: "b", purpose: "The second variant's purpose.", howTo: ["Variant B's how-to."] },
    ],
  },
} as unknown as Exercise;

function row(i: number, exerciseId = "ex-1"): PathTakeRow {
  return {
    id: `t${String(i)}`,
    pathId: "alternate-picking",
    stepId: "step-2",
    exerciseId,
    startedAt: 1_000 - i,
    bpm: 80 + i,
    bars: 8,
    caught: true,
    passed: i % 2 === 0,
    facts: { verdict: i % 2 === 0 ? "passed" : "belowBar" },
  };
}

const PROGRESS: PlayerProgress = {
  states: [],
  takes: [row(0), row(1), row(2, "other"), row(3), row(4), row(5), row(6), row(7)],
  ceilings: [],
};

const TAKE: TakeOutcome = {
  stepId: "s",
  exerciseId: "ex-1",
  title: "Outside picking",
  bpm: 92,
  takeNumber: 3,
  measures: { expected: 32, heard: 30, extras: 1, evenness: 0.81, noteIdentity: 0.95, caught: true } as TakeMeasures,
  grade: {
    verdict: "belowBar",
    checks: [],
    headline: { metric: "evenness", value: 0.81, min: 0.85, met: false },
    unmeasured: [],
    cleanBpm: null,
    passesExercise: false,
  } as TakeGrade,
  previousValue: 0.78,
  cleanBefore: 88,
};

const FINDING = {
  kind: "rushing",
  bars: [8, 8],
  noteIds: [],
  severity: 0.7,
  evidence: { onsets: 8, hits: 7, hitRate: 0.875, meanDeviationMs: -34, deviationBeats: -0.1, spreadMs: 9, passes: 3, passesAffected: 2, printedBars: [9, 9] },
} as unknown as Finding;
const REVIEW = { findings: [FINDING, FINDING, FINDING, FINDING] } as unknown as SongAttemptReview;

const PLAN: SessionPlan = { minutes: 15 as PlanMinutes, mood: "returning", daysAway: 1, steps: [] };
const RUN: RunState = { ...IDLE, phase: "result", stepIndex: 1, bpm: 92, takes: 3, outcomes: [TAKE], plan: PLAN };

function sources(over: Partial<CoachSources> = {}): CoachSources {
  return {
    screen: () => "session",
    locale: () => "en",
    now: () => 42,
    grading: () => "on",
    input: () => ({ listening: true, direct: true }),
    brain: () => ({ llmCompiled: true, choice: "off", resident: false, fastEnough: false }),
    progress: () => PROGRESS,
    plan: () => PLAN,
    run: () => RUN,
    path: () => PATH,
    step: () => STEP,
    exercise: () => ({ exercise: EXERCISE, variantSeed: 1 }),
    lastTake: () => TAKE,
    review: () => REVIEW,
    due: () => [],
    ...over,
  };
}

describe("buildCoachContext", () => {
  it("reads each getter once, when asked, and keeps the design's picks only", () => {
    const run = vi.fn(() => RUN);
    const ctx = buildCoachContext(sources({ run }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(ctx.now).toBe(42);
    expect(ctx.run).toEqual({
      phase: "result",
      stepIndex: 1,
      bpm: 92,
      takes: 3,
      outcomes: [TAKE],
      ungraded: null,
      untimed: false,
    });
    expect(Object.keys(ctx.path ?? {}).sort()).toEqual(["goal", "gradingLimits", "id", "kind", "title"]);
    expect(Object.keys(ctx.step ?? {}).sort()).toEqual(["goal", "howTo", "id", "order", "payoff", "title", "why"]);
    expect(ctx.brain).toEqual({ llmCompiled: true, choice: "off", resident: false, fastEnough: false });
    expect(ctx.review?.findings).toHaveLength(4);
  });

  it("carries the words of the variant played, not the Exercise's", () => {
    const ctx = buildCoachContext(sources());
    expect(ctx.exercise).toBe(EXERCISE);
    expect(ctx.variantSeed).toBe(1);
    expect(ctx.words).toEqual({ purpose: "The second variant's purpose.", howTo: ["Variant B's how-to."] });
  });

  it("brings this Exercise's newest five Takes, and no other Exercise's", () => {
    const ctx = buildCoachContext(sources());
    expect(ctx.takesHere?.map((t) => t.id)).toEqual(["t0", "t1", "t3", "t4", "t5"]);
    expect(ctx.takesHere).toHaveLength(TAKES_HERE);
  });

  it("leaves out what the host does not have, and an idle run", () => {
    const ctx = buildCoachContext({
      screen: () => "today",
      locale: () => "de",
      grading: () => "ask",
      input: () => ({ listening: false, direct: false, failure: "permission" }),
      brain: () => ({ llmCompiled: false, choice: "off", resident: false, fastEnough: false }),
      progress: () => PROGRESS,
      run: () => IDLE,
    });
    expect(Object.keys(ctx).sort()).toEqual(["brain", "grading", "input", "locale", "now", "progress", "screen"]);
  });
});

describe("estimateTokens", () => {
  it("over-counts English, which runs about four characters a token", () => {
    const text = long("The last four bars ran ahead, about a sixteenth early.", 20);
    expect(estimateTokens(text)).toBeGreaterThanOrEqual(Math.ceil(text.length / 4));
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 3));
  });

  it("counts a character outside ASCII as a whole token, and CJK as more", () => {
    expect(estimateTokens("Привет")).toBe(6);
    expect(estimateTokens("最后四小节")).toBe(8);
  });
});

describe("contextForModel", () => {
  it("says where the player is, what they played and what was measured", () => {
    const text = contextForModel(buildCoachContext(sources()));
    expect(text.split("\n")[0]).toBe("screen session; language en; grading on; input listening (direct)");
    expect(text).toContain("step 2: Two strings");
    expect(text).toContain("purpose: The second variant's purpose.");
    expect(text).toContain("last take 3 at 92 bpm: belowBar; evenness 0.81 (pass mark >= 0.85)");
    expect(text).toContain("findings: rushing bars 9-9, -34 ms");
  });

  it("never says 'the bar' for the threshold (owner decision 2)", () => {
    expect(contextForModel(buildCoachContext(sources()))).not.toMatch(/\bthe bar\b/i);
  });

  const HUGE: CoachContext = {
    ...buildCoachContext(sources()),
    takesHere: Array.from({ length: 5 }, (_, i) => row(i)),
    due: Array.from({ length: 40 }, () => ({}) as never),
  };
  const CJK: CoachContext = {
    ...HUGE,
    locale: "zh-CN",
    path: { ...HUGE.path!, title: "交替拨弦".repeat(30), goal: "每个音都要上下交替拨弦，均匀而快速。".repeat(20), gradingLimits: "应用只听得到起音。".repeat(40) },
    step: { ...HUGE.step!, title: "两根弦".repeat(30), goal: "跨弦时不丢拍。".repeat(30), why: "跨弦是手最容易乱的地方。".repeat(30) },
  };

  it.each([
    ["English", HUGE],
    ["Chinese", CJK],
  ])("holds the cap with everything there is to say, in %s", (_name, ctx) => {
    for (const cap of [450, 200, 120, 60, 25]) {
      const text = contextForModel(ctx, cap);
      expect(estimateTokens(text), `${String(cap)}: ${text}`).toBeLessThanOrEqual(cap);
      expect(text.length, `${String(cap)} came back empty`).toBeGreaterThan(0);
    }
  });

  it("keeps the most important lines and drops the least, rather than cutting at random", () => {
    const text = contextForModel(HUGE, 120);
    expect(text.startsWith("screen session")).toBe(true);
    expect(text).not.toContain("grading limits:");
    // Given the room, the same context says it all.
    const roomy = contextForModel(HUGE, 2_000);
    expect(roomy).toContain("grading limits:");
    expect(roomy.split("\n").length).toBeGreaterThan(text.split("\n").length);
  });

  it("clips the first line rather than say nothing, when even that will not fit", () => {
    const text = contextForModel(HUGE, 5);
    expect(text.endsWith("…")).toBe(true);
    expect(estimateTokens(text)).toBeLessThanOrEqual(5);
  });
});
