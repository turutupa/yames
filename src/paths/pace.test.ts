/**
 * TODAY-4 (acceptance 2026-11-18: "Alternate Picking ladders still start at
 * 50"): every graded ladder in the shipped packs starts at about 0.6 of its
 * pass tempo, or at the author's written first rung where that is higher,
 * with six to eight rungs. A 50 BPM start is right where the pass is 80 to 85.
 */
import { describe, expect, it } from "vitest";
import type { PathDoc } from "./format";
import { PACE_START_SHARE, paceLadder } from "./pace";

const PACKS = Object.values(import.meta.glob("./packs/*.json", { eager: true })).map(
  (m) => (m as { default: PathDoc }).default,
);

describe("paceLadder", () => {
  it("starts at 0.6 of the pass, rounded to 5, keeps the pass and the top", () => {
    const rungs = paceLadder(100, 120, 50);
    expect(rungs[0]).toBe(60);
    expect(rungs).toContain(100);
    expect(rungs[rungs.length - 1]).toBe(120);
    expect(paceLadder(85, 110, 50)[0]).toBe(Math.round((85 * PACE_START_SHARE) / 5) * 5);
  });

  it("never lowers a written start", () => {
    expect(paceLadder(70, 90, 50)[0]).toBe(50);
  });
});

describe("the shipped ladders (TODAY-4)", () => {
  for (const pack of PACKS) {
    it(`${pack.id}: every graded Exercise starts at about 0.6 of its pass, 6 to 8 rungs`, () => {
      for (const step of pack.steps) {
        for (const e of step.exercises) {
          const pass = e.tempo.passAtBpm;
          if (e.grading !== "graded" || !pass) continue;
          const first = e.tempo.rungs[0].bpm;
          expect(first / pass, e.id).toBeGreaterThanOrEqual(0.55);
          expect(first / pass, e.id).toBeLessThanOrEqual(0.9);
          expect(e.tempo.rungs.length, e.id).toBeGreaterThanOrEqual(6);
          expect(e.tempo.rungs.length, e.id).toBeLessThanOrEqual(8);
        }
      }
    });
  }
});
