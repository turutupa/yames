/**
 * Learning mode — ROADMAP §6 1.5.
 *
 * The gate the roadmap names is "vitest on tier demotion; nothing in
 * Rust moves". The second half is the important one and no test can
 * state it directly, so it is stated here instead: every assertion
 * below is about WHEN the coach speaks and HOW it phrases itself.
 * Nothing in this file, and nothing in `learningMode.ts`, touches a
 * score — the d3d scenarios and `reportStats` are untouched by this
 * item and their suites are the proof.
 */

import { describe, expect, it } from "vitest";
import type { BeatFeedback } from "../types";
import {
  LEARNING_WINDOW_SCALE,
  isCorrection,
  scaled,
  severityFor,
  severityPlan,
  tierFor,
} from "./learningMode";
import {
  ACCURACY_DROP_WINDOW,
  TREND_CONFIRMATION_REQUIRED,
  WARMUP_GRACE_MS,
  createGatekeeper,
  evaluate,
} from "./gatekeeper";
import { TEMPLATE_CATALOG } from "./templateCatalog";
import { createShuffleState, pickTemplateForSeverities } from "./templates";

const T0 = 1_715_000_000_000;
/** Past the 30-second warmup, so nothing is suppressed for being early. */
const AFTER_WARMUP = T0 + WARMUP_GRACE_MS + 1_000;

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

function hits(n: number, dev = 0): BeatFeedback[] {
  return Array.from({ length: n }, () => fb("perfect", dev));
}

/** Prevents the personal-best detector from hijacking the scenario. */
const HIGH_PB = 10_000;

/**
 * A window that reads as a rushing trend: a neutral half followed by a
 * half leaning `leadMs` early.
 */
function rushingWindow(leadMs: number): BeatFeedback[] {
  return [...hits(ACCURACY_DROP_WINDOW, 0), ...hits(ACCURACY_DROP_WINDOW, -leadMs)];
}

// ---------------------------------------------------------------------------
// The factor
// ---------------------------------------------------------------------------

describe("the window", () => {
  it("is one and a half times wider while learning, and untouched when strict", () => {
    expect(scaled(12, "learning")).toBe(12 * LEARNING_WINDOW_SCALE);
    expect(scaled(12, "strict")).toBe(12);
    expect(scaled(12, undefined)).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Which events are corrections
// ---------------------------------------------------------------------------

describe("severityFor", () => {
  it("phrases the positive scenarios as encouragement", () => {
    for (const s of [
      "personal_best_streak",
      "recovery",
      "recovery_confirmed",
      "tempo_milestone",
      "new_band_locked",
    ] as const) {
      expect(severityFor(s, "spoken")).toBe("encouragement");
    }
  });

  it("phrases a drop and fatigue as corrections in either channel", () => {
    for (const s of ["accuracy_drop", "fatigue"] as const) {
      expect(severityFor(s, "spoken")).toBe("correction");
      expect(severityFor(s, "written")).toBe("correction");
    }
  });

  it("lets a trend graduate: neutral while unconfirmed, corrective once spoken", () => {
    expect(severityFor("rushing_trend", "written")).toBe("neutral");
    expect(severityFor("rushing_trend", "spoken")).toBe("correction");
    expect(severityFor("dragging_trend", "written")).toBe("neutral");
    expect(severityFor("dragging_trend", "spoken")).toBe("correction");
  });

  it("treats a timing bias as a note, not a correction", () => {
    // It is a "shift everything 12 ms" heads-up, not an accuracy alarm.
    expect(isCorrection("bias_only", "written")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tier demotion — the gate the roadmap names
// ---------------------------------------------------------------------------

describe("tierFor", () => {
  it("leaves every tier alone in strict stance", () => {
    expect(tierFor("accuracy_drop", "spoken", "strict")).toBe("spoken");
    expect(tierFor("fatigue", "spoken", undefined)).toBe("spoken");
  });

  it("takes corrections out of the player's ears while learning", () => {
    expect(tierFor("accuracy_drop", "spoken", "learning")).toBe("written");
    expect(tierFor("fatigue", "spoken", "learning")).toBe("written");
    expect(tierFor("rushing_trend", "spoken", "learning")).toBe("written");
    expect(tierFor("dragging_trend", "spoken", "learning")).toBe("written");
  });

  it("does not silence a milestone, a recovery or a boundary signal", () => {
    // A player who asked for a gentler coach did not ask for a mute
    // button. These are the things it is still allowed to say out loud.
    for (const s of [
      "tempo_milestone",
      "recovery",
      "recovery_confirmed",
      "new_band_locked",
      "boundary_signal_a",
      "boundary_signal_b",
    ] as const) {
      expect(tierFor(s, "spoken", "learning")).toBe("spoken");
    }
  });

  it("never promotes anything", () => {
    expect(tierFor("accuracy_drop", "written", "learning")).toBe("written");
    expect(tierFor("check_in", "written", "learning")).toBe("written");
  });
});

// ---------------------------------------------------------------------------
// Encouragement preference
// ---------------------------------------------------------------------------

describe("severityPlan", () => {
  it("is a single answer in strict stance", () => {
    expect(severityPlan("accuracy_drop", "spoken", "strict")).toEqual(["correction"]);
    expect(severityPlan("check_in", "written", undefined)).toEqual(["neutral"]);
  });

  it("asks for the encouraging phrasing first while learning", () => {
    expect(severityPlan("accuracy_drop", "written", "learning")).toEqual([
      "encouragement",
      "correction",
    ]);
    expect(severityPlan("check_in", "written", "learning")).toEqual([
      "encouragement",
      "neutral",
    ]);
  });

  it("keeps the strict phrasing behind it, so no finding is dropped to stay cheerful", () => {
    // Some findings have no cheerful true form. When the catalogue has
    // no encouraging variant the coach still says the thing — plainly,
    // not silently. Asserted against a catalogue built for the purpose
    // rather than against today's content, which can gain an
    // encouraging variant at any time without this rule changing.
    const sparse = {
      generic: { fatigue: { correction: ["Your last eight bars slid late."] } },
    };
    const drawn = pickTemplateForSeverities(sparse, createShuffleState(), {
      vocab: "electric-guitar",
      scenario: "fatigue",
      severities: severityPlan("fatigue", "written", "learning"),
      rng: () => 0,
    });
    expect(drawn).toEqual({
      text: "Your last eight bars slid late.",
      severity: "correction",
    });
  });

  it("draws the encouraging variant when the catalogue has one", () => {
    // `accuracy_drop` is a correction in strict stance; in learning it
    // is said the encouraging way, and the encouraging way still
    // carries the same numbers.
    const drawn = pickTemplateForSeverities(TEMPLATE_CATALOG, createShuffleState(), {
      vocab: "electric-guitar",
      scenario: "accuracy_drop",
      severities: severityPlan("accuracy_drop", "written", "learning"),
      context: { recentAccuracyPct: 61, priorAccuracyPct: 88, windowBeats: 16 },
      rng: () => 0,
    });
    expect(drawn?.severity).toBe("encouragement");
    expect(drawn?.text).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("an always-positive scenario is already encouragement and gains nothing", () => {
    expect(severityPlan("personal_best_streak", "spoken", "learning")).toEqual([
      "encouragement",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The gatekeeper, end to end
// ---------------------------------------------------------------------------

describe("the gatekeeper under each stance", () => {
  /** Drive the trend detector to its confirmation threshold. */
  function runTrend(leadMs: number, stance: "strict" | "learning") {
    let state = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    let last = null as ReturnType<typeof evaluate>["event"];
    for (let i = 0; i < TREND_CONFIRMATION_REQUIRED; i++) {
      const out = evaluate(state, {
        // 30 s apart: past the trends' 25 s per-scenario cooldown, and
        // short of the 60 s `new_band_locked` needs — that detector has
        // higher priority and would otherwise answer instead.
        now: AFTER_WARMUP + i * 30_000,
        bpm: 120,
        window: rushingWindow(leadMs),
        // A 100 %-hit-rate window would also trip streak suppression,
        // which downgrades spoken to written for its own reasons.
        inStreak: false,
        stance,
      });
      state = out.state;
      if (out.event) last = out.event;
    }
    return last;
  }

  it("names a 6 ms lean when strict and says nothing about it while learning", () => {
    // 6 ms clears the strict 5 ms threshold and falls inside the
    // learning stance's 7.5 ms.
    expect(runTrend(6, "strict")?.scenario).toBe("rushing_trend");
    expect(runTrend(6, "learning")).toBeNull();
  });

  it("still names a 9 ms lean while learning — but in writing", () => {
    const strict = runTrend(9, "strict");
    const learning = runTrend(9, "learning");
    expect(strict?.scenario).toBe("rushing_trend");
    expect(strict?.tier).toBe("spoken");
    expect(learning?.scenario).toBe("rushing_trend");
    expect(learning?.tier).toBe("written");
  });

  it("lets a 14 ms bias pass while learning and flags it when strict", () => {
    // The bias detector wants a consistent offset with low scatter:
    // 14 ms clears the strict 12 ms threshold, not the learning 18 ms.
    const biased = hits(ACCURACY_DROP_WINDOW, -14);
    const ctx = { now: AFTER_WARMUP, bpm: 120, window: biased };
    const base = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    expect(evaluate(base, { ...ctx, stance: "strict" }).event?.scenario).toBe("bias_only");
    expect(evaluate(base, { ...ctx, stance: "learning" }).event).toBeNull();
  });

  it("demotes a forced fatigue tip out of the spoken channel while learning", () => {
    const base = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const ctx = {
      now: AFTER_WARMUP,
      bpm: 120,
      window: hits(ACCURACY_DROP_WINDOW),
      force: { scenario: "fatigue" as const, context: {} },
    };
    expect(evaluate(base, { ...ctx, stance: "strict" }).event?.tier).toBe("spoken");
    expect(evaluate(base, { ...ctx, stance: "learning" }).event?.tier).toBe("written");
  });

  it("still speaks a forced boundary signal while learning", () => {
    const base = { ...createGatekeeper(T0), bestStreak: HIGH_PB };
    const out = evaluate(base, {
      now: AFTER_WARMUP,
      bpm: 120,
      window: hits(ACCURACY_DROP_WINDOW),
      stance: "learning",
      force: { scenario: "boundary_signal_a", context: { change: "BPM up to 130" } },
    });
    expect(out.event?.tier).toBe("spoken");
  });
});
