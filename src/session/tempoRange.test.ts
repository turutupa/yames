import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../paths/format";
import { tempoRange } from "./coachWords";
import { ALT } from "./testKit";

const SHRED_PACK = import.meta.glob("../paths/packs/shred.json", { eager: true });
const SHRED = (Object.values(SHRED_PACK)[0] as { default: unknown }).default as PathDoc;

describe("an Exercise card's tempo (QA 2026-11-17 #14)", () => {
  it("names the subdivision when the pack carries one, with start and pass tempo", () => {
    const ex = SHRED.steps[0].exercises[0];
    expect(ex.subdivision).toBe("sixteenths");
    expect(tempoRange(ex)).toEqual({
      subdivision: "sixteenths",
      from: ex.tempo.rungs[0].bpm,
      to: ex.tempo.passAtBpm,
    });
  });

  it("Alternate Picking names its grid too (QA 2 #14)", () => {
    const ex = ALT.steps[0].exercises[0];
    expect(tempoRange(ex)).toMatchObject({ subdivision: "eighths", from: ex.tempo.rungs[0].bpm });
  });

  it("without one, just the tempos", () => {
    const ex = { ...ALT.steps[0].exercises[0], subdivision: undefined };
    expect(tempoRange(ex)).toMatchObject({ subdivision: null, from: ex.tempo.rungs[0].bpm });
  });

  it("no pass tempo: only where it starts; no rungs: nothing", () => {
    const ex = ALT.steps[0].exercises[0];
    const open: Exercise = { ...ex, tempo: { ...ex.tempo, passAtBpm: null } };
    expect(tempoRange(open)?.to).toBeNull();
    expect(tempoRange({ ...ex, tempo: { ...ex.tempo, rungs: [] } })).toBeNull();
  });
});
