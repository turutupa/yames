/**
 * The note verifier's legato line (detection M4): reported, never graded,
 * and carried from the late grade to the result.
 */
import { describe, expect, it } from "vitest";
import type { ScorerTakeGrade, VerifierReport } from "../ipc";
import { legatoOf, withRightNotes } from "./takeMeasures";

const report = (kinds: VerifierReport["kinds"], status: VerifierReport["status"] = "ran"): VerifierReport => ({
  status,
  kinds,
  lagMs: 0,
  modelMs: 0,
  ruleMs: 0,
  audioS: 10,
});

describe("legatoOf", () => {
  it("pools hammer-ons, pull-offs and taps, and leaves the rest out", () => {
    const r = report([
      { kind: "hammer", due: 6, sounded: 5, notSounded: 1, wrong: 0, unsure: 0 },
      { kind: "pull", due: 4, sounded: 3, notSounded: 0, wrong: 0, unsure: 1 },
      { kind: "picked", due: 20, sounded: 20, notSounded: 0, wrong: 0, unsure: 0 },
    ]);
    expect(legatoOf(r)).toEqual({ due: 10, sounded: 8, notSounded: 1 });
  });
  it("says nothing when the verifier did not run or there was no legato", () => {
    expect(legatoOf(undefined)).toBeUndefined();
    expect(legatoOf(report([{ kind: "hammer", due: 3, sounded: 3, notSounded: 0, wrong: 0, unsure: 0 }], "noModel"))).toBeUndefined();
    expect(legatoOf(report([{ kind: "picked", due: 8, sounded: 8, notSounded: 0, wrong: 0, unsure: 0 }]))).toBeUndefined();
  });
});

describe("withRightNotes", () => {
  it("brings the verifier's account along with the late pass", async () => {
    const timed = { notesPending: true, notesSerial: 4 } as unknown as ScorerTakeGrade;
    const verifier = report([{ kind: "tap", due: 2, sounded: 2, notSounded: 0, wrong: 0, unsure: 0 }]);
    const late = { notesSerial: 4, pass: { verdict: "passed" }, verifier } as unknown as ScorerTakeGrade;
    const got = await withRightNotes(timed, async () => late);
    expect(got?.verifier).toBe(verifier);
    expect(got?.notesPending).toBe(false);
  });
});
