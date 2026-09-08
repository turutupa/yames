import { describe, expect, it } from "vitest";
import {
  addStep,
  chainStepToPreset,
  createChain,
  duplicateChain,
  duplicateStep,
  presetToChainStep,
  removeStep,
  renameChain,
  reorderSteps,
  setChainCountIn,
  setChainRepeat,
  upsertChain,
  updateStep,
} from "./chains";
import type { Chain, ChainStep, Preset } from "../types";

function preset(over: Partial<Preset> = {}): Preset {
  return {
    id: "p1",
    name: "Warmup",
    createdAt: 1,
    bpm: 92,
    subdivision: 2,
    timeSignature: 7,
    beatGroups: [3, 2, 2],
    freeMode: false,
    soundType: "woodblock",
    volume: 0.6,
    view: "beat",
    ...over,
  };
}

function stepOf(name: string): ChainStep {
  return {
    id: `id-${name}`,
    name,
    bpm: 100,
    subdivision: 1,
    beatGroups: [4],
    soundType: "click",
    volume: 0.8,
    trigger: { kind: "manual" },
    transition: { kind: "cut" },
  };
}

describe("preset ↔ step (U9.1)", () => {
  it("copies the configuration in rather than pointing at the preset", () => {
    const p = preset();
    const s = presetToChainStep(p);
    expect(s.id).not.toBe(p.id);
    expect(s).toMatchObject({
      name: "Warmup",
      bpm: 92,
      subdivision: 2,
      beatGroups: [3, 2, 2],
      soundType: "woodblock",
      volume: 0.6,
    });
    expect(Object.keys(s)).not.toContain("presetId");
    // Editing the preset afterwards must not reach the step.
    p.beatGroups![0] = 9;
    expect(s.beatGroups).toEqual([3, 2, 2]);
  });

  it("gives a fresh step a gap that will not run away on its own", () => {
    expect(presetToChainStep(preset()).trigger).toEqual({ kind: "manual" });
    expect(presetToChainStep(preset()).transition).toEqual({ kind: "cut" });
  });

  it("takes a gap when one is offered", () => {
    const s = presetToChainStep(preset(), {
      trigger: { kind: "bars", bars: 8 },
      transition: { kind: "rest", bars: 1 },
    });
    expect(s.trigger).toEqual({ kind: "bars", bars: 8 });
    expect(s.transition).toEqual({ kind: "rest", bars: 1 });
  });

  it("resolves a legacy preset that only carries a time signature", () => {
    const s = presetToChainStep(preset({ beatGroups: undefined, timeSignature: 5 }));
    expect(s.beatGroups).toEqual([5]);
  });

  it("reads the retired never-accent preset as FREE mode", () => {
    const s = presetToChainStep(
      preset({ beatGroups: undefined, freeMode: undefined, timeSignature: 0 }),
    );
    expect(s.freeMode).toBe(true);
  });

  it("saves a step back out as a preset, gap dropped", () => {
    const s: ChainStep = {
      ...stepOf("Chorus"),
      beatGroups: [3, 2, 2],
      trigger: { kind: "bars", bars: 8 },
      transition: { kind: "rest", bars: 1 },
    };
    const p = chainStepToPreset(s);
    expect(p).toMatchObject({ name: "Chorus", beatGroups: [3, 2, 2], timeSignature: 7, view: "beat" });
    expect(p.id).not.toBe(s.id);
    expect(p).not.toHaveProperty("trigger");
    expect(p).not.toHaveProperty("transition");
  });

  it("round-trips a configuration through a preset unchanged", () => {
    const s = stepOf("Verse");
    const back = presetToChainStep(chainStepToPreset(s));
    expect(back).toMatchObject({
      name: s.name,
      bpm: s.bpm,
      subdivision: s.subdivision,
      beatGroups: s.beatGroups,
      soundType: s.soundType,
      volume: s.volume,
    });
  });

  it("takes a name for the preset when the step's is not the one wanted", () => {
    expect(chainStepToPreset(stepOf("Verse"), "Verse (fast)").name).toBe("Verse (fast)");
  });
});

describe("chains", () => {
  it("starts once through, with no steps", () => {
    const c = createChain("Evening");
    expect(c).toMatchObject({ name: "Evening", repeat: 1, steps: [] });
  });

  it("renames without touching anything else", () => {
    const c = createChain("Evening", [stepOf("a")]);
    const renamed = renameChain(c, "Morning");
    expect(renamed.name).toBe("Morning");
    expect(renamed.id).toBe(c.id);
    expect(renamed.steps).toBe(c.steps);
    expect(c.name).toBe("Evening");
  });

  it("keeps repeat a whole count, and never negative", () => {
    const c = createChain("Evening");
    expect(setChainRepeat(c, 0).repeat).toBe(0);
    expect(setChainRepeat(c, 4).repeat).toBe(4);
    expect(setChainRepeat(c, -2).repeat).toBe(0);
    expect(setChainRepeat(c, 2.7).repeat).toBe(2);
  });

  it("duplicates deeply — new ids on the chain and on every step", () => {
    const c = createChain("Evening", [stepOf("a"), stepOf("b")]);
    const copy = duplicateChain(c, "Evening copy");
    expect(copy.id).not.toBe(c.id);
    expect(copy.name).toBe("Evening copy");
    expect(copy.repeat).toBe(c.repeat);
    expect(copy.steps.map((s) => s.name)).toEqual(["a", "b"]);
    for (let i = 0; i < copy.steps.length; i++) {
      expect(copy.steps[i].id).not.toBe(c.steps[i].id);
      expect(copy.steps[i].beatGroups).not.toBe(c.steps[i].beatGroups);
    }
    expect(new Set(copy.steps.map((s) => s.id)).size).toBe(2);
  });
});

describe("steps", () => {
  const base = createChain("Evening", [stepOf("a"), stepOf("b"), stepOf("c")]);
  const names = (steps: ChainStep[]) => steps.map((s) => s.name);

  it("adds at the end by default and at a position when asked", () => {
    expect(names(addStep(base, stepOf("d")).steps)).toEqual(["a", "b", "c", "d"]);
    expect(names(addStep(base, stepOf("d"), 0).steps)).toEqual(["d", "a", "b", "c"]);
    expect(names(addStep(base, stepOf("d"), 2).steps)).toEqual(["a", "b", "d", "c"]);
    expect(names(base.steps)).toEqual(["a", "b", "c"]);
  });

  it("removes by id", () => {
    expect(names(removeStep(base, "id-b").steps)).toEqual(["a", "c"]);
    expect(names(removeStep(base, "nope").steps)).toEqual(["a", "b", "c"]);
  });

  it("patches one step and leaves the rest alone", () => {
    const edited = updateStep(base, "id-b", { bpm: 140, trigger: { kind: "bars", bars: 8 } });
    expect(edited.steps[1]).toMatchObject({ bpm: 140, trigger: { kind: "bars", bars: 8 } });
    expect(edited.steps[0]).toBe(base.steps[0]);
    expect(base.steps[1].bpm).toBe(100);
  });

  it("duplicates a step in place, next to its original", () => {
    const out = duplicateStep(base, "id-a");
    expect(names(out.steps)).toEqual(["a", "a", "b", "c"]);
    expect(out.steps[1].id).not.toBe(out.steps[0].id);
    expect(duplicateStep(base, "nope")).toBe(base);
  });

  it("reorders by position, because two steps can look the same", () => {
    expect(names(reorderSteps(base, 0, 2).steps)).toEqual(["b", "c", "a"]);
    expect(names(reorderSteps(base, 2, 0).steps)).toEqual(["c", "a", "b"]);
    expect(reorderSteps(base, 1, 1)).toBe(base);
  });

  it("clamps a drag that overshoots instead of dropping the step", () => {
    expect(names(reorderSteps(base, 0, 99).steps)).toEqual(["b", "c", "a"]);
    expect(names(reorderSteps(base, -5, 1).steps)).toEqual(["b", "a", "c"]);
    expect(reorderSteps(createChain("empty"), 0, 1).steps).toEqual([]);
  });

  it("keeps every step through any sequence of moves", () => {
    // Property-style: a reorder is a permutation, never a loss.
    let chain = createChain("long", Array.from({ length: 9 }, (_, i) => stepOf(`s${i}`)));
    const ids = new Set(chain.steps.map((s) => s.id));
    for (let from = 0; from < 9; from++) {
      for (let to = 0; to < 9; to++) {
        chain = reorderSteps(chain, from, to);
        expect(chain.steps).toHaveLength(9);
        expect(new Set(chain.steps.map((s) => s.id))).toEqual(ids);
      }
    }
  });
});

describe("upsertChain", () => {
  const chain = (id: string, name = id): Chain => ({
    id,
    name,
    createdAt: 0,
    repeat: 1,
    steps: [],
  });

  /**
   * The bug the owner reported as "clicking on a created chain does nothing".
   *
   * `newChain` awaited `save_chain` and then APPENDED its chain to the list.
   * The chain is in the store by the time that await returns, so a
   * `list_chains` still in flight could resolve with it already present — and
   * the mount effect fires two of those under StrictMode. The append then put
   * one id in the list twice; React warned about duplicate keys, and
   * reconciliation between two rows sharing an identity is undefined. They
   * rendered as a single row stuck in rename mode, and clicking either did
   * nothing.
   *
   * The interleaving is narrow and order-dependent — a listing that lands
   * AFTER the append simply replaces the array and hides everything — so it is
   * the LOGIC that is pinned here rather than the timing. A test that tried to
   * stage the race passed against the bug, which is worse than no test.
   */
  it("does not add a chain that is already in the list", () => {
    const a = chain("a");
    const list = [chain("z"), a];
    expect(upsertChain(list, a)).toBe(list);
    expect(upsertChain(list, a).map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("replaces by id rather than appending a second copy", () => {
    const list = [chain("z"), chain("a", "old name")];
    const renamed = chain("a", "new name");
    const next = upsertChain(list, renamed);
    expect(next.map((c) => c.id)).toEqual(["z", "a"]);
    expect(next[1].name).toBe("new name");
    // In place — the order of the library does not shuffle on a save.
    expect(next).not.toBe(list);
  });

  it("appends one that is genuinely new", () => {
    const list = [chain("z")];
    expect(upsertChain(list, chain("a")).map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("never produces a duplicate id, however many times it is applied", () => {
    const a = chain("a");
    let list: Chain[] = [];
    for (let i = 0; i < 5; i++) list = upsertChain(list, a);
    expect(list.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("the count-in at the top of a chain", () => {
  it("is clamped to what the engine will take", () => {
    // `arm_count_in` accepts 0..8, and past two bars of four a count-in has
    // stopped being a count-in and become a wait.
    const chain = createChain("Warm-up");
    expect(setChainCountIn(chain, 4).countIn).toBe(4);
    expect(setChainCountIn(chain, 99).countIn).toBe(8);
    // `undefined` and 0 are the same answer — no count-in — and clamping a
    // chain that already has none returns the chain itself, so this reads
    // the meaning rather than the literal.
    expect(setChainCountIn(chain, -3).countIn ?? 0).toBe(0);
    expect(setChainCountIn(setChainCountIn(chain, 6), -3).countIn).toBe(0);
    expect(setChainCountIn(chain, 2.6).countIn).toBe(3);
  });

  it("returns the same chain when nothing changed", () => {
    // The header's steppers run against the ends of the range, and a new
    // object each press would mark the chain dirty for doing nothing.
    const chain = setChainCountIn(createChain("Warm-up"), 4);
    expect(setChainCountIn(chain, 4)).toBe(chain);
    const none = createChain("Cold");
    expect(setChainCountIn(none, 0)).toBe(none);
  });

  it("a new chain has none, like every chain saved before it existed", () => {
    expect(createChain("Warm-up").countIn).toBeUndefined();
  });
});
