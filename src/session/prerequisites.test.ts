import { describe, expect, it } from "vitest";
import type { PathDoc } from "../paths/format";
import { RUNNABLE_PATH_IDS } from "./packs";
import { NO_PROGRESS } from "./progress";
import type { PlayerProgress } from "./progress";
import { hasStartedPath, isThroughLevel, unmetPathPrerequisites } from "./prerequisites";

const PACKS = import.meta.glob("../paths/packs/*.json", { eager: true });
const RUNNABLE_PATHS = Object.values(PACKS)
  .map((m) => (m as { default: PathDoc }).default)
  .filter((p) => RUNNABLE_PATH_IDS.includes(p.id));
const byId = (id: string): PathDoc => RUNNABLE_PATHS.find((p) => p.id === id)!;
const ALT = byId("alternate-picking");
const RHYTHM = byId("rhythm-foundations");
const NOW = 1_800_000_000_000;

const on = (path: PathDoc, stepId?: string, level?: "beginner" | "intermediate" | "advanced"): PlayerProgress => ({
  ...NO_PROGRESS,
  states: [{ pathId: path.id, currentStepId: stepId, level, startedAt: NOW, updatedAt: NOW }],
});

describe("prerequisite Paths, for one player", () => {
  it("a Path that builds on another says so until the player is through that Level", () => {
    expect(ALT.prerequisites.paths).toEqual([{ path: "rhythm-foundations", level: "beginner" }]);
    expect(unmetPathPrerequisites(NO_PROGRESS, RUNNABLE_PATHS, ALT)).toEqual([
      { path: "rhythm-foundations", level: "beginner" },
    ]);
    // Started, and still inside the Beginner Level: not through it yet.
    expect(unmetPathPrerequisites(on(RHYTHM, RHYTHM.steps[1].id), RUNNABLE_PATHS, ALT)).toHaveLength(1);
    // On the first Intermediate Step: through Beginner.
    const firstIntermediate = RHYTHM.levels!.find((l) => l.id === "intermediate")!.stepIds[0];
    expect(unmetPathPrerequisites(on(RHYTHM, firstIntermediate), RUNNABLE_PATHS, ALT)).toEqual([]);
  });

  it("choosing a higher Level counts: the player has said they know the lower one", () => {
    expect(isThroughLevel(on(RHYTHM, undefined, "intermediate"), RHYTHM, "beginner")).toBe(true);
    expect(isThroughLevel(on(RHYTHM, undefined, "intermediate"), RHYTHM, "intermediate")).toBe(false);
  });

  it("a Path nobody has started is not through any Level, and a Path with no prerequisites has none unmet", () => {
    expect(hasStartedPath(NO_PROGRESS, RHYTHM.id)).toBe(false);
    expect(isThroughLevel(NO_PROGRESS, RHYTHM, "beginner")).toBe(false);
    expect(unmetPathPrerequisites(NO_PROGRESS, RUNNABLE_PATHS, RHYTHM)).toEqual([]);
  });

  it("every shipped prerequisite points at a Path the app runs", () => {
    const ids = new Set(RUNNABLE_PATHS.map((p) => p.id));
    for (const path of RUNNABLE_PATHS) {
      for (const need of path.prerequisites.paths) expect(ids.has(need.path), `${path.id} -> ${need.path}`).toBe(true);
    }
  });
});
