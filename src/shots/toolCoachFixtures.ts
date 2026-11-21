/**
 * The tools' coach in the screenshot harness (leg c2a2,
 * `tests/layout/tool-coach.spec.ts`). Harness-only: nothing here ships.
 *
 * Asked for on the page's query string rather than as scenes, so any tool
 * scene (Metronome, Drill, a Setlist, a Jam, Progress) can carry it:
 *
 *   `?coachFeed=lowConf`  while the input is on and the click plays, one
 *                         `beat-feedback` per beat, its calibration confidence
 *                         at 0.3. The timing is steady and one beat in four is
 *                         missed, so nothing the gatekeeper ranks above the
 *                         low-confidence caveat has cause (no streak, no band
 *                         locked, no trend, no bias, no drop): after the warm-up
 *                         and thirty seconds below 0.5 the real gatekeeper fires
 *                         `low_confidence`, and the real intervention layer
 *                         hangs `calibration-retry` on it.
 *   `?coachReport=1`      `get_session_report` and `get_final_session_report`
 *                         answer a reportable run, `coach_generate` a sentence.
 *   `?toolFinding=K`      with `coachReport`, `close_open_segment` emits the
 *                         `practice-segment-ended` of a free-play run whose
 *                         `findings[0]` is of kind K (`subdivisionWeak`,
 *                         `beatPositionBias`, `tempoCeiling`, `drift`), as
 *                         `analyze_free_play` would rank it (leg c5c2).
 *   `?toolRuns=N`         `get_session_history` answers N saved runs.
 *   `?inputFail=1`        `start_evaluation` is refused, as with no input
 *                         device: Listen is on and says "Input off".
 */
import type { BeatFeedback, SavedSession, SessionReport } from "../types";
import type { Finding } from "../songs/types";

const params = () => new URLSearchParams(window.location.search);

export function coachFeedOption(): "lowConf" | null {
  return params().get("coachFeed") === "lowConf" ? "lowConf" : null;
}

export function coachReportOption(): boolean {
  return params().get("coachReport") === "1";
}

const FINDING_KINDS = ["subdivisionWeak", "beatPositionBias", "tempoCeiling", "drift"] as const;

export function toolFindingOption(): (typeof FINDING_KINDS)[number] | null {
  const k = params().get("toolFinding");
  return (FINDING_KINDS as readonly string[]).includes(k ?? "") ? (k as (typeof FINDING_KINDS)[number]) : null;
}

/** One free-play finding of `kind`, its numbers those of `findings.rs`'s fixtures. */
export function freePlayFinding(kind: (typeof FINDING_KINDS)[number]): Finding {
  const base = { onsets: 48, hits: 48, hitRate: 1, meanDeviationMs: 0, deviationBeats: 0, spreadMs: 0, passes: 1, passesAffected: 1 };
  const evidence: Finding["evidence"] =
    kind === "subdivisionWeak"
      ? { ...base, hits: 16, hitRate: 1 / 3, subdivision: 2, subdivisionPosition: [1, 2], hitRateDelta: -0.67, referenceBpm: 120 }
      : kind === "beatPositionBias"
        ? { ...base, onsets: 16, hits: 16, meanDeviationMs: 40, deviationBeats: 0.08, beatPosition: 3, referenceBpm: 120 }
        : kind === "tempoCeiling"
          ? { ...base, onsets: 20, hits: 20, spreadMs: 45, bpmBand: [100, 140], referenceBpm: 100 }
          : { ...base, onsets: 60, hits: 60, meanDeviationMs: 40, deviationBeats: 0.08, referenceBpm: 120 };
  return { kind, noteIds: [], severity: 0.8, evidence };
}

export function inputFailOption(): boolean {
  return params().get("inputFail") === "1";
}

export function toolRunsOption(): number {
  const n = Number(params().get("toolRuns") ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(30, Math.floor(n))) : 0;
}

/** Hit, hit, hit, miss: steady, centred on the beat, the confidence low. */
const LOW_CONF_DEVIATIONS: (number | null)[] = [3, -3, 2, null];

export function lowConfidenceFeedback(beatIndex: number): BeatFeedback {
  const dev = LOW_CONF_DEVIATIONS[beatIndex % LOW_CONF_DEVIATIONS.length];
  return {
    beatIndex,
    deviationMs: dev ?? 0,
    intervalErrorMs: dev === null ? 0 : 3,
    classification: dev === null ? "miss" : "good",
    amplitude: dev === null ? 0 : 0.2,
    calibrationOffsetMs: 0,
    calibrationConfidence: 0.3,
    gridCorrelation: 0.9,
  };
}

/** Thirty-two beats, twenty-eight heard: comfortably reportable (`isSegmentReportable`). */
export function reportableRun(score = 82, spread = 1): SessionReport {
  const deviations = Array.from({ length: 28 }, (_, i) => Math.round((((i * 7) % 11) - 5) * 2.4 * spread));
  return {
    totalBeats: 32,
    hitsCount: 28,
    missCount: 4,
    skippedBeats: 0,
    perfectCount: 12,
    goodCount: 12,
    okCount: 4,
    meanDeviationMs: 3.1,
    stdDeviationMs: 9.4 * spread,
    meanAbsDeviationMs: 7.6 * spread,
    meanIntervalErrorMs: 6.2,
    grade: "B",
    score,
    deviations,
    dynamicsStd: 0.05,
    meanAmplitude: 0.2,
    tempoStabilityMs: 5.5,
    longestStreak: 14,
    comment: "",
    insights: [],
    gridCorrelation: 0.9,
    onsetEfficiency: 0.92,
    hitCompleteness: 0.88,
    intervalConsistency: 0.84,
    gridAlignment: 0.81,
    playMode: "structured",
    subdivision: 1,
  };
}

export const COACH_REPORT_SENTENCE =
  "Even spacing through most of that run; the last two bars leaned a touch early, so keep the third beat where it lands.";

const DAY = 24 * 60 * 60 * 1000;
const PRESETS = ["Warm-up 4/4", "Sixteenths at 90", "Shuffle groove", "Odd meter 7/8", "Speed ramp"];

/** `n` saved runs over the last days, newest first, the first with two stretches. */
export function toolRunsHistory(n: number): SavedSession[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const timestamp = now - (i === 0 ? 2 * 60 * 60 * 1000 : i * DAY + (i % 2) * 3 * 60 * 60 * 1000);
    const bpm = 80 + ((i * 7) % 30);
    const report = reportableRun(88 - i * 6, 1 + i * 0.2);
    return {
      id: `shot-run-${i}`,
      timestamp,
      bpm,
      timeSignature: 4,
      report,
      presetName: PRESETS[i % PRESETS.length],
      segments:
        i === 0
          ? [
              { report: reportableRun(84), bpm, timeSignature: 4, startTime: timestamp, endTime: timestamp + 95_000 },
              { report: reportableRun(91, 0.8), bpm: bpm + 5, timeSignature: 4, startTime: timestamp + 120_000, endTime: timestamp + 240_000 },
            ]
          : undefined,
    };
  });
}
