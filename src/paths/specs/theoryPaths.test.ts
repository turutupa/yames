// What the Theory Paths promise (plans/tasks/mvp/CONTENT.md): written lines
// graded on what the app measures today, a timing bar on every one, and a
// small "your turn" minority that says it is not checked yet.
import { describe, expect, it } from "vitest";
import { METRICS } from "../metrics";
import { buildPath } from "../generate";
import type { Exercise } from "../format";
import bluesPentatonics from "./blues-pentatonics";
import classicRock from "./classic-rock";
import knowTheNeck from "./know-the-neck";
import scalesAndModes from "./scales-and-modes";

const UNBUILT = new Set(METRICS.filter((m) => m.status === "new-grader" && m.id !== "evennessHold").map((m) => m.id));

describe.each([
  ["blues-pentatonics", bluesPentatonics, 30, 0.7],
  ["classic-rock", classicRock, 24, 0.75],
  ["know-the-neck", knowTheNeck, 25, 0.9],
  ["scales-and-modes", scalesAndModes, 25, 0.9],
] as const)("%s", (_id, spec, minGraded, minShare) => {
  const doc = buildPath(spec);
  const exercises: Exercise[] = doc.steps.flatMap((s) => s.exercises);
  const graded = exercises.filter((e) => e.grading === "graded");

  it("is mostly graded, with enough to last weeks", () => {
    expect(graded.length).toBeGreaterThanOrEqual(minGraded);
    expect(graded.length / exercises.length).toBeGreaterThanOrEqual(minShare);
  });

  it("grades nothing on a metric that isn't measured yet", () => {
    for (const ex of [...exercises, ...(doc.levels ?? []).flatMap((l) => l.warmups)]) {
      expect(ex.passBars.filter((b) => UNBUILT.has(b.metric)).map((b) => b.metric), ex.id).toEqual([]);
      expect(ex.graded.filter((m) => UNBUILT.has(m)), ex.id).toEqual([]);
      expect(ex.landings ?? [], ex.id).toEqual([]);
    }
  });

  it("puts a timing bar on every graded line", () => {
    for (const ex of graded) {
      expect(ex.passBars.some((b) => b.metric === "timingEvenness"), ex.id).toBe(true);
      expect(ex.notesRole, ex.id).toBe("target");
    }
  });

  it("swings its timing bar where the band swings", () => {
    for (const ex of graded) {
      if (ex.backing.kind !== "jam" || ex.backing.feel === "straight") continue;
      // Only lines with a swung off-beat in them: a whole note has nothing to swing.
      if (!ex.notes.some((n) => n.tick % 960 === 640)) continue;
      const bar = ex.passBars.find((b) => b.metric === "timingEvenness")!;
      expect(bar.min, ex.id).toBeLessThanOrEqual(0.65);
    }
  });

  it("says out loud that a 'your turn' is not checked yet", () => {
    for (const ex of exercises.filter((e) => e.grading === "selfChecked" && e.notesRole === "example")) {
      expect(ex.title, ex.id).toMatch(/^Your turn/);
      expect(ex.coachLine, ex.id).toMatch(/not checked yet/i);
      expect(ex.selfCheck?.length, ex.id).toBeGreaterThan(0);
    }
  });

  it("names the subdivision first in every how-to", () => {
    for (const ex of exercises) {
      expect(ex.howTo[0], ex.id).toMatch(/eighth|sixteenth|triplet|sextuplet|half note|whole note|quarter|shuffle|12\/8|straight time|dotted/i);
    }
  });
});
