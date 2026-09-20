/**
 * An attempt — one go at a passage, from pressing play to pressing stop.
 *
 * Everything here is arithmetic over what scoring already said. No IPC, no
 * React, no clock the caller did not pass in; `useSongAttempt` is the part
 * that talks to the app, and this is the part that can be reasoned about.
 *
 * ## Play to stop, not segment to segment
 *
 * The analyzer's `ScheduleRun` accumulates from the moment the schedule is
 * loaded until it is cleared, and `report()` matches the WHOLE run every
 * time (`src-tauri/src/score.rs`). So a `practice-segment-ended` that arrives
 * mid-pass — the activity gap, a grid discontinuity — carries the same run
 * with more in it, not a slice of it. **The last payload supersedes every
 * earlier one**; concatenating them would count every onset as many times as
 * the segment happened to close, and a player who paused to tune would be
 * credited with playing the passage twice.
 *
 * That is also why the attempt ends with `clear_score_schedule`: the run is
 * what makes an attempt a thing, and clearing it is what makes the next press
 * of play a different attempt rather than more of this one.
 *
 * ## The floor
 *
 * Eight scored onsets. Below that there is nothing to judge — `findings.rs`
 * will not speak on fewer than four samples and a passage that short cannot
 * show a tendency — so the attempt is dropped rather than stored, and the
 * player gets no review rather than a confident sentence about six notes.
 * A false start, a bump of the footswitch and a count-in that was cut off all
 * land here, and none of them belong in a history a coach reads from.
 */
import type {
  Attempt,
  AttemptExtra,
  AttemptOnset,
  PracticeSegmentEndedPayload,
} from "../ipc";
import type { BarRange } from "./schedule";
import type { ExtraOnset, OnsetResult } from "./types";

/**
 * Fewer scored onsets than this and the attempt is not an attempt.
 *
 * Eight rather than `findings.rs`'s four: four is the smallest number that
 * can show a tendency, and asking for double that means the coach's first
 * sentence about a passage is never drawn from the bare minimum.
 */
export const MIN_SCORED_ONSETS = 8;

/** What scoring handed back for one go, as the review carries it around. */
export type AttemptResults = {
  results: OnsetResult[];
  extras: ExtraOnset[];
  /** The number scoring gave the pass, 0–100. */
  score: number;
};

/** Everything the store and the judgement need to know about one go. */
export type AttemptFacts = AttemptResults & {
  /** Times round the loop, at least 1. */
  passes: number;
  hits: number;
  misses: number;
  /** Onsets the schedule marked soft that never arrived. Never a miss. */
  softAbsent: number;
  extraCount: number;
  /** Signed, in ms, over the hits. Negative is early. */
  meanDevMs: number;
  /** Median absolute deviation over the hits, in ms. */
  madMs: number;
  /** Hits plus misses: what the player was actually judged on. */
  scoredOnsets: number;
};

/** Is there enough here to judge? */
export function isAttemptWorthKeeping(results: readonly OnsetResult[]): boolean {
  return countScored(results) >= MIN_SCORED_ONSETS;
}

/** Hits and misses. A `softAbsent` was never due, so it is not scored. */
export function countScored(results: readonly OnsetResult[]): number {
  let n = 0;
  for (const r of results) if (r.state !== "softAbsent") n += 1;
  return n;
}

/**
 * The run as the analyzer last reported it.
 *
 * Returns null when the payload carries no schedule verdicts at all, which is
 * every segment of free play and every segment of a build where the schedule
 * never reached the engine.
 */
export function resultsFromSegment(
  payload: PracticeSegmentEndedPayload,
): AttemptResults | null {
  const results = payload.onsetResults;
  if (!results || results.length === 0) return null;
  return {
    results: [...results],
    extras: [...(payload.extraOnsets ?? [])],
    score: payload.score,
  };
}

/** Everything a sentence, a colour or a row of the store wants. */
export function attemptFacts(run: AttemptResults): AttemptFacts {
  let hits = 0;
  let misses = 0;
  let softAbsent = 0;
  let maxPass = 0;
  const deviations: number[] = [];

  for (const r of run.results) {
    if (r.pass > maxPass) maxPass = r.pass;
    if (r.state === "hit") {
      hits += 1;
      if (r.deviationMs !== null) deviations.push(r.deviationMs);
    } else if (r.state === "miss") {
      misses += 1;
    } else {
      softAbsent += 1;
    }
  }
  for (const e of run.extras) if (e.pass > maxPass) maxPass = e.pass;

  return {
    ...run,
    passes: maxPass + 1,
    hits,
    misses,
    softAbsent,
    extraCount: run.extras.length,
    meanDevMs: mean(deviations),
    madMs: medianAbsoluteDeviation(deviations),
    scoredOnsets: hits + misses,
  };
}

/** What `saveAttempt` is handed. */
export type AttemptRecordInput = {
  id: string;
  scoreId: string;
  sessionId?: string;
  /** Epoch ms — when the player pressed play. */
  startedAt: number;
  range: BarRange;
  tempoPercent: number;
  facts: AttemptFacts;
  takePath?: string;
};

/**
 * The row.
 *
 * The per-onset verdicts travel with it: they are the biggest thing on the
 * row and the library never wants them, but they are also the only record of
 * WHERE it went wrong, and a review opened tomorrow has nowhere else to read
 * the colours from.
 */
export function attemptRecord(input: AttemptRecordInput): Attempt {
  const { facts } = input;
  return {
    id: input.id,
    scoreId: input.scoreId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    startedAt: input.startedAt,
    rangeStartBar: input.range.startBar,
    rangeEndBar: input.range.endBar,
    tempoPercent: input.tempoPercent,
    passes: facts.passes,
    score: facts.score,
    hits: facts.hits,
    misses: facts.misses,
    extras: facts.extraCount,
    meanDevMs: facts.meanDevMs,
    madMs: facts.madMs,
    ...(input.takePath ? { takePath: input.takePath } : {}),
    onsets: facts.results.map(toStoredOnset),
    extraOnsets: facts.extras.map((e): AttemptExtra => ({ beat: e.beat, pass: e.pass })),
  };
}

function toStoredOnset(r: OnsetResult): AttemptOnset {
  return {
    id: r.id,
    state: r.state,
    deviationMs: r.deviationMs,
    pass: r.pass,
    ...(r.accentHeard === undefined ? {} : { accentHeard: r.accentHeard }),
  };
}

/** A stored attempt, read back as the review wants it. */
export function resultsFromStored(attempt: Attempt): AttemptResults {
  return {
    results: (attempt.onsets ?? []).map((o): OnsetResult => ({
      id: o.id,
      state: o.state,
      deviationMs: o.deviationMs,
      pass: o.pass,
      ...(o.accentHeard === undefined ? {} : { accentHeard: o.accentHeard }),
    })),
    extras: (attempt.extraOnsets ?? []).map((e): ExtraOnset => ({ beat: e.beat, pass: e.pass })),
    score: attempt.score,
  };
}

/**
 * An id for an attempt.
 *
 * `crypto.randomUUID` where it exists, which is every webview this app ships
 * to, and a timestamp-and-counter where it does not — a test environment, and
 * one old enough that this branch will outlive it.
 */
let counter = 0;
export function newAttemptId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  counter += 1;
  return `attempt-${String(Date.now())}-${String(counter)}`;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Median absolute deviation — the same estimator the Rust scorer uses, and
 * for the same reason: one wild note must not decide how steady the pass was.
 */
function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const devs = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  return median(devs);
}
