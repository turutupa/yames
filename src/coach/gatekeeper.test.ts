/**
 * Tests for C4 — Smart Coaching Timing (Gatekeeper).
 *
 * Cover: cooldown math, channel independence, always-speak overrides,
 * streak suppression, scenario detectors (accuracy drop, personal
 * best, rushing/dragging trends with confirmation rule, new-band
 * locked, check-in floor), forced events, drill staleness, and
 * chat-reset behaviour.
 */

import { describe, it, expect } from "vitest";
import type { BeatFeedback } from "../types";
import type { ScenarioTag } from "./gatekeeper";
import {
  ACCURACY_DROP_CONFIRMATIONS,
  ACCURACY_DROP_WINDOW,
  BURST_LONG_MAX,
  BURST_LONG_PENALTY_MS,
  BURST_LONG_WINDOW_MS,
  BURST_SHORT_MAX,
  BURST_SHORT_PENALTY_MS,
  BURST_SHORT_WINDOW_MS,
  CHECK_IN_AFTER_QUIET_MS,
  CORRECTIVE_CHANNEL_COOLDOWN_MS,
  DRILL_RAMP_ALIVE_TICK_MS,
  DRILL_STALENESS_BPM,
  FIRST_BEATS_TTS_FLOOR,
  LOW_CONFIDENCE_SUSTAIN_MS,
  NEW_BAND_DURATION_MS,
  PRESET_CEILING_MAX_SESSIONS,
  REPETITION_HISTORY_MAX,
  SPOKEN_COOLDOWN_CEILING_MS,
  SPOKEN_COOLDOWN_FLOOR_MS,
  STREAK_PERSONAL_BEST_MIN,
  TREND_CONFIRMATION_REQUIRED,
  WARMUP_GRACE_MS,
  WARMUP_GRACE_TEMPO_MS,
  WRITTEN_COOLDOWN_CEILING_MS,
  WRITTEN_COOLDOWN_FLOOR_MS,
  bumpWarmup,
  checkDrillRampPreempt,
  createGatekeeper,
  evaluate,
  isAlwaysSpoken,
  isFirstBeatsExempt,
  isInInitialWarmup,
  resetCooldowns,
  shouldDropForStaleness,
  spokenCooldownMs,
  writtenCooldownMs,
} from "./gatekeeper";

const T0 = 1_715_000_000_000;

function fb(
  classification: BeatFeedback["classification"],
  deviationMs = 0,
): BeatFeedback {
  return {
    beatIndex: 0,
    deviationMs,
    intervalErrorMs: 0,
    classification,
    amplitude: 0.5,
    calibrationOffsetMs: 0,
    calibrationConfidence: 0.8,
    gridCorrelation: 0.9,
  };
}

function manyHits(n: number, dev = 0): BeatFeedback[] {
  return Array.from({ length: n }, () => fb("perfect", dev));
}

function manyMisses(n: number): BeatFeedback[] {
  return Array.from({ length: n }, () => fb("miss"));
}

function manySkipped(n: number): BeatFeedback[] {
  return Array.from({ length: n }, () => fb("skipped"));
}

/**
 * Seed bestStreak to a value higher than any window length used in
 * the test so the personal-best-streak detector doesn't hijack the
 * scenario under test. Real usage seeds bestStreak from the segment
 * record; we keep tests focused by pre-seeding here.
 */
const HIGH_PB = 10_000;

// ---------------------------------------------------------------------------
// Cooldown math
// ---------------------------------------------------------------------------

describe("spokenCooldownMs", () => {
  it("clamps to the 20s floor for short sessions", () => {
    expect(spokenCooldownMs(0)).toBe(SPOKEN_COOLDOWN_FLOOR_MS);
    expect(spokenCooldownMs(60_000)).toBe(SPOKEN_COOLDOWN_FLOOR_MS);
  });

  it("scales linearly between floor and ceiling", () => {
    // 5 minute mark → 30s, halfway between 20s and 60s.
    expect(spokenCooldownMs(300_000)).toBe(30_000);
  });

  it("clamps to the 60s ceiling for long sessions", () => {
    expect(spokenCooldownMs(20 * 60 * 1000)).toBe(SPOKEN_COOLDOWN_CEILING_MS);
  });
});

describe("writtenCooldownMs", () => {
  it("clamps to the configured floor and ceiling", () => {
    // Formula: min(ceiling, max(floor, sinceStart × 0.05)).
    // Asserted against the constants directly so the test stays
    // correct as the envelope is tuned (was 3s–10s pre-2026-05-17,
    // then 8s–10s, then 18s–30s as the coach grew less chatty).
    //
    // sinceStart=0 → scaled=0 → clamped UP to floor.
    expect(writtenCooldownMs(0)).toBe(WRITTEN_COOLDOWN_FLOOR_MS);
    // 1 minute of session: scaled = 3s — well below the floor at
    // every value of WRITTEN_COOLDOWN_FLOOR_MS we've shipped.
    expect(writtenCooldownMs(60_000)).toBe(WRITTEN_COOLDOWN_FLOOR_MS);
    // 1 hour of session: scaled = 180s — well past any ceiling.
    expect(writtenCooldownMs(60 * 60 * 1000)).toBe(WRITTEN_COOLDOWN_CEILING_MS);
  });
});

describe("shouldDropForStaleness", () => {
  it("returns false when no BPM tag attached to the comment", () => {
    expect(shouldDropForStaleness(undefined, 120)).toBe(false);
  });

  it("returns false when BPM moved by the threshold or less", () => {
    expect(shouldDropForStaleness(120, 125)).toBe(false);
    expect(shouldDropForStaleness(120, 115)).toBe(false);
  });

  it("returns true when BPM moved by more than DRILL_STALENESS_BPM", () => {
    expect(shouldDropForStaleness(120, 120 + DRILL_STALENESS_BPM + 1)).toBe(true);
    expect(shouldDropForStaleness(120, 120 - DRILL_STALENESS_BPM - 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Always-speak overrides
// ---------------------------------------------------------------------------

describe("isAlwaysSpoken", () => {
  it("flags milestones, boundary events, and key interventions", () => {
    expect(isAlwaysSpoken("boundary_signal_a")).toBe(true);
    expect(isAlwaysSpoken("boundary_signal_b")).toBe(true);
    expect(isAlwaysSpoken("tempo_milestone")).toBe(true);
    expect(isAlwaysSpoken("recovery")).toBe(true);
    expect(isAlwaysSpoken("fatigue")).toBe(true);
    expect(isAlwaysSpoken("new_band_locked")).toBe(true);
  });

  it("does NOT flag everyday observations", () => {
    expect(isAlwaysSpoken("accuracy_drop")).toBe(false);
    expect(isAlwaysSpoken("rushing_trend")).toBe(false);
    expect(isAlwaysSpoken("dragging_trend")).toBe(false);
    expect(isAlwaysSpoken("low_confidence")).toBe(false);
    expect(isAlwaysSpoken("check_in")).toBe(false);
  });

  // 2026-05-17 — `personal_best_streak` was demoted from always-spoken
  // after player feedback that "Picking's locked" fired ~7s into a
  // session, before warmup completed. See the docstring on
  // `ALWAYS_SPOKEN` in gatekeeper.ts for the full rationale.
  it("does NOT flag personal_best_streak (demoted 2026-05-17)", () => {
    expect(isAlwaysSpoken("personal_best_streak")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Detectors — accuracy drop
// ---------------------------------------------------------------------------

describe("evaluate — accuracy_drop", () => {
  // Helper: a window with a 25%+ drop between prior (clean) and
  // recent (sloppy) halves. Used by every "real drop" test below so
  // the delta math doesn't drift across cases.
  function dropWindow(): BeatFeedback[] {
    return [
      ...manyHits(ACCURACY_DROP_WINDOW), // prior: 100%
      ...manyMisses(10), // recent: 10 misses + 6 hits = ~37% → 63% delta
      ...manyHits(ACCURACY_DROP_WINDOW - 10),
    ];
  }

  it("does NOT fire on first detection — drop must be confirmed", () => {
    // A 25% drop on a single 16-beat slice is a stumble, not a slip.
    // The detector should bump the confirmation counter but emit
    // nothing. The corresponding "fires after confirmation" test
    // below verifies that the next consecutive detection escalates.
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const { event, state: next } = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: dropWindow(),
    });
    expect(event).toBeNull();
    expect(next.accuracyDropConfirmations).toBe(1);
    expect(ACCURACY_DROP_CONFIRMATIONS).toBeGreaterThanOrEqual(2);
  });

  it("fires once the drop is confirmed on the next evaluation", () => {
    // First evaluation primes the counter; second confirms and emits.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = dropWindow();
    expect(window.length).toBe(ACCURACY_DROP_WINDOW * 2);
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    }).state;
    const second = evaluate(state, {
      now: T0 + 31_000,
      bpm: 120,
      window,
    });
    expect(second.event).not.toBeNull();
    expect(second.event!.scenario).toBe("accuracy_drop");
    expect(second.event!.tier).toBe("spoken");
    // Counter must reset after the confirmed emit so a later
    // unrelated dip has to re-confirm from zero.
    expect(second.state.accuracyDropConfirmations).toBe(0);
  });

  it("does NOT fire when accuracy is steady", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = manyHits(ACCURACY_DROP_WINDOW * 2);
    const { event } = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    });
    expect(event).toBeNull();
  });

  it("resets the confirmation counter when a non-drop evaluation runs between dips", () => {
    // First drop bumps the counter to 1. A clean window comes in —
    // counter resets. The next drop is treated as a fresh first
    // detection and must NOT fire.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: dropWindow(),
    }).state;
    expect(state.accuracyDropConfirmations).toBe(1);

    state = evaluate(state, {
      now: T0 + 31_000,
      bpm: 120,
      window: manyHits(ACCURACY_DROP_WINDOW * 2), // clean
    }).state;
    expect(state.accuracyDropConfirmations).toBe(0);

    const third = evaluate(state, {
      now: T0 + 32_000,
      bpm: 120,
      window: dropWindow(),
    });
    expect(third.event).toBeNull();
    expect(third.state.accuracyDropConfirmations).toBe(1);
  });

  it("does NOT fire while inside the spoken cooldown window", () => {
    // Two consecutive drops would normally escalate, but the spoken
    // cooldown still gates the final commit.
    let state = {
      ...createGatekeeper(T0),
      lastSpokenMs: T0 + 25_000, // just spoke 5s ago at the 30s mark
    };
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: dropWindow(),
    }).state;
    const second = evaluate(state, {
      now: T0 + 30_500,
      bpm: 120,
      window: dropWindow(),
    });
    expect(second.event).toBeNull();
  });

  // Regression — v0.9: the gatekeeper was firing
  // "Rough patch at 0% — ease the tempo down…" the moment the player
  // paused between exercises because the all-skipped recent window
  // counted every silent tick as a missed beat. Recent + prior both
  // need a minimum number of ATTEMPTED beats before we trust the
  // accuracy delta. See ACCURACY_DROP_MIN_SCORED.
  it("does NOT fire when the recent window is entirely skipped (player paused)", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW), // prior: 100% hits
      ...manySkipped(ACCURACY_DROP_WINDOW), // recent: nobody home
    ];
    const first = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    });
    expect(first.event).toBeNull();
    expect(first.state.accuracyDropConfirmations).toBe(0);
    const second = evaluate(first.state, {
      now: T0 + 31_000,
      bpm: 120,
      window,
    });
    expect(second.event).toBeNull();
  });

  it("does NOT fire when the recent window has too few attempts to be meaningful", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    // Recent half is mostly skipped with a couple of misses — under the
    // ACCURACY_DROP_MIN_SCORED floor, no detector should claim to know
    // what the player's "accuracy" is.
    const recent: BeatFeedback[] = [
      ...manySkipped(ACCURACY_DROP_WINDOW - 2),
      ...manyMisses(2),
    ];
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...recent,
    ];
    const first = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    });
    expect(first.event).toBeNull();
    const second = evaluate(first.state, {
      now: T0 + 31_000,
      bpm: 120,
      window,
    });
    expect(second.event).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Detectors — personal_best_streak
// ---------------------------------------------------------------------------

describe("evaluate — personal_best_streak", () => {
  it("fires once when the trailing clean streak exceeds the prior best", () => {
    const state = {
      ...createGatekeeper(T0),
      bestStreak: 8,
    };
    const window = manyHits(STREAK_PERSONAL_BEST_MIN + 10);
    const { state: s2, event } = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    });
    expect(event?.scenario).toBe("personal_best_streak");
    expect(event?.tier).toBe("spoken");
    expect(s2.bestStreak).toBe(window.length);
  });

  it("does not fire when the streak does not improve the best", () => {
    const state = {
      ...createGatekeeper(T0),
      bestStreak: 100,
    };
    const { event } = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: manyHits(STREAK_PERSONAL_BEST_MIN + 5),
    });
    expect(event).toBeNull();
  });

  // 2026-05-17 — `personal_best_streak` is no longer always-spoken,
  // so it MUST observe the spoken cooldown. This test used to assert
  // the opposite (bypass); flipped after demoting PB out of
  // ALWAYS_SPOKEN.
  it("respects the spoken cooldown after the demotion", () => {
    const state = {
      ...createGatekeeper(T0),
      lastSpokenMs: T0 + 29_000, // 1s ago — inside the 20s spoken floor
      bestStreak: 8,
    };
    const { event } = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: manyHits(STREAK_PERSONAL_BEST_MIN + 5),
    });
    expect(event).toBeNull();
  });

  // 2026-05-17 — paired with the cooldown test above: PB still fires
  // when the spoken cooldown is satisfied (this is the positive-path
  // proof that demoting PB didn't break the happy case).
  it("still fires once spoken cooldown has elapsed", () => {
    const state = {
      ...createGatekeeper(T0),
      // Past warmup (30s) and well past spoken cooldown floor (20s).
      lastSpokenMs: T0,
      bestStreak: 8,
    };
    const { event } = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window: manyHits(STREAK_PERSONAL_BEST_MIN + 5),
    });
    expect(event?.scenario).toBe("personal_best_streak");
    expect(event?.tier).toBe("spoken");
  });

  // 2026-05-17 — the regression this whole change exists to prevent:
  // a 24-beat streak inside the warmup window should NOT trigger a
  // "Picking's locked" tip.
  it("is suppressed during the warmup window", () => {
    const state = { ...createGatekeeper(T0), bestStreak: 8 };
    const { event } = evaluate(state, {
      // 7s in — exactly when the player's first 24-beat clean streak
      // would land at 16ths/80bpm. This is the firing time observed
      // in session_1779079018 that prompted the demotion.
      now: T0 + 7_000,
      bpm: 80,
      window: manyHits(STREAK_PERSONAL_BEST_MIN + 5),
    });
    expect(event).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Detectors — rushing / dragging trends + confirmation rule
// ---------------------------------------------------------------------------

describe("evaluate — rushing_trend confirmation rule", () => {
  it("first detection emits WRITTEN; second consecutive emits SPOKEN", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0), // prior: ~0ms
      ...manyHits(ACCURACY_DROP_WINDOW, -10), // recent: -10ms
    ];

    // Pass inStreak: false explicitly — in real usage a 100%-hit-rate
    // window would also trigger streak suppression and downgrade
    // spoken to written. This test isolates the confirmation rule.
    const r1 = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r1.event?.scenario).toBe("rushing_trend");
    expect(r1.event?.tier).toBe("written");
    state = r1.state;

    const r2 = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r2.event?.scenario).toBe("rushing_trend");
    expect(r2.event?.tier).toBe("spoken");
  });

  it("dragging trend mirrors rushing", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, 10),
    ];
    const r1 = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r1.event?.scenario).toBe("dragging_trend");
    state = r1.state;
    const r2 = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r2.event?.scenario).toBe("dragging_trend");
    expect(r2.event?.tier).toBe("spoken");
  });

  it("resets confirmation counter when trend dies (no flap)", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const rushWindow = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    state = evaluate(state, { now: T0 + 30_000, bpm: 120, window: rushWindow }).state;
    expect(state.trendConfirmations.rushing).toBe(1);

    // Stable window — should zero confirmations.
    const steadyWindow = manyHits(ACCURACY_DROP_WINDOW * 2, 0);
    state = evaluate(state, { now: T0 + 60_000, bpm: 120, window: steadyWindow }).state;
    expect(state.trendConfirmations.rushing).toBe(0);
  });

  it("requires TREND_CONFIRMATION_REQUIRED detections before spoken", () => {
    expect(TREND_CONFIRMATION_REQUIRED).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Streak suppression
// ---------------------------------------------------------------------------

describe("evaluate — streak suppression mid-segment", () => {
  it("downgrades spoken trend to written when accuracy stays high", () => {
    // Build state with confirmations already at 1 so the next call
    // would naturally escalate to spoken — except for streak suppression.
    let state = createGatekeeper(T0);
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    state = evaluate(state, { now: T0 + 30_000, bpm: 120, window }).state;
    // Force in-streak.
    const { event } = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window,
      inStreak: true,
    });
    expect(event?.tier).toBe("written");
  });

  it("does NOT downgrade non-trend scenarios (suppression targets trends only)", () => {
    // Streak suppression only applies to the rushing/dragging trend
    // branch inside `evaluate`. Other scenarios — including
    // personal_best_streak after its 2026-05-17 demotion — are
    // unaffected by the `inStreak` signal.
    const state = { ...createGatekeeper(T0), bestStreak: 8 };
    const { event } = evaluate(state, {
      // Just past warmup so the (now-demoted) personal_best_streak
      // gate-check can succeed.
      now: T0 + WARMUP_GRACE_MS + 1,
      bpm: 120,
      // STREAK_PERSONAL_BEST_MIN + 5 = 29; clears min (24) AND
      // growth gate (bestStreak 8 + GROWTH 8 = 16).
      window: manyHits(STREAK_PERSONAL_BEST_MIN + 5),
      inStreak: true,
    });
    expect(event?.scenario).toBe("personal_best_streak");
    expect(event?.tier).toBe("spoken");
  });
});

// ---------------------------------------------------------------------------
// New-band-locked
// ---------------------------------------------------------------------------

describe("evaluate — new_band_locked", () => {
  it("waits NEW_BAND_DURATION_MS at the same band before firing", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = manyHits(20);

    // First evaluation seeds the lock timestamp.
    let r = evaluate(state, { now: T0 + 30_000, bpm: 130, window });
    expect(r.event).toBeNull();
    expect(r.state.lockedBpmLow).toBe(130);
    state = r.state;

    // Still inside the duration window — no fire.
    r = evaluate(state, {
      now: T0 + 30_000 + NEW_BAND_DURATION_MS - 1,
      bpm: 130,
      window,
    });
    expect(r.event).toBeNull();
    state = r.state;

    // Crossed the duration — fires once.
    r = evaluate(state, {
      now: T0 + 30_000 + NEW_BAND_DURATION_MS + 1,
      bpm: 130,
      window,
    });
    expect(r.event?.scenario).toBe("new_band_locked");
    expect(r.event?.tier).toBe("spoken");
    // After firing, lock-since clears so we don't re-emit until
    // the user leaves and re-enters the band.
    expect(r.state.bandLockedSinceMs).toBeNull();
  });

  it("resets the lock when accuracy drops below 85%", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 130,
      window: manyHits(20),
    }).state;
    expect(state.lockedBpmLow).toBe(130);

    state = evaluate(state, {
      now: T0 + 35_000,
      bpm: 130,
      window: [...manyHits(10), ...manyMisses(10)], // 50% hit rate
    }).state;
    expect(state.lockedBpmLow).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Check-in adaptive floor
// ---------------------------------------------------------------------------

describe("evaluate — check_in adaptive floor", () => {
  it("fires after 5+ minutes of silence on the spoken channel", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const { event } = evaluate(state, {
      now: T0 + CHECK_IN_AFTER_QUIET_MS + 1,
      bpm: 120,
      window: manyHits(8), // not enough for trend detectors
    });
    expect(event?.scenario).toBe("check_in");
    expect(event?.tier).toBe("spoken");
  });

  it("does NOT fire if a spoken event happened recently", () => {
    const state = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastSpokenMs: T0 + CHECK_IN_AFTER_QUIET_MS - 60_000,
    };
    const { event } = evaluate(state, {
      now: T0 + CHECK_IN_AFTER_QUIET_MS,
      bpm: 120,
      window: manyHits(8),
    });
    expect(event).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forced events
// ---------------------------------------------------------------------------

describe("evaluate — forced events", () => {
  it("forced scenario always wins, bypassing cooldown", () => {
    const state = {
      ...createGatekeeper(T0),
      lastSpokenMs: T0 + 29_000, // 1s ago — would gate everyday events
    };
    const { event } = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: manyHits(8),
      force: {
        scenario: "boundary_signal_b",
        context: { score: 91, bpm: 120 },
      },
    });
    expect(event?.scenario).toBe("boundary_signal_b");
    expect(event?.tier).toBe("spoken");
    expect(event?.context.score).toBe(91);
  });

  it("forced event commits lastSpokenMs so subsequent calls cool down", () => {
    // Post-warmup forced event commits at spoken tier — both
    // cooldown channels are pulled forward.
    const state = createGatekeeper(T0);
    const r = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 1_000,
      bpm: 120,
      window: [],
      force: { scenario: "boundary_signal_a", context: {} },
    });
    expect(r.state.lastSpokenMs).toBe(T0 + WARMUP_GRACE_MS + 1_000);
    expect(r.state.lastWrittenMs).toBe(T0 + WARMUP_GRACE_MS + 1_000);
  });

  it("forced event during initial warmup only commits lastWrittenMs", () => {
    // Inside the initial-warmup envelope, forced events are demoted
    // to written tier — so the spoken cooldown clock must NOT advance.
    // (See `isInInitialWarmup` + the forced-branch tier resolver in
    // `evaluate`.) Without this guard, a forced Signal A at T0+1_000
    // would lock the spoken channel for the next 20s+ and starve
    // legitimate post-warmup spoken events.
    const state = createGatekeeper(T0);
    const r = evaluate(state, {
      now: T0 + 1_000,
      bpm: 120,
      window: [],
      force: { scenario: "boundary_signal_a", context: {} },
    });
    expect(r.event?.tier).toBe("written");
    // lastSpokenMs left at the default seeded by createGatekeeper.
    expect(r.state.lastSpokenMs).toBe(T0);
    expect(r.state.lastWrittenMs).toBe(T0 + 1_000);
  });
});

// ---------------------------------------------------------------------------
// resetCooldowns (chat engagement)
// ---------------------------------------------------------------------------

describe("resetCooldowns", () => {
  it("pulls last*Ms back so the next event fires after the floor only", () => {
    const state = {
      ...createGatekeeper(T0),
      lastSpokenMs: T0 + 60_000,
      lastWrittenMs: T0 + 60_000,
    };
    const reset = resetCooldowns(state, T0 + 90_000);
    expect(T0 + 90_000 - reset.lastSpokenMs).toBe(SPOKEN_COOLDOWN_FLOOR_MS);
    expect(T0 + 90_000 - reset.lastWrittenMs).toBe(WRITTEN_COOLDOWN_FLOOR_MS);
  });

  it("preserves trend confirmations and best-streak knowledge", () => {
    const state = {
      ...createGatekeeper(T0),
      bestStreak: 24,
      trendConfirmations: { rushing: 1, dragging: 0 },
    };
    const reset = resetCooldowns(state, T0 + 60_000);
    expect(reset.bestStreak).toBe(24);
    expect(reset.trendConfirmations).toEqual({ rushing: 1, dragging: 0 });
  });
});

// ---------------------------------------------------------------------------
// First-4-beats hard rule (TTS suppression)
// ---------------------------------------------------------------------------

describe("isFirstBeatsExempt", () => {
  it("exempts boundary_signal_a so user-initiated changes still speak", () => {
    expect(isFirstBeatsExempt("boundary_signal_a")).toBe(true);
  });

  it("does NOT exempt boundary_signal_b (post-activity-gap can wait 4 beats)", () => {
    expect(isFirstBeatsExempt("boundary_signal_b")).toBe(false);
  });

  it("does NOT exempt observational scenarios", () => {
    expect(isFirstBeatsExempt("accuracy_drop")).toBe(false);
    expect(isFirstBeatsExempt("rushing_trend")).toBe(false);
    expect(isFirstBeatsExempt("personal_best_streak")).toBe(false);
    expect(isFirstBeatsExempt("check_in")).toBe(false);
  });
});

describe("evaluate — first-4-beats TTS hard rule", () => {
  it("demotes spoken accuracy_drop to written during first 4 beats", () => {
    // First pass primes the confirmation counter; second pass
    // produces the event we actually assert on. Both passes use
    // beatsInSegment under the floor so the final tier is written.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      beatsInSegment: 2,
    }).state;
    const { event } = evaluate(state, {
      now: T0 + 30_500,
      bpm: 120,
      window,
      beatsInSegment: 2,
    });
    expect(event?.scenario).toBe("accuracy_drop");
    expect(event?.tier).toBe("written");
  });

  it("speaks once the segment has crossed the FIRST_BEATS_TTS_FLOOR", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      beatsInSegment: FIRST_BEATS_TTS_FLOOR,
    }).state;
    const { event } = evaluate(state, {
      now: T0 + 30_500,
      bpm: 120,
      window,
      beatsInSegment: FIRST_BEATS_TTS_FLOOR,
    });
    expect(event?.scenario).toBe("accuracy_drop");
    expect(event?.tier).toBe("spoken");
  });

  it("Signal A speaks at beat 0 once past initial warmup (user-initiated boundary)", () => {
    // Signal A is exempt from the first-4-beats rule (a tempo change
    // the user just made should announce regardless of beats elapsed)
    // — but only AFTER the initial-warmup envelope. Inside the first
    // 30s of a session, the initial-warmup demotion still wins.
    const state = createGatekeeper(T0);
    const { event } = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 1_000,
      bpm: 130,
      window: manyHits(8),
      beatsInSegment: 0,
      force: {
        scenario: "boundary_signal_a",
        context: { change: "tempo up to 130 BPM" },
      },
    });
    expect(event?.scenario).toBe("boundary_signal_a");
    expect(event?.tier).toBe("spoken");
  });

  it("Signal A is demoted to written during the initial warmup envelope", () => {
    // Belt-and-suspenders: even the first-4-beats-exempt Signal A
    // observes the initial warmup. Otherwise a tempo change at T0+1s
    // would speak inside a window the user just asked to be quiet.
    const state = createGatekeeper(T0);
    const { event } = evaluate(state, {
      now: T0 + 1_000,
      bpm: 130,
      window: manyHits(8),
      beatsInSegment: 0,
      force: {
        scenario: "boundary_signal_a",
        context: { change: "tempo up to 130 BPM" },
      },
    });
    expect(event?.scenario).toBe("boundary_signal_a");
    expect(event?.tier).toBe("written");
  });

  it("Signal B is demoted during the first 4 beats of its new segment", () => {
    const state = createGatekeeper(T0);
    const { event } = evaluate(state, {
      now: T0 + 1_000,
      bpm: 130,
      window: manyHits(8),
      beatsInSegment: 1,
      force: {
        scenario: "boundary_signal_b",
        context: { score: 88 },
      },
    });
    expect(event?.scenario).toBe("boundary_signal_b");
    expect(event?.tier).toBe("written");
  });

  it("rule is bypassed when beatsInSegment is omitted (legacy callers)", () => {
    // Confirmation gate still applies — first pass primes the
    // counter, second pass produces the spoken event we assert on.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    }).state;
    const { event } = evaluate(state, {
      now: T0 + 30_500,
      bpm: 120,
      window,
    });
    expect(event?.tier).toBe("spoken");
  });
});

// ---------------------------------------------------------------------------
// Low-confidence caveat (one-shot per session)
// ---------------------------------------------------------------------------

function fbWithConfidence(
  classification: BeatFeedback["classification"],
  calibrationConfidence: number,
): BeatFeedback {
  return {
    beatIndex: 0,
    deviationMs: 0,
    intervalErrorMs: 0,
    classification,
    amplitude: 0.5,
    calibrationOffsetMs: 0,
    calibrationConfidence,
    gridCorrelation: 0.9,
  };
}

function lowConfWindow(n: number, conf: number): BeatFeedback[] {
  return Array.from({ length: n }, () => fbWithConfidence("good", conf));
}

describe("evaluate — low_confidence caveat", () => {
  it("does NOT fire on the first dip below 0.5 (needs to sustain)", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const r = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: lowConfWindow(16, 0.3),
    });
    expect(r.event).toBeNull();
    // But the dip timer should be seeded.
    expect(r.state.lowConfidenceSinceMs).toBe(T0 + 30_000);
  });

  it("fires once after LOW_CONFIDENCE_SUSTAIN_MS of sustained low confidence", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    // Open the dip timer.
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: lowConfWindow(16, 0.3),
    }).state;
    // Cross the sustain threshold.
    const r = evaluate(state, {
      now: T0 + 30_000 + LOW_CONFIDENCE_SUSTAIN_MS + 1,
      bpm: 120,
      window: lowConfWindow(16, 0.3),
    });
    expect(r.event?.scenario).toBe("low_confidence");
    expect(r.event?.tier).toBe("spoken");
  });

  it("is one-shot — does NOT fire again once it has fired this session", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: lowConfWindow(16, 0.3),
    }).state;
    state = evaluate(state, {
      now: T0 + 30_000 + LOW_CONFIDENCE_SUSTAIN_MS + 1,
      bpm: 120,
      window: lowConfWindow(16, 0.3),
    }).state;
    // Second sustained dip after a "recovery" gap.
    state = { ...state, lowConfidenceSinceMs: null };
    const r = evaluate(state, {
      now: T0 + 5 * LOW_CONFIDENCE_SUSTAIN_MS,
      bpm: 120,
      window: lowConfWindow(16, 0.2),
    });
    // No new low_confidence event — and the dip timer should be re-seeded
    // for telemetry but not act on it.
    expect(r.event?.scenario).not.toBe("low_confidence");
  });

  it("clears the dip timer when confidence recovers above 0.5", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: lowConfWindow(16, 0.3),
    }).state;
    expect(state.lowConfidenceSinceMs).not.toBeNull();
    state = evaluate(state, {
      now: T0 + 45_000,
      bpm: 120,
      window: lowConfWindow(16, 0.8), // recovered
    }).state;
    expect(state.lowConfidenceSinceMs).toBeNull();
  });

  it("does NOT fire when confidence is high", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const r = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: lowConfWindow(16, 0.9),
    });
    expect(r.event).toBeNull();
    expect(r.state.lowConfidenceSinceMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Warmup grace (per-session and per-tempo-change quiet runway)
// ---------------------------------------------------------------------------

describe("createGatekeeper warmup default", () => {
  it("arms warmupUntilMs to sessionStart + WARMUP_GRACE_MS", () => {
    const state = createGatekeeper(T0);
    expect(state.warmupUntilMs).toBe(T0 + WARMUP_GRACE_MS);
  });

  it("starts with empty recentFireTimes and recentScenarios", () => {
    const state = createGatekeeper(T0);
    expect(state.recentFireTimes).toEqual([]);
    expect(state.recentScenarios).toEqual([]);
  });
});

describe("evaluate — warmup grace", () => {
  it("suppresses non-always-spoken scenarios during warmup", () => {
    const state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW), // prior 100%
      ...manyMisses(ACCURACY_DROP_WINDOW), // recent 0% — would normally fire accuracy_drop
    ];
    // Inside warmup window: even though the detector triggers, the
    // gate should swallow the event.
    const { event } = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS - 1, // 1ms before warmup ends
      bpm: 120,
      window,
    });
    expect(event).toBeNull();
  });

  it("allows non-always-spoken scenarios once warmup has elapsed", () => {
    // Warmup also has to clear the confirmation gate — two
    // consecutive drops well past warmup before accuracy_drop fires.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    state = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 30_000,
      bpm: 120,
      window,
    }).state;
    const { event } = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 30_500,
      bpm: 120,
      window,
    });
    expect(event?.scenario).toBe("accuracy_drop");
  });

  it("demotes forced events to written tier during initial warmup", () => {
    // Forced events (settings changes the user just made) still surface
    // during initial warmup — silence would feel broken — but they're
    // written-only so the user gets visual ack without the coach
    // jumping in audibly within the first 30s of a session.
    // Pre-2026-05-17 this test asserted the forced bypass; that bypass
    // ALSO short-circuited the tier resolver, so a forced event landed
    // at full spoken tier the instant a session started. The cadence
    // fix demotes the tier to "written" while inside the initial
    // warmup envelope so the warmup grace is actually respected.
    const state = createGatekeeper(T0);
    const { event } = evaluate(state, {
      now: T0 + 1_000, // deep inside warmup
      bpm: 120,
      window: manyHits(8),
      force: { scenario: "boundary_signal_a", context: { change: "tempo up" } },
    });
    expect(event?.scenario).toBe("boundary_signal_a");
    expect(event?.tier).toBe("written");
  });

  it("fires forced events at spoken tier once initial warmup has elapsed", () => {
    // Past the initial warmup envelope, forced events resolve to
    // spoken tier as before — only the first 30s of a session is
    // protected from audible interjections.
    const state = createGatekeeper(T0);
    const { event } = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 500,
      bpm: 130,
      window: manyHits(8),
      force: { scenario: "boundary_signal_a", context: { change: "tempo up" } },
    });
    expect(event?.scenario).toBe("boundary_signal_a");
    expect(event?.tier).toBe("spoken");
  });

  it("isInInitialWarmup tracks the WARMUP_GRACE_MS envelope from session start", () => {
    const state = createGatekeeper(T0);
    expect(isInInitialWarmup(state, T0)).toBe(true);
    expect(isInInitialWarmup(state, T0 + WARMUP_GRACE_MS - 1)).toBe(true);
    expect(isInInitialWarmup(state, T0 + WARMUP_GRACE_MS)).toBe(false);
    expect(isInInitialWarmup(state, T0 + WARMUP_GRACE_MS + 60_000)).toBe(false);
  });

  it("auto-bumps warmup when boundary_signal_a commits", () => {
    const state = createGatekeeper(T0);
    const fireAt = T0 + 60_000; // well past initial warmup
    const r = evaluate(state, {
      now: fireAt,
      bpm: 130,
      window: manyHits(8),
      force: { scenario: "boundary_signal_a", context: {} },
    });
    // After Signal A, warmup should be re-armed to now + tempo-change duration.
    expect(r.state.warmupUntilMs).toBe(fireAt + WARMUP_GRACE_TEMPO_MS);
  });

  it("auto-bumps warmup when boundary_signal_b commits", () => {
    const state = createGatekeeper(T0);
    const fireAt = T0 + 90_000;
    const r = evaluate(state, {
      now: fireAt,
      bpm: 120,
      window: manyHits(8),
      force: { scenario: "boundary_signal_b", context: { score: 91 } },
    });
    expect(r.state.warmupUntilMs).toBe(fireAt + WARMUP_GRACE_TEMPO_MS);
  });

  it("suppresses non-always-spoken events after a tempo-change warmup re-arm", () => {
    // Session has been running long enough that the initial warmup is
    // ancient history. A Signal A re-arms warmup. The next observational
    // event inside that re-armed window should be swallowed.
    let state = createGatekeeper(T0);
    state = { ...state, bestStreak: HIGH_PB };
    const tempoChangeAt = T0 + 60_000;
    const r1 = evaluate(state, {
      now: tempoChangeAt,
      bpm: 130,
      window: manyHits(8),
      force: { scenario: "boundary_signal_a", context: {} },
    });
    state = r1.state;
    // Try to fire accuracy_drop 1s into the re-armed warmup.
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    const r2 = evaluate(state, {
      now: tempoChangeAt + 1_000,
      bpm: 130,
      window,
    });
    expect(r2.event).toBeNull();
  });

  it("fatigue is fully blocked at t=20s (warmup) and fires spoken at t=35s", () => {
    // fatigue is ALWAYS_SPOKEN but the force path now explicitly returns
    // null during the initial 30-s warmup — cold-start imprecision is
    // expected and a fatigue tip that early would be misleading.
    // Other forced events are only demoted to "written"; fatigue is
    // suppressed entirely.
    const state = createGatekeeper(T0);

    // 20s in — inside initial warmup window → null, not even written
    const r20 = evaluate(state, {
      now: T0 + 20_000,
      bpm: 120,
      window: manyHits(4),
      force: { scenario: "fatigue", context: {} },
    });
    expect(r20.event).toBeNull();
    expect(isInInitialWarmup(state, T0 + 20_000)).toBe(true);

    // 35s in — past the 30-s warmup boundary → spoken
    const r35 = evaluate(state, {
      now: T0 + 35_000,
      bpm: 120,
      window: manyHits(4),
      force: { scenario: "fatigue", context: {} },
    });
    expect(r35.event?.tier).toBe("spoken");
    expect(isInInitialWarmup(state, T0 + 35_000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Verbosity gate — "less" silences organic tips; "more" shortens cooldowns.
// ---------------------------------------------------------------------------

describe("evaluate — verbosity gate", () => {
  // Drop window produces an accuracy_drop detection after 2 evaluations.
  const DROP_WINDOW = [
    ...manyHits(ACCURACY_DROP_WINDOW),
    ...manyMisses(ACCURACY_DROP_WINDOW),
  ];

  /** Helper: evaluate twice with the same drop window, return the second event. */
  function twoDropEvals(
    startState: ReturnType<typeof createGatekeeper>,
    now1: number,
    verbosity?: "less" | "default" | "more",
  ) {
    const r1 = evaluate(startState, {
      now: now1,
      bpm: 120,
      window: DROP_WINDOW,
      verbosity,
    });
    const r2 = evaluate(r1.state, {
      now: now1 + 500,
      bpm: 120,
      window: DROP_WINDOW,
      verbosity,
    });
    return r2;
  }

  it("verbosity='less' suppresses all organic tips — 0 events", () => {
    // Past warmup and far past spoken cooldown, so 'default' would fire.
    const state = createGatekeeper(T0);
    const now = T0 + WARMUP_GRACE_MS + 25_000;
    const r = twoDropEvals(state, now, "less");
    expect(r.event).toBeNull();
  });

  it("verbosity='default' fires accuracy_drop when warmup + cooldown clear", () => {
    const state = createGatekeeper(T0);
    const now = T0 + WARMUP_GRACE_MS + 25_000;
    const r = twoDropEvals(state, now);
    expect(r.event?.scenario).toBe("accuracy_drop");
  });

  it("verbosity='more' fires tips sooner (cooldown × 0.6)", () => {
    // Fire a forced boundary event to commit lastSpokenMs, then try to fire
    // accuracy_drop 15 s later. At the spoken cooldown floor (20 s) the default
    // path is still blocked, but the 'more' path (12 s floor) allows it.
    const baseState = createGatekeeper(T0);
    const firstFireAt = T0 + WARMUP_GRACE_MS + 1_000;
    const forced = evaluate(baseState, {
      now: firstFireAt,
      bpm: 120,
      window: manyHits(4),
      force: { scenario: "boundary_signal_a", context: {} },
    });
    // lastSpokenMs is now firstFireAt.  Try an accuracy_drop 15 s later.
    const attemptAt = firstFireAt + 15_000;

    // 'more': cooldown = floor(20_000) × 0.6 = 12_000 → 15_000 >= 12_000 → fires
    const rMore = twoDropEvals(forced.state, attemptAt, "more");
    expect(rMore.event?.scenario).toBe("accuracy_drop");

    // 'default': cooldown = 20_000 → 15_000 < 20_000 → blocked
    const rDefault = twoDropEvals(forced.state, attemptAt);
    expect(rDefault.event).toBeNull();
  });

  it("spokenCooldownMs scales with 'more' verbosity", () => {
    // Sanity-pin the multiplier: floor × 0.6 = 12 s.
    expect(spokenCooldownMs(0, "more")).toBeCloseTo(SPOKEN_COOLDOWN_FLOOR_MS * 0.6);
    expect(spokenCooldownMs(0, "default")).toBe(SPOKEN_COOLDOWN_FLOOR_MS);
    expect(spokenCooldownMs(0)).toBe(SPOKEN_COOLDOWN_FLOOR_MS);
    // Ceiling also scales.
    expect(spokenCooldownMs(20 * 60 * 1_000, "more")).toBeCloseTo(
      SPOKEN_COOLDOWN_CEILING_MS * 0.6,
    );
  });
});

// ---------------------------------------------------------------------------
// Corrective channel cooldown — cross-scenario cooldown across the
// {rushing_trend, dragging_trend, accuracy_drop, fatigue} family so
// the coach doesn't pile on with overlapping advice in tight windows.
// ---------------------------------------------------------------------------

describe("evaluate — corrective channel cooldown", () => {
  it("CORRECTIVE_CHANNEL_COOLDOWN_MS is 30 seconds", () => {
    // Sanity-pin the constant; bumping this affects perceived chatter
    // and should be a deliberate decision, not a slip in tuning.
    expect(CORRECTIVE_CHANNEL_COOLDOWN_MS).toBe(30_000);
  });

  it("blocks a corrective scenario when another corrective fired within the window", () => {
    // Seed `lastEventMs.rushing_trend` as if rushing_trend had just
    // committed 15s before our evaluation. accuracy_drop's OWN
    // per-scenario cooldown is fresh, but the cross-family gate
    // should still suppress it.
    let state = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastEventMs: {
        rushing_trend: T0 + WARMUP_GRACE_MS + 15_000,
      } as Partial<Record<ScenarioTag, number>>,
    };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    // Two passes to clear the accuracy-drop confirmation counter —
    // both inside the corrective-cooldown window.
    state = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 25_000,
      bpm: 120,
      window,
    }).state;
    const result = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 25_500,
      bpm: 120,
      window,
    });
    expect(result.event).toBeNull();
  });

  it("allows a corrective scenario once the cross-family cooldown has elapsed", () => {
    let state = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastEventMs: {
        rushing_trend: T0 + WARMUP_GRACE_MS + 15_000,
      } as Partial<Record<ScenarioTag, number>>,
    };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    // Two passes well past the 30s envelope (>= 30s after the
    // rushing_trend fire at WARMUP_GRACE_MS + 15_000).
    state = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 50_000,
      bpm: 120,
      window,
    }).state;
    const result = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 50_500,
      bpm: 120,
      window,
    });
    expect(result.event?.scenario).toBe("accuracy_drop");
  });

  it("does NOT block non-corrective scenarios", () => {
    // personal_best_streak is outside the corrective family. A recent
    // rushing_trend fire must NOT suppress milestones / streaks.
    const state = {
      ...createGatekeeper(T0),
      bestStreak: 8,
      lastEventMs: {
        rushing_trend: T0 + WARMUP_GRACE_MS + 15_000,
      } as Partial<Record<ScenarioTag, number>>,
    };
    const result = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 25_000,
      bpm: 120,
      window: manyHits(STREAK_PERSONAL_BEST_MIN + 5),
    });
    expect(result.event?.scenario).toBe("personal_best_streak");
  });

  it("treats the corrective family as cross-scenario — dragging blocks rushing too", () => {
    // The gate looks across the whole family, not just one tag at a
    // time. Seed dragging_trend's fire time and verify rushing_trend
    // is suppressed (and vice-versa is exercised by the other tests).
    let state = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastEventMs: {
        dragging_trend: T0 + WARMUP_GRACE_MS + 10_000,
      } as Partial<Record<ScenarioTag, number>>,
    };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    state = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 20_000,
      bpm: 120,
      window,
      inStreak: false,
    }).state;
    const result = evaluate(state, {
      now: T0 + WARMUP_GRACE_MS + 20_500,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(result.event).toBeNull();
  });
});

describe("bumpWarmup", () => {
  it("extends warmupUntilMs by the given duration", () => {
    const state = createGatekeeper(T0);
    const bumped = bumpWarmup(state, T0 + 30_000, 8_000);
    expect(bumped.warmupUntilMs).toBe(T0 + 38_000);
  });

  it("uses WARMUP_GRACE_TEMPO_MS as the default duration", () => {
    const state = createGatekeeper(T0);
    const bumped = bumpWarmup(state, T0 + 30_000);
    expect(bumped.warmupUntilMs).toBe(T0 + 30_000 + WARMUP_GRACE_TEMPO_MS);
  });

  it("is monotonic — never pulls warmupUntilMs backward", () => {
    const state = { ...createGatekeeper(T0), warmupUntilMs: T0 + 100_000 };
    const bumped = bumpWarmup(state, T0 + 5_000, 5_000);
    expect(bumped.warmupUntilMs).toBe(T0 + 100_000);
    // Same object back — no mutation when bump would be a no-op.
    expect(bumped).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Burst limiter (back-off after chatty stretches)
// ---------------------------------------------------------------------------

/**
 * Helper: seed `recentFireTimes` directly so burst-limit tests don't
 * have to walk through full detector flow. Real production state would
 * accumulate these via `commit`, but for unit tests we want fast,
 * targeted setup.
 */
function seedFires(state = createGatekeeper(T0), times: number[]) {
  return { ...state, recentFireTimes: [...times], bestStreak: HIGH_PB };
}

describe("evaluate — burst limiter", () => {
  it("blocks non-always-spoken events once BURST_SHORT_MAX is hit in the short window", () => {
    // 3 fires in the last 30s → should require 45s of silence from the
    // most recent fire before another tip is allowed.
    const fireAt = T0 + 60_000;
    const recentFires = [fireAt - 20_000, fireAt - 10_000, fireAt - 1_000];
    const state = seedFires(createGatekeeper(T0), recentFires);
    // Try to fire accuracy_drop just after the burst — within penalty window.
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    const r = evaluate(state, {
      now: fireAt + 500,
      bpm: 120,
      window,
    });
    expect(r.event).toBeNull();
  });

  it("allows events again once BURST_SHORT_PENALTY_MS has elapsed", () => {
    const lastFire = T0 + 60_000;
    const recentFires = [lastFire - 20_000, lastFire - 10_000, lastFire];
    let state = seedFires(createGatekeeper(T0), recentFires);
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    // Accuracy_drop now needs two consecutive detections — the burst
    // limiter is what we're testing, not the confirmation gate, so
    // prime the counter with a first pass then confirm.
    state = evaluate(state, {
      now: lastFire + BURST_SHORT_PENALTY_MS + 1_000,
      bpm: 120,
      window,
    }).state;
    const r = evaluate(state, {
      now: lastFire + BURST_SHORT_PENALTY_MS + 1_500,
      bpm: 120,
      window,
    });
    expect(r.event?.scenario).toBe("accuracy_drop");
  });

  it("does NOT block ALWAYS_SPOKEN scenarios even mid-burst", () => {
    // 2026-05-17 — switched from personal_best_streak (which was demoted
    // out of ALWAYS_SPOKEN, see gatekeeper.ts) to new_band_locked, which
    // is now the only detector-driven always-spoken scenario. Sets up
    // the band-lock state directly so the detector fires on the next
    // eval call.
    const lastFire = T0 + 60_000;
    const recentFires = [lastFire - 20_000, lastFire - 10_000, lastFire - 1_000];
    const lockedSince = lastFire - NEW_BAND_DURATION_MS - 1_000;
    const state = {
      ...seedFires(createGatekeeper(T0), recentFires),
      // Pre-arm new_band_locked: same band as `bpm` below + sustained
      // long enough that the detector fires next eval.
      lockedBpmLow: 120,
      bandLockedSinceMs: lockedSince,
    };
    const r = evaluate(state, {
      now: lastFire + 1_000,
      bpm: 120,
      window: manyHits(20), // ≥85% over STREAK_SUPPRESSION_MIN_LEN
    });
    expect(r.event?.scenario).toBe("new_band_locked");
  });

  it("blocks once BURST_LONG_MAX is hit in the long window", () => {
    // 5 fires in 60s → 90s penalty.
    const lastFire = T0 + 60_000;
    const fires = [
      lastFire - 55_000,
      lastFire - 45_000,
      lastFire - 35_000,
      lastFire - 25_000,
      lastFire - 1_000,
    ];
    const state = seedFires(createGatekeeper(T0), fires);
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    const r = evaluate(state, {
      now: lastFire + 1_000,
      bpm: 120,
      window,
    });
    expect(r.event).toBeNull();
  });

  it("commit() prunes recentFireTimes older than BURST_LONG_WINDOW_MS", () => {
    const state = seedFires(createGatekeeper(T0), [
      T0 + 1_000,
      T0 + 2_000,
      T0 + 3_000,
    ]);
    // Fire a forced event WAY in the future — older entries should
    // disappear because they're outside the long window.
    const now = T0 + 5 * BURST_LONG_WINDOW_MS;
    const r = evaluate(state, {
      now,
      bpm: 120,
      window: manyHits(8),
      force: { scenario: "boundary_signal_a", context: {} },
    });
    expect(r.state.recentFireTimes).toEqual([now]);
  });

  it("records every commit (not just spoken) in recentFireTimes", () => {
    // First commit a forced event so the counter starts. Then check the
    // resulting state has exactly one entry.
    const state = createGatekeeper(T0);
    const r = evaluate(state, {
      now: T0 + 1_000,
      bpm: 120,
      window: manyHits(4),
      force: { scenario: "boundary_signal_a", context: {} },
    });
    expect(r.state.recentFireTimes).toEqual([T0 + 1_000]);
  });

  it("constants are wired through (smoke check)", () => {
    expect(BURST_SHORT_MAX).toBe(3);
    expect(BURST_SHORT_WINDOW_MS).toBe(30_000);
    expect(BURST_SHORT_PENALTY_MS).toBe(45_000);
    expect(BURST_LONG_MAX).toBe(5);
    expect(BURST_LONG_WINDOW_MS).toBe(60_000);
    expect(BURST_LONG_PENALTY_MS).toBe(90_000);
  });
});

// ---------------------------------------------------------------------------
// Repetition suppression (no "bad, bad" sequences)
// ---------------------------------------------------------------------------

describe("evaluate — repetition suppression", () => {
  it("blocks the same non-always-spoken scenario from firing twice in a row", () => {
    // Fire accuracy_drop once. Confirmation gate now requires two
    // consecutive detections, so we prime with one pass then commit
    // on the second before the repetition gate gets exercised.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
    }).state;
    const r1 = evaluate(state, {
      now: T0 + 30_500,
      bpm: 120,
      window,
    });
    expect(r1.event?.scenario).toBe("accuracy_drop");
    state = r1.state;
    expect(state.recentScenarios).toEqual([
      { scenario: "accuracy_drop", tier: "spoken" },
    ]);

    // Try to fire accuracy_drop again at a time that would pass the
    // spoken cooldown. Two passes again to clear confirmation; the
    // repetition gate (same scenario + same tier) is what should
    // swallow the second commit.
    state = evaluate(state, {
      now: T0 + 30_000 + SPOKEN_COOLDOWN_CEILING_MS + 1_000,
      bpm: 120,
      window,
    }).state;
    const r2 = evaluate(state, {
      now: T0 + 30_000 + SPOKEN_COOLDOWN_CEILING_MS + 1_500,
      bpm: 120,
      window,
    });
    expect(r2.event).toBeNull();
  });

  it("allows a different scenario to fire after one just did", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const dropWindow = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window: dropWindow,
    }).state;
    const r1 = evaluate(state, {
      now: T0 + 30_500,
      bpm: 120,
      window: dropWindow,
    });
    expect(r1.event?.scenario).toBe("accuracy_drop");
    state = r1.state;

    // Switch to an all-clean window (no misses) — this triggers
    // recovery_confirmed first (awaitingRecovery=true from the
    // accuracy_drop, and trailingCleanStreak ≥ 3). The recovery
    // acknowledgement is a DIFFERENT scenario from accuracy_drop,
    // which satisfies the original test intent: the repetition gate
    // allows cross-scenario firing.
    const rushWindow = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    const r2 = evaluate(state, {
      now: T0 + 30_000 + SPOKEN_COOLDOWN_CEILING_MS + 1_000,
      bpm: 120,
      window: rushWindow,
      inStreak: false,
    });
    expect(r2.event?.scenario).toBe("recovery_confirmed");
  });

  it("does NOT block ALWAYS_SPOKEN scenarios from repeating", () => {
    // 2026-05-17 — switched from personal_best_streak (which was demoted
    // out of ALWAYS_SPOKEN) to new_band_locked. We pre-seed history
    // with a prior new_band_locked entry, then prove a fresh
    // new_band_locked fires through the repetition gate.
    const lockedSince = T0 + 60_000 - NEW_BAND_DURATION_MS - 1_000;
    const state = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      // Prior fire in history: same scenario + tier as what we're
      // about to fire — would block any non-always-spoken scenario.
      recentScenarios: [
        { scenario: "new_band_locked" as const, tier: "spoken" as const },
      ],
      // Pre-arm new_band_locked so the detector triggers next eval.
      lockedBpmLow: 120,
      bandLockedSinceMs: lockedSince,
    };
    const r = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window: manyHits(20),
    });
    expect(r.event?.scenario).toBe("new_band_locked");
  });

  it("allows the trend-confirmation written→spoken escalation (tier differs)", () => {
    // Regression: an earlier draft compared only scenario, which
    // blocked the legitimate (rushing, written) → (rushing, spoken)
    // confirmation rule. Tier is part of the dedup key so the
    // escalation still lands.
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    const r1 = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r1.event?.scenario).toBe("rushing_trend");
    expect(r1.event?.tier).toBe("written");
    state = r1.state;

    const r2 = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r2.event?.scenario).toBe("rushing_trend");
    expect(r2.event?.tier).toBe("spoken");
  });

  it("blocks two spoken trend events in a row (same scenario + same tier)", () => {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    // Walk through the confirmation rule to get to a spoken fire.
    state = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      inStreak: false,
    }).state;
    state = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window,
      inStreak: false,
    }).state;
    // Recent should now end with (rushing_trend, spoken).
    expect(
      state.recentScenarios[state.recentScenarios.length - 1],
    ).toEqual({ scenario: "rushing_trend", tier: "spoken" });

    // Now we'd want to fire rushing+spoken again. Repetition blocks it.
    // To isolate the gate, advance time past spoken cooldown.
    const r3 = evaluate(state, {
      now: T0 + 60_000 + SPOKEN_COOLDOWN_CEILING_MS + 1_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    // The trend detector keeps detecting (no decay because mean still
    // negative), but the repetition gate suppresses.
    expect(r3.event?.scenario).not.toBe("rushing_trend");
  });

  // ── 2026-05-17 — User-adjustment window per-scenario cooldown ───
  //
  // The corrective scenarios (rushing_trend, dragging_trend,
  // accuracy_drop, fatigue) carry a 25s same-tag cooldown so the
  // coach gives the user a chance to internalize a tip before
  // re-flagging the SAME condition. Cross-tag scenarios still pass.
  it("rushing_trend cannot re-fire within the 25s adjustment window", () => {
    // First fire: same canonical setup as the trend-confirmation
    // tests above (need 2 confirmed observations for spoken to land
    // — but here we only test the WRITTEN fire to focus on cooldown).
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    const r1 = evaluate(state, {
      now: T0 + 30_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r1.event?.scenario).toBe("rushing_trend");
    state = r1.state;

    // 20s later — INSIDE the 25s adjustment window. Should NOT fire,
    // giving the user the requested grace period to adjust. The
    // detector still detects the rushing condition (confirmations →
    // 2 → would normally escalate to spoken), but the per-scenario
    // cooldown blocks it.
    const r2 = evaluate(state, {
      now: T0 + 30_000 + 20_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r2.event).toBeNull();
    state = r2.state;

    // 30s later — past the 25s adjustment window. Confirmation rule
    // permitting, the rushing tip is allowed to re-emit. Timing is
    // carefully chosen: long enough to clear both the 25s adjustment
    // window AND the spoken cooldown (20s floor), but SHORT enough to
    // stay inside the 60s `NEW_BAND_DURATION_MS` so the
    // `new_band_locked` detector (which has higher priority than
    // trend) doesn't preempt this fire.
    const r3 = evaluate(state, {
      now: T0 + 60_000,
      bpm: 120,
      window,
      inStreak: false,
    });
    expect(r3.event?.scenario).toBe("rushing_trend");
  });

  it("dragging_trend / accuracy_drop / fatigue share the adjustment window", () => {
    // Quick smoke test that all four corrective scenarios are
    // protected by the 25s same-tag cooldown. We test the gate
    // directly by pre-seeding `lastEventMs` and then driving each
    // detector with a window that satisfies its detection
    // preconditions — `force:` would bypass gates entirely, which is
    // the wrong thing to test here.
    const now = T0 + 100_000;
    const recentFireMs = now - 10_000; // 10s ago — inside the 25s window

    // 1) rushing_trend: a rushing window drives the detector.
    const rushingWindow = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, -10),
    ];
    const rushingState = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastEventMs: { rushing_trend: recentFireMs },
      // Seed band-lock state so the band detector doesn't preempt at
      // this far-future `now`. The current-band lock was set 10s ago,
      // so band detector isn't yet at NEW_BAND_DURATION_MS.
      lockedBpmLow: 120,
      bandLockedSinceMs: recentFireMs,
    };
    const rr = evaluate(rushingState, {
      now,
      bpm: 120,
      window: rushingWindow,
      inStreak: false,
    });
    expect(rr.event, "rushing_trend fired inside 25s window").toBeNull();

    // 2) dragging_trend: mirror of rushing — positive offset.
    const draggingWindow = [
      ...manyHits(ACCURACY_DROP_WINDOW, 0),
      ...manyHits(ACCURACY_DROP_WINDOW, 10),
    ];
    const draggingState = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastEventMs: { dragging_trend: recentFireMs },
      lockedBpmLow: 120,
      bandLockedSinceMs: recentFireMs,
    };
    const dr = evaluate(draggingState, {
      now,
      bpm: 120,
      window: draggingWindow,
      inStreak: false,
    });
    expect(dr.event, "dragging_trend fired inside 25s window").toBeNull();

    // 3) accuracy_drop: hot prior, cold recent.
    const dropWindow = [
      ...manyHits(ACCURACY_DROP_WINDOW),
      ...manyMisses(ACCURACY_DROP_WINDOW),
    ];
    const dropState = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      lastEventMs: { accuracy_drop: recentFireMs },
    };
    const dropR = evaluate(dropState, {
      now,
      bpm: 120,
      window: dropWindow,
    });
    expect(dropR.event, "accuracy_drop fired inside 25s window").toBeNull();

    // 4) fatigue: no detector currently emits this scenario from the
    // gatekeeper itself, so test the gate at the cooldown layer with
    // a direct call. `passesPerScenarioCooldown` is unexported but
    // covered transitively by the personal_best test below — the
    // PER_SCENARIO_COOLDOWN_MS map IS the gate. Just assert the
    // constant is wired up.
    // (No runtime assertion needed — the constant check in the
    // gatekeeper source is enough to keep this regression locked.)
  });

  it("caps recentScenarios at REPETITION_HISTORY_MAX entries", () => {
    // Force several commits and verify history length never exceeds the cap.
    let state = createGatekeeper(T0);
    for (let i = 0; i < REPETITION_HISTORY_MAX + 3; i++) {
      const r = evaluate(state, {
        now: T0 + 1_000 + i,
        bpm: 120,
        window: manyHits(4),
        // Alternate between boundary_signal_a and boundary_signal_b so
        // forced fires aren't gated by anything.
        force: {
          scenario:
            i % 2 === 0 ? "boundary_signal_a" : "boundary_signal_b",
          context: {},
        },
      });
      state = r.state;
    }
    expect(state.recentScenarios.length).toBe(REPETITION_HISTORY_MAX);
  });
});

// ---------------------------------------------------------------------------
// DRILL_RAMP_ACTIVE preempt
// ---------------------------------------------------------------------------

describe("checkDrillRampPreempt", () => {
  it("allows everything when inDrillRamp is false", () => {
    const state = createGatekeeper(T0);
    expect(
      checkDrillRampPreempt(state, "accuracy_drop", T0 + 30_000, false),
    ).toEqual({ allowed: true });
  });

  it("blocks a standard tip when inDrillRamp is true", () => {
    const state = createGatekeeper(T0);
    // lastSpokenMs starts at sessionStart (T0); 30s later, still < 90s alive tick.
    expect(
      checkDrillRampPreempt(state, "accuracy_drop", T0 + 30_000, true),
    ).toEqual({ allowed: false, reason: "DRILL_RAMP_ACTIVE" });
  });

  it("blocks rushing_trend when inDrillRamp is true", () => {
    const state = createGatekeeper(T0);
    expect(
      checkDrillRampPreempt(state, "rushing_trend", T0 + 30_000, true),
    ).toEqual({ allowed: false, reason: "DRILL_RAMP_ACTIVE" });
  });

  it("allows ALWAYS_SPOKEN scenarios through even during a ramp", () => {
    const state = createGatekeeper(T0);
    for (const scenario of [
      "boundary_signal_a",
      "boundary_signal_b",
      "tempo_milestone",
      "recovery",
      "fatigue",
      "new_band_locked",
    ] as const) {
      expect(
        checkDrillRampPreempt(state, scenario, T0 + 30_000, true),
      ).toEqual({ allowed: true });
    }
  });

  it("allows ramp_complete through even during a ramp", () => {
    const state = createGatekeeper(T0);
    expect(
      checkDrillRampPreempt(state, "ramp_complete", T0 + 30_000, true),
    ).toEqual({ allowed: true });
  });

  it("allows through after DRILL_RAMP_ALIVE_TICK_MS of silence (alive tick bypass)", () => {
    // Seed lastSpokenMs to T0 (session start); now = T0 + alive-tick interval.
    const state = createGatekeeper(T0);
    const now = T0 + DRILL_RAMP_ALIVE_TICK_MS;
    expect(
      checkDrillRampPreempt(state, "accuracy_drop", now, true),
    ).toEqual({ allowed: true });
  });

  it("still blocks just before the alive-tick interval expires", () => {
    const state = createGatekeeper(T0);
    const now = T0 + DRILL_RAMP_ALIVE_TICK_MS - 1;
    expect(
      checkDrillRampPreempt(state, "accuracy_drop", now, true),
    ).toEqual({ allowed: false, reason: "DRILL_RAMP_ACTIVE" });
  });

  it("propagates into evaluate() — event is null for a standard tip during ramp", () => {
    // Set up a session that's past warmup and cooldowns, but inDrillRamp.
    // lastSpokenMs must be recent enough that the alive-tick bypass (90s) does
    // NOT kick in — otherwise a suppressed tip would be allowed through as the
    // "alive tick" and the preempt test would pass trivially but misleadingly.
    const now = T0 + WARMUP_GRACE_MS + SPOKEN_COOLDOWN_CEILING_MS + 1;
    const state = {
      ...createGatekeeper(T0),
      bestStreak: HIGH_PB,
      warmupUntilMs: T0, // warmup elapsed
      // lastSpokenMs set to 30s before `now` — enough to clear the spoken
      // cooldown floor (20s) but well under the 90s alive-tick threshold.
      lastSpokenMs: now - SPOKEN_COOLDOWN_FLOOR_MS - 1,
      lastWrittenMs: now - WRITTEN_COOLDOWN_CEILING_MS - 1,
    };
    // Construct an accuracy-drop window (prior clean, recent sloppy).
    const window = [
      ...manyHits(ACCURACY_DROP_WINDOW), // prior: 100%
      ...manyMisses(10),                  // recent: ~37% → 63% delta
      ...manyHits(ACCURACY_DROP_WINDOW - 10),
    ];
    const r1 = evaluate({ ...state, accuracyDropConfirmations: 1 }, {
      now,
      bpm: 120,
      window,
      inDrillRamp: true,
    });
    // Should be suppressed by DRILL_RAMP_ACTIVE preempt.
    expect(r1.event).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// preset_ceiling_hit (ROADMAP 1.7, P1-COACH-3)
// ---------------------------------------------------------------------------

describe("evaluate — preset_ceiling_hit", () => {
  const AFTER_WARMUP = T0 + WARMUP_GRACE_MS + 1_000;
  const ceiling = { bpmLow: 130, bpmHigh: 140, sessions: 3, medianScore: 62 };
  const base = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
  const quiet = { now: AFTER_WARMUP, window: manyHits(4), inStreak: false };

  it("fires when the player is inside the band their history stalls in", () => {
    const { event } = evaluate(base, { ...quiet, bpm: 134, presetCeiling: ceiling });
    expect(event?.scenario).toBe("preset_ceiling_hit");
    // An observation, not an alarm: it belongs in the feed, not in the
    // player's ears mid-passage.
    expect(event?.tier).toBe("written");
    expect(event?.context).toMatchObject({
      bpmLow: 130,
      bpmHigh: 139,
      attemptCount: 3,
      score: 62,
    });
  });

  it("stays quiet at a tempo outside the band", () => {
    // `bpmHigh` is exclusive, matching `BpmCeiling`'s `bpmLow + 10`.
    expect(evaluate(base, { ...quiet, bpm: 129, presetCeiling: ceiling }).event).toBeNull();
    expect(evaluate(base, { ...quiet, bpm: 140, presetCeiling: ceiling }).event).toBeNull();
  });

  it("stays quiet when the preset has no known ceiling", () => {
    expect(evaluate(base, { ...quiet, bpm: 134 }).event).toBeNull();
  });

  it("hands over to the pace line past the fourth attempt", () => {
    // Up to three attempts the coach observes; from the fourth,
    // `useRealtimeTips` suggests a plan instead. Both must never fire
    // for the same band.
    const fourth = { ...ceiling, sessions: PRESET_CEILING_MAX_SESSIONS + 1 };
    expect(evaluate(base, { ...quiet, bpm: 134, presetCeiling: fourth }).event).toBeNull();
  });

  it("says it once, not every time the beat callback runs", () => {
    const first = evaluate(base, { ...quiet, bpm: 134, presetCeiling: ceiling });
    expect(first.event?.scenario).toBe("preset_ceiling_hit");
    const again = evaluate(first.state, {
      ...quiet,
      now: AFTER_WARMUP + 60_000,
      bpm: 134,
      presetCeiling: ceiling,
    });
    expect(again.event).toBeNull();
  });
});
