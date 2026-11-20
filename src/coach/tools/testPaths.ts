/**
 * Two small Paths for the tools' tests, one with its words in Spanish, so
 * resolution is tested in the player's language. Shaped as the packs are, only
 * the fields the tools read. Not imported by the app.
 */

import type { CoachRun } from "../context";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import type { RunPhase } from "../../session/runner";

function exercise(id: string, title: string, rungs: Array<[number, "graded" | "selfCheck"]>): Exercise {
  return {
    id,
    title,
    tempo: { rungs: rungs.map(([bpm, grading]) => ({ bpm, grading })) },
  } as unknown as Exercise;
}

function step(id: string, order: number, title: string, exercises: Exercise[]): Step {
  return { id, order, title, exercises } as unknown as Step;
}

export const ALT: PathDoc = {
  id: "alternate-picking",
  title: "Alternate Picking",
  steps: [
    step("ap-1", 1, "Down and up on one string", [
      exercise("ap-1-a", "Steady eighths", [[60, "graded"], [70, "graded"], [80, "graded"]]),
    ]),
    step("ap-2", 2, "Crossing two strings", [
      exercise("ap-2-a", "Outside picking", [[60, "graded"], [72, "graded"], [90, "selfCheck"]]),
      exercise("ap-2-b", "Inside picking", [[60, "graded"]]),
    ]),
    step("ap-3", 3, "Crossing three strings", [exercise("ap-3-a", "Three-string rolls", [[50, "graded"]])]),
  ],
} as unknown as PathDoc;

/** Legato, as a Spanish player reads it (the overlay applied). */
export const LEGATO_ES: PathDoc = {
  id: "legato",
  title: "Ligado",
  steps: [
    step("lg-1", 1, "Martilleos en una cuerda", [exercise("lg-1-a", "Martilleos lentos", [[50, "graded"]])]),
    step("lg-2", 2, "Crossing con ligados", [exercise("lg-2-a", "Tirones", [[55, "graded"]])]),
  ],
} as unknown as PathDoc;

/** A third Path whose title shares a word with the first, for "Which one?". */
export const ALT_BLUES: PathDoc = {
  id: "blues-pentatonics",
  title: "Alternate Blues",
  steps: [step("bp-1", 1, "Box one", [exercise("bp-1-a", "Box one, up and down", [[70, "graded"]])])],
} as unknown as PathDoc;

export const TEST_PATHS: readonly PathDoc[] = [ALT, LEGATO_ES, ALT_BLUES];

/** A Session's run in a phase, for a context. */
export function runIn(phase: RunPhase): CoachRun {
  return { phase, stepIndex: 0, bpm: 80, takes: 0, outcomes: [], ungraded: null, untimed: false } as unknown as CoachRun;
}
