import { describe, expect, it } from "vitest";
import triads from "../paths/packs/triads.json";
import type { Exercise, PathDoc } from "../paths/format";
import { ALT } from "./testKit";
import { keyChoicesOf, keySymbol, pickVariantSeed, readChosenKeys, stepPageSeed } from "./variants";

function exercise(id: string): Exercise {
  for (const step of (triads as unknown as PathDoc).steps) for (const e of step.exercises) if (e.id === id) return e;
  throw new Error(`no ${id}`);
}

describe("an Exercise's keys (card #93)", () => {
  const keyed = exercise("three-chords.stay-put-keys");

  it("lists a key-moved Exercise's keys, and none for one without", () => {
    expect(keyChoicesOf(keyed).map((c) => c.key)).toEqual(["D", "E", "Bb"]);
    expect(keyChoicesOf(ALT.steps[0].exercises[0])).toEqual([]);
  });

  it("writes a key the way a chart does", () => {
    expect(keySymbol("Bb")).toBe("B♭");
    expect(keySymbol("F# minor")).toBe("F♯m");
    expect(keySymbol("E")).toBe("E");
  });

  it("a Step page plays the key chosen, else the next in turn as Today does", () => {
    const takes = [{ variantSeed: 0 }, { variantSeed: 2 }];
    expect(stepPageSeed(keyed, takes, undefined)).toBe(pickVariantSeed(keyed, 2, 0));
    expect(stepPageSeed(keyed, [], undefined)).toBe(0);
    expect(stepPageSeed(keyed, takes, "key=Bb")).toBe(2);
    // A key the Exercise no longer has: back to the turn.
    expect(stepPageSeed(keyed, [], "key=Q")).toBe(0);
  });

  it("reads only what it wrote", () => {
    expect(readChosenKeys({ "triads/x": "key=E", bad: 3 })).toEqual({ "triads/x": "key=E" });
    expect(readChosenKeys(null)).toEqual({});
    expect(readChosenKeys(["a"])).toEqual({});
  });
});
