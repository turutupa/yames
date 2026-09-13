import { describe, expect, it } from "vitest";
import {
  addStep,
  setlistStepToPreset,
  createSetlist,
  duplicateSetlist,
  duplicateStep,
  jamStepBars,
  jamToSetlistStep,
  presetToSetlistStep,
  removeStep,
  renameSetlist,
  reorderSteps,
  setSetlistCountIn,
  setSetlistRepeat,
  upsertSetlist,
  updateStep,
} from "./setlists";
import { STARTER_JAMS } from "../jam/jams";
import type { Jam } from "../jam/types";
import type { Setlist, SetlistStep, Preset } from "../types";

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

function stepOf(name: string): SetlistStep {
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
    const s = presetToSetlistStep(p);
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
    expect(presetToSetlistStep(preset()).trigger).toEqual({ kind: "manual" });
    expect(presetToSetlistStep(preset()).transition).toEqual({ kind: "cut" });
  });

  it("takes a gap when one is offered", () => {
    const s = presetToSetlistStep(preset(), {
      trigger: { kind: "bars", bars: 8 },
      transition: { kind: "rest", bars: 1 },
    });
    expect(s.trigger).toEqual({ kind: "bars", bars: 8 });
    expect(s.transition).toEqual({ kind: "rest", bars: 1 });
  });

  it("resolves a legacy preset that only carries a time signature", () => {
    const s = presetToSetlistStep(preset({ beatGroups: undefined, timeSignature: 5 }));
    expect(s.beatGroups).toEqual([5]);
  });

  it("reads the retired never-accent preset as FREE mode", () => {
    const s = presetToSetlistStep(
      preset({ beatGroups: undefined, freeMode: undefined, timeSignature: 0 }),
    );
    expect(s.freeMode).toBe(true);
  });

  it("saves a step back out as a preset, gap dropped", () => {
    const s: SetlistStep = {
      ...stepOf("Chorus"),
      beatGroups: [3, 2, 2],
      trigger: { kind: "bars", bars: 8 },
      transition: { kind: "rest", bars: 1 },
    };
    const p = setlistStepToPreset(s);
    expect(p).toMatchObject({ name: "Chorus", beatGroups: [3, 2, 2], timeSignature: 7, view: "beat" });
    expect(p.id).not.toBe(s.id);
    expect(p).not.toHaveProperty("trigger");
    expect(p).not.toHaveProperty("transition");
  });

  it("round-trips a configuration through a preset unchanged", () => {
    const s = stepOf("Verse");
    const back = presetToSetlistStep(setlistStepToPreset(s));
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
    expect(setlistStepToPreset(stepOf("Verse"), "Verse (fast)").name).toBe("Verse (fast)");
  });
});

describe("setlists", () => {
  it("starts once through, with no steps", () => {
    const c = createSetlist("Evening");
    expect(c).toMatchObject({ name: "Evening", repeat: 1, steps: [] });
  });

  it("renames without touching anything else", () => {
    const c = createSetlist("Evening", [stepOf("a")]);
    const renamed = renameSetlist(c, "Morning");
    expect(renamed.name).toBe("Morning");
    expect(renamed.id).toBe(c.id);
    expect(renamed.steps).toBe(c.steps);
    expect(c.name).toBe("Evening");
  });

  it("keeps repeat a whole count, and never negative", () => {
    const c = createSetlist("Evening");
    expect(setSetlistRepeat(c, 0).repeat).toBe(0);
    expect(setSetlistRepeat(c, 4).repeat).toBe(4);
    expect(setSetlistRepeat(c, -2).repeat).toBe(0);
    expect(setSetlistRepeat(c, 2.7).repeat).toBe(2);
  });

  it("duplicates deeply — new ids on the setlist and on every step", () => {
    const c = createSetlist("Evening", [stepOf("a"), stepOf("b")]);
    const copy = duplicateSetlist(c, "Evening copy");
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
  const base = createSetlist("Evening", [stepOf("a"), stepOf("b"), stepOf("c")]);
  const names = (steps: SetlistStep[]) => steps.map((s) => s.name);

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
    expect(reorderSteps(createSetlist("empty"), 0, 1).steps).toEqual([]);
  });

  it("keeps every step through any sequence of moves", () => {
    // Property-style: a reorder is a permutation, never a loss.
    let setlist = createSetlist("long", Array.from({ length: 9 }, (_, i) => stepOf(`s${i}`)));
    const ids = new Set(setlist.steps.map((s) => s.id));
    for (let from = 0; from < 9; from++) {
      for (let to = 0; to < 9; to++) {
        setlist = reorderSteps(setlist, from, to);
        expect(setlist.steps).toHaveLength(9);
        expect(new Set(setlist.steps.map((s) => s.id))).toEqual(ids);
      }
    }
  });
});

describe("upsertSetlist", () => {
  const setlist = (id: string, name = id): Setlist => ({
    id,
    name,
    createdAt: 0,
    repeat: 1,
    steps: [],
  });

  /**
   * The bug the owner reported as "clicking on a created setlist does nothing".
   *
   * `newSetlist` awaited `save_setlist` and then APPENDED its setlist to the list.
   * The setlist is in the store by the time that await returns, so a
   * `list_setlists` still in flight could resolve with it already present — and
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
  it("does not add a setlist that is already in the list", () => {
    const a = setlist("a");
    const list = [setlist("z"), a];
    expect(upsertSetlist(list, a)).toBe(list);
    expect(upsertSetlist(list, a).map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("replaces by id rather than appending a second copy", () => {
    const list = [setlist("z"), setlist("a", "old name")];
    const renamed = setlist("a", "new name");
    const next = upsertSetlist(list, renamed);
    expect(next.map((c) => c.id)).toEqual(["z", "a"]);
    expect(next[1].name).toBe("new name");
    // In place — the order of the library does not shuffle on a save.
    expect(next).not.toBe(list);
  });

  it("appends one that is genuinely new", () => {
    const list = [setlist("z")];
    expect(upsertSetlist(list, setlist("a")).map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("never produces a duplicate id, however many times it is applied", () => {
    const a = setlist("a");
    let list: Setlist[] = [];
    for (let i = 0; i < 5; i++) list = upsertSetlist(list, a);
    expect(list.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("the count-in at the top of a setlist", () => {
  it("is clamped to what the engine will take", () => {
    // `arm_count_in` accepts 0..8, and past two bars of four a count-in has
    // stopped being a count-in and become a wait.
    const setlist = createSetlist("Warm-up");
    expect(setSetlistCountIn(setlist, 4).countIn).toBe(4);
    expect(setSetlistCountIn(setlist, 99).countIn).toBe(8);
    // `undefined` and 0 are the same answer — no count-in — and clamping a
    // setlist that already has none returns the setlist itself, so this reads
    // the meaning rather than the literal.
    expect(setSetlistCountIn(setlist, -3).countIn ?? 0).toBe(0);
    expect(setSetlistCountIn(setSetlistCountIn(setlist, 6), -3).countIn).toBe(0);
    expect(setSetlistCountIn(setlist, 2.6).countIn).toBe(3);
  });

  it("returns the same setlist when nothing changed", () => {
    // The header's steppers run against the ends of the range, and a new
    // object each press would mark the setlist dirty for doing nothing.
    const setlist = setSetlistCountIn(createSetlist("Warm-up"), 4);
    expect(setSetlistCountIn(setlist, 4)).toBe(setlist);
    const none = createSetlist("Cold");
    expect(setSetlistCountIn(none, 0)).toBe(none);
  });

  it("a new setlist has none, like every setlist saved before it existed", () => {
    expect(createSetlist("Warm-up").countIn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A jam as a step (JAM_MODE §8.5)
// ---------------------------------------------------------------------------

function jam(over: Partial<Jam> = {}): Jam {
  return { ...STARTER_JAMS[0], ...over };
}

describe("jamToSetlistStep", () => {
  it("copies the jam rather than pointing at it, and keeps the id as well", () => {
    // U9.1 both ways: the step is a COPY, so it still plays if the jam is
    // deleted — and it carries `jamId`, so while the jam exists it is the
    // band that plays rather than the copy.
    const source = jam({ name: "Slow blues in A", bpm: 92 });
    const step = jamToSetlistStep(source);
    expect(step.jamId).toBe(source.id);
    expect(step.name).toBe("Slow blues in A");
    expect(step.bpm).toBe(92);
    expect(step.id).not.toBe(source.id);
  });

  it("takes the jam's meter, groups and all", () => {
    // The engine checks `ticksPerBeat × beatsPerBar` against its own bar, so a
    // step whose meter disagrees with the groove's is a step that plays the
    // plain click. Groups, not the sum: 3+2+2 and 2+2+3 are different music.
    const step = jamToSetlistStep(jam({ meter: { beatGroups: [3, 2, 2], ticksPerBeat: 2 } }));
    expect(step.beatGroups.reduce((a, b) => a + b, 0)).toBe(7);
    expect(step.beatGroups).toEqual([3, 2, 2]);
    expect(step.subdivision).toBe(2);
    expect(step.freeMode).toBe(false);
  });

  it("falls back to the jam's count-in sound, not to whatever is loaded", () => {
    // The sound only ever sounds on the day the jam has been deleted, and it
    // has to be the same sound every time — a step that borrowed the app's
    // current click would play something different on each occasion.
    expect(jamToSetlistStep(jam({ countInSound: "beep" })).soundType).toBe("beep");
    expect(jamToSetlistStep(jam({ countInSound: "sticks" })).soundType).toBe("wood");
    expect(jamToSetlistStep(jam({ countInSound: undefined })).soundType).toBe("beep");
  });

  it("starts with a gap that cannot run away, and takes one when given", () => {
    expect(jamToSetlistStep(jam()).trigger).toEqual({ kind: "manual" });
    const step = jamToSetlistStep(jam(), { trigger: { kind: "bars", bars: 48 } });
    expect(step.trigger).toEqual({ kind: "bars", bars: 48 });
  });

  it("gives every step its own id, so two of the same jam are two rows", () => {
    const source = jam();
    expect(jamToSetlistStep(source).id).not.toBe(jamToSetlistStep(source).id);
  });

  it("survives being duplicated as the same jam", () => {
    // A duplicated jam step is still that jam: copying the row must not
    // quietly turn the band into a click.
    const setlist = addStep(createSetlist("Routine"), jamToSetlistStep(jam()));
    const copied = duplicateStep(setlist, setlist.steps[0].id);
    expect(copied.steps).toHaveLength(2);
    expect(copied.steps[1].jamId).toBe(setlist.steps[0].jamId);
    expect(copied.steps[1].id).not.toBe(setlist.steps[0].id);
  });

  it("drops the jam when the step is saved as a preset — a preset is a click", () => {
    const preset = setlistStepToPreset(jamToSetlistStep(jam()));
    expect(preset).not.toHaveProperty("jamId");
  });
});

describe("jamStepBars", () => {
  it("is the length of one chorus", () => {
    expect(jamStepBars(jam({ form: { kind: "blues12", bars: 12 } }))).toBe(12);
    expect(jamStepBars(jam({ form: { kind: "aaba32", bars: 32 } }))).toBe(32);
  });

  it("is zero for a jam that is no longer there", () => {
    expect(jamStepBars(null)).toBe(0);
    expect(jamStepBars(undefined)).toBe(0);
  });
});
