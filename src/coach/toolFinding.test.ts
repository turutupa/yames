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
import { TOOL_FINDING_MIN_RUN_MS, toolFinding, toolFindingText } from "./toolFinding";

const RUN = 30_000;

function finding(kind: FindingKind, evidence: Partial<Evidence>): Finding {
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
    },
  };
}

const T = (key: string, values?: Record<string, unknown>) => i18n.t(key, { ...values, lng: "en" }) as string;

describe("toolFinding: one sentence per kind", () => {
  it.each([
    [
      "beat late",
      finding("beatPositionBias", { beatPosition: 3, meanDeviationMs: 40.4 }),
      "Beat 3 of the bar came 40 ms late on average, out of line with the other beats.",
    ],
    [
      "beat early",
      finding("beatPositionBias", { beatPosition: 1, meanDeviationMs: -17.6 }),
      "Beat 1 of the bar came 18 ms early on average, out of line with the other beats.",
    ],
    [
      "the off-beat eighth",
      finding("subdivisionWeak", { subdivisionPosition: [1, 2], onsets: 48, hits: 16 }),
      "No note landed on the off-beat eighth in 32 of 48 beats.",
    ],
    [
      "the fourth sixteenth",
      finding("subdivisionWeak", { subdivisionPosition: [3, 4], onsets: 40, hits: 31 }),
      "No note landed on the fourth sixteenth in 9 of 40 beats.",
    ],
    [
      "the ceiling",
      finding("tempoCeiling", { bpmBand: [100, 140], spreadMs: 45 }),
      "Your timing held at 100 BPM and slipped at 140 BPM.",
    ],
    [
      "drift later",
      finding("drift", { meanDeviationMs: 40.2 }),
      "By the last third of the run you were landing 40 ms later than in the first third.",
    ],
    [
      "drift earlier",
      finding("drift", { meanDeviationMs: -12.5 }),
      "By the last third of the run you were landing 13 ms earlier than in the first third.",
    ],
  ])("%s", (_name, f, text) => {
    const line = toolFinding([f], RUN);
    expect(line).not.toBeNull();
    expect(line!.kind).toBe(f.kind);
    expect(toolFindingText(line!, T)).toBe(text);
  });

  it("says the headline only: findings[0], whatever follows it", () => {
    const line = toolFinding(
      [finding("drift", { meanDeviationMs: 30 }), finding("beatPositionBias", { beatPosition: 2, meanDeviationMs: 25 })],
      RUN,
    );
    expect(line?.kind).toBe("drift");
  });

  it("numbers are whole and unsigned, the direction is in the words", () => {
    const line = toolFinding([finding("drift", { meanDeviationMs: -6.49 })], RUN)!;
    expect(line.values).toEqual({ ms: 6 });
    expect(line.key).toBe("toolCoach.finding.driftEarly");
  });
});

describe("toolFinding: when there is nothing to say", () => {
  it("no findings, or none at all", () => {
    expect(toolFinding([], RUN)).toBeNull();
    expect(toolFinding(undefined, RUN)).toBeNull();
  });

  it("a run under the note's 10 s", () => {
    const f = finding("drift", { meanDeviationMs: 40 });
    expect(toolFinding([f], TOOL_FINDING_MIN_RUN_MS - 1)).toBeNull();
    expect(toolFinding([f], TOOL_FINDING_MIN_RUN_MS)).not.toBeNull();
    expect(toolFinding([f], Number.NaN)).toBeNull();
  });

  it("a beat or a drift whose number would read as on time", () => {
    expect(toolFinding([finding("beatPositionBias", { beatPosition: 2, meanDeviationMs: 2.4 })], RUN)).toBeNull();
    expect(toolFinding([finding("drift", { meanDeviationMs: -2.4 })], RUN)).toBeNull();
  });

  it("evidence it needs and does not have", () => {
    expect(toolFinding([finding("beatPositionBias", { meanDeviationMs: 30 })], RUN)).toBeNull();
    expect(toolFinding([finding("subdivisionWeak", { subdivisionPosition: [1, 5], onsets: 20, hits: 4 })], RUN)).toBeNull();
    expect(toolFinding([finding("subdivisionWeak", { subdivisionPosition: [1, 2], onsets: 20, hits: 20 })], RUN)).toBeNull();
    expect(toolFinding([finding("tempoCeiling", {})], RUN)).toBeNull();
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
