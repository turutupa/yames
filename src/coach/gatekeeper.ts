/**
 * C4 — Smart Coaching Timing (Heuristic Gatekeeper).
 *
 * The "architectural heart" of the coach: a cheap, deterministic
 * state machine that runs every N beats and decides:
 *
 *   1. Is a comment warranted right now?
 *   2. If so, what scenario tag is it?
 *   3. Which channel (spoken or written) gets it?
 *
 * The gatekeeper is the WHEN. C5 templates + LLM paraphrasing
 * decide WHAT.
 *
 * Design constraints from the plan:
 *
 *   - **Pure state.** No React, no Tauri. Immutable state in, new
 *     state out. Trivially unit-testable.
 *   - **Per-channel cooldowns.** Spoken cooldown:
 *     `min(60s, max(20s, sinceStart × 0.1))`. Written cooldown:
 *     `min(10s, max(3s, sinceStart × 0.05))`. Channels are
 *     independent — written can run hot while spoken stays quiet.
 *   - **Always-speak overrides.** Milestones, boundary events
 *     (Signal A / Signal B), and interventions bypass the spoken
 *     cooldown. Streak suppression mid-segment also exempts these.
 *   - **Streak suppression mid-segment only.** While accuracy ≥ 85%
 *     for ≥ 16 beats, suppress *spoken* events (writes still flow)
 *     EXCEPT the always-speak overrides above.
 *   - **Adaptive cooldown floor.** 5 minutes of continuous active
 *     play without a spoken event → low-priority `check_in` event.
 *   - **Drill staleness.** Comments tagged with a BPM are dropped if
 *     the current BPM has moved by > 5 since the comment was generated.
 *   - **User-typed reset.** When the user types in chat, all
 *     cooldowns reset (engagement signal).
 */

import type { BeatFeedback } from "../types";
import { scaled, tierFor, type CoachStance } from "./learningMode";

// ---------------------------------------------------------------------------
// Constants — exposed for tests and tuning.
// ---------------------------------------------------------------------------

/** Hard floor on spoken-channel cooldown. */
export const SPOKEN_COOLDOWN_FLOOR_MS = 20_000;
/** Hard ceiling on spoken-channel cooldown. */
export const SPOKEN_COOLDOWN_CEILING_MS = 60_000;

/**
 * Hard floor on written-channel cooldown.
 *
 * History:
 *   - 3s (original): nearly decorative — bursts only stopped at 3/30s.
 *   - 8s (2026-05-17): bought a single bar of breathing room at 120 BPM
 *     but still allowed 3 corrective tips inside the burst-short window.
 *   - 18s (2026-05-18): paired with the new `CORRECTIVE_CHANNEL_COOLDOWN_MS`
 *     to address player feedback that even with the 8s floor, written
 *     tips of DIFFERENT corrective scenarios (drift_early → drop →
 *     drift_late) chained inside 20–30 seconds. At 18s the floor
 *     guarantees ≥ 25 beats between any two written tips at 85 BPM
 *     (one slow bar of 16ths). The corrective-channel cooldown gates
 *     contradictory tips on top of this; the burst limiter still
 *     handles sustained chatty stretches.
 */
export const WRITTEN_COOLDOWN_FLOOR_MS = 18_000;
/** Hard ceiling on written-channel cooldown.
 *
 * Bumped 10s → 30s on 2026-05-18 so the adaptive scaling
 * (`sinceStart × 0.05`) actually has headroom — at the old 10s ceiling
 * the formula clamped before it could meaningfully lengthen pauses on
 * long sessions. 30s lines up with the corrective-channel cooldown so
 * "calm" sessions feel calm and "chatty" sessions still get debounced. */
export const WRITTEN_COOLDOWN_CEILING_MS = 30_000;

/** Adaptive cooldown floor: spoken silence that triggers `check_in`. */
export const CHECK_IN_AFTER_QUIET_MS = 5 * 60 * 1000;

/** Drill staleness: drop tagged comment if BPM moved by more than this. */
export const DRILL_STALENESS_BPM = 5;

/**
 * Streak suppression: when last-N beats hit rate ≥ this and length
 * ≥ STREAK_MIN_LEN, spoken comments are suppressed unless the
 * scenario is an always-speak override.
 */
export const STREAK_SUPPRESSION_HIT_RATE = 0.85;
export const STREAK_SUPPRESSION_MIN_LEN = 16;

/** Accuracy-drop trigger thresholds.
 *
 * Bumped 0.20 → 0.25 on 2026-05-18 after player feedback that the old
 * 20% delta over a single 16-beat window fired on any temporary
 * stumble. The new 25% delta paired with `ACCURACY_DROP_CONFIRMATIONS`
 * (require two consecutive detections before emitting) means the
 * scenario only fires when the drop is both larger AND sustained.
 * Pairs with the new 60s per-scenario cooldown (was 25s) so even a
 * confirmed drop can't re-fire chattily.
 */
export const ACCURACY_DROP_DELTA = 0.25;
export const ACCURACY_DROP_WINDOW = 16;
/**
 * Number of consecutive evaluations that must detect a drop before
 * the scenario is emitted. Mirrors `TREND_CONFIRMATION_REQUIRED` — a
 * one-shot dip is a stumble, two in a row is a real slip.
 *
 * The counter is held in `GatekeeperState.accuracyDropConfirmations`,
 * incremented when a drop is detected, reset when a non-drop
 * evaluation runs. Detector returns a sub-threshold "pending" state
 * for the first detection so the caller can still update the counter
 * without committing an event.
 */
export const ACCURACY_DROP_CONFIRMATIONS = 2;
/**
 * Minimum number of attempted (hits + miss) beats required in BOTH
 * the prior and recent windows before `detectAccuracyDrop` will fire.
 *
 * Without this floor a single ticked-but-not-played bar (window full
 * of `skipped` classifications) read as 0% accuracy, which paired
 * with a hot prior window tripped the 20% delta and emitted a
 * "Rough patch at 0% — ease the tempo down…" tip seconds into the
 * session. Half-window is enough to compute a statistically
 * meaningful rate without demanding the player attempts every tick.
 */
export const ACCURACY_DROP_MIN_SCORED = ACCURACY_DROP_WINDOW / 2;

const LOW_COMPLETENESS_THRESHOLD = 0.50;

/** Rushing/dragging trend thresholds. */
export const TREND_OFFSET_THRESHOLD_MS = 5;
export const TREND_PRIOR_NEUTRAL_MS = 2;
export const TREND_CONFIRMATION_REQUIRED = 2;

/**
 * Bias-only detection thresholds.
 *
 * `bias_only` fires when the player has a CONSISTENT signed offset
 * (|mean| > threshold) but LOW scatter (σ < std threshold). High
 * scatter means jitter — a different problem addressed by the trend
 * detectors. Low scatter with a large mean means the player is
 * accurate but calibrated slightly off the grid.
 */
export const BIAS_MEAN_THRESHOLD_MS = 12;
export const BIAS_STD_THRESHOLD_MS = 15;
/** Min hit count in the analysis window before bias can fire. */
export const BIAS_MIN_HITS = ACCURACY_DROP_WINDOW / 2;

/**
 * Personal-best streak: min beats AND must beat session best.
 *
 * Bumped from 8 → 24 on 2026-05-17. At 8 the detector fired as soon as
 * the player strung together a measure of 4/4 quarters (~4s) — then
 * re-fired every beat the streak grew past the previous best (8 → 9 →
 * 10 → 11 ...). At 16ths that produced 5+ "Picking's locked / Streak
 * holding / Clean run going" tips in 10 seconds. 24 beats is one bar of
 * 16ths or six bars of quarters — a meaningfully sustained passage.
 *
 * Paired with `STREAK_PERSONAL_BEST_GROWTH` below: re-fires now require
 * beating the previous best by a meaningful margin, not just one beat.
 */
export const STREAK_PERSONAL_BEST_MIN = 24;

/**
 * Minimum margin by which a new streak must beat the existing best
 * before re-firing the `personal_best_streak` scenario. Without this
 * the detector fired on every single-beat improvement (8 → 9 → 10).
 * 8 beats ≈ one bar of 8ths, so consecutive fires now reflect a real
 * jump in performance, not the streak counter ticking up.
 */
export const STREAK_PERSONAL_BEST_GROWTH = 8;

/** New-band-locked: sustained accuracy ≥ this for at least this long. */
export const NEW_BAND_ACCURACY = 0.85;
export const NEW_BAND_DURATION_MS = 60_000;

/**
 * First-N-beats hard rule from the plan's "Hard gatekeeper rules for
 * TTS": "No TTS during the first 4 beats of any segment (let the
 * player settle in)." Spoken events fired while the segment is fresh
 * are demoted to the written channel so they still land in the feed
 * — just silently.
 *
 * Signal A (user-initiated settings change) is exempt: it's the
 * acknowledgement of the player's own input, suppressing it would
 * undermine the "always has something to say" principle.
 */
export const FIRST_BEATS_TTS_FLOOR = 4;

/**
 * Low-confidence caveat thresholds (one-shot per session, per plan
 * OQ5 + C4 events table): "If D2 mean confidence < 0.5 for 30s,
 * coach mentions unclear signal."
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const LOW_CONFIDENCE_SUSTAIN_MS = 30_000;

/**
 * Burst limiter — "if it already has said several comments in a row
 * it should shut up for a while unless completely necessary to chime
 * in" (player feedback, 2026-05-17).
 *
 * Two tiers operate together:
 *   - Short burst: ≥ BURST_SHORT_MAX fires within BURST_SHORT_WINDOW_MS
 *     → require BURST_SHORT_PENALTY_MS of silence from the most recent
 *     fire before any new tip may emit.
 *   - Long burst: ≥ BURST_LONG_MAX fires within BURST_LONG_WINDOW_MS
 *     → require BURST_LONG_PENALTY_MS of silence.
 *
 * `ALWAYS_SPOKEN` scenarios (boundary events, milestones, recovery,
 * fatigue, new_band_locked) bypass the limiter — those represent
 * genuinely necessary chime-ins. (Note: `personal_best_streak` used
 * to be in this set but was demoted on 2026-05-17 — see the comment
 * on `ALWAYS_SPOKEN` below.)
 */
export const BURST_SHORT_WINDOW_MS = 30_000;
export const BURST_SHORT_MAX = 3;
export const BURST_SHORT_PENALTY_MS = 45_000;

export const BURST_LONG_WINDOW_MS = 60_000;
export const BURST_LONG_MAX = 5;
export const BURST_LONG_PENALTY_MS = 90_000;

/**
 * Alive-tick interval during a drill ramp. Even while `DRILL_RAMP_ACTIVE`
 * suppresses regular tips, a short "still tracking" may still slip through
 * once this interval has elapsed since the last spoken event — so long
 * silence during a long ramp doesn't feel broken.
 */
export const DRILL_RAMP_ALIVE_TICK_MS = 90_000;

/**
 * Warmup grace — give the player a quiet runway at the start of a
 * session and after any tempo/exercise change. Player feedback
 * (2026-05-17): "what if a user is just 'warming up' not necessarily
 * in the session but in that given exercise... you gotta be lenient
 * in the beginning for the player to get used to the newly set
 * tempo."
 *
 * During the warmup window, non-ALWAYS_SPOKEN scenarios are
 * suppressed. The session start sets a 15s warmup automatically;
 * `bumpWarmup` can extend it by 10s when the user changes settings.
 */
/**
 * Bumped from 15s → 30s on 2026-05-17 — the 15s window let
 * `personal_best_streak` fire almost immediately on any decent player
 * (which is the worst kind of "premature" tip — congratulating them
 * for breathing). 30s gives the player time to settle into a tempo
 * before the coach has any opinion at all.
 */
export const WARMUP_GRACE_MS = 30_000;
export const WARMUP_GRACE_TEMPO_MS = 10_000;

/**
 * Repetition suppression — "we don't wanna give something like GREAT,
 * bad, bad, GREAT! that's just not meaningful" (player feedback,
 * 2026-05-17). When the most recently fired scenario tag would repeat
 * back-to-back, suppress unless it's ALWAYS_SPOKEN. The history is
 * capped at REPETITION_HISTORY_MAX entries so the gate stays cheap.
 */
export const REPETITION_HISTORY_MAX = 3;

/**
 * Where `preset_ceiling_hit` stops and the pace line takes over
 * (ROADMAP 1.7, P1-COACH-3 and P1-DSP-3).
 *
 * `presetAwareness` will name a ceiling band after three sessions have
 * stalled in it. Three is enough to say "you have been here before".
 * It is not enough to prescribe: a player who has tried a tempo three
 * times is still trying it, and a coach that starts planning around a
 * pattern that young is guessing.
 *
 * So the two split at four. Up to and including three attempts the
 * coach makes the observation and nothing more — this scenario. From
 * the fourth, `useRealtimeTips` fires `pace_coaching` instead, which
 * suggests dropping a band and building back. Exactly one of them can
 * fire for a given band, and the player never hears both.
 */
export const PRESET_CEILING_MAX_SESSIONS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScenarioTag =
  | "accuracy_drop"
  | "low_completeness"
  | "personal_best_streak"
  | "rushing_trend"
  | "dragging_trend"
  | "recovery"
  | "recovery_confirmed"
  | "fatigue"
  | "bias_only"
  | "tempo_milestone"
  | "new_band_locked"
  | "low_confidence"
  | "check_in"
  | "boundary_signal_a"
  | "boundary_signal_b"
  | "grid_discontinuity"
  | "ramp_complete"
  | "preset_ceiling_hit";

export type Tier = "spoken" | "written";

export type GatekeeperEvent = {
  scenario: ScenarioTag;
  tier: Tier;
  /**
   * Structured context for the content layer (C5 templates +
   * optional LLM paraphrase). The keys are scenario-specific but
   * always JSON-serializable for telemetry.
   */
  context: Record<string, number | string | boolean>;
  /**
   * BPM at the moment the event was generated. Used by
   * `shouldDropForStaleness` so drill-ramp comments don't land
   * stale ("rushing at 130" landing at 145).
   */
  taggedBpm: number;
};

/**
 * Persistent state across evaluation calls. Treat as immutable —
 * every `evaluate(...)` returns a new state. Keep the shape flat
 * to keep React-friendly equality cheap.
 */
export type GatekeeperState = {
  sessionStartMs: number;
  /** Wall-clock ms of last spoken event (any scenario). */
  lastSpokenMs: number;
  /** Wall-clock ms of last written event (any scenario). */
  lastWrittenMs: number;
  /** Per-scenario last-fire times for per-scenario cooldowns. */
  lastEventMs: Partial<Record<ScenarioTag, number>>;
  /**
   * Rolling confirmations of pending trend scenarios. Trends require
   * two consecutive confirmations before escalating to spoken.
   */
  trendConfirmations: { rushing: number; dragging: number };
  /**
   * Rolling confirmations of the accuracy-drop detector. The drop has
   * to show up on `ACCURACY_DROP_CONFIRMATIONS` consecutive evaluations
   * before the scenario is emitted — a single stumble bumps the
   * counter but doesn't fire. Reset to 0 whenever a non-drop evaluation
   * runs OR when the detector emits.
   */
  accuracyDropConfirmations: number;
  /** Best clean-streak the gatekeeper has seen this session. */
  bestStreak: number;
  /** Latest BPM band low ("locked-in" band detection). */
  lockedBpmLow: number | null;
  /** When current band was first observed continuously at ≥ 85%. */
  bandLockedSinceMs: number | null;
  /**
   * Wall-clock ms when mean confidence first dropped below
   * `LOW_CONFIDENCE_THRESHOLD`. Cleared when confidence recovers. The
   * caveat fires once when this has been set for ≥ 30s; subsequent
   * dips don't re-fire (one-shot per session).
   */
  lowConfidenceSinceMs: number | null;
  /**
   * Timestamps (wall-clock ms) of recently committed events of any
   * tier. Used by the burst limiter to detect when the coach has been
   * chatty and back off. Entries older than `BURST_LONG_WINDOW_MS` are
   * pruned on every commit so the array stays small.
   */
  recentFireTimes: number[];
  /**
   * Until this wall-clock ms, non-ALWAYS_SPOKEN scenarios are
   * suppressed (warmup grace). Set on session start and re-armed by
   * `bumpWarmup` whenever the player changes tempo / preset / drill.
   */
  warmupUntilMs: number;
  /**
   * Scenario + tier of the most recent commits, newest LAST. Used by
   * the repetition gate to suppress immediate scenario duplicates
   * ("bad, bad" pattern) while still allowing the trend-confirmation
   * rule's written→spoken escalation (same scenario but different
   * tier is meaningful, not repetitive). Capped at
   * `REPETITION_HISTORY_MAX`.
   */
  recentScenarios: Array<{ scenario: ScenarioTag; tier: Tier }>;
  /**
   * True after `accuracy_drop` or `fatigue` fires; reset when
   * `recovery_confirmed` fires. Gates the once-per-cycle rule for
   * recovery confirmations: the coach only says "got it back" once per
   * corrective tip cycle, not on every clean beat.
   */
  awaitingRecovery: boolean;
};

export type GatekeeperContext = {
  /** Wall-clock now (ms). */
  now: number;
  /** Current BPM at evaluation time. */
  bpm: number;
  /** Sliding window of recent BeatFeedback. Newest LAST. */
  window: BeatFeedback[];
  /** Whether the user is currently in a streak-suppression state. */
  inStreak?: boolean;
  /**
   * Number of beats elapsed since the current segment started.
   * Resets on Signal A (settings change) and Signal B (activity gap
   * → new segment). Used to enforce the "no TTS in first 4 beats"
   * hard rule from the plan. When omitted, the rule is bypassed —
   * useful for tests and historical compatibility.
   */
  beatsInSegment?: number;
  /**
   * If the caller has a strong reason to FORCE a scenario (boundary
   * events from Signal A / B), pass it here. Forced events bypass
   * the cooldown and streak suppression.
   */
  force?: { scenario: ScenarioTag; context: Record<string, number | string | boolean> };
  /**
   * True while a drill ramp is actively stepping BPM toward the target
   * (not at steady target). When true the `DRILL_RAMP_ACTIVE` preempt
   * suppresses non-critical tips. Defaults to false when omitted.
   */
  inDrillRamp?: boolean;
  /**
   * User-tunable coaching verbosity level. Defaults to `"default"` when
   * omitted.
   *   - `"less"` — zero organic tips emitted; only forced boundary events
   *     (Signal A/B) still fire. Equivalent to "silent" coaching mode.
   *   - `"default"` — standard cooldown envelope (current behaviour).
   *   - `"more"` — cooldowns scaled × 0.6, so tips fire ~40% more often.
   */
  verbosity?: "less" | "default" | "more";
  /**
   * Rolling average hitCompleteness over the last 3 segments.
   * Absent when fewer than 3 segments have been recorded.
   * Used by the `low_completeness` scenario detector.
   */
  recentHitCompleteness?: number;
  /**
   * The tempo band this preset has historically stalled in, from
   * `presetAwareness.detectBpmCeiling` via `detectRecurringIssues`, or
   * absent when the preset has not crossed the three-session gate.
   *
   * Supplied by the session layer at session start and left alone
   * afterwards — it is a fact about the player's history, not about
   * this session. The gatekeeper only compares it against the tempo
   * being played. See `PRESET_CEILING_MAX_SESSIONS` for where this
   * scenario stops and the pace line takes over.
   */
  presetCeiling?: {
    bpmLow: number;
    bpmHigh: number;
    sessions: number;
    medianScore: number;
  };
  /**
   * How hard the coach is on the player (ROADMAP 1.5). `"learning"`
   * widens every tolerance below by `LEARNING_WINDOW_SCALE` and demotes
   * corrections out of the spoken channel. Defaults to `"strict"` —
   * today's behaviour — when omitted. Never affects a score; see
   * `learningMode.ts`.
   */
  stance?: CoachStance;
};

// ---------------------------------------------------------------------------
// Cooldown math
// ---------------------------------------------------------------------------

/**
 * Cooldown duration for the spoken channel, given elapsed session
 * time. Formula:
 *     min(60s, max(20s, sinceStart × 0.1))
 *
 * Short sessions stay at the 20s floor; long sessions climb toward
 * the 60s ceiling so the coach doesn't natter once the user is
 * settled in.
 */
export function spokenCooldownMs(
  sinceSessionStartMs: number,
  verbosity?: "less" | "default" | "more",
): number {
  const scaled = sinceSessionStartMs * 0.1;
  const base = Math.min(
    SPOKEN_COOLDOWN_CEILING_MS,
    Math.max(SPOKEN_COOLDOWN_FLOOR_MS, scaled),
  );
  return verbosity === "more" ? base * 0.6 : base;
}

/**
 * Cooldown duration for the written channel. Same shape, shorter
 * envelope — written notes can run hot.
 */
export function writtenCooldownMs(
  sinceSessionStartMs: number,
  verbosity?: "less" | "default" | "more",
): number {
  const scaled = sinceSessionStartMs * 0.05;
  const base = Math.min(
    WRITTEN_COOLDOWN_CEILING_MS,
    Math.max(WRITTEN_COOLDOWN_FLOOR_MS, scaled),
  );
  return verbosity === "more" ? base * 0.6 : base;
}

/**
 * Drill staleness check. Comments referencing a specific BPM are
 * stale if the current BPM has drifted by more than
 * `DRILL_STALENESS_BPM` since the comment was tagged.
 */
export function shouldDropForStaleness(
  taggedBpm: number | undefined,
  currentBpm: number,
): boolean {
  if (taggedBpm === undefined) return false;
  return Math.abs(currentBpm - taggedBpm) > DRILL_STALENESS_BPM;
}

// ---------------------------------------------------------------------------
// Construction + reset
// ---------------------------------------------------------------------------

export function createGatekeeper(sessionStartMs: number): GatekeeperState {
  return {
    sessionStartMs,
    lastSpokenMs: sessionStartMs,
    lastWrittenMs: sessionStartMs,
    lastEventMs: {},
    trendConfirmations: { rushing: 0, dragging: 0 },
    accuracyDropConfirmations: 0,
    bestStreak: 0,
    lockedBpmLow: null,
    bandLockedSinceMs: null,
    lowConfidenceSinceMs: null,
    recentFireTimes: [],
    warmupUntilMs: sessionStartMs + WARMUP_GRACE_MS,
    recentScenarios: [],
    awaitingRecovery: false,
  };
}

/**
 * True when we're still in the INITIAL warmup window — the first
 * `WARMUP_GRACE_MS` after session start, before any tempo-change
 * `bumpWarmup` or boundary-signal re-arm could have extended it.
 *
 * The generic `state.warmupUntilMs` check doesn't distinguish "first
 * 30s of session" from "30s after a mid-session tempo change", but
 * the player experience differs:
 *   - At session start they want pure silence to warm up — no spoken
 *     tips, including ALWAYS_SPOKEN ones and forced boundary signals.
 *   - At a mid-session tempo change they want the boundary
 *     acknowledged ("Bumped to 130 BPM — let's go") because they just
 *     initiated the change.
 *
 * Used by `evaluate` to demote forced spoken events to written when
 * the session is still in its initial warmup runway.
 */
export function isInInitialWarmup(
  state: GatekeeperState,
  now: number,
): boolean {
  return now < state.sessionStartMs + WARMUP_GRACE_MS;
}

/**
 * Extend the warmup grace window. Called from the session layer when
 * the player changes tempo, picks a different preset, or otherwise
 * starts a fresh exercise — give them a brief quiet runway to settle
 * in before the coach starts critiquing. Idempotent / monotonic: only
 * pushes `warmupUntilMs` forward, never pulls it back.
 */
export function bumpWarmup(
  state: GatekeeperState,
  now: number,
  durationMs: number = WARMUP_GRACE_TEMPO_MS,
): GatekeeperState {
  const candidate = now + durationMs;
  if (candidate <= state.warmupUntilMs) return state;
  return { ...state, warmupUntilMs: candidate };
}

/**
 * Reset cooldowns. Called when the user types in chat — engagement
 * signal that says "keep talking, I'm listening." Trend confirmations
 * and best-streak knowledge stick around.
 */
export function resetCooldowns(
  state: GatekeeperState,
  now: number,
): GatekeeperState {
  return {
    ...state,
    lastSpokenMs: now - SPOKEN_COOLDOWN_FLOOR_MS,
    lastWrittenMs: now - WRITTEN_COOLDOWN_FLOOR_MS,
  };
}

// ---------------------------------------------------------------------------
// Always-speak override matrix
// ---------------------------------------------------------------------------

/**
 * 2026-05-17 — `personal_best_streak` removed from this set.
 *
 * Player feedback: "[personal_best_streak] fired ~7s into a session, before
 * I'd even warmed up. positive comments should only show up when there's
 * been a silence for some time, just to give feedback to the user that they
 * are doing good, not something you say 3s in."
 *
 * Promoting PB to always-spoken meant it bypassed the 30s warmup, the burst
 * limiter, the repetition gate, AND the channel cooldowns. With
 * `STREAK_PERSONAL_BEST_MIN = 24` achievable in ~4.5s at 16ths/80bpm, that
 * combo guaranteed a "Picking's locked" tip before the player had time to
 * settle in. Demoting it to a regular scenario means:
 *   - 30s warmup gate now applies → no premature congratulation
 *   - Burst limiter applies → won't pile up with trends + accuracy_drop
 *   - Spoken cooldown applies → guarantees the "silent runway" the user
 *     described — at least 20–60s of coach silence before PB lands
 *   - Per-scenario 60s cooldown + growth gate still cap re-fires
 *
 * The other entries here remain ALWAYS_SPOKEN because they're either user-
 * initiated (boundary signals), milestone events the player explicitly
 * wants to hear, or interventions that exist precisely to break silence
 * when the player needs help (recovery, fatigue) or has earned a milestone
 * (tempo_milestone, new_band_locked — and `new_band_locked` already has a
 * 60s sustained-accuracy gate built in, so it can't fire prematurely).
 */
const ALWAYS_SPOKEN: ReadonlySet<ScenarioTag> = new Set([
  "boundary_signal_a",
  "boundary_signal_b",
  "tempo_milestone",
  "recovery",
  "recovery_confirmed",
  "fatigue",
  "new_band_locked",
]);

export function isAlwaysSpoken(scenario: ScenarioTag): boolean {
  return ALWAYS_SPOKEN.has(scenario);
}

/**
 * Scenarios exempt from the first-4-beats hard rule. Signal A is the
 * only exemption: a settings-change boundary IS the player's own
 * action being acknowledged, so suppressing it would feel broken
 * ("I changed BPM and the coach said nothing").
 */
const FIRST_BEATS_RULE_EXEMPT: ReadonlySet<ScenarioTag> = new Set([
  "boundary_signal_a",
]);

export function isFirstBeatsExempt(scenario: ScenarioTag): boolean {
  return FIRST_BEATS_RULE_EXEMPT.has(scenario);
}

// ---------------------------------------------------------------------------
// Cooldown gates
// ---------------------------------------------------------------------------

function passesSpokenCooldown(
  state: GatekeeperState,
  scenario: ScenarioTag,
  now: number,
  verbosity?: "less" | "default" | "more",
): boolean {
  if (isAlwaysSpoken(scenario)) return true;
  const elapsed = now - state.sessionStartMs;
  const required = spokenCooldownMs(elapsed, verbosity);
  return now - state.lastSpokenMs >= required;
}

function passesWrittenCooldown(
  state: GatekeeperState,
  now: number,
  verbosity?: "less" | "default" | "more",
): boolean {
  const elapsed = now - state.sessionStartMs;
  const required = writtenCooldownMs(elapsed, verbosity);
  return now - state.lastWrittenMs >= required;
}

/**
 * Burst-limit gate. Counts recent fires in two rolling windows; if
 * either threshold is hit, requires a penalty window of silence from
 * the most recent fire before allowing another tip. ALWAYS_SPOKEN
 * scenarios bypass — those are the "completely necessary to chime
 * in" cases.
 */
function passesBurstLimit(
  state: GatekeeperState,
  scenario: ScenarioTag,
  now: number,
): boolean {
  if (isAlwaysSpoken(scenario)) return true;
  if (state.recentFireTimes.length === 0) return true;

  let shortCount = 0;
  let longCount = 0;
  let lastFire = 0;
  for (const t of state.recentFireTimes) {
    const age = now - t;
    if (age <= BURST_SHORT_WINDOW_MS) shortCount++;
    if (age <= BURST_LONG_WINDOW_MS) longCount++;
    if (t > lastFire) lastFire = t;
  }

  if (shortCount >= BURST_SHORT_MAX && now - lastFire < BURST_SHORT_PENALTY_MS) {
    return false;
  }
  if (longCount >= BURST_LONG_MAX && now - lastFire < BURST_LONG_PENALTY_MS) {
    return false;
  }
  return true;
}

/**
 * Warmup gate. Suppresses non-ALWAYS_SPOKEN scenarios while the
 * session is still in its warmup window (set on construction,
 * extended by `bumpWarmup` on settings changes).
 */
function passesWarmup(
  state: GatekeeperState,
  scenario: ScenarioTag,
  now: number,
): boolean {
  // Fatigue tips are blocked during the initial 30-s warmup even though
  // fatigue is ALWAYS_SPOKEN — cold-start imprecision is expected.
  if (scenario === "fatigue" && isInInitialWarmup(state, now)) return false;
  if (isAlwaysSpoken(scenario)) return true;
  return now >= state.warmupUntilMs;
}

/**
 * Repetition gate. Rejects when the (scenario, tier) pair would
 * exactly match the most recently fired event (avoids the "bad, bad"
 * sequence the player called out). Tier is included in the comparison
 * so the trend-confirmation rule's written→spoken escalation is NOT
 * treated as a repeat — that escalation is deliberate signal. Two
 * `accuracy_drop` SPOKEN tips in a row, on the other hand, get
 * blocked. ALWAYS_SPOKEN scenarios bypass.
 */
function passesRepetition(
  state: GatekeeperState,
  scenario: ScenarioTag,
  tier: Tier,
): boolean {
  if (isAlwaysSpoken(scenario)) return true;
  if (state.recentScenarios.length === 0) return true;
  const last = state.recentScenarios[state.recentScenarios.length - 1];
  return !(last.scenario === scenario && last.tier === tier);
}

/**
 * Per-scenario hard cooldown that applies EVEN to ALWAYS_SPOKEN
 * scenarios. The other cooldowns (spoken/written) gate the whole
 * channel and are bypassed for always-speak events, which is correct
 * for boundary signals and milestones — but `personal_best_streak`
 * abused that bypass by re-firing every time the streak counter beat
 * its previous max. This map enforces a per-scenario minimum gap that
 * always-speak status cannot defeat.
 *
 * Scenarios not in the map have no per-scenario cooldown — they fall
 * through to the channel cooldown / burst limiter / repetition gate
 * as before.
 */
const PER_SCENARIO_COOLDOWN_MS: Partial<Record<ScenarioTag, number>> = {
  // 60s between personal_best fires — even a virtuoso doesn't deserve
  // five "great streak!" chimes per minute. Paired with the growth
  // gate inside `detectPersonalBestStreak` this limits PB tips to ~1
  // per minute of strong play (2026-05-17).
  personal_best_streak: 60_000,
  // === User-adjustment window (2026-05-17) =========================
  // The corrective scenarios (`rushing_trend`, `dragging_trend`,
  // `accuracy_drop`, `fatigue`) used to re-fire as fast as their
  // detectors re-detected the same condition — which on a 2-second
  // analysis cadence meant the coach would re-comment "you're
  // dragging" before the user could even register the FIRST tip.
  //
  // User feedback (verbatim): "we don't wanna comment too fast on
  // what user is doing, for example, if user is dragging or going
  // too fast, we wanna give the user the opportunity to fix it."
  //
  // 25s per scenario gives the user a full 8–10 bar window at
  // common tempos (≥80 BPM) to internalize the tip and adjust
  // before the SAME issue is flagged again. Cross-scenario
  // comments (e.g. accuracy_drop after a rushing tip) still pass
  // through; this only debounces the SAME tag.
  rushing_trend: 25_000,
  dragging_trend: 25_000,
  // accuracy_drop sits at 60s (vs 25s for the trend pairs) because
  // confirmation + cooldown both feed the same "actually slipping"
  // bar. A confirmed drop tells the player something real; a second
  // confirmed drop one minute later tells them the first message
  // didn't land — anything tighter would feel like the coach piling on.
  accuracy_drop: 60_000,
  fatigue: 25_000,
  // bias_only is a gentle calibration note. 90s prevents it from
  // becoming a chant if the player's grip consistently lands slightly off;
  // generous enough that the user has time to try adjusting first.
  bias_only: 90_000,
  low_completeness: 300_000,   // 5 min — effectively once per session
  // The ceiling observation is a fact about the player's history, and
  // the history does not change while they play. Saying it twice in a
  // session would be the coach repeating itself, not informing.
  preset_ceiling_hit: 600_000,
};

function passesPerScenarioCooldown(
  state: GatekeeperState,
  scenario: ScenarioTag,
  now: number,
): boolean {
  const cd = PER_SCENARIO_COOLDOWN_MS[scenario];
  if (cd === undefined) return true;
  const lastFire = state.lastEventMs[scenario];
  if (lastFire === undefined) return true;
  return now - lastFire >= cd;
}

/**
 * Cross-scenario "corrective channel" cooldown (2026-05-18).
 *
 * The per-scenario map debounces REPEATS of the same tag, but the
 * corrective scenarios as a group share a problem: they're all
 * "coach is correcting you" tips, and the player can't tell them
 * apart fast enough when they stack. Player feedback was a tight
 * cluster of
 *
 *     drift_early → accuracy_drop → drift_late → drift_early
 *
 * across ~55 seconds — each scenario passed its OWN 25s/60s
 * per-scenario gate because the gates only look at one tag at a
 * time. The result reads as a coach piling on with contradictory
 * advice, which is worse than silence.
 *
 * This gate enforces a 30s cooldown across the whole corrective
 * family. Once any one of them fires, the others wait. Doesn't
 * affect non-corrective scenarios (PB streak, milestones, recovery,
 * boundary events, low-confidence, check-in).
 */
export const CORRECTIVE_CHANNEL_COOLDOWN_MS = 30_000;

const CORRECTIVE_SCENARIOS: ReadonlySet<ScenarioTag> = new Set([
  "rushing_trend",
  "dragging_trend",
  "accuracy_drop",
  "fatigue",
]);

function passesCorrectiveChannel(
  state: GatekeeperState,
  scenario: ScenarioTag,
  now: number,
): boolean {
  if (!CORRECTIVE_SCENARIOS.has(scenario)) return true;
  // Find the newest fire across the corrective family (any scenario
  // in the set, not just the one we're evaluating). Tracked via
  // `lastEventMs` which is already kept up to date by `commit`.
  let lastCorrectiveFire = 0;
  for (const tag of CORRECTIVE_SCENARIOS) {
    const t = state.lastEventMs[tag];
    if (t !== undefined && t > lastCorrectiveFire) lastCorrectiveFire = t;
  }
  if (lastCorrectiveFire === 0) return true;
  return now - lastCorrectiveFire >= CORRECTIVE_CHANNEL_COOLDOWN_MS;
}

/**
 * Drill-ramp preempt check.
 *
 * When `ctx.inDrillRamp` is true, suppress all non-critical tips so
 * the coach stays quiet during a BPM ramp and can fire a
 * `ramp_complete` summary when the ramp ends.
 *
 * Allowed through even during a ramp:
 *   - ALWAYS_SPOKEN scenarios (boundary signals, milestones, recovery,
 *     fatigue, new_band_locked) — these are user-initiated or safety
 *     interventions that must not be silenced.
 *   - The 90-second alive tick: when the last spoken event was ≥
 *     `DRILL_RAMP_ALIVE_TICK_MS` ago, one tip may pass through so the
 *     player knows the coach is still tracking during a long ramp.
 *   - `ramp_complete` itself.
 *
 * Returns `{ allowed: true }` when the tip may proceed, or
 * `{ allowed: false, reason: "DRILL_RAMP_ACTIVE" }` when suppressed.
 *
 * Exported for direct unit-testing (no React dependency).
 */
export function checkDrillRampPreempt(
  state: GatekeeperState,
  scenario: ScenarioTag,
  now: number,
  inDrillRamp: boolean,
): { allowed: boolean; reason?: "DRILL_RAMP_ACTIVE" } {
  if (!inDrillRamp) return { allowed: true };
  // Always-spoken scenarios bypass the preempt.
  if (isAlwaysSpoken(scenario)) return { allowed: true };
  // ramp_complete itself bypasses.
  if (scenario === "ramp_complete") return { allowed: true };
  // Alive-tick bypass: if we've been quiet long enough, let one through.
  if (now - state.lastSpokenMs >= DRILL_RAMP_ALIVE_TICK_MS) return { allowed: true };
  return { allowed: false, reason: "DRILL_RAMP_ACTIVE" };
}

/**
 * Combined gate: a detected scenario only passes when ALL gates pass.
 * Order is cheapest-first for short-circuit efficiency, but every
 * gate is consulted on a real fire so behavior is independent of
 * ordering. Always-spoken scenarios are bypassed by the warmup,
 * burst, and repetition gates individually — but NOT by the
 * per-scenario cooldown map above.
 */
function passesAllGates(
  state: GatekeeperState,
  scenario: ScenarioTag,
  tier: Tier,
  now: number,
  inDrillRamp?: boolean,
  verbosity?: "less" | "default" | "more",
): boolean {
  // Drill-ramp preempt: check before any other gate so the fast-path
  // short-circuit still works. Allowed scenarios (ALWAYS_SPOKEN,
  // ramp_complete, alive tick) pass through; everything else is blocked.
  if (!checkDrillRampPreempt(state, scenario, now, inDrillRamp ?? false).allowed) return false;
  if (!passesPerScenarioCooldown(state, scenario, now)) return false;
  // Corrective-channel cooldown runs alongside the per-scenario gate.
  // It only affects {rushing_trend, dragging_trend, accuracy_drop,
  // fatigue} — see `passesCorrectiveChannel`. Cheap (set membership +
  // 4 map lookups) so it's safe to run before the warmup check.
  if (!passesCorrectiveChannel(state, scenario, now)) return false;
  if (!passesWarmup(state, scenario, now)) return false;
  if (!passesRepetition(state, scenario, tier)) return false;
  if (!passesBurstLimit(state, scenario, now)) return false;
  if (tier === "spoken") {
    return passesSpokenCooldown(state, scenario, now, verbosity);
  }
  return passesWrittenCooldown(state, now, verbosity);
}

// ---------------------------------------------------------------------------
// Scenario detectors
// ---------------------------------------------------------------------------

type Detection = {
  scenario: ScenarioTag;
  tier: Tier;
  context: Record<string, number | string | boolean>;
  /**
   * If true, the detector also wants to update gatekeeper state in a
   * scenario-specific way (e.g. trend confirmations). Returned via
   * `partialState` so the public `evaluate` stays the single
   * write-point.
   */
  partialState?: Partial<GatekeeperState>;
};

/**
 * Result of the accuracy-drop probe. Decoupled from `Detection`
 * because we want to update the confirmation counter even when the
 * drop is *pending* (1 confirmation, not yet escalated to a fireable
 * `Detection`). The caller (`evaluate`) inspects this and decides:
 *
 *   - `kind: "drop"` with `confirmations >= ACCURACY_DROP_CONFIRMATIONS`
 *     → return a `Detection` and reset the counter.
 *   - `kind: "drop"` below threshold → no event, but persist the
 *     incremented counter via `partialState`.
 *   - `kind: "clean"` → reset the counter to 0 via `partialState`
 *     (only if it was non-zero, to avoid spurious state writes).
 */
type AccuracyDropProbe =
  | {
      kind: "drop";
      detection: Detection;
      confirmations: number;
    }
  | { kind: "clean" };

function probeAccuracyDrop(
  state: GatekeeperState,
  window: BeatFeedback[],
  stance?: CoachStance,
): AccuracyDropProbe {
  if (window.length < ACCURACY_DROP_WINDOW * 2) return { kind: "clean" };
  const recent = window.slice(-ACCURACY_DROP_WINDOW);
  const prior = window.slice(-ACCURACY_DROP_WINDOW * 2, -ACCURACY_DROP_WINDOW);
  // Require a minimum number of ATTEMPTED beats in both halves before
  // we trust the rate comparison. Otherwise a quiet pause (window full
  // of `skipped`) reads as a 0% recent rate and the detector fires a
  // bogus accuracy-drop tip — see ACCURACY_DROP_MIN_SCORED docstring.
  if (scoredCount(recent) < ACCURACY_DROP_MIN_SCORED) return { kind: "clean" };
  if (scoredCount(prior) < ACCURACY_DROP_MIN_SCORED) return { kind: "clean" };
  const recentRate = hitRate(recent);
  const priorRate = hitRate(prior);
  // Learning mode widens the drop the player is allowed before the coach
  // calls it one: 25 % becomes 37.5 %. ROADMAP 1.5.
  if (priorRate - recentRate < scaled(ACCURACY_DROP_DELTA, stance)) {
    return { kind: "clean" };
  }
  const confirmations = state.accuracyDropConfirmations + 1;
  return {
    kind: "drop",
    confirmations,
    detection: {
      scenario: "accuracy_drop",
      tier: "spoken",
      context: {
        priorAccuracyPct: Math.round(priorRate * 100),
        recentAccuracyPct: Math.round(recentRate * 100),
        windowBeats: ACCURACY_DROP_WINDOW,
        confirmations,
      },
    },
  };
}

function detectPersonalBestStreak(
  state: GatekeeperState,
  window: BeatFeedback[],
): Detection | null {
  const streak = trailingCleanStreak(window);
  if (streak < STREAK_PERSONAL_BEST_MIN) return null;
  // Growth gate: re-fires must beat the previous best by a meaningful
  // margin, not just one beat. Without this the detector fired on
  // every 8 → 9 → 10 tick of the streak counter, producing 5+ rapid
  // "Picking's locked / Clean run / Streak holding" tips per minute
  // (2026-05-17 feedback).
  if (streak < state.bestStreak + STREAK_PERSONAL_BEST_GROWTH) return null;
  return {
    scenario: "personal_best_streak",
    tier: "spoken",
    context: {
      streak,
      previousBest: state.bestStreak,
    },
    partialState: { bestStreak: streak },
  };
}

function detectTrend(
  state: GatekeeperState,
  window: BeatFeedback[],
  stance?: CoachStance,
): Detection | null {
  if (window.length < ACCURACY_DROP_WINDOW * 2) return null;
  const recent = window.slice(-ACCURACY_DROP_WINDOW);
  const prior = window.slice(-ACCURACY_DROP_WINDOW * 2, -ACCURACY_DROP_WINDOW);
  const recentMean = meanOffset(recent);
  const priorMean = meanOffset(prior);
  // How far the passage has to lean before the coach names it. 5 ms
  // strict, 7.5 ms while learning — the player is allowed to be half
  // again as early before anyone says "rushing". ROADMAP 1.5.
  const leanMs = scaled(TREND_OFFSET_THRESHOLD_MS, stance);

  // Rushing: recent mean < -threshold, prior near-neutral.
  if (recentMean < -leanMs && priorMean >= -TREND_PRIOR_NEUTRAL_MS) {
    const confirmations = state.trendConfirmations.rushing + 1;
    const tier: Tier =
      confirmations >= TREND_CONFIRMATION_REQUIRED ? "spoken" : "written";
    return {
      scenario: "rushing_trend",
      tier,
      context: {
        offsetMs: Number(recentMean.toFixed(1)),
        priorOffsetMs: Number(priorMean.toFixed(1)),
        confirmations,
        // Templates 64/70 + 81/87 reference `{windowBeats}` directly.
        // `detectTrend` slices `window.slice(-ACCURACY_DROP_WINDOW)`
        // when computing recentMean, so the trend statement is over
        // exactly that many beats. Without this key the `fillTemplate`
        // helper passes `{windowBeats}` through verbatim and the user
        // sees raw `{windowBeats}` in the rendered tip (v0.9 bug).
        windowBeats: ACCURACY_DROP_WINDOW,
      },
      partialState: {
        trendConfirmations: {
          rushing: confirmations,
          dragging: 0,
        },
      },
    };
  }

  // Dragging: mirror.
  if (recentMean > leanMs && priorMean <= TREND_PRIOR_NEUTRAL_MS) {
    const confirmations = state.trendConfirmations.dragging + 1;
    const tier: Tier =
      confirmations >= TREND_CONFIRMATION_REQUIRED ? "spoken" : "written";
    return {
      scenario: "dragging_trend",
      tier,
      context: {
        offsetMs: Number(recentMean.toFixed(1)),
        priorOffsetMs: Number(priorMean.toFixed(1)),
        confirmations,
        // See `rushing_trend` above — templates 81/87 reference
        // `{windowBeats}` and need this key populated or the
        // placeholder leaks through to the rendered tip.
        windowBeats: ACCURACY_DROP_WINDOW,
      },
      partialState: {
        trendConfirmations: {
          rushing: 0,
          dragging: confirmations,
        },
      },
    };
  }

  // Neither — decay confirmations so a single noisy beat doesn't
  // permanently latch the next escalation.
  if (
    state.trendConfirmations.rushing > 0 ||
    state.trendConfirmations.dragging > 0
  ) {
    return {
      scenario: "accuracy_drop", // sentinel; caller discards by `null`
      tier: "written",
      context: {},
      partialState: { trendConfirmations: { rushing: 0, dragging: 0 } },
    };
  }
  return null;
}

/**
 * The player is at the tempo this exercise has stalled in before
 * (ROADMAP 1.7, P1-COACH-3).
 *
 * Wired from `presetAwareness.detectBpmCeiling`, which already applies
 * the data gates worth having — a band needs three sessions and a
 * median under 70 before it is called a ceiling at all, and only the
 * LOWEST such band counts, because once playing falls apart at some
 * tempo the harder bands say nothing. All this has to do is notice that
 * the player has walked into it.
 *
 * `bpmHigh` is exclusive, matching `BpmCeiling`'s `bpmLow + 10`.
 *
 * Silent above `PRESET_CEILING_MAX_SESSIONS` attempts: from there the
 * player has earned advice rather than an observation, and
 * `pace_coaching` gives it. Only one of the two ever fires.
 */
function detectPresetCeilingHit(ctx: GatekeeperContext): Detection | null {
  const ceiling = ctx.presetCeiling;
  if (!ceiling) return null;
  if (ceiling.sessions > PRESET_CEILING_MAX_SESSIONS) return null;
  if (ctx.bpm < ceiling.bpmLow || ctx.bpm >= ceiling.bpmHigh) return null;
  return {
    scenario: "preset_ceiling_hit",
    tier: "written",
    context: {
      bpmLow: ceiling.bpmLow,
      bpmHigh: ceiling.bpmHigh - 1,
      attemptCount: ceiling.sessions,
      score: Math.round(ceiling.medianScore),
    },
  };
}

/**
 * Detect a timing bias: consistent signed offset with low scatter.
 *
 * A player landing {biasMs}ms early/late on EVERY hit isn't random
 * — they have a technique or equipment lean. The right coach message
 * is "shift everything", not "tighten up". Fires as "written" (a
 * quiet heads-up) so it doesn't interrupt flow; the 90s per-scenario
 * cooldown prevents it becoming a chant.
 *
 * Requires `ACCURACY_DROP_WINDOW` beats of hits (not misses/skips)
 * so the window is statistically meaningful.
 */
function detectBias(
  _state: GatekeeperState,
  window: BeatFeedback[],
  stance?: CoachStance,
): Detection | null {
  if (window.length < ACCURACY_DROP_WINDOW) return null;
  const recent = window.slice(-ACCURACY_DROP_WINDOW);
  const hits = recent.filter(
    (b) => b.classification !== "miss" && b.classification !== "skipped",
  );
  if (hits.length < BIAS_MIN_HITS) return null;

  const m = hits.reduce((a, b) => a + b.deviationMs, 0) / hits.length;
  // 12 ms strict, 18 ms while learning. ROADMAP 1.5.
  if (Math.abs(m) <= scaled(BIAS_MEAN_THRESHOLD_MS, stance)) return null;

  const variance =
    hits.reduce((a, b) => a + (b.deviationMs - m) ** 2, 0) / hits.length;
  const std = Math.sqrt(variance);
  if (std >= BIAS_STD_THRESHOLD_MS) return null;

  const direction = m < 0 ? "before" : "after";
  const correctionDirection = m < 0 ? "later" : "earlier";
  return {
    scenario: "bias_only",
    tier: "written",
    context: {
      biasMs: Math.round(Math.abs(m)),
      direction,
      correctionDirection,
    },
  };
}

/**
 * Detect recovery after a corrective tip (accuracy_drop / fatigue).
 *
 * Fires as a fast reactive "got it back" acknowledgement within a
 * few beats of the player cleaning up their timing. Only arms when
 * `state.awaitingRecovery` is true (set by `commit` when a corrective
 * fires) and disarms once fired to prevent repeating every clean beat.
 *
 * Criterion: ≥ 3 trailing clean (non-miss) beats in the window.
 * This is deliberately loose — once the player has strung three
 * consecutive hits back together the recovery is real enough to
 * acknowledge.
 */
function detectRecoveryConfirmed(
  state: GatekeeperState,
  window: BeatFeedback[],
): Detection | null {
  if (!state.awaitingRecovery) return null;
  if (trailingCleanStreak(window) < 3) return null;
  return {
    scenario: "recovery_confirmed",
    tier: "spoken", // ALWAYS_SPOKEN — bypasses spoken cooldown
    context: {},
  };
}

function detectNewBandLocked(
  state: GatekeeperState,
  ctx: GatekeeperContext,
): { detection: Detection | null; partialState?: Partial<GatekeeperState> } {
  const recent = ctx.window.slice(-STREAK_SUPPRESSION_MIN_LEN);
  if (recent.length < STREAK_SUPPRESSION_MIN_LEN) {
    return { detection: null };
  }
  const rate = hitRate(recent);
  const bandLow = Math.floor(ctx.bpm / 10) * 10;
  const sustained = rate >= NEW_BAND_ACCURACY;

  if (!sustained) {
    if (state.lockedBpmLow !== null) {
      return {
        detection: null,
        partialState: { lockedBpmLow: null, bandLockedSinceMs: null },
      };
    }
    return { detection: null };
  }

  // Sustained — either we just entered this band or we've been here.
  if (state.lockedBpmLow !== bandLow || state.bandLockedSinceMs === null) {
    return {
      detection: null,
      partialState: {
        lockedBpmLow: bandLow,
        bandLockedSinceMs: ctx.now,
      },
    };
  }

  if (ctx.now - state.bandLockedSinceMs < NEW_BAND_DURATION_MS) {
    return { detection: null };
  }

  // We've been locked for ≥ NEW_BAND_DURATION_MS. Emit once per band:
  // clear bandLockedSinceMs so we don't re-emit unless we leave and
  // come back.
  return {
    detection: {
      scenario: "new_band_locked",
      tier: "spoken",
      context: {
        bpmLow: bandLow,
        bpmHigh: bandLow + 9,
        accuracyPct: Math.round(rate * 100),
      },
    },
    partialState: { bandLockedSinceMs: null },
  };
}

function detectCheckIn(
  state: GatekeeperState,
  now: number,
): Detection | null {
  if (now - state.lastSpokenMs < CHECK_IN_AFTER_QUIET_MS) return null;
  return {
    scenario: "check_in",
    tier: "spoken",
    context: {
      quietMs: now - state.lastSpokenMs,
    },
  };
}

/**
 * Low-confidence caveat detector. Per plan OQ5: when the mean
 * calibration confidence drops below 0.5 and stays there for ≥ 30s,
 * fire a one-shot `low_confidence` event. The detector itself is
 * stateful: it tracks when the dip started so we can require a
 * sustained duration rather than reacting to a single noisy beat.
 *
 * Returns a `partialState` whenever the rolling state needs to be
 * updated (start/clear the dip timer), so the caller commits state
 * changes whether or not an event fires.
 */
function detectLowConfidence(
  state: GatekeeperState,
  ctx: GatekeeperContext,
): { detection: Detection | null; partialState?: Partial<GatekeeperState> } {
  // One-shot per session — already fired, don't fire again.
  if (state.lastEventMs.low_confidence != null) {
    return { detection: null };
  }

  // Need a meaningful sample size to compute a reliable mean.
  const window = ctx.window;
  const scored = window.filter((b) => b.classification !== "skipped");
  if (scored.length < 8) return { detection: null };

  const mean =
    scored.reduce((a, b) => a + b.calibrationConfidence, 0) / scored.length;

  // Recovery — clear the dip timer if we're back above threshold.
  if (mean >= LOW_CONFIDENCE_THRESHOLD) {
    if (state.lowConfidenceSinceMs !== null) {
      return {
        detection: null,
        partialState: { lowConfidenceSinceMs: null },
      };
    }
    return { detection: null };
  }

  // Below threshold — open the timer if this is the first dip.
  if (state.lowConfidenceSinceMs === null) {
    return {
      detection: null,
      partialState: { lowConfidenceSinceMs: ctx.now },
    };
  }

  // Sustained long enough? If yes, fire the one-shot caveat.
  if (ctx.now - state.lowConfidenceSinceMs < LOW_CONFIDENCE_SUSTAIN_MS) {
    return { detection: null };
  }

  return {
    detection: {
      scenario: "low_confidence",
      tier: "spoken",
      context: {
        meanConfidence: Number(mean.toFixed(2)),
        sustainedSecs: Math.round(
          (ctx.now - state.lowConfidenceSinceMs) / 1000,
        ),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Public `evaluate`
// ---------------------------------------------------------------------------

/**
 * Run all detectors against the current state + context and decide
 * whether to emit an event. Returns the (possibly unchanged) state
 * AND the chosen event (or `null` if nothing fired or everything was
 * gated by cooldowns).
 *
 * Priority order:
 *   1. Forced event (always wins, subject to first-beats demotion).
 *   2. Accuracy drop (intervention).
 *   3. Personal best streak.
 *   4. New-band-locked.
 *   5. Trend (rushing/dragging).
 *   6. Low-confidence caveat (one-shot per session).
 *   7. Check-in (adaptive floor).
 *
 * Cross-cutting post-detection rules:
 *   - First-4-beats hard rule: spoken events are demoted to written
 *     during the first `FIRST_BEATS_TTS_FLOOR` beats of a segment,
 *     except for `boundary_signal_a` (user-initiated, must speak).
 */
export function evaluate(
  state: GatekeeperState,
  ctx: GatekeeperContext,
): { state: GatekeeperState; event: GatekeeperEvent | null } {
  // 1. Forced events bypass cooldown / streak / warmup-suppression
  // gates BUT not the initial-warmup tier demotion. Player feedback
  // (2026-05-18): "warmup grace of 30 seconds is already fine... as
  // long as its respected, not like when i started playing that it
  // immediately started firing comments". The "immediate firing"
  // was forced `boundary_signal_b` (activity-gap detection on the
  // very first beats of a session) sneaking through with tier
  // "spoken" — bypassing the warmup gate because forced events
  // skipped `passesAllGates` entirely. The event still belongs in
  // the feed (the coach has acknowledged the start), but it must
  // not trigger TTS during the warmup runway. Demoting to "written"
  // achieves both: silent acknowledgement, no audible interruption.
  if (ctx.force) {
    // Fatigue tips are blocked entirely during the initial 30-s warmup,
    // not just demoted. Cold-start imprecision is expected; a fatigue call
    // that early would be misleading. Other forced events are only demoted
    // to "written" (silent acknowledgement without TTS interruption).
    if (
      ctx.force.scenario === "fatigue" &&
      isInInitialWarmup(state, ctx.now)
    ) {
      return { state, event: null };
    }
    const tier: Tier = isInInitialWarmup(state, ctx.now) ? "written" : "spoken";
    const forced: GatekeeperEvent = {
      scenario: ctx.force.scenario,
      tier,
      context: ctx.force.context,
      taggedBpm: ctx.bpm,
    };
    return commit(state, ctx.now, applyFirstBeatsRule(forced, ctx));
  }

  // Verbosity gate: "less" suppresses all organic tips. Forced boundary
  // events (Signal A/B above) are exempt — they're UI state-change acks,
  // not coaching tips. This implements the silent-mode contract:
  // coachVerbosity === "less" → zero organic coach utterances.
  if (ctx.verbosity === "less") return { state, event: null };

  let working = state;

  // 1.5. Recovery confirmation — reactive fast-path. Fires before
  // accuracy_drop re-detection so the player hears "got it back"
  // within a beat or two of cleaning up, not after another miss cycle.
  // ALWAYS_SPOKEN → bypasses spoken cooldown. Gates itself via
  // `awaitingRecovery` so it fires at most once per corrective cycle.
  const recoveryDetection = detectRecoveryConfirmed(working, ctx.window);
  if (
    recoveryDetection &&
    passesAllGates(
      working,
      recoveryDetection.scenario,
      recoveryDetection.tier,
      ctx.now,
      ctx.inDrillRamp,
      ctx.verbosity,
    )
  ) {
    return commit(working, ctx.now, applyFirstBeatsRule(toEvent(recoveryDetection, ctx.bpm), ctx));
  }

  // 2. Accuracy drop (intervention). Always escalates to spoken,
  // bypasses streak suppression. Requires
  // `ACCURACY_DROP_CONFIRMATIONS` consecutive detections before
  // emitting — see the `probeAccuracyDrop` docstring. Both branches
  // (drop / clean) update `accuracyDropConfirmations`; only a
  // confirmed drop also commits an event.
  const dropProbe = probeAccuracyDrop(working, ctx.window, ctx.stance);
  if (dropProbe.kind === "drop") {
    if (dropProbe.confirmations < ACCURACY_DROP_CONFIRMATIONS) {
      // Sub-threshold: persist the bumped counter so the next
      // detection can escalate, but emit nothing.
      working = {
        ...working,
        accuracyDropConfirmations: dropProbe.confirmations,
      };
    } else {
      // Confirmed: reset the counter so the next firing has to
      // re-confirm from zero, then run the normal commit path.
      working = { ...working, accuracyDropConfirmations: 0 };
      if (
        passesAllGates(
          working,
          dropProbe.detection.scenario,
          dropProbe.detection.tier,
          ctx.now,
          ctx.inDrillRamp,
          ctx.verbosity,
        )
      ) {
        return commit(
          working,
          ctx.now,
          applyFirstBeatsRule(toEvent(dropProbe.detection, ctx.bpm), ctx),
        );
      }
    }
  } else if (working.accuracyDropConfirmations > 0) {
    // Clean window after a pending drop wipes the confirmation
    // counter — the player recovered, so we don't want a later
    // unrelated dip to inherit the half-count and fire on first
    // contact.
    working = { ...working, accuracyDropConfirmations: 0 };
  }

  // 2.5. Low completeness — corrective. Player has been missing ≥half the
  // beats across the last 3+ segments. Fires at most once per 5-min cooldown.
  if (
    ctx.recentHitCompleteness !== undefined &&
    ctx.recentHitCompleteness < LOW_COMPLETENESS_THRESHOLD &&
    passesAllGates(
      working,
      "low_completeness",
      "spoken",
      ctx.now,
      ctx.inDrillRamp,
      ctx.verbosity,
    )
  ) {
    const ev: GatekeeperEvent = {
      scenario: "low_completeness",
      tier: "spoken",
      context: { avgHitCompleteness: Math.round((ctx.recentHitCompleteness) * 100) },
      taggedBpm: ctx.bpm,
    };
    return commit(working, ctx.now, applyFirstBeatsRule(ev, ctx));
  }

  // 3. Personal best streak — always speakable.
  const pb = detectPersonalBestStreak(working, ctx.window);
  if (pb) {
    if (pb.partialState) working = { ...working, ...pb.partialState };
    if (passesAllGates(working, pb.scenario, pb.tier, ctx.now, ctx.inDrillRamp, ctx.verbosity)) {
      return commit(
        working,
        ctx.now,
        applyFirstBeatsRule(toEvent(pb, ctx.bpm), ctx),
      );
    }
  }

  // 4. New-band-locked — always speakable, but only emits once per
  // band entry.
  const band = detectNewBandLocked(working, ctx);
  if (band.partialState) working = { ...working, ...band.partialState };
  if (
    band.detection &&
    passesAllGates(working, band.detection.scenario, band.detection.tier, ctx.now, ctx.inDrillRamp, ctx.verbosity)
  ) {
    return commit(
      working,
      ctx.now,
      applyFirstBeatsRule(toEvent(band.detection, ctx.bpm), ctx),
    );
  }

  // 5. Trends — written initially, spoken on confirmation.
  const trend = detectTrend(working, ctx.window, ctx.stance);
  if (trend && trend.partialState) {
    working = { ...working, ...trend.partialState };
  }
  // The "neither" sentinel reuses `accuracy_drop` as a placeholder;
  // discard if the actual scenario is the sentinel.
  if (
    trend &&
    (trend.scenario === "rushing_trend" ||
      trend.scenario === "dragging_trend")
  ) {
    const inStreak = ctx.inStreak ?? streakActive(ctx.window);
    const suppressSpoken =
      inStreak && !isAlwaysSpoken(trend.scenario) && trend.tier === "spoken";
    const tier: Tier = suppressSpoken ? "written" : trend.tier;
    if (passesAllGates(working, trend.scenario, tier, ctx.now, ctx.inDrillRamp, ctx.verbosity)) {
      return commit(
        working,
        ctx.now,
        applyFirstBeatsRule(toEvent({ ...trend, tier }, ctx.bpm), ctx),
      );
    }
  }

  // 5.4. Preset ceiling reached (ROADMAP 1.7, P1-COACH-3). The player
  // is at the tempo this exercise has stalled in before. Written tier:
  // it is an observation, and one the player can act on or ignore. It
  // sits below the trends because a live trend is about the bar they
  // just played and this is about a month of them.
  const ceiling = detectPresetCeilingHit(ctx);
  if (
    ceiling &&
    passesAllGates(working, ceiling.scenario, ceiling.tier, ctx.now, ctx.inDrillRamp, ctx.verbosity)
  ) {
    return commit(working, ctx.now, applyFirstBeatsRule(toEvent(ceiling, ctx.bpm), ctx));
  }

  // 5.5. Bias-only: consistent offset with low scatter. Written tier
  // only — a gentle calibration note, not an accuracy alarm.
  const bias = detectBias(working, ctx.window, ctx.stance);
  if (
    bias &&
    passesAllGates(working, bias.scenario, bias.tier, ctx.now, ctx.inDrillRamp, ctx.verbosity)
  ) {
    return commit(working, ctx.now, applyFirstBeatsRule(toEvent(bias, ctx.bpm), ctx));
  }

  // 6. Low-confidence caveat — one-shot per session.
  const lowConf = detectLowConfidence(working, ctx);
  if (lowConf.partialState) working = { ...working, ...lowConf.partialState };
  if (
    lowConf.detection &&
    passesAllGates(
      working,
      lowConf.detection.scenario,
      lowConf.detection.tier,
      ctx.now,
      ctx.inDrillRamp,
      ctx.verbosity,
    )
  ) {
    return commit(
      working,
      ctx.now,
      applyFirstBeatsRule(toEvent(lowConf.detection, ctx.bpm), ctx),
    );
  }

  // 7. Adaptive cooldown floor — emits at most once per quiet window
  // because committing updates `lastSpokenMs`.
  const checkIn = detectCheckIn(working, ctx.now);
  if (checkIn && passesAllGates(working, checkIn.scenario, checkIn.tier, ctx.now, ctx.inDrillRamp, ctx.verbosity)) {
    return commit(
      working,
      ctx.now,
      applyFirstBeatsRule(toEvent(checkIn, ctx.bpm), ctx),
    );
  }

  return { state: working, event: null };
}

/**
 * Apply the first-4-beats hard rule. Demotes spoken events to
 * written when the segment is too fresh, unless the scenario is
 * exempt (Signal A). Returns the event unchanged when the rule
 * doesn't apply or `beatsInSegment` wasn't supplied.
 */
function applyFirstBeatsRule(
  event: GatekeeperEvent,
  ctx: GatekeeperContext,
): GatekeeperEvent {
  const staged = applyStanceRule(event, ctx);
  if (staged.tier !== "spoken") return staged;
  if (ctx.beatsInSegment === undefined) return staged;
  if (ctx.beatsInSegment >= FIRST_BEATS_TTS_FLOOR) return staged;
  if (isFirstBeatsExempt(staged.scenario)) return staged;
  return { ...staged, tier: "written" };
}

/**
 * Learning mode's second effect: a correction stops interrupting.
 *
 * Runs ahead of the first-beats rule — both only ever demote, so the
 * order changes nothing, but every event reaching `commit` passes
 * through here and that is the property worth keeping. Milestones,
 * recoveries and the boundary signals keep their voice; see
 * `learningMode.tierFor` for why.
 */
function applyStanceRule(
  event: GatekeeperEvent,
  ctx: GatekeeperContext,
): GatekeeperEvent {
  const tier = tierFor(event.scenario, event.tier, ctx.stance);
  return tier === event.tier ? event : { ...event, tier };
}

// ---------------------------------------------------------------------------
// Internal: commit and event-builder helpers
// ---------------------------------------------------------------------------

function commit(
  state: GatekeeperState,
  now: number,
  event: GatekeeperEvent,
): { state: GatekeeperState; event: GatekeeperEvent } {
  const lastEventMs = { ...state.lastEventMs, [event.scenario]: now };
  // Burst-limiter bookkeeping: append `now`, drop entries older than
  // the longest watched window so the array can't grow unbounded.
  const cutoff = now - BURST_LONG_WINDOW_MS;
  const recentFireTimes = [
    ...state.recentFireTimes.filter((t) => t > cutoff),
    now,
  ];
  // Repetition bookkeeping: append (scenario, tier), cap to most
  // recent N. Tier is part of the key so the trend rule's
  // written→spoken escalation isn't mistaken for a duplicate.
  const recentScenarios = [
    ...state.recentScenarios,
    { scenario: event.scenario, tier: event.tier },
  ].slice(-REPETITION_HISTORY_MAX);
  // Segment-boundary auto-bump: when boundary_signal_a (settings
  // change) or boundary_signal_b (activity-gap new segment) fires,
  // re-arm the warmup so the player gets a quiet runway for the new
  // exercise. Monotonic: never pulls the existing warmup back.
  const warmupUntilMs =
    event.scenario === "boundary_signal_a" ||
    event.scenario === "boundary_signal_b"
      ? Math.max(state.warmupUntilMs, now + WARMUP_GRACE_TEMPO_MS)
      : state.warmupUntilMs;
  // Update the awaiting-recovery flag: corrective tips arm it, the
  // recovery confirmation disarms it. All other scenarios leave it as-is.
  const awaitingRecovery =
    event.scenario === "accuracy_drop" || event.scenario === "fatigue"
      ? true
      : event.scenario === "recovery_confirmed"
        ? false
        : state.awaitingRecovery;
  const base = {
    ...state,
    lastEventMs,
    recentFireTimes,
    recentScenarios,
    warmupUntilMs,
    awaitingRecovery,
  };
  const next: GatekeeperState =
    event.tier === "spoken"
      ? { ...base, lastSpokenMs: now, lastWrittenMs: now }
      : { ...base, lastWrittenMs: now };
  return { state: next, event };
}

function toEvent(detection: Detection, bpm: number): GatekeeperEvent {
  return {
    scenario: detection.scenario,
    tier: detection.tier,
    context: detection.context,
    taggedBpm: bpm,
  };
}

// ---------------------------------------------------------------------------
// Tiny stats helpers (window-aware, no allocations)
// ---------------------------------------------------------------------------

/**
 * Hit rate computed over ATTEMPTED beats only — `hits / (hits + miss)`.
 *
 * Skipped beats (no detected onset, i.e. the player wasn't playing on
 * that tick) are excluded from BOTH numerator and denominator. A
 * player who stops between exercises shouldn't be scored as missing
 * those ticks — that's the same convention the segment score and
 * `src/coach/reportStats.ts` use, and the gatekeeper now matches.
 *
 * Returns 1 when the window has no attempted beats. "No data" reads
 * as "fine" so detectors like `detectAccuracyDrop` don't fire on
 * all-skipped windows (the v0.9 "Rough patch at 0%" bug came from
 * the old `hits / window.length` denominator turning a quiet pause
 * into a 0% accuracy event). Callers that need a minimum-attempted
 * floor should gate on `scoredCount(window)` separately before
 * consulting the rate.
 */
function hitRate(window: BeatFeedback[]): number {
  let hits = 0;
  let scored = 0;
  for (const b of window) {
    if (b.classification === "skipped") continue;
    scored++;
    if (b.classification !== "miss") hits++;
  }
  return scored === 0 ? 1 : hits / scored;
}

/** Count of attempted beats (hits + misses) in the window. Used to
 *  gate detectors that need a meaningful sample size before firing —
 *  see `detectAccuracyDrop`. */
function scoredCount(window: BeatFeedback[]): number {
  let n = 0;
  for (const b of window) if (b.classification !== "skipped") n++;
  return n;
}

function meanOffset(window: BeatFeedback[]): number {
  const hits = window.filter(
    (b) => b.classification !== "miss" && b.classification !== "skipped",
  );
  if (hits.length === 0) return 0;
  return hits.reduce((a, b) => a + b.deviationMs, 0) / hits.length;
}

function trailingCleanStreak(window: BeatFeedback[]): number {
  let streak = 0;
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i].classification === "miss") break;
    if (window[i].classification !== "skipped") streak++;
  }
  return streak;
}

function streakActive(window: BeatFeedback[]): boolean {
  if (window.length < STREAK_SUPPRESSION_MIN_LEN) return false;
  const recent = window.slice(-STREAK_SUPPRESSION_MIN_LEN);
  return hitRate(recent) >= STREAK_SUPPRESSION_HIT_RATE;
}
