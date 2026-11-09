/**
 * The pure middle of the pipeline: bytes in, bytes out, no file system. The CLI
 * (`scripts/paths.mjs`) does the reading and writing around these.
 */
import { buildSchedule } from "../songs/schedule";
import type { ScoreSchedule } from "../songs/types";
import { TICKS, barLengthTicks } from "./format";
import type { PathDoc } from "./format";
import { buildPath, serializePath } from "./generate";
import { renderReviewPage } from "./review";
import type { PathSpec } from "./spec";
import { SPECS } from "./specs/index";
import { exerciseScore } from "./toScore";
import { RULES, errorsIn, runtimeNeeds, validatePath } from "./validate";
import type { Issue } from "./validate";

export { RULES, errorsIn, runtimeNeeds, serializePath, validatePath, renderReviewPage };
export type { Issue, PathDoc };

export function allSpecs(): readonly PathSpec[] {
  return SPECS;
}

export function packBytes(spec: PathSpec): string {
  return serializePath(buildPath(spec));
}

export function formatIssue(issue: Issue): string {
  return `${issue.severity === "error" ? "ERROR" : "warn "} ${issue.rule}  ${issue.where}\n      ${issue.message}`;
}

export type ScheduleFixture = {
  path: string;
  exercise: string;
  bpm: number;
  /** Bars of played notes the Rust test should drop one from. */
  schedule: ScoreSchedule;
};

/**
 * Every Exercise with target notes, as the schedule `score.rs` will be handed.
 * `src-tauri/tests/path_exercises.rs` reads this file and runs `match_attempt`.
 */
export function scheduleFixtures(docs: readonly PathDoc[]): string {
  const rows: ScheduleFixture[] = [];
  for (const doc of docs) {
    for (const step of doc.steps) {
      for (const ex of step.exercises) {
        if (ex.notesRole !== "target") continue;
        const bpm = ex.tempo.passAtBpm ?? ex.tempo.rungs[0].bpm;
        const score = exerciseScore(doc.id, ex, bpm);
        const schedule = buildSchedule(score, undefined, { loops: false });
        rows.push({ path: doc.id, exercise: ex.id, bpm, schedule });
      }
    }
  }
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}

/** A one-paragraph summary for the terminal and the reports. */
export function summary(doc: PathDoc): string {
  const exercises = doc.steps.flatMap((s) => s.exercises);
  const by = (mode: string) => exercises.filter((e) => e.grading === mode).length;
  const notes = exercises.reduce((sum, e) => sum + e.notes.length, 0);
  const bars = exercises.reduce((sum, e) => sum + e.bars, 0);
  const beatTicks = barLengthTicks({ numerator: 4, denominator: 4 }) / TICKS;
  return (
    `${doc.id}: ${doc.steps.length} Steps, ${exercises.length} Exercises ` +
    `(${by("graded")} graded, ${by("landings")} landings, ${by("selfChecked")} self-checked, ` +
    `${by("practiceOnly")} practice-only), ${notes} notes in ${bars} bars of ${beatTicks}, ` +
    `about ${Math.round(doc.estimatedMinutes / 60)} hours. Status: ${doc.review.status}.`
  );
}
