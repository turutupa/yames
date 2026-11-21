/**
 * The recap's coach line after a custom Exercise (My exercises, t2bb review
 * item 1): Today never plans one, so the line never says it "comes back".
 */
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { recapLineText } from "./SessionCoach";
import type { SessionRun } from "./hooks/useSessionRun";
import type { TakeOutcome } from "../../session/runner";
import { MY_EXERCISES_PATH_ID } from "../../session/myExercises";
import { ALT, NOW } from "../../session/testKit";

const t = i18n.t.bind(i18n);

function sessionWith(pathId: string, exerciseId: string, verdict: "passed" | "below"): SessionRun {
  const outcome = {
    stepId: "s1",
    exerciseId,
    title: "A minor pentatonic, the box at fret 5: up and back down. 3 bars.",
    bpm: 80,
    takeNumber: 1,
    measures: {},
    grade: { verdict, cleanBpm: null },
    previousValue: null,
    cleanBefore: null,
    takeId: "take-1",
  } as unknown as TakeOutcome;
  return {
    run: { outcomes: [outcome], plan: { steps: [{ id: "s1", kind: "exercise", pathId, exerciseId }] } },
    paths: [ALT],
    progress: { states: [], takes: [], ceilings: [] },
  } as unknown as SessionRun;
}

describe("the recap line after a custom Exercise", () => {
  it("says what moved and never that it comes back next Session", () => {
    const below = recapLineText(t, sessionWith(MY_EXERCISES_PATH_ID, "my.v1-box", "below"), NOW);
    expect(below).toBe("Last played at 80 BPM.");
    const passed = recapLineText(t, sessionWith(MY_EXERCISES_PATH_ID, "my.v1-box", "passed"), NOW);
    expect(passed).toBe("Passed at 80 BPM.");
    for (const line of [below, passed]) expect(line).not.toMatch(/comes back|rests/);
  });

  it("a pack Exercise still says when it comes back", () => {
    const exerciseId = ALT.steps[0].exercises[0].id;
    expect(recapLineText(t, sessionWith(ALT.id, exerciseId, "below"), NOW)).toMatch(/comes back/);
  });
});
