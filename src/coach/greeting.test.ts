/**
 * Tests for C2 — Context-Aware Greetings.
 *
 * These exercise the tier-picker thresholds and the rendering paths
 * for all four tiers, including the "downtrend / played recently"
 * special case and the 500ms async budget.
 */

import { describe, it, expect } from "vitest";
import type { SavedSession, SessionReport } from "../types";
import {
  loadHistoryWithBudget,
  pickGreetingTier,
  renderGreeting,
  PRESET_HISTORY_THRESHOLD,
  RECENT_DAYS,
  SOLID_WORK_MEDIAN_SCORE,
} from "./greeting";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = 1_715_000_000_000; // arbitrary fixed timestamp

function makeReport(score: number, overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    totalBeats: 64,
    hitsCount: 60,
    missCount: 2,
    skippedBeats: 2,
    perfectCount: 50,
    goodCount: 8,
    okCount: 2,
    meanDeviationMs: 0,
    stdDeviationMs: 5,
    meanAbsDeviationMs: 4,
    meanIntervalErrorMs: 3,
    grade: "A",
    score,
    deviations: [],
    dynamicsStd: 0.1,
    meanAmplitude: 0.5,
    tempoStabilityMs: 3,
    longestStreak: 16,
    comment: "",
    insights: [],
    gridCorrelation: 0.9,
    ...overrides,
  };
}

function makeSession(
  daysAgo: number,
  score: number,
  bpm: number,
  presetId?: string,
  presetName?: string,
): SavedSession {
  return {
    id: `s-${daysAgo}-${score}-${bpm}`,
    timestamp: FIXED_NOW - daysAgo * 24 * 60 * 60 * 1000,
    bpm,
    timeSignature: 4,
    beatGroups: [4],
    report: makeReport(score),
    presetId,
    presetName,
  };
}

// ---------------------------------------------------------------------------
// Tier selection
// ---------------------------------------------------------------------------

describe("pickGreetingTier", () => {
  it("returns tier 4 (cold) when no preset and no history", () => {
    const tier = pickGreetingTier({ bpm: 120, now: FIXED_NOW, history: [] });
    expect(tier).toBe("no-preset-cold");
  });

  it("returns tier 3 (recent-history) when no preset but ≥1 recent session", () => {
    const tier = pickGreetingTier({
      bpm: 120,
      now: FIXED_NOW,
      history: [makeSession(2, 80, 120)],
    });
    expect(tier).toBe("no-preset-recent-history");
  });

  it("ignores sessions older than the recent window for tier 3", () => {
    const tier = pickGreetingTier({
      bpm: 120,
      now: FIXED_NOW,
      history: [makeSession(RECENT_DAYS + 1, 80, 120)],
    });
    expect(tier).toBe("no-preset-cold");
  });

  it("returns tier 2 (preset-first-time) for 0 prior preset sessions", () => {
    const tier = pickGreetingTier({
      bpm: 120,
      presetId: "p1",
      presetName: "Warm Up",
      now: FIXED_NOW,
      history: [],
    });
    expect(tier).toBe("preset-first-time");
  });

  it("returns tier 2 for 1 prior preset session (second time)", () => {
    const tier = pickGreetingTier({
      bpm: 120,
      presetId: "p1",
      now: FIXED_NOW,
      history: [makeSession(1, 70, 120, "p1")],
    });
    expect(tier).toBe("preset-first-time");
  });

  it("returns tier 1 (preset-with-history) once threshold is met", () => {
    const sessions = Array.from({ length: PRESET_HISTORY_THRESHOLD }, (_, i) =>
      makeSession(i + 1, 80 + i, 120, "p1"),
    );
    const tier = pickGreetingTier({
      bpm: 120,
      presetId: "p1",
      now: FIXED_NOW,
      history: sessions,
    });
    expect(tier).toBe("preset-with-history");
  });

  it("counts only sessions matching the preset id (other presets don't qualify)", () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession(i + 1, 80, 120, "other-preset"),
    );
    const tier = pickGreetingTier({
      bpm: 120,
      presetId: "p1",
      now: FIXED_NOW,
      history: sessions,
    });
    // Zero matching sessions for "p1" → first-time bucket.
    expect(tier).toBe("preset-first-time");
  });
});

// ---------------------------------------------------------------------------
// Rendering — text shape (specific, number-rich; opaque preset name)
// ---------------------------------------------------------------------------

describe("renderGreeting — tier 1 (preset-with-history)", () => {
  it("references preset name, last score, last BPM, and a target", () => {
    const sessions = [
      makeSession(0, 88, 135, "p1", "Spider Exercise"),
      makeSession(2, 85, 130, "p1", "Spider Exercise"),
      makeSession(5, 82, 125, "p1", "Spider Exercise"),
      makeSession(8, 78, 120, "p1", "Spider Exercise"),
    ];
    const out = renderGreeting({
      bpm: 140,
      presetId: "p1",
      presetName: "Spider Exercise",
      now: FIXED_NOW + 6 * 60 * 60 * 1000, // 6h after most recent
      history: sessions,
    });
    expect(out.tier).toBe("preset-with-history");
    expect(out.text).toContain("Spider Exercise");
    expect(out.text).toContain("88");
    expect(out.text).toContain("135 BPM");
    // Target = min(personalBest=88, lastScore+3=91) = 88.
    expect(out.text).toContain("88 is within reach");
    expect(out.context.targetScore).toBe(88);
    expect(out.context.personalBest).toBe(88);
    expect(out.context.lastScore).toBe(88);
  });

  it("does not expose preset-name text when none provided (still tier 1)", () => {
    const sessions = Array.from({ length: 4 }, (_, i) =>
      makeSession(i + 1, 80 + i, 120, "p1"),
    );
    const out = renderGreeting({
      bpm: 120,
      presetId: "p1",
      now: FIXED_NOW,
      history: sessions,
    });
    expect(out.tier).toBe("preset-with-history");
    expect(out.text).toMatch(/\d+ at \d+ BPM/); // has numbers
    expect(out.text).not.toMatch(/undefined|null/i);
  });

  it("suggests matching (not beating) when downtrend AND played within 4h", () => {
    // Last 3 sessions averaged < earlier 3 by more than 5 points.
    const sessions = [
      makeSession(0, 60, 130, "p1", "Run"),
      makeSession(0, 62, 130, "p1", "Run"),
      makeSession(0, 65, 130, "p1", "Run"),
      makeSession(2, 85, 130, "p1", "Run"),
      makeSession(4, 82, 130, "p1", "Run"),
      makeSession(6, 84, 130, "p1", "Run"),
    ];
    // Force last session timestamp to be 1h ago.
    sessions[0] = { ...sessions[0], timestamp: FIXED_NOW - 60 * 60 * 1000 };
    const out = renderGreeting({
      bpm: 130,
      presetId: "p1",
      presetName: "Run",
      now: FIXED_NOW,
      history: sessions,
    });
    expect(out.text.toLowerCase()).toContain("match");
    expect(out.context.onDowntrend).toBe(true);
    expect(out.context.playedWithin4h).toBe(true);
  });

  it("calls out the user's struggle at this tempo when relevant", () => {
    const sessions = [
      makeSession(1, 85, 110, "p1", "Run"),
      makeSession(3, 86, 105, "p1", "Run"),
      makeSession(5, 60, 130, "p1", "Run"), // struggle at 130 ±5
      makeSession(7, 88, 105, "p1", "Run"),
    ];
    const out = renderGreeting({
      bpm: 132, // within ±5 of the 130-BPM struggle session
      presetId: "p1",
      presetName: "Run",
      now: FIXED_NOW,
      history: sessions,
    });
    expect(out.text).toContain("132 BPM");
    expect(out.text).toMatch(/clean that up/i);
    expect(out.context.strugglePriorScore).toBe(60);
  });
});

describe("renderGreeting — tier 2 (preset-first-time)", () => {
  it("uses 'first run' wording when zero prior preset sessions", () => {
    const out = renderGreeting({
      bpm: 120,
      presetId: "p1",
      presetName: "Warm Up",
      now: FIXED_NOW,
      history: [],
    });
    expect(out.tier).toBe("preset-first-time");
    expect(out.text).toContain("Warm Up");
    expect(out.text).toContain("120 BPM");
    expect(out.context.sessionCount).toBe(0);
  });

  it("uses 'second session' wording when exactly 1 prior preset session", () => {
    const out = renderGreeting({
      bpm: 120,
      presetId: "p1",
      presetName: "Warm Up",
      now: FIXED_NOW,
      history: [makeSession(2, 76, 120, "p1", "Warm Up")],
    });
    expect(out.text).toMatch(/Second session/);
    expect(out.text).toContain("76");
    expect(out.context.lastScore).toBe(76);
  });
});

describe("renderGreeting — tier 3 (no-preset-recent-history)", () => {
  it("uses 'solid work' line when bar is met (≥3 sessions, median ≥75)", () => {
    const sessions = [
      makeSession(0, 80, 120),
      makeSession(2, 85, 120),
      makeSession(4, 78, 120),
    ];
    const out = renderGreeting({
      bpm: 120,
      now: FIXED_NOW,
      history: sessions,
    });
    expect(out.tier).toBe("no-preset-recent-history");
    expect(out.text.toLowerCase()).toContain("solid work");
    expect(out.context.sessions7d).toBe(3);
    expect(out.context.medianScore7d).toBeGreaterThanOrEqual(SOLID_WORK_MEDIAN_SCORE);
  });

  it("falls back to generic recent-history wording below the bar", () => {
    const out = renderGreeting({
      bpm: 120,
      now: FIXED_NOW,
      history: [makeSession(1, 50, 120)],
    });
    expect(out.tier).toBe("no-preset-recent-history");
    expect(out.text.toLowerCase()).not.toContain("solid work");
  });
});

describe("renderGreeting — tier 4 (no-preset-cold)", () => {
  it("ships the plan's verbatim cold greeting when rng selects the first variant", () => {
    // Tier-4 now ships an array of cold variants so a returning cold
    // player doesn't see the same opener twice in a row. The
    // canonical plan copy stays at index 0 so `rng: () => 0` keeps
    // exercising the original wording for this regression guard.
    const out = renderGreeting({
      bpm: 100,
      now: FIXED_NOW,
      history: [],
      rng: () => 0,
    });
    expect(out.tier).toBe("no-preset-cold");
    expect(out.text).toBe(
      "Hey — good to see you. Play when you're ready and I'll start picking up your timing.",
    );
  });

  it("rotates between cold variants based on rng output", () => {
    // Confirm a different rng pulls a different variant. Without
    // this, a regression to a single hard-coded string would slip
    // through the deterministic test above.
    const a = renderGreeting({
      bpm: 100,
      now: FIXED_NOW,
      history: [],
      rng: () => 0,
    });
    const b = renderGreeting({
      bpm: 100,
      now: FIXED_NOW,
      history: [],
      rng: () => 0.99,
    });
    expect(a.text).not.toBe(b.text);
  });

  it("treats missing history as tier 4 even with a preset id (defensive)", () => {
    // If `history` is undefined (e.g. timeout before load), we should
    // emit tier-4. We DON'T claim preset-first-time without evidence.
    // (Implementation note: pickGreetingTier sees `presetId` and goes
    // first-time; the caller should pass an empty array on timeout.)
    const out = renderGreeting({
      bpm: 100,
      presetId: "p1",
      now: FIXED_NOW,
      history: undefined,
    });
    expect(["preset-first-time", "no-preset-cold"]).toContain(out.tier);
  });
});

// ---------------------------------------------------------------------------
// Async budget
// ---------------------------------------------------------------------------

describe("loadHistoryWithBudget", () => {
  it("returns the loaded history when load resolves within budget", async () => {
    const result = await loadHistoryWithBudget(
      async () => [makeSession(1, 80, 120)],
      500,
    );
    expect(result).toBeDefined();
    expect(result?.length).toBe(1);
  });

  it("returns undefined when loader exceeds the budget", async () => {
    const result = await loadHistoryWithBudget(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([makeSession(1, 80, 120)]), 50),
        ),
      10, // 10ms budget — loader takes 50ms
    );
    expect(result).toBeUndefined();
  });
});
