/**
 * The note that makes a change audible (leg c5a1). Every expected value here is
 * written by hand from the chords' letters, never computed by the code under
 * test: Dm7 is D F A C, G7 is G B D F, Cmaj7 is C E G B, E7 is E G# B D,
 * G7b9 is G B D F Ab, Cm is C Eb G.
 */
import { describe, expect, it } from "vitest";
import type { JamHarmony } from "../../jam/display";
import { jamHarmony } from "../../jam/display";
import { chordIntervals, chordName, type Chord, type ChordQuality, type Key } from "../../jam/harmony";
import { createJam } from "../../jam/jams";
import type { CoachContext } from "../context";
import type { FactCard } from "./cards";
import { changeNoteLines, roleOfInterval, withChangeNote } from "./changeNote";

const chart = (key: Key, chords: Chord[]): JamHarmony => ({ key, concert: key, chords });
const C_MAJOR: Key = { root: 0, mode: "major" };
const A_MINOR: Key = { root: 9, mode: "minor" };
const C_MINOR: Key = { root: 0, mode: "minor" };

describe("changeNoteLines", () => {
  // ii-V-I in C: Dm7 G7 Cmaj7 Cmaj7, looping.
  const twoFiveOne = chart(C_MAJOR, [
    { root: 2, quality: "m7" },
    { root: 7, quality: "7" },
    { root: 0, quality: "maj7" },
    { root: 0, quality: "maj7" },
  ]);

  it("a ii-V-I in C: C to B into G7, F to E into Cmaj7, E to F into Dm7 (the loop)", () => {
    expect(changeNoteLines(twoFiveOne, "G7")).toEqual([
      { key: "jam.change.halfDown", values: { from: "Dm7", to: "G7", note: "C", target: "B" } },
      { key: "jam.change.third", values: { to: "G7", target: "B" } },
    ]);
    expect(changeNoteLines(twoFiveOne, "Cmaj7")).toEqual([
      { key: "jam.change.halfDown", values: { from: "G7", to: "Cmaj7", note: "F", target: "E" } },
      { key: "jam.change.third", values: { to: "Cmaj7", target: "E" } },
    ]);
    expect(changeNoteLines(twoFiveOne, "Dm7")).toEqual([
      { key: "jam.change.halfUp", values: { from: "Cmaj7", to: "Dm7", note: "E", target: "F" } },
      { key: "jam.change.third", values: { to: "Dm7", target: "F" } },
    ]);
  });

  it("a minor iv-V-i in A: A to G# into E7, B to C into Am, E to F into Dm", () => {
    const minor = chart(A_MINOR, [
      { root: 2, quality: "min" },
      { root: 4, quality: "7" },
      { root: 9, quality: "min" },
      { root: 9, quality: "min" },
    ]);
    expect(changeNoteLines(minor, "E7")).toEqual([
      { key: "jam.change.halfDown", values: { from: "Dm", to: "E7", note: "A", target: "G#" } },
      { key: "jam.change.third", values: { to: "E7", target: "G#" } },
    ]);
    expect(changeNoteLines(minor, "Am")).toEqual([
      { key: "jam.change.halfUp", values: { from: "E7", to: "Am", note: "B", target: "C" } },
      { key: "jam.change.third", values: { to: "Am", target: "C" } },
    ]);
    expect(changeNoteLines(minor, "Dm")).toEqual([
      { key: "jam.change.halfUp", values: { from: "Am", to: "Dm", note: "E", target: "F" } },
      { key: "jam.change.third", values: { to: "Dm", target: "F" } },
    ]);
  });

  it("an altered dominant in C minor: C to B into G7b9, D to Eb into Cm", () => {
    const altered = chart(C_MINOR, [
      { root: 5, quality: "min" },
      { root: 7, quality: "7b9" },
      { root: 0, quality: "min" },
      { root: 0, quality: "min" },
    ]);
    expect(changeNoteLines(altered, "G7b9")).toEqual([
      { key: "jam.change.halfDown", values: { from: "Fm", to: "G7b9", note: "C", target: "B" } },
      { key: "jam.change.third", values: { to: "G7b9", target: "B" } },
    ]);
    expect(changeNoteLines(altered, "Cm")).toEqual([
      { key: "jam.change.halfUp", values: { from: "G7b9", to: "Cm", note: "D", target: "Eb" } },
      { key: "jam.change.third", values: { to: "Cm", target: "Eb" } },
    ]);
  });

  it("no note moves by a step: A to A7 only adds G, so nothing is said", () => {
    const blues = chart({ root: 9, mode: "major" }, [
      { root: 9, quality: "maj" },
      { root: 9, quality: "7" },
      { root: 2, quality: "7" },
      { root: 2, quality: "7" },
    ]);
    expect(changeNoteLines(blues, "A7")).toBeNull();
  });

  it("nothing for a chord the chart does not have, a one-chord chart, or a chord it cannot read", () => {
    expect(changeNoteLines(twoFiveOne, "F7")).toBeNull();
    expect(changeNoteLines(chart(C_MAJOR, [{ root: 0, quality: "maj" }, { root: 0, quality: "maj" }]), "C")).toBeNull();
    expect(changeNoteLines(twoFiveOne, "H7")).toBeNull();
  });

  it("Bm to E7#9: the #9 (F##) is not the third; F# moves a whole step up to G#, the third (review c5a1 M1)", () => {
    // Bm = B D F#. E7#9 = E G# B D F## (F## sounds as G, a minor third above E, but it is the sharp ninth).
    // F# leaves; it could go up a half step to F## (the #9, no role) or a whole step to G# (the third).
    const sharpNine = chart({ root: 4, mode: "major" }, [
      { root: 11, quality: "min" },
      { root: 4, quality: "7sharp9" },
    ]);
    expect(changeNoteLines(sharpNine, "E7#9")).toEqual([
      { key: "jam.change.wholeUp", values: { from: "Bm", to: "E7#9", note: "F#", target: "G#" } },
      { key: "jam.change.third", values: { to: "E7#9", target: "G#" } },
    ]);
  });

  it("the chord as the asker typed it matches the chart's by sound (A#7 is the chart's Bb7)", () => {
    const flat = chart({ root: 5, mode: "major" }, [
      { root: 5, quality: "7" },
      { root: 10, quality: "7" },
    ]);
    // F7 = F A C Eb, Bb7 = Bb D F Ab. Bb7's third D is reached from C (a whole step up) and from Eb (a half step down).
    expect(changeNoteLines(flat, "A#7")).toEqual([
      { key: "jam.change.halfDown", values: { from: "F7", to: "Bb7", note: "Eb", target: "D" } },
      { key: "jam.change.third", values: { to: "Bb7", target: "D" } },
    ]);
  });
});

describe("roleOfInterval: a tone is called the third or the seventh only when it is that degree", () => {
  // Written by hand, one entry per stack position (root first), from what each
  // tone IS: 3/4 the third, b7/maj7 the seventh (bb7 in dim7), everything else
  // (root, fifth, sixth, 2, 4, 9, b9, #9, 11, 13) no role.
  const T = "third";
  const S = "seventh";
  const _ = null;
  const cases: Array<[ChordQuality, number[], Array<"third" | "seventh" | null>]> = [
    ["7sharp9", [0, 4, 7, 10, 15], [_, T, _, S, _]],
    ["7b9", [0, 4, 7, 10, 13], [_, T, _, S, _]],
    ["9", [0, 4, 7, 10, 14], [_, T, _, S, _]],
    ["maj9", [0, 4, 7, 11, 14], [_, T, _, S, _]],
    ["m9", [0, 3, 7, 10, 14], [_, T, _, S, _]],
    ["11", [0, 4, 7, 10, 14, 17], [_, T, _, S, _, _]],
    ["m11", [0, 3, 7, 10, 14, 17], [_, T, _, S, _, _]],
    ["13", [0, 4, 7, 10, 14, 21], [_, T, _, S, _, _]],
    ["m13", [0, 3, 7, 10, 14, 21], [_, T, _, S, _, _]],
    ["maj13", [0, 4, 7, 11, 14, 21], [_, T, _, S, _, _]],
    ["add9", [0, 2, 4, 7], [_, _, T, _]],
    ["madd9", [0, 3, 7, 14], [_, T, _, _]],
    ["69", [0, 4, 7, 9, 14], [_, T, _, _, _]],
    ["6", [0, 4, 7, 9], [_, T, _, _]],
    ["m6", [0, 3, 7, 9], [_, T, _, _]],
    ["sus2", [0, 2, 7], [_, _, _]],
    ["sus4", [0, 5, 7], [_, _, _]],
    ["7sus4", [0, 5, 7, 10], [_, _, _, S]],
    ["7sus2", [0, 2, 7, 10], [_, _, _, S]],
    ["9sus4", [0, 5, 7, 10, 14], [_, _, _, S, _]],
    ["dim7", [0, 3, 6, 9], [_, T, _, S]],
    ["m7b5", [0, 3, 6, 10], [_, T, _, S]],
    ["7sharp5", [0, 4, 8, 10], [_, T, _, S]],
    ["mMaj7", [0, 3, 7, 11], [_, T, _, S]],
    ["5", [0, 7], [_, _]],
    ["maj", [0, 4, 7], [_, T, _]],
    ["min", [0, 3, 7], [_, T, _]],
    ["dim", [0, 3, 6], [_, T, _]],
    ["aug", [0, 4, 8], [_, T, _]],
    ["7", [0, 4, 7, 10], [_, T, _, S]],
    ["maj7", [0, 4, 7, 11], [_, T, _, S]],
    ["m7", [0, 3, 7, 10], [_, T, _, S]],
  ];
  it.each(cases)("%s", (quality, stack, roles) => {
    // The stack is restated by hand so a change to the table cannot pass silently.
    expect(chordIntervals(quality)).toEqual(stack);
    expect(stack.map((i) => roleOfInterval(i, quality))).toEqual(roles);
  });
});

describe("withChangeNote: only on the Jam screen, after the card's own lines", () => {
  const card: FactCard = { shape: "chord_notes", lines: [{ key: "ask.card.theory.chordNotes", values: { chord: "Em", notes: "E G B" } }], source: { kind: "app" } };

  it("a typed chart with a slash chord: D/F# is read as D, as the Jam screen shows it", () => {
    const jam = createJam("Slash", { key: "G", form: { kind: "custom", bars: 4 }, progression: ["G", "D/F#", "Em", "C"] });
    const shown = jamHarmony(jam);
    expect(shown.chords.map((c) => chordName(c, shown.key))).toEqual(["G", "D", "Em", "C"]);
    const ctx = { jam: { jam } } as unknown as CoachContext;
    const out = withChangeNote(card, ctx, "E", "m") as FactCard;
    expect(out.lines).toEqual([
      card.lines[0],
      { key: "jam.change.halfUp", values: { from: "D", to: "Em", note: "F#", target: "G" } },
      { key: "jam.change.third", values: { to: "Em", target: "G" } },
    ]);
    expect(out.source).toEqual({ kind: "app" });
  });

  it("anywhere but Jam, or for a card that could not read the chord, the card is unchanged", () => {
    expect(withChangeNote(card, {} as CoachContext, "E", "m")).toBe(card);
    const unknown: FactCard = { ...card, uncertain: true };
    const jam = createJam("Slash", { key: "G", form: { kind: "custom", bars: 4 }, progression: ["G", "D/F#", "Em", "C"] });
    expect(withChangeNote(unknown, { jam: { jam } } as unknown as CoachContext, "E", "m")).toBe(unknown);
  });
});
