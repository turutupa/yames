/** Fixtures for the session tests: hand-built rows and a real pack. Not shipped. */
import type { ExerciseCeilingRow, PathStateRow, PathTakeRow } from "../ipc";
import type { PathDoc } from "../paths/format";
import type { PlayerProgress, TakeFacts } from "./progress";

const PACKS = import.meta.glob("../paths/packs/alternate-picking.json", { eager: true });
export const ALT = (Object.values(PACKS)[0] as { default: unknown }).default as PathDoc;
export const DAY = 86_400_000;
/** A Sunday, far enough from zero that nothing rounds to the epoch. */
export const NOW = 1_794_000_000_000;

let takeId = 0;

export function take(
  exerciseId: string,
  fields: Partial<PathTakeRow> & { facts?: TakeFacts } = {},
): PathTakeRow {
  takeId += 1;
  return {
    id: `t${takeId}`,
    pathId: ALT.id,
    stepId: exerciseId.split(".")[0],
    exerciseId,
    startedAt: NOW - DAY,
    bpm: 60,
    bars: 8,
    caught: true,
    passed: false,
    facts: {},
    ...fields,
  };
}

/** A Take below the bar, with evenness as the number that missed. */
export function missed(exerciseId: string, bpm: number, evenness: number, ago = DAY): PathTakeRow {
  return take(exerciseId, {
    bpm,
    startedAt: NOW - ago,
    facts: {
      verdict: "belowBar",
      headlineMetric: "timingEvenness",
      headlineValue: evenness,
      headlineMin: 0.85,
    },
  });
}

/** A Take that passed its bar. */
export function passed(exerciseId: string, bpm: number, evenness = 0.87, ago = DAY): PathTakeRow {
  return take(exerciseId, {
    bpm,
    startedAt: NOW - ago,
    passed: true,
    facts: {
      verdict: "passed",
      headlineMetric: "timingEvenness",
      headlineValue: evenness,
      headlineMin: 0.85,
    },
  });
}

export function ceiling(exerciseId: string, cleanBpm: number): ExerciseCeilingRow {
  return { exerciseKey: `${ALT.id}/${exerciseId}`, cleanBpm, lastPracticed: NOW - DAY };
}

export function state(fields: Partial<PathStateRow> = {}): PathStateRow {
  return { pathId: ALT.id, startedAt: NOW - 30 * DAY, updatedAt: NOW - DAY, ...fields };
}

/** Takes newest first, as the store hands them back. */
export function progress(fields: Partial<PlayerProgress> = {}): PlayerProgress {
  const takes = [...(fields.takes ?? [])].sort((a, b) => b.startedAt - a.startedAt);
  return { states: [state()], ceilings: [], ...fields, takes };
}
