/**
 * The tools' note's measured sentence (C5): one per kind `analyze_free_play`
 * ranks, its numbers whole and unsigned, `null` for nothing, a short run or a
 * number that would read as nothing. The English is held to the honesty lint.
 */
import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import en from "../locales/en/coach.json";
import { bannedClaimsIn } from "../paths/honesty";
import type { Evidence, Finding, FindingKind } from "../songs/types";
import { type FreePlayCounts, TOOL_FINDING_MIN_RUN_MS, toolFinding, toolFindingText } from "./toolFinding";

const RUN = 30_000;

const NO_COUNTS: FreePlayCounts = {
  counted: 0,
  agreeing: 0,
  lowNotes: 0,
  highNotes: 0,
  lowSpreadMs: 0,
  highSpreadMs: 0,
};

/** A finding as `analyze_free_play` sends it; `counts: null` = an older payload without them. */
function finding(kind: FindingKind, evidence: Partial<Evidence>, counts: Partial<FreePlayCounts> | null = {}): Finding {
  return {
    kind,
    noteIds: [],
    severity: 0.5,
    evidence: {
      onsets: 16,
      hits: 16,
      hitRate: 1,
      meanDeviationMs: 0,
      deviationBeats: 0,
      spreadMs: 0,
      passes: 1,
      passesAffected: 1,
      ...evidence,
      ...(counts ? { freePlay: { ...NO_COUNTS, ...counts } } : {}),
    } as Evidence,
  };
}

const T = (key: string, values?: Record<string, unknown>) => i18n.t(key, { ...values, lng: "en" }) as string;

const DRIFT = { counted: 60, agreeing: 20 };

describe("toolFinding: one sentence per kind, with what it counted (c5c2b M3)", () => {
  it.each([
    [
      "beat late",
      finding("beatPositionBias", { beatPosition: 3, meanDeviationMs: 40.4 }, { counted: 16, agreeing: 15 }),
      "On beat 3 of the bar your notes came 40 ms later than on the other beats, on average: 15 of the 16 notes on that beat were later than the other beats' average.",
    ],
    [
      "beat early",
      finding("beatPositionBias", { beatPosition: 1, meanDeviationMs: -17.6 }, { counted: 12, agreeing: 9 }),
      "On beat 1 of the bar your notes came 18 ms earlier than on the other beats, on average: 9 of the 12 notes on that beat were earlier than the other beats' average.",
    ],
    [
      "the off-beat eighth",
      finding("subdivisionWeak", { subdivisionPosition: [1, 2] }, { counted: 48, agreeing: 32 }),
      "No note landed on the off-beat eighth on 32 of the 48 beats where it was counted.",
    ],
    [
      "the fourth sixteenth",
      finding("subdivisionWeak", { subdivisionPosition: [3, 4] }, { counted: 40, agreeing: 9 }),
      "No note landed on the fourth sixteenth on 9 of the 40 beats where it was counted.",
    ],
    [
      "the ceiling, as played",
      finding(
        "tempoCeiling",
        { bpmBand: [100, 110], spreadMs: 30 },
        { lowBpm: [100, 108], highBpm: [112, 116], lowNotes: 36, highNotes: 24, lowSpreadMs: 2, highSpreadMs: 30 },
      ),
      "At 100–108 BPM, at least half of your 36 notes on the click landed within 2 ms of their usual place against it; at 112–116 BPM, at least half of your 24 notes on the click were 30 ms or more from it.",
    ],
    [
      "the ceiling at one tempo each",
      finding(
        "tempoCeiling",
        { bpmBand: [100, 140], spreadMs: 45 },
        { lowBpm: [100, 100], highBpm: [140, 140], lowNotes: 20, highNotes: 20, lowSpreadMs: 2, highSpreadMs: 45 },
      ),
      "At 100 BPM, at least half of your 20 notes on the click landed within 2 ms of their usual place against it; at 140 BPM, at least half of your 20 notes on the click were 45 ms or more from it.",
    ],
    [
      "drift later",
      finding("drift", { meanDeviationMs: 40.2 }, DRIFT),
      "Over a stretch of 60 notes on the click, the last 20 landed 40 ms later against the click than the first 20, on average.",
    ],
    [
      "drift earlier",
      finding("drift", { meanDeviationMs: -12.5 }, DRIFT),
      "Over a stretch of 60 notes on the click, the last 20 landed 13 ms earlier against the click than the first 20, on average.",
    ],
  ])("%s", (_name, f, text) => {
    const line = toolFinding([f], RUN);
    expect(line).not.toBeNull();
    expect(line!.kind).toBe(f.kind);
    expect(toolFindingText(line!, T)).toBe(text);
  });

  it("says the headline only: findings[0], whatever follows it", () => {
    const line = toolFinding(
      [
        finding("drift", { meanDeviationMs: 30 }, DRIFT),
        finding("beatPositionBias", { beatPosition: 2, meanDeviationMs: 25 }, { counted: 12, agreeing: 12 }),
      ],
      RUN,
    );
    expect(line?.kind).toBe("drift");
  });

  it("numbers are whole and unsigned, the direction is in the words", () => {
    const line = toolFinding([finding("drift", { meanDeviationMs: -6.49 }, DRIFT)], RUN)!;
    expect(line.values).toEqual({ ms: 6, notes: 60, third: 20 });
    expect(line.key).toBe("toolCoach.finding.driftEarly");
  });
});

describe("toolFinding: when there is nothing to say", () => {
  it("no findings, or none at all", () => {
    expect(toolFinding([], RUN)).toBeNull();
    expect(toolFinding(undefined, RUN)).toBeNull();
  });

  it("a run under the note's 10 s", () => {
    const f = finding("drift", { meanDeviationMs: 40 }, DRIFT);
    expect(toolFinding([f], TOOL_FINDING_MIN_RUN_MS - 1)).toBeNull();
    expect(toolFinding([f], TOOL_FINDING_MIN_RUN_MS)).not.toBeNull();
    expect(toolFinding([f], Number.NaN)).toBeNull();
  });

  it("a beat or a drift whose number would read as on time", () => {
    expect(
      toolFinding([finding("beatPositionBias", { beatPosition: 2, meanDeviationMs: 2.4 }, { counted: 12, agreeing: 12 })], RUN),
    ).toBeNull();
    expect(toolFinding([finding("drift", { meanDeviationMs: -2.4 }, DRIFT)], RUN)).toBeNull();
  });

  it("evidence it needs and does not have", () => {
    expect(toolFinding([finding("beatPositionBias", { meanDeviationMs: 30 }, { counted: 12, agreeing: 12 })], RUN)).toBeNull();
    expect(
      toolFinding([finding("subdivisionWeak", { subdivisionPosition: [1, 5] }, { counted: 20, agreeing: 16 })], RUN),
    ).toBeNull();
    expect(
      toolFinding([finding("subdivisionWeak", { subdivisionPosition: [1, 2] }, { counted: 20, agreeing: 0 })], RUN),
    ).toBeNull();
    expect(toolFinding([finding("tempoCeiling", {})], RUN)).toBeNull();
  });

  it("a finding without its counts (an older payload) is not said", () => {
    expect(toolFinding([finding("drift", { meanDeviationMs: 40 }, null)], RUN)).toBeNull();
    expect(toolFinding([finding("beatPositionBias", { beatPosition: 3, meanDeviationMs: 40 }, null)], RUN)).toBeNull();
    expect(toolFinding([finding("subdivisionWeak", { subdivisionPosition: [1, 2], onsets: 48, hits: 16 }, null)], RUN)).toBeNull();
    expect(toolFinding([finding("tempoCeiling", { bpmBand: [100, 140] }, null)], RUN)).toBeNull();
  });

  it("counts that contradict themselves are not said", () => {
    // More notes on the side named than on the beat; a third bigger than a third.
    expect(
      toolFinding([finding("beatPositionBias", { beatPosition: 3, meanDeviationMs: 40 }, { counted: 8, agreeing: 9 })], RUN),
    ).toBeNull();
    expect(toolFinding([finding("drift", { meanDeviationMs: 40 }, { counted: 30, agreeing: 11 })], RUN)).toBeNull();
    // A higher band no wider than the lower one.
    expect(
      toolFinding(
        [
          finding(
            "tempoCeiling",
            { bpmBand: [100, 110] },
            { lowBpm: [100, 104], highBpm: [110, 112], lowNotes: 9, highNotes: 9, lowSpreadMs: 12, highSpreadMs: 12 },
          ),
        ],
        RUN,
      ),
    ).toBeNull();
  });

  it("Songs' kinds never make a tools' sentence", () => {
    for (const kind of ["consistentMiss", "rushing", "clean", "improved"] as FindingKind[]) {
      expect(toolFinding([finding(kind, { meanDeviationMs: 30 })], RUN)).toBeNull();
    }
  });
});

function strings(node: unknown, prefix: string): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${prefix}.${k}`));
}

const FINDING = strings((en as { toolCoach: { finding: unknown } }).toolCoach.finding, "toolCoach.finding");

describe("the tools' finding sentences, in English", () => {
  it("has strings to check", () => {
    expect(FINDING.length).toBe(21);
  });

  it.each(FINDING)("%s claims nothing the app cannot measure", (_key, text) => {
    expect(bannedClaimsIn(text, true).map((c) => c.name)).toEqual([]);
  });

  it.each(FINDING)("%s says no cause and gives no advice", (_key, text) => {
    expect(text).not.toMatch(/\bbecause\b|\bsince\b|\btry\b|\bshould\b|\bslow (?:it )?down\b|\bgreat\b|\bnice\b|\bwell done\b/);
    // The pass mark is never "the bar" (owner decision 2); "beat 3 of the bar" is the measure.
    expect(text.replace(/\bof the bar\b/g, "")).not.toMatch(/\bthe bar\b|\bpass bar\b/i);
  });

  it("every position inside a beat the click can play has a name", () => {
    for (const [total, positions] of [[2, 2], [3, 3], [4, 4], [6, 6]]) {
      for (let p = 0; p < positions; p++) {
        expect(T(`toolCoach.finding.position.${total}.${p}`)).not.toContain("toolCoach");
      }
    }
  });
});
