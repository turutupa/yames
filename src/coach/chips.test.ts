import { describe, expect, it } from "vitest";

import {
  CHIP_CATALOG,
  CHIPS_RECENCY_LS_KEY,
  MAX_SUBSTANTIVE_CHIPS,
  RECENCY_PENALTY,
  answerChip,
  buildChipPlaceholders,
  loadRecentChipIds,
  renderAffordanceLabel,
  saveRecentChipIds,
  selectChips,
  type ChipContext,
  type RecencyStorage,
} from "./chips";
import type { SessionReport } from "../types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function mkReport(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    totalBeats: 32,
    hitsCount: 28,
    missCount: 4,
    skippedBeats: 0,
    perfectCount: 20,
    goodCount: 6,
    okCount: 2,
    meanDeviationMs: 0,
    stdDeviationMs: 10,
    meanAbsDeviationMs: 8,
    meanIntervalErrorMs: 4,
    grade: "A",
    score: 85,
    deviations: [],
    dynamicsStd: 0.1,
    meanAmplitude: 0.5,
    tempoStabilityMs: 5,
    longestStreak: 16,
    comment: "",
    insights: [],
    gridCorrelation: 0.8,
    ...overrides,
  };
}

function mkCtx(overrides: Partial<ChipContext> = {}): ChipContext {
  return {
    report: mkReport(),
    bpm: 120,
    timeSignature: 4,
    beatGroups: [4],
    segmentsCompleted: 1,
    recentChipIds: new Set(),
    segments: [],
    ...overrides,
  };
}

function inMemoryStorage(): RecencyStorage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
  };
}

// ---------------------------------------------------------------------------
// Catalog sanity
// ---------------------------------------------------------------------------

describe("CHIP_CATALOG", () => {
  it("retains the Escape chip entry for backward compat (even though it is no longer surfaced)", () => {
    // The "Ask something else…" chip was retired from the selector in
    // v0.9 (the coach card already pins a chat input to the bottom, so
    // the chip duplicated that affordance). The catalog entry is kept
    // so external referrers — telemetry recency keys, tests, future
    // reuses on other surfaces — don't break.
    const escape = CHIP_CATALOG.find((c) => c.category === "escape");
    expect(escape).toBeDefined();
    expect(escape?.pathway).toBe("llm");
    // Its qualifies predicate now hard-rejects so it never appears in
    // the selector output.
    expect(escape?.qualifies({} as ChipContext)).toBe(false);
  });

  it("each chip has a stable, unique id", () => {
    const ids = CHIP_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("template-fill chips define a template", () => {
    for (const chip of CHIP_CATALOG) {
      if (chip.pathway === "template-fill") {
        expect(chip.template, `chip ${chip.id} needs a template`).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// selectChips — five-step pipeline
// ---------------------------------------------------------------------------

describe("selectChips", () => {
  it("never returns the Escape chip — the always-on chat input replaces it", () => {
    // v0.9: the escape chip was retired from the selector. The coach
    // card's chat input is permanently visible at the bottom, so a
    // chip pointing the user to free-text was redundant clutter.
    const out = selectChips(mkCtx());
    expect(out.some((s) => s.chip.category === "escape")).toBe(false);
  });

  it("returns at most MAX_SUBSTANTIVE_CHIPS", () => {
    // Make every qualifying chip qualify by stacking the context.
    const ctx = mkCtx({
      report: mkReport({ score: 50, meanDeviationMs: -20 }),
      bpm: 140,
      previousSessionScore: 60,
      segmentsCompleted: 5,
      sustainedRushing: true,
      segments: Array.from({ length: 5 }, (_, i) => ({
        report: mkReport({ score: 60 + i * 5 }),
        bpm: 140,
        timeSignature: 4,
        beatGroups: [4],
      })),
    });
    const out = selectChips(ctx);
    expect(out.length).toBeLessThanOrEqual(MAX_SUBSTANTIVE_CHIPS);
  });

  it("filters chips whose qualifies predicate returns false", () => {
    // 95% score at 100 BPM should NOT trigger drop-bpm or why-rushing.
    const out = selectChips(mkCtx({
      report: mkReport({ score: 95, meanDeviationMs: 0 }),
      bpm: 100,
    }));
    const ids = out.map((s) => s.chip.id);
    expect(ids).not.toContain("drop-bpm");
    expect(ids).not.toContain("why-rushing");
    // But ready-faster should qualify (score > 90 AND bpm < 180).
    expect(ids).toContain("ready-faster");
  });

  it("enforces diversity — no two chips of the same category", () => {
    const out = selectChips(mkCtx({
      report: mkReport({ score: 50, meanDeviationMs: -20 }),
      bpm: 140,
      previousSessionScore: 80,
      segmentsCompleted: 5,
      sustainedRushing: true,
      sustainedDragging: false,
      segments: [],
    }));
    const cats = out.map((s) => s.chip.category);
    const dupes = cats.filter((c, i) => cats.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it("applies the recency penalty (×0.7) to chips shown last session", () => {
    const ctxNoRecency = mkCtx({
      report: mkReport({ score: 95 }),
      bpm: 100,
    });
    const noPenalty = selectChips(ctxNoRecency);
    const readyFasterScore = noPenalty.find((s) => s.chip.id === "ready-faster")?.score;
    expect(readyFasterScore).toBeGreaterThan(0);

    const ctxWithRecency = mkCtx({
      report: mkReport({ score: 95 }),
      bpm: 100,
      recentChipIds: new Set(["ready-faster"]),
    });
    const withPenalty = selectChips(ctxWithRecency);
    const penalized = withPenalty.find((s) => s.chip.id === "ready-faster")?.score;
    expect(penalized).toBeCloseTo((readyFasterScore ?? 0) * RECENCY_PENALTY, 5);
  });

  it("never returns zero substantive chips because the NextStep fallback always qualifies", () => {
    // Make NOTHING fit except the fallback.
    const out = selectChips(mkCtx({
      report: mkReport({ score: 80, meanDeviationMs: 0 }),
      bpm: 60, // too low for ready-faster
      previousSessionScore: undefined,
      segmentsCompleted: 0,
      sustainedRushing: false,
      sustainedDragging: false,
    }));
    const substantive = out.filter((s) => s.chip.category !== "escape");
    expect(substantive.length).toBeGreaterThanOrEqual(1);
    expect(substantive.some((s) => s.chip.id === "what-to-work-on")).toBe(true);
  });

  it("orders substantive chips by descending score", () => {
    const out = selectChips(mkCtx({
      report: mkReport({ score: 50, meanDeviationMs: -15 }),
      bpm: 140,
      sustainedRushing: true,
    }));
    const sub = out.filter((s) => s.chip.category !== "escape");
    for (let i = 1; i < sub.length; i++) {
      expect(sub[i - 1].score).toBeGreaterThanOrEqual(sub[i].score);
    }
  });
});

// ---------------------------------------------------------------------------
// answerChip — pathway resolution
// ---------------------------------------------------------------------------

describe("answerChip", () => {
  it("returns null for LLM-pathway chips (caller routes elsewhere)", () => {
    const escape = CHIP_CATALOG.find((c) => c.pathway === "llm")!;
    expect(answerChip(escape, mkCtx())).toBeNull();
  });

  it("fills placeholders for template-fill chips", () => {
    const dropBpm = CHIP_CATALOG.find((c) => c.id === "drop-bpm")!;
    const out = answerChip(
      dropBpm,
      mkCtx({
        report: mkReport({ score: 60 }),
        bpm: 140,
        personalBestAtBpm: 78,
      }),
    );
    expect(out).toContain("60%");
    expect(out).toContain("140 BPM");
    expect(out).toContain("78%");
    expect(out).toContain("130"); // bpm-10
  });

  it("compare-last-session reports direction + delta correctly", () => {
    const compare = CHIP_CATALOG.find((c) => c.id === "compare-last-session")!;
    const up = answerChip(
      compare,
      mkCtx({
        report: mkReport({ score: 88 }),
        bpm: 120,
        previousSessionScore: 75,
      }),
    );
    expect(up).toContain("up");
    expect(up).toContain("13%");

    const down = answerChip(
      compare,
      mkCtx({
        report: mkReport({ score: 60 }),
        bpm: 120,
        previousSessionScore: 80,
      }),
    );
    expect(down).toContain("down");
    expect(down).toContain("20%");
  });

  it("best-run-today picks the highest-scored segment", () => {
    const bestRun = CHIP_CATALOG.find((c) => c.id === "best-run-today")!;
    const segments = [
      { report: mkReport({ score: 60, stdDeviationMs: 18 }), bpm: 100, timeSignature: 4 },
      { report: mkReport({ score: 92, stdDeviationMs: 6 }), bpm: 120, timeSignature: 4 },
      { report: mkReport({ score: 80, stdDeviationMs: 12 }), bpm: 110, timeSignature: 4 },
    ];
    const out = answerChip(bestRun, mkCtx({ segments, segmentsCompleted: 3 }));
    expect(out).toContain("segment 2");
    expect(out).toContain("120 BPM");
    expect(out).toContain("92%");
    expect(out).toContain("σ=6ms");
  });

  it("why-rushing renders absolute offset value", () => {
    const whyRushing = CHIP_CATALOG.find((c) => c.id === "why-rushing")!;
    const out = answerChip(
      whyRushing,
      mkCtx({
        report: mkReport({ meanDeviationMs: -12.7 }),
        sustainedRushing: true,
      }),
    );
    expect(out).toContain("13ms"); // rounded abs
  });
});

// ---------------------------------------------------------------------------
// renderAffordanceLabel
// ---------------------------------------------------------------------------

describe("renderAffordanceLabel", () => {
  it("fills the BPM placeholder for set-bpm affordances", () => {
    const dropBpm = CHIP_CATALOG.find((c) => c.id === "drop-bpm")!;
    const out = renderAffordanceLabel(dropBpm, mkCtx({ bpm: 140 }));
    expect(out).toBe("Drop to 130 BPM");
  });

  it("returns null for chips without affordances", () => {
    // best-run-today has no follow-up.
    const noFollow = CHIP_CATALOG.find((c) => c.id === "best-run-today")!;
    expect(renderAffordanceLabel(noFollow, mkCtx())).toBeNull();
  });

  it("clamps BPM deltas to the 20..300 valid range", () => {
    const readyFaster = CHIP_CATALOG.find((c) => c.id === "ready-faster")!;
    const out = renderAffordanceLabel(readyFaster, mkCtx({ bpm: 295 }));
    expect(out).toBe("Bump to 300 BPM");
  });
});

// ---------------------------------------------------------------------------
// Recency persistence
// ---------------------------------------------------------------------------

describe("recency persistence", () => {
  it("round-trips through storage", () => {
    const storage = inMemoryStorage();
    saveRecentChipIds(storage, ["drop-bpm", "why-rushing"]);
    const out = loadRecentChipIds(storage);
    expect(out).toEqual(new Set(["drop-bpm", "why-rushing"]));
  });

  it("returns an empty set when no key exists", () => {
    expect(loadRecentChipIds(inMemoryStorage())).toEqual(new Set());
  });

  it("gracefully ignores corrupted storage payloads", () => {
    const storage = inMemoryStorage();
    storage.setItem(CHIPS_RECENCY_LS_KEY, "{not json");
    expect(loadRecentChipIds(storage)).toEqual(new Set());
  });

  it("ignores non-array JSON without throwing", () => {
    const storage = inMemoryStorage();
    storage.setItem(CHIPS_RECENCY_LS_KEY, JSON.stringify({ not: "array" }));
    expect(loadRecentChipIds(storage)).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// buildChipPlaceholders — defensive checks for the what-to-work-on selector
// ---------------------------------------------------------------------------

// The branch labels were rewritten in v0.9 from technical jargon
// ("tempo stability", "timing accuracy", "hit completeness") to
// plain-language phrases that read AND speak naturally — chip
// answers are read aloud by TTS, and a player who doesn't think in
// terms of σ / ms / "completeness" can't act on the technical label.
describe("buildChipPlaceholders → what-to-work-on remediation", () => {
  const fallback = CHIP_CATALOG.find((c) => c.id === "what-to-work-on")!;

  it("flags uneven pulse when tempoStabilityMs > 25", () => {
    const ph = buildChipPlaceholders(
      fallback,
      mkCtx({ report: mkReport({ tempoStabilityMs: 40, meanAbsDeviationMs: 10, score: 80 }) }),
    );
    expect(ph.worstComponent).toBe("keeping a steady pulse");
  });

  it("flags off-the-beat when meanAbsDeviationMs > 25 (and tempo stable)", () => {
    const ph = buildChipPlaceholders(
      fallback,
      mkCtx({ report: mkReport({ tempoStabilityMs: 10, meanAbsDeviationMs: 35, score: 80 }) }),
    );
    expect(ph.worstComponent).toBe("landing on the beat");
  });

  it("flags missed beats when score < 60 and timing OK", () => {
    const ph = buildChipPlaceholders(
      fallback,
      mkCtx({ report: mkReport({ tempoStabilityMs: 8, meanAbsDeviationMs: 15, score: 55 }) }),
    );
    expect(ph.worstComponent).toBe("catching every beat");
  });

  it("flags consistency when everything is mid-range", () => {
    const ph = buildChipPlaceholders(
      fallback,
      mkCtx({ report: mkReport({ tempoStabilityMs: 10, meanAbsDeviationMs: 12, score: 75 }) }),
    );
    expect(ph.worstComponent).toBe("consistency");
  });

  it("does NOT include a numeric componentScore — that lives on the mini-report card", () => {
    // The old template embedded "({componentScore})" — e.g. "(1777ms σ)"
    // — which was unintelligible when TTS spoke it aloud. The template
    // dropped the parenthetical in v0.9; this guards against regression.
    const ph = buildChipPlaceholders(
      fallback,
      mkCtx({ report: mkReport({ tempoStabilityMs: 40, meanAbsDeviationMs: 10, score: 80 }) }),
    );
    expect(ph.componentScore).toBeUndefined();
  });
});
