import type { SessionSegment } from "../types";

/**
 * Tiny shared helpers for `SessionReport`-derived stats.
 *
 * The accuracy denominator is the #1 source of "subtle correctness"
 * bugs across this codebase: it MUST be `hits + miss` (i.e. scored
 * beats) and NOT `totalBeats`. The two diverge whenever the player
 * hasn't started yet, plays below the noise floor, or rests during
 * a long passage — `totalBeats` keeps ticking on the metronome but
 * `hits + miss` only counts beats the player attempted. The Rust
 * score (`session.rs::report()`) uses the scored-beat denominator,
 * so every JS-side display has to match or the displayed accuracy
 * disagrees with the displayed score.
 *
 * The bug was already shipped twice — once in `EndReportSummary`,
 * once in `SegmentTimeline` — before being fixed during the Step-3
 * coordination review. Concentrating the math here means the next
 * place that needs an accuracy percentage gets it right by default.
 */

interface ScoredFields {
  hitsCount: number;
  missCount: number;
}

/**
 * Fields needed to recompute a session score from accuracy components.
 * Strict subset of `SessionReport` so it can be applied to any shape
 * that carries hits/misses + per-classification counts + stddev.
 */
interface RescorableFields {
  hitsCount: number;
  missCount: number;
  perfectCount: number;
  goodCount: number;
  okCount: number;
  stdDeviationMs: number;
}

/**
 * Number of beats the player ATTEMPTED. Synonym for `hits + miss`
 * but named to keep call sites readable ("of N scored beats…").
 */
export function scoredBeats(report: ScoredFields): number {
  return report.hitsCount + report.missCount;
}

/**
 * Accuracy as a fraction in [0, 1], defined as
 *   hits / (hits + miss).
 *
 * Returns 0 when no beats were attempted — same NaN-avoidance
 * rationale as `accuracyPct`. Use this when the caller is comparing
 * against a threshold (MIN_SEGMENT_HIT_RATE_FOR_REPORT, etc.) rather
 * than rendering a percentage to the user.
 */
export function accuracyRatio(report: ScoredFields): number {
  const denom = scoredBeats(report);
  return denom > 0 ? report.hitsCount / denom : 0;
}

/**
 * Accuracy as a rounded integer percentage, defined as
 *   hits / (hits + miss).
 *
 * Returns 0 when no beats were attempted — surfacing "0%" rather
 * than `NaN` keeps downstream string templates safe even when the
 * report is empty (e.g. a session that ended before any onsets
 * crossed the gate).
 */
export function accuracyPct(report: ScoredFields): number {
  return Math.round(accuracyRatio(report) * 100);
}

/**
 * The session-score formula, ported verbatim from Rust's "legacy" path
 * (`session.rs::report` — the branch taken when no `PracticeSegment`s
 * are recorded).  Lives here on the JS side because we want to use the
 * SAME formula for displayed scores regardless of whether the backend
 * happened to take the segment-aware branch.
 *
 *   score = (0.30·hitRate + 0.50·accuracyScore + 0.20·consistencyScore) · 100
 *
 *   hitRate          = hits / (hits + miss)
 *   accuracyScore    = (perfect·10 + good·7 + ok·3) / (hits·10)
 *   consistencyScore = max(0, 1 - min(1, stdDeviationMs / 50))
 *
 * Why override the backend's segment-aware score?  The segment path
 * mixes in DSP-dependent components (`hit_completeness` punishes idle
 * stretches inside an open segment; `onset_efficiency` punishes spurious
 * onsets from the doubling/density bug).  When the DSP misbehaves —
 * which it does today on dense subdivisions — a session with great
 * accuracy can get a wildly low segment-weighted score even though the
 * player did well by every visible metric.  See `c847c91b` vs
 * `6c920ad0` in the user's 80 BPM 16ths history: 75% acc / streak 30 /
 * stddev 23.6ms → segment-path 27 ("F", demotivating) where the legacy
 * formula returns 74 ("B") next to a 69% acc / streak 23 / stddev 22ms
 * run that already scored 72.
 *
 * This formula depends ONLY on what the player did (counts of hits per
 * quality bucket, stddev of deviations), so it's robust to DSP segment
 * quirks.  The plan-pinned segment scoring tests still cover the Rust
 * side; we just don't surface that score to the user until the
 * underlying DSP bugs are resolved.
 */
export function computeLegacyScore(report: RescorableFields): number {
  const scored = report.hitsCount + report.missCount;
  const hitRate = scored > 0 ? report.hitsCount / scored : 0;
  const points =
    report.perfectCount * 10 + report.goodCount * 7 + report.okCount * 3;
  const maxPoints = report.hitsCount * 10;
  const accuracyScore = maxPoints > 0 ? points / maxPoints : 0;
  const consistencyScore = Math.max(
    0,
    1 - Math.min(1, report.stdDeviationMs / 50),
  );
  const raw =
    (hitRate * 0.3 + accuracyScore * 0.5 + consistencyScore * 0.2) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * What a score MEANS — the one table (ROADMAP 1.7, P3-COACH-3).
 *
 * Four places used to answer this question and three of them disagreed.
 * The letter grade and the narrative both broke at 95/85/70/55/40; the
 * end-report's one-word qualifier broke at 90/75/55; the score ring and
 * badge coloured at 90/70/50. A score of 72 therefore arrived as a
 * cyan "good" ring, the word "Fair", and a paragraph opening "72 is a
 * real foundation" — three readings of one number, on one card.
 *
 * So the boundaries live here, once, and everything that turns a score
 * into a word, a letter or a colour reads them. `bandForScore` is the
 * primitive; `gradeForScore` keeps the letters the Rust report uses
 * (`session.rs::report`), which is why the band ids are named after the
 * feeling rather than the letter — the letters are Rust's vocabulary,
 * not the coach's.
 */
export type ScoreBand = "flawless" | "strong" | "solid" | "fair" | "building" | "early";

/** Lower bound of each band, highest first. The single source of truth. */
const SCORE_BANDS: ReadonlyArray<readonly [ScoreBand, number]> = [
  ["flawless", 95],
  ["strong", 85],
  ["solid", 70],
  ["fair", 55],
  ["building", 40],
  ["early", 0],
];

export function bandForScore(score: number): ScoreBand {
  for (const [band, floor] of SCORE_BANDS) {
    if (score >= floor) return band;
  }
  return "early";
}

/**
 * Convert a numeric score to the same letter grade the Rust report uses
 * (`session.rs::report`).  Kept next to `computeLegacyScore` so any time
 * we override `score` we can override `grade` in lockstep without
 * duplicating the band boundaries.
 */
export function gradeForScore(score: number): string {
  switch (bandForScore(score)) {
    case "flawless": return "S";
    case "strong": return "A";
    case "solid": return "B";
    case "fair": return "C";
    case "building": return "D";
    default: return "F";
  }
}

/**
 * The hit-quality colour a score is drawn in — the same four feedback
 * colours a beat gets, so the ring, the badge and the breakdown bars
 * speak one visual language.
 *
 * Two bands share a colour at each end: there are six bands and four
 * colours, and "flawless" versus "strong" is a distinction the words
 * make, not one worth a fifth hue.
 */
export function feedbackToneForScore(
  score: number,
): "perfect" | "good" | "ok" | "miss" {
  switch (bandForScore(score)) {
    case "flawless":
    case "strong": return "perfect";
    case "solid": return "good";
    case "fair": return "ok";
    default: return "miss";
  }
}

/**
 * Grade-band one-liner mirroring `session.rs::generate_comment` on the
 * Rust side. The single-segment path emits this verbatim from Rust, but
 * the JS multi-segment aggregator (`useSession::aggregateReports`) used
 * to ship `"N segments played"` for every multi-segment session
 * regardless of score — which left history cards reading like a beat
 * count instead of a quality summary, and made the new narrative card
 * the only piece of evaluative copy on screen. Keeping the comment
 * generator on the JS side means both code paths produce the same
 * one-liner shape and the narrative below it gets to do the
 * shape-aware explanation work without having to compete with a
 * generic "3 segments played" header.
 *
 * Strings are kept identical to the Rust matcher arms (down to
 * punctuation) so a session that crosses the multi-segment boundary
 * doesn't visibly change tone between runs.
 */
export function commentForScore(score: number, scoredBeatCount: number): string {
  if (scoredBeatCount < 8) {
    return "Not enough data yet — keep playing!";
  }
  const grade = gradeForScore(score);
  if (grade === "S") {
    return score === 100
      ? "Flawless. You're a metronome yourself."
      : "Outstanding timing — near-perfect precision.";
  }
  if (grade === "A") return "Solid performance. Your timing is tight and consistent.";
  if (grade === "B") return "Good work! A few rough edges, but strong overall.";
  if (grade === "C") return "Decent foundation. Focus on evenness and you'll climb fast.";
  if (grade === "D") return "Getting there. Slow down and lock in with the click.";
  return "Keep at it — consistent practice builds timing muscle memory.";
}

/**
 * Re-score a `SessionReport`-shaped object using `computeLegacyScore`
 * and the matching grade. Used at every UI/coach boundary so the
 * displayed score is always derived from the same formula regardless of
 * which Rust branch produced the input. Pure — never mutates input.
 *
 * Generic over the report shape so this can be reused for:
 *   - Live mini-reports (`getSessionReport()` → `SessionReport`)
 *   - Saved history (`SavedSession.report`)
 *   - Anywhere else a report is rendered.
 */
export function rescoreReport<T extends RescorableFields & { grade: string; score: number }>(report: T): T {
  // Use the Rust segment-aware score when segments were recorded (signalled by
  // onsetEfficiency being defined on the report). After MAD_FIX_1 and WEIGHTS_1
  // the Rust formula is correct for guitar sessions. Fall back to
  // computeLegacyScore only for no-segment sessions (short warmups, old saved
  // sessions that pre-date the segment pipeline).
  const hasSegments =
    'onsetEfficiency' in report &&
    (report as unknown as { onsetEfficiency?: number }).onsetEfficiency !== undefined;
  const score = hasSegments ? report.score : computeLegacyScore(report);
  const grade = gradeForScore(score);
  if (score === report.score && grade === report.grade) {
    return report;
  }
  return { ...report, score, grade };
}

/**
 * Rolling average of hitCompleteness over the last `n` segments.
 * Returns undefined if fewer than `n` segments exist, or if none of
 * them carry a hitCompleteness value (old saved sessions).
 *
 * Used by the gatekeeper's `low_completeness` scenario to detect chronic
 * under-playing across multiple segments.
 */
export function computeRecentHitCompleteness(
  segments: SessionSegment[],
  n = 3,
): number | undefined {
  if (segments.length < n) return undefined;
  const last = segments.slice(-n);
  const values = last
    .map((s) => s.report.hitCompleteness)
    .filter((v): v is number => v !== undefined);
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
