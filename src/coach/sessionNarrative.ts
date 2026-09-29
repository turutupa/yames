/**
 * Human-readable interpretation of a `SessionReport`.
 *
 * The Rust side already emits a `comment` (grade-based one-liner) and
 * `insights` (rule-based observations). They're useful but they don't
 * explain the *relationship* between the score and the underlying
 * components — so a 65 that's "consistent but scattered" reads the
 * same as a 65 that's "wildly inconsistent on a few good beats." This
 * module produces a 1–3 sentence narrative that:
 *
 *   * Anchors the score in plain English ("solid foundation", "needs
 *     work on evenness").
 *   * Calls out what's *actually working* (consistency, streak,
 *     centered timing) so the user doesn't read a 65 as a failure when
 *     they were tight but a touch scattered.
 *   * Names the *one thing* to focus on next, in concrete terms.
 *   * Adds a caveat when the input itself looks suspicious (very quiet
 *     mean amplitude, almost no scored beats) so users with audio
 *     setup issues aren't blamed for "timing problems" they didn't have.
 *
 * Pure function, no React / Tauri dependencies — fully unit-testable.
 */

import type { SessionReport } from "../types";
import { accuracyRatio, bandForScore, scoredBeats } from "./reportStats";

/**
 * Output shape. Consumers can render each field independently (e.g. a
 * larger headline + smaller body) or join them with spaces / newlines.
 *
 *   * `headline` is always present and is the "what does this score
 *     actually mean" sentence.
 *   * `praise` is optional — only present when there's something
 *     genuinely working ("your timing barely varies", "30-beat streak").
 *   * `focus` is optional — the single most actionable thing to improve.
 *   * `caveat` is optional — surfaces audio/data-quality red flags.
 */
export interface SessionNarrative {
  headline: string;
  praise?: string;
  focus?: string;
  caveat?: string;
}

// ─── Tunable thresholds ─────────────────────────────────────────────
// All numbers picked to match the Rust-side insight thresholds in
// `session.rs::generate_insights` so the JS narrative and the Rust
// insights agree on what "consistent" or "scattered" means.

/** Below this many scored beats we treat the report as untrustworthy. */
const MIN_RELIABLE_SCORED_BEATS = 8;
/** Below this mean amplitude (0–1 linear) the signal is suspiciously quiet. */
const QUIET_INPUT_AMPLITUDE = 0.03; // ≈ −30 dBFS
/** Tight consistency band (std deviation, ms). */
const TIGHT_CONSISTENCY_MS = 12;
/** Loose consistency band — beyond this, timing is genuinely scattered. */
const LOOSE_CONSISTENCY_MS = 25;
/** Tempo stability under this = locked-in spacing. */
const TIGHT_TEMPO_STABILITY_MS = 8;
/** Beyond this = audibly uneven spacing. */
const LOOSE_TEMPO_STABILITY_MS = 30;
/** Bias direction is noticeable from this many ms onward. */
const BIAS_NOTICEABLE_MS = 5;
/** "Strong streak" floor for callouts. */
const STRONG_STREAK = 16;
/** Hit-rate cutoffs (fraction). */
const HIGH_HIT_RATE = 0.85;
const LOW_HIT_RATE = 0.55;

// ────────────────────────────────────────────────────────────────────

/**
 * Build a `SessionNarrative` from a `SessionReport`.
 *
 * The headline is anchored on the score band but qualified by the
 * underlying components so two sessions with the same score but
 * different "shapes" produce different narratives:
 *
 *   * 65 with std=10ms ("very consistent, just slightly scattered")
 *   * 65 with std=35ms ("foundation is there, evenness is the work")
 */
export function buildSessionNarrative(report: SessionReport): SessionNarrative {
  const scored = scoredBeats(report);
  const hitFrac = accuracyRatio(report);
  const score = report.score;
  const stdMs = report.stdDeviationMs;
  const tempoMs = report.tempoStabilityMs;
  const absDev = report.meanAbsDeviationMs;
  const bias = report.meanDeviationMs;
  const streak = report.longestStreak;
  const skipped = report.skippedBeats;
  const meanAmp = report.meanAmplitude;
  const perfectRatio = report.hitsCount > 0
    ? report.perfectCount / report.hitsCount
    : 0;

  // ── Too little data ────────────────────────────────────────────
  if (scored < MIN_RELIABLE_SCORED_BEATS) {
    return {
      headline:
        "Not enough scored beats to read much into the numbers — play a longer pass and we'll get a real picture.",
      caveat: meanAmp < QUIET_INPUT_AMPLITUDE
        ? "Your input is very quiet — open Settings → Audio Test and check the sensitivity slider."
        : undefined,
    };
  }

  // ── Quiet-input caveat (shared across all branches) ───────────
  // Surfaced when the average detected onset amplitude was below the
  // QUIET_INPUT_AMPLITUDE threshold. This is a real "your scores
  // might not reflect your playing" red flag, so we attach it to
  // every narrative below, not just the low-score ones.
  const quietCaveat = meanAmp < QUIET_INPUT_AMPLITUDE
    ? `Your input was very quiet (avg ≈ ${(meanAmp * 100).toFixed(1)}% of full scale) — the DSP may have missed real hits. Check Settings → Audio Test and bump the sensitivity.`
    : undefined;

  // ── Score-band headlines, with shape-aware qualifiers ─────────
  let headline = "";

  // The band boundaries are `reportStats.bandForScore` — the same ones
  // the letter grade, the end-report's one-word qualifier and the score
  // ring use, so a session never gets two readings (ROADMAP 1.7,
  // P3-COACH-3). What is said inside each band is this module's own
  // business, and the shape-aware branches below are the point of it.
  const band = bandForScore(score);
  if (band === "flawless") {
    headline = "Near-perfect — your timing is essentially indistinguishable from the click.";
  } else if (band === "strong") {
    headline = "Strong session — tight, consistent, and accurate.";
  } else if (band === "solid") {
    if (stdMs <= TIGHT_CONSISTENCY_MS) {
      headline = `${score} is a solid score, and your consistency is excellent — you're closer to an A than the number suggests.`;
    } else {
      headline = `${score} is a real foundation. Your hits are landing, just not always cleanly on the grid.`;
    }
  } else if (band === "fair") {
    if (stdMs <= TIGHT_CONSISTENCY_MS) {
      headline = `${score} looks middling, but your spacing is actually very tight — most of the drop is scatter from the grid, not lost consistency. A few cleaner passes and this jumps to 80+.`;
    } else if (hitFrac >= HIGH_HIT_RATE) {
      headline = `${score} is mostly an accuracy problem — you're hitting almost every beat, just a bit loose around the click.`;
    } else {
      headline = `${score} — the foundation is there, but timing varies enough between beats that it's pulling the score down.`;
    }
  } else if (band === "building") {
    headline = `${score} — work in progress. Most beats are landing, but the spread is wide; slow the tempo down and lock in.`;
  } else {
    headline = `${score} — early days for this passage. Try a slower BPM and shorter loops to build the muscle memory first.`;
  }

  // ── Praise: pick the strongest genuine positive ───────────────
  // Priorities matter — we want to surface the most informative
  // praise, not all of them. A 32-beat streak is more interesting
  // than "centered timing", which is more interesting than perfect
  // ratio. One praise line keeps the narrative compact.
  let praise: string | undefined;
  if (streak >= STRONG_STREAK) {
    praise = `Highlight: ${streak} beats in a row without a miss.`;
  } else if (stdMs < TIGHT_CONSISTENCY_MS && tempoMs < TIGHT_TEMPO_STABILITY_MS) {
    praise = `Your internal clock is rock solid — spacing varied by only ±${tempoMs.toFixed(1)} ms.`;
  } else if (stdMs < TIGHT_CONSISTENCY_MS) {
    praise = `Your consistency is tight — timing barely varied (±${stdMs.toFixed(1)} ms).`;
  } else if (perfectRatio > 0.6 && report.hitsCount >= 12) {
    praise = `${Math.round(perfectRatio * 100)}% of your hits were "perfect" (within 10 ms of the click).`;
  } else if (Math.abs(bias) < BIAS_NOTICEABLE_MS && report.hitsCount >= 12) {
    praise = "Your timing is centered — no rushing or dragging bias.";
  }

  // ── Focus: the single thing to work on next ────────────────────
  // Picked by what's MOST dragging the score down: scatter (std) >
  // tempo stability > bias > hit rate. One focus line.
  let focus: string | undefined;
  if (stdMs > LOOSE_CONSISTENCY_MS) {
    focus = "Focus next: evenness. Your timing swings ± a lot from beat to beat — try short, repeatable phrases at a slower tempo until the spread tightens.";
  } else if (tempoMs > LOOSE_TEMPO_STABILITY_MS) {
    focus = "Focus next: spacing. The gap between your hits is uneven — count subdivisions out loud or set a finer click subdivision to anchor the pulse.";
  } else if (bias > BIAS_NOTICEABLE_MS * 2) {
    focus = `Focus next: you're dragging an average of ${bias.toFixed(0)} ms behind the click — push a touch forward in the beat.`;
  } else if (bias < -BIAS_NOTICEABLE_MS * 2) {
    focus = `Focus next: you're rushing an average of ${Math.abs(bias).toFixed(0)} ms ahead — let the click breathe.`;
  } else if (hitFrac < LOW_HIT_RATE) {
    focus = `Focus next: more than half your beats weren't registering as hits. Either the audio is too quiet, or you're playing fewer notes than the grid expects.`;
  } else if (absDev > 20 && score < 80) {
    focus = `Focus next: you're an average of ${absDev.toFixed(0)} ms off the click. Slow down ~10 BPM and rebuild from there.`;
  }

  // ── Note about skipped beats (no-activity, not played) ─────────
  // Only surface when skipped is a meaningful fraction — small skip
  // counts during natural rests aren't actionable feedback.
  let skipNote: string | undefined;
  if (skipped > 0 && skipped >= report.totalBeats * 0.2) {
    skipNote = `${skipped} beats had no detected sound — long rests, or the input dropped out. Don't worry about those for scoring.`;
  }

  return {
    headline,
    praise,
    focus,
    caveat: quietCaveat ?? skipNote,
  };
}
