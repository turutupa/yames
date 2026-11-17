import { describe, expect, it } from "vitest";
import type { Exercise } from "../paths/format";
import { exerciseGradingKey, pathBadge } from "./badges";
import { ALT, NOW } from "./testKit";
import { NO_PROGRESS } from "./progress";
import type { PlayerProgress } from "./progress";

const subscribed: PlayerProgress = { ...NO_PROGRESS, states: [{ pathId: ALT.id, startedAt: NOW, updatedAt: NOW }] };
const graded = ALT.steps[0].exercises.find((e) => e.grading === "graded")!;
const as = (fields: Partial<Exercise>): Exercise => ({ ...graded, ...fields });

describe("Path badges (QA 2026-11-17 #13)", () => {
  it("Subscribed on a subscribed Path, nothing on a runnable one that is not", () => {
    expect(pathBadge(ALT.id, subscribed)).toBe("subscribed");
    expect(pathBadge(ALT.id, NO_PROGRESS)).toBeNull();
    expect(pathBadge(ALT.id, { ...subscribed, unsubscribed: [ALT.id] })).toBeNull();
  });

  it("Coming soon on a Path the app can't run yet, whatever its pack's review status", () => {
    expect(pathBadge("not-a-runnable-path", subscribed)).toBe("comingSoon");
  });
});

describe("an Exercise card's grading line", () => {
  it("a graded Exercise on a runnable Path has none: its bar says it", () => {
    expect(exerciseGradingKey(graded, true)).toBeNull();
  });

  it("self-checked and practice-only say what they are, not 'yet'", () => {
    expect(exerciseGradingKey(as({ grading: "selfChecked" }), true)).toBe("session.paths.selfChecked");
    expect(exerciseGradingKey(as({ grading: "practiceOnly" }), true)).toBe("session.paths.practiceOnly");
  });

  it("'Not graded yet' where grading is still to come", () => {
    expect(exerciseGradingKey(as({ grading: "landings" }), true)).toBe("session.paths.notGradedYet");
    expect(exerciseGradingKey(graded, false)).toBe("session.paths.notGradedYet");
  });
});
