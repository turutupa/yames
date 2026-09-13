// The library's data operations, and the six jams that ship. The starter set
// is what the first press of Jam plays, so "it is six, they are distinct, and
// every one of them names a groove that exists" is worth a test on its own.
import { describe, expect, it } from "vitest";
import {
  STARTER_JAMS,
  clampCountIn,
  countInChoiceId,
  countInChoices,
  createJam,
  duplicateJam,
  newId,
  parseCountInChoice,
  renameJam,
  reorderJams,
  upsertJam,
} from "./jams";
import { GROOVES, grooveById } from "./grooves";
import { JAM_MAX_COUNT_IN } from "./types";
import type { Jam } from "./types";

const names = (list: Jam[]) => list.map((j) => j.name);

describe("createJam", () => {
  it("fills in something that plays when handed nothing", () => {
    const jam = createJam("New jam");
    expect(jam.name).toBe("New jam");
    expect(jam.id).toBeTruthy();
    expect(grooveById(jam.grooveId).id).toBe(jam.grooveId);
    expect(jam.form.kind).toBe("loop8");
    expect(jam.fills).toBe(true);
    expect(jam.kit).toBe("room");
  });

  it("counts in one bar of whatever meter the groove is written in", () => {
    // Four for a rock groove, three for a waltz. A count-in in the wrong
    // meter lands you on beat two of the first bar.
    expect(createJam("x", { grooveId: "rock8" }).countIn).toBe(4);
    expect(createJam("x", { grooveId: "waltz" }).countIn).toBe(3);
    expect(createJam("x", { grooveId: "sixEight" }).countIn).toBe(6);
  });

  it("takes the settings it is handed — the '+' means 'another one like this'", () => {
    const jam = createJam("New jam", {
      bpm: 138,
      grooveId: "bossa",
      feel: "swing",
      intensity: "loud",
      form: { kind: "custom", bars: 17 },
      countIn: 0,
      fills: false,
      key: "Bb",
    });
    expect(jam.bpm).toBe(138);
    expect(jam.grooveId).toBe("bossa");
    expect(jam.feel).toBe("swing");
    expect(jam.intensity).toBe("loud");
    expect(jam.form).toEqual({ kind: "custom", bars: 17 });
    expect(jam.countIn).toBe(0);
    expect(jam.fills).toBe(false);
    expect(jam.key).toBe("Bb");
  });

  it("carries how often the fills land, and writes nothing when there is nothing to carry", () => {
    expect(createJam("x", { fills: true, fillEvery: 4 }).fillEvery).toBe(4);
    // A jam that never asked for one keeps the field off its record, the way
    // the key and the band do — an old record and a new default look the same.
    expect("fillEvery" in createJam("x")).toBe(false);
  });

  it("holds a custom form and a count-in to what the engine will take", () => {
    expect(createJam("x", { form: { kind: "custom", bars: 500 } }).form.bars).toBe(64);
    expect(createJam("x", { countIn: 99 }).countIn).toBe(JAM_MAX_COUNT_IN);
    expect(clampCountIn(-4)).toBe(0);
  });

  it("leaves the key off rather than writing an empty one", () => {
    expect("key" in createJam("x")).toBe(false);
  });

  it("gives every jam its own id", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
  });
});

describe("renameJam", () => {
  it("renames, trimming what the field was given", () => {
    const jam = createJam("Old");
    expect(renameJam(jam, "  Blues in G  ").name).toBe("Blues in G");
  });

  it("leaves the jam alone on an empty name or no change", () => {
    const jam = createJam("Old");
    expect(renameJam(jam, "   ")).toBe(jam);
    expect(renameJam(jam, "Old")).toBe(jam);
  });
});

describe("upsertJam", () => {
  it("appends a jam the list has never seen", () => {
    const a = createJam("A");
    expect(upsertJam([], a)).toEqual([a]);
  });

  it("replaces rather than doubling an id the list already holds", () => {
    // The bug this was written for: `saveJams` resolves with the jam already
    // in the store, so a listing still in flight can come back with it, and a
    // blind append renders two rows sharing one identity.
    const a = createJam("A");
    const edited = { ...a, bpm: 160 };
    const list = upsertJam([a], edited);
    expect(list).toHaveLength(1);
    expect(list[0].bpm).toBe(160);
  });

  it("returns the same array when nothing changes, so React can skip it", () => {
    const a = createJam("A");
    const list = [a];
    expect(upsertJam(list, a)).toBe(list);
  });
});

describe("duplicateJam", () => {
  it("copies everything but the identity", () => {
    const jam = STARTER_JAMS[0];
    const copy = duplicateJam(jam, "Slow blues in A copy");
    expect(copy.id).not.toBe(jam.id);
    expect(copy.name).toBe("Slow blues in A copy");
    expect({ ...copy, id: "", name: "", createdAt: 0 }).toEqual({
      ...jam,
      id: "",
      name: "",
      createdAt: 0,
    });
  });
});

describe("reorderJams", () => {
  const list = [createJam("A"), createJam("B"), createJam("C")];

  it("moves a jam to where it was dropped", () => {
    expect(names(reorderJams(list, 0, 2))).toEqual(["B", "C", "A"]);
    expect(names(reorderJams(list, 2, 0))).toEqual(["C", "A", "B"]);
  });

  it("leaves the list alone for a drag that ended nowhere", () => {
    expect(reorderJams(list, 1, 1)).toBe(list);
    expect(reorderJams(list, -1, 0)).toBe(list);
    expect(reorderJams(list, 0, 9)).toBe(list);
  });

  it("does not mutate the list it was given", () => {
    reorderJams(list, 0, 2);
    expect(names(list)).toEqual(["A", "B", "C"]);
  });
});

describe("the starter jams", () => {
  it("ships the six the plan names, in order", () => {
    expect(names([...STARTER_JAMS])).toEqual([
      "Slow blues in A",
      "Funk in E",
      "Bossa in D minor",
      "Swing in F",
      "Rock in G",
      "Waltz in C",
    ]);
  });

  it("gives each one a stable id, so a re-seed cannot double the library", () => {
    const ids = STARTER_JAMS.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("jam-"))).toBe(true);
  });

  it("names only grooves that exist", () => {
    const known = new Set(GROOVES.map((g) => g.id));
    for (const jam of STARTER_JAMS) expect(known, jam.name).toContain(jam.grooveId);
  });

  it("sets the tempo, the form and the key the brief asks for", () => {
    const by = Object.fromEntries(STARTER_JAMS.map((j) => [j.name, j]));
    // "A blues", not "A": the key is what the chords-in-the-key strip is drawn
    // from, and A major does not contain the A7 the twelve-bar plays.
    expect([by["Slow blues in A"].bpm, by["Slow blues in A"].form.kind, by["Slow blues in A"].key])
      .toEqual([92, "blues12", "A blues"]);
    expect([by["Funk in E"].bpm, by["Funk in E"].form.kind, by["Funk in E"].key])
      .toEqual([104, "loop8", "E"]);
    expect([by["Bossa in D minor"].bpm, by["Bossa in D minor"].form.kind, by["Bossa in D minor"].key])
      .toEqual([120, "bars16", "Dm"]);
    expect([by["Swing in F"].bpm, by["Swing in F"].form.kind, by["Swing in F"].key])
      .toEqual([160, "aaba32", "F"]);
    expect([by["Rock in G"].bpm, by["Rock in G"].form.kind, by["Rock in G"].key])
      .toEqual([120, "loop8", "G"]);
    expect([by["Waltz in C"].bpm, by["Waltz in C"].form.kind, by["Waltz in C"].key])
      .toEqual([140, "bars16", "C"]);
  });

  it("counts in one bar and plays its fills", () => {
    for (const jam of STARTER_JAMS) {
      expect(jam.countIn, jam.name).toBe(grooveById(jam.grooveId).beatsPerBar);
      expect(jam.fills, jam.name).toBe(true);
    }
  });
});

/**
 * The count-in, as ONE control (plans/JAM_UX_DECISIONS.md A4).
 *
 * It used to be two: how many bars, and what they sounded like, a screen
 * apart. "One bar of sticks" is a single thing a drummer says out loud, so it
 * is one dropdown now — and these three functions are the whole of the merge.
 */
describe("the count-in, merged", () => {
  it("writes an id a dropdown can carry, and reads it back", () => {
    const choice = { beats: 4, sound: "sticks" as const };
    expect(countInChoiceId(choice)).toBe("4|sticks");
    expect(parseCountInChoice("4|sticks")).toEqual(choice);
  });

  it("collapses every no-count-in to the same id, whatever sound it carried", () => {
    // A record that says "no count-in, on the sticks" is a record two readers
    // can disagree about, and one of them draws the control.
    expect(countInChoiceId({ beats: 0, sound: "sticks" })).toBe("0");
    expect(parseCountInChoice("0")).toEqual({ beats: 0, sound: "beep" });
  });

  it("reads anything unreadable as no count-in", () => {
    expect(parseCountInChoice("wombat")).toEqual({ beats: 0, sound: "beep" });
    expect(parseCountInChoice("")).toEqual({ beats: 0, sound: "beep" });
    expect(parseCountInChoice("-4|beep")).toEqual({ beats: 0, sound: "beep" });
  });

  it("offers none, one bar and two bars in each sound", () => {
    expect(countInChoices(4).map(countInChoiceId)).toEqual([
      "0",
      "4|beep",
      "4|sticks",
      "8|beep",
      "8|sticks",
    ]);
  });

  it("does not offer two bars where two bars will not fit", () => {
    // Two bars of 6/8 is twelve beats, past `arm_count_in`'s limit of eight.
    // Not offered, rather than offered and quietly clamped to something that
    // is not two bars.
    expect(countInChoices(6).map(countInChoiceId)).toEqual(["0", "6|beep", "6|sticks"]);
  });

  it("never offers a count-in past the engine's limit", () => {
    for (const beatsPerBar of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      for (const choice of countInChoices(beatsPerBar)) {
        expect(choice.beats, `${beatsPerBar} per bar`).toBeLessThanOrEqual(JAM_MAX_COUNT_IN);
      }
    }
  });
});

/** The second pass's optional half, carried by "another one like this one". */
describe("createJam and the vibe", () => {
  it("carries the vibe, the variation, the voices and your own kit", () => {
    const source = createJam("a", {
      vibe: "rock",
      variation: "punk",
      bassVoice: "picked",
      keysVoice: "organ",
      customKit: { dir: "C:/samples/mine", name: "mine" },
    });
    expect(source.vibe).toBe("rock");
    expect(source.variation).toBe("punk");
    expect(source.bassVoice).toBe("picked");
    expect(source.keysVoice).toBe("organ");
    expect(source.customKit).toEqual({ dir: "C:/samples/mine", name: "mine" });
  });

  it("leaves them off a jam that never had them", () => {
    // The plainest new jam writes the same small record it always did.
    const plain = createJam("a");
    expect("vibe" in plain).toBe(false);
    expect("customKit" in plain).toBe(false);
  });

  it("does not carry the chord sheet's own state", () => {
    // Where you left a cheat sheet is not part of the music.
    const copy = createJam("a", {
      pinnedShape: { root: 4, quality: "min", index: 2 },
      shapesFollow: true,
    });
    expect("pinnedShape" in copy).toBe(false);
    expect("shapesFollow" in copy).toBe(false);
  });
});
