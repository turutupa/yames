// The coach's voice, checked the only way a rule-written voice can be: every
// kind says something, it says it in printed bar numbers, it says the same
// thing three ways, and what it says resolves into blocks with nothing
// dropped.
//
// `t` here is the real English bundle rather than a stub. A test against a
// stub would pass with a template that names a placeholder nobody fills, and
// a review that says "you're {{amount}} early" is exactly the failure this
// file exists to catch.
import { describe, expect, it } from "vitest";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en/songs.json";
import { resolveCoachAnswer } from "../coach/blocks";
import { createShuffleState } from "../coach/templates";
import {
  FINDING_KINDS,
  actionFor,
  barsPhrase,
  beatFractionKey,
  blocksFor,
  comeBackDays,
  directionKey,
  printedBarsOf,
  rangeForFix,
  sentenceFor,
  sentenceKeys,
  tempoPercentForFix,
} from "./verdict";
import type { Evidence, Finding, FindingKind, SongScore } from "./types";

const t = (() => {
  const instance = i18n.createInstance();
  void instance.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return instance.t.bind(instance) as (key: string, values?: Record<string, unknown>) => string;
})();

/** Four bars, the third and fourth of them a repeat of the first and second. */
function score(): SongScore {
  return {
    schema: 1,
    id: "song-1",
    title: "A made-up thing",
    artist: "Nobody",
    source: { fileName: "made-up.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 96 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
      { index: 2, startTick: 7680, lengthTicks: 3840, printedBar: 0 },
      { index: 3, startTick: 11520, lengthTicks: 3840, printedBar: 1 },
    ],
    notes: [],
    sections: [],
  };
}

const EVIDENCE: Evidence = {
  onsets: 32,
  hits: 24,
  hitRate: 0.75,
  meanDeviationMs: -118,
  deviationBeats: -0.24,
  spreadMs: 21,
  passes: 3,
  passesAffected: 2,
  referenceBpm: 96,
  printedBars: [1, 1],
  subdivision: 4,
  beatPosition: 3,
  subdivisionPosition: [2, 4],
  bpmBand: [96, 120],
  extras: 4,
  hitRateDelta: 0.12,
  spreadDeltaMs: 9,
};

function finding(kind: FindingKind, over: Partial<Finding> = {}): Finding {
  return {
    kind,
    bars: [2, 3],
    noteIds: [4, 5, 6],
    severity: 0.5,
    evidence: EVIDENCE,
    fix: { type: "loopBars", start: 2, end: 3, tempoPercent: 80 },
    ...over,
  };
}

describe("every kind has a voice", () => {
  it("covers exactly the kinds the contract lists", () => {
    expect([...FINDING_KINDS].sort()).toEqual(
      [
        "afterShift", "beatPositionBias", "clean", "consistentMiss", "dragging", "drift",
        "extras", "fallsApart", "improved", "rushing", "subdivisionWeak", "tempoCeiling",
        "uneven",
      ].sort(),
    );
  });

  for (const kind of FINDING_KINDS) {
    it(`says something real for "${kind}"`, () => {
      const said = sentenceFor(t, finding(kind), score(), createShuffleState(), () => 0.42);
      expect(said.length).toBeGreaterThan(12);
      // The three failures a template can have and still look fine in a diff.
      expect(said, "an unfilled placeholder").not.toMatch(/\{\{/);
      expect(said, "a locale key drawn as a sentence").not.toMatch(/songs\.review/);
      expect(said, "a number nobody measured").not.toMatch(/\bNaN\b|undefined/);
    });

    it(`has three variants for "${kind}", all of them written`, () => {
      const keys = sentenceKeys(kind);
      expect(keys).toHaveLength(3);
      const written = keys.map((key) => t(key, { bars: "bars 1–2", amount: "a hair", when: "late" }));
      expect(new Set(written).size, `"${kind}" repeats itself`).toBe(3);
      for (const [i, line] of written.entries()) {
        expect(line, `${keys[i]} is missing`).not.toBe(keys[i]);
      }
    });
  }

  /** A4: praise is never generic. It has to name something. */
  it("names bars in both the praise kinds", () => {
    for (const kind of ["clean", "improved"] as const) {
      for (const key of sentenceKeys(kind)) {
        expect(t(key, { bars: "bars 5–8", goes: "3 goes", ms: 9 })).toContain("bars 5–8");
      }
    }
  });

  /** B1: numbers help, a percentage as the headline does not. */
  it("never puts a percentage in a headline sentence", () => {
    for (const kind of FINDING_KINDS) {
      const said = sentenceFor(t, finding(kind), score(), createShuffleState());
      expect(said, `"${kind}" quotes a percentage`).not.toMatch(/\d\s?%/);
    }
  });
});

describe("the numbers a sentence quotes", () => {
  it("quotes the bar on the page, not the bar in the played order", () => {
    // Played bars 2 and 3 are printed bars 1 and 2 — the repeat.
    const f = finding("rushing", { evidence: { ...EVIDENCE, printedBars: [0, 1] } });
    expect(printedBarsOf(f, score())).toEqual([1, 2]);
    expect(barsPhrase(t, f, score())).toBe("bars 1–2");
  });

  it("says a single bar as one bar rather than as a range of one", () => {
    const f = finding("rushing", { evidence: { ...EVIDENCE, printedBars: [8, 8] } });
    expect(barsPhrase(t, f, score())).toBe("bar 9");
  });

  it("falls back to the score when the evidence carries no printed bars", () => {
    const bare = { ...EVIDENCE };
    delete bare.printedBars;
    const f = finding("rushing", { evidence: bare });
    expect(printedBarsOf(f, score())).toEqual([1, 2]);
  });

  it("has nothing to point at in free play, and says so", () => {
    const bare = { ...EVIDENCE };
    delete bare.printedBars;
    const f = finding("drift", { evidence: bare, bars: undefined });
    expect(printedBarsOf(f, null)).toBeNull();
    expect(barsPhrase(t, f, null)).toBe("this passage");
  });

  /** B1's own example: "about a sixteenth early", never eleven milliseconds. */
  it("turns a fraction of a beat into a note value", () => {
    expect(t(beatFractionKey(-0.25))).toBe("about a sixteenth");
    expect(t(beatFractionKey(0.5))).toBe("about an eighth");
    expect(t(beatFractionKey(0.02))).toBe("a hair");
    expect(t(beatFractionKey(-1.4))).toBe("a whole beat");
  });

  it("reads the sign the way the wire writes it — negative is early", () => {
    expect(t(directionKey(-0.2))).toBe("early");
    expect(t(directionKey(0.2))).toBe("late");
  });
});

describe("the same finding twice is not the same sentence twice", () => {
  it("draws from the bag rather than repeating itself", () => {
    const bag = createShuffleState();
    const said = Array.from({ length: 3 }, () =>
      sentenceFor(t, finding("rushing"), score(), bag, () => 0.5),
    );
    expect(new Set(said).size).toBeGreaterThan(1);
  });
});

describe("the fix becomes a button, and the button becomes a state change", () => {
  it("turns a percentage of the score's tempo into a BPM a button can print", () => {
    const action = actionFor(finding("rushing"), "song-1");
    expect(action).toEqual({ kind: "loopBars", score: "song-1", fromBar: 3, toBar: 4, bpm: 77 });
  });

  it("loses the tempo rather than inventing one when nothing measured it", () => {
    const bare = { ...EVIDENCE };
    delete bare.referenceBpm;
    const action = actionFor(finding("rushing", { evidence: bare }), "song-1");
    expect(action).toEqual({ kind: "loopBars", score: "song-1", fromBar: 3, toBar: 4 });
  });

  it("will not point a loop at a song that is not in the library", () => {
    expect(actionFor(finding("rushing"), null)).toBeNull();
  });

  it("makes a ramp out of two percentages of the same reference", () => {
    const f = finding("tempoCeiling", {
      fix: { type: "ramp", start: 2, end: 3, fromPercent: 80, toPercent: 100 },
    });
    expect(actionFor(f, "song-1")).toEqual({ kind: "ramp", fromBpm: 77, toBpm: 96 });
  });

  it("refuses a climb that starts where it ends", () => {
    const f = finding("tempoCeiling", {
      fix: { type: "ramp", start: 2, end: 3, fromPercent: 90, toPercent: 90 },
    });
    expect(actionFor(f, "song-1")).toBeNull();
  });

  it("keeps the days when it turns them into an occasion and back", () => {
    for (const days of [1, 2, 3]) {
      const f = finding("clean", { fix: { type: "comeBack", days } });
      const action = actionFor(f, "song-1");
      expect(action?.kind).toBe("comeBack");
      expect(comeBackDays((action as { when: string }).when)).toBe(days);
    }
  });

  /**
   * The conversion the host depends on: a block counts bars from 1 so the
   * catalogue can check them against the song's length, and a range counts
   * from 0 because that is what the schedule and the cursor use. Getting this
   * backwards loops the wrong bars, silently.
   */
  it("hands the transport played bars, counted from zero", () => {
    expect(rangeForFix(finding("rushing").fix)).toEqual({ startBar: 2, endBar: 3 });
    expect(tempoPercentForFix(finding("rushing").fix)).toBe(80);
    expect(
      rangeForFix({ type: "ramp", start: 4, end: 7, fromPercent: 70, toPercent: 90 }),
    ).toEqual({ startBar: 4, endBar: 7 });
    expect(rangeForFix({ type: "comeBack", days: 2 })).toBeNull();
  });
});

describe("the blocks the coach answers with", () => {
  const context = {
    scores: [{ id: "song-1", title: "A made-up thing", bars: 4 }],
    attempts: [{ id: 1, scoreId: "song-1" }],
  };

  for (const kind of FINDING_KINDS) {
    it(`survives resolve with nothing dropped, for "${kind}"`, () => {
      const blocks = blocksFor(
        t,
        finding(kind),
        score(),
        { scoreId: "song-1", attemptNumber: 1 },
        createShuffleState(),
      );
      const answer = resolveCoachAnswer({ blocks }, context);
      expect(answer.dropped, `"${kind}" dropped ${JSON.stringify(answer.dropped)}`).toEqual([]);
      expect(answer.blocks.length).toBe(blocks.length);
    });
  }

  it("says one thing, points at it, and offers one button", () => {
    const blocks = blocksFor(
      t,
      finding("rushing"),
      score(),
      { scoreId: "song-1", attemptNumber: 1 },
      createShuffleState(),
    );
    expect(blocks.map((b) => b.type)).toEqual(["text", "tabExcerpt", "action"]);
  });

  it("points at the played bars, which is what the catalogue checks", () => {
    const blocks = blocksFor(
      t,
      finding("rushing"),
      score(),
      { scoreId: "song-1", attemptNumber: 1 },
      createShuffleState(),
    );
    expect(blocks[1]).toMatchObject({ type: "tabExcerpt", fromBar: 3, toBar: 4, attempt: 1 });
  });

  it("draws the passage over time only when there is a story to draw", () => {
    const withHistory = blocksFor(
      t,
      finding("improved"),
      score(),
      { scoreId: "song-1", attemptNumber: 1, withProgress: true },
      createShuffleState(),
    );
    expect(withHistory.map((b) => b.type)).toContain("progress");
    const without = blocksFor(
      t,
      finding("improved"),
      score(),
      { scoreId: "song-1", attemptNumber: 1 },
      createShuffleState(),
    );
    expect(without.map((b) => b.type)).not.toContain("progress");
  });

  it("drops to a sentence alone when the song is not in the library", () => {
    const blocks = blocksFor(t, finding("rushing"), score(), { scoreId: null }, createShuffleState());
    expect(blocks.map((b) => b.type)).toEqual(["text"]);
  });

  it("is never longer than an answer is allowed to be", () => {
    for (const kind of FINDING_KINDS) {
      const blocks = blocksFor(
        t,
        finding(kind),
        score(),
        { scoreId: "song-1", attemptNumber: 1, withProgress: true },
        createShuffleState(),
      );
      expect(blocks.length).toBeLessThanOrEqual(4);
    }
  });
});
