/**
 * The metronome-state slice, on its own. It came out of `useSession.ts`, so
 * the rules it encodes — salience order, and a bar that changed LENGTH not
 * also reporting a regrouping — are worth pinning down away from the coach.
 */
import { describe, it, expect } from "vitest";
import { diffMetronomeState, type MetronomeSnapshot } from "./useMetronomeState";

const base: MetronomeSnapshot = {
  bpm: 120,
  presetId: undefined,
  presetName: undefined,
  timeSignature: 4,
  meterId: "4",
  instrument: "electric-guitar",
};

describe("diffMetronomeState", () => {
  it("says nothing when nothing moved", () => {
    expect(diffMetronomeState(base, { ...base })).toEqual([]);
  });

  it("names the direction the tempo went", () => {
    expect(diffMetronomeState(base, { ...base, bpm: 140 })[0]).toEqual({
      kind: "bpm-up",
      from: 120,
      to: 140,
    });
    expect(diffMetronomeState(base, { ...base, bpm: 90 })[0].kind).toBe("bpm-down");
  });

  it("reports a preset by name, and its absence as free play", () => {
    const loaded = { ...base, presetId: "p1", presetName: "Riff #3" };
    expect(diffMetronomeState(base, loaded)[0]).toEqual({
      kind: "preset",
      from: "free play",
      to: "Riff #3",
    });
    expect(diffMetronomeState(loaded, base)[0].to).toBe("free play");
  });

  it("sees a regrouping that keeps the bar's length", () => {
    const from = { ...base, timeSignature: 7, meterId: "3,2,2" };
    const to = { ...base, timeSignature: 7, meterId: "2,3,2" };
    expect(diffMetronomeState(from, to)).toEqual([
      { kind: "grouping", from: "3,2,2", to: "2,3,2" },
    ]);
  });

  it("reports a new bar length instead of the regrouping it implies", () => {
    const to = { ...base, timeSignature: 7, meterId: "3,2,2" };
    const changes = diffMetronomeState(base, to);
    expect(changes.map((c) => c.kind)).toEqual(["time-sig"]);
  });

  it("orders several changes by salience — tempo, preset, meter, instrument", () => {
    const to: MetronomeSnapshot = {
      bpm: 96,
      presetId: "p2",
      presetName: "Slow burn",
      timeSignature: 3,
      meterId: "3",
      instrument: "piano",
    };
    expect(diffMetronomeState(base, to).map((c) => c.kind)).toEqual([
      "bpm-down",
      "preset",
      "time-sig",
      "instrument",
    ]);
  });
});
