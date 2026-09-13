import { describe, it, expect } from "vitest";
import {
  AS_THE_FORM,
  chordsForJam,
  fitProgression,
  isEmptyProgression,
  progressionEdit,
  withChordAt,
} from "./progression";
import { chordName, chordsForForm, parseChordName } from "./harmony";
import type { Key } from "./harmony";
import type { JamForm } from "./types";

const A_BLUES: Key = { root: 9, mode: "blues" };
const BLUES12: JamForm = { kind: "blues12", bars: 12 };

describe("the progression length rule", () => {
  it("is exactly as long as the form, always", () => {
    expect(fitProgression(undefined, 12)).toHaveLength(12);
    expect(fitProgression([], 8)).toHaveLength(8);
    expect(fitProgression(["A7", "D7"], 4)).toHaveLength(4);
    expect(fitProgression(["A7", "D7", "E7", "A7"], 2)).toHaveLength(2);
  });

  it("keeps the bars you wrote where you wrote them when the form grows", () => {
    // Bars 1-4 stay bars 1-4; the new bars are "as the form", not a repeat of
    // the changes you typed — nothing invents music you did not write.
    expect(fitProgression(["A7", "D7", "E7", "A7"], 8)).toEqual([
      "A7",
      "D7",
      "E7",
      "A7",
      AS_THE_FORM,
      AS_THE_FORM,
      AS_THE_FORM,
      AS_THE_FORM,
    ]);
  });

  it("drops the tail when the form shrinks", () => {
    expect(fitProgression(["A7", "D7", "E7", "A7"], 2)).toEqual(["A7", "D7"]);
  });

  it("never shares the array it was handed", () => {
    const source = ["A7", "D7"];
    const fitted = fitProgression(source, 2);
    fitted[0] = "Bb";
    expect(source[0]).toBe("A7");
  });

  it("reads all-empty as no progression at all", () => {
    expect(isEmptyProgression(undefined)).toBe(true);
    expect(isEmptyProgression([])).toBe(true);
    expect(isEmptyProgression(["", "", ""])).toBe(true);
    expect(isEmptyProgression(["", "A7", ""])).toBe(false);
  });

  it("writes back undefined once the last chord is cleared", () => {
    expect(progressionEdit(["A7", ""], 2)).toEqual(["A7", ""]);
    expect(progressionEdit(["", ""], 2)).toBeUndefined();
    expect(progressionEdit(undefined, 4)).toBeUndefined();
  });

  it("changes one bar and leaves the rest alone", () => {
    expect(withChordAt(["A7", "D7", "E7"], 3, 1, "Bbm7")).toEqual(["A7", "Bbm7", "E7"]);
    expect(withChordAt(["A7", "D7", "E7"], 3, 1, AS_THE_FORM)).toEqual(["A7", "", "E7"]);
    // A bar the form does not have cannot be written to.
    expect(withChordAt(["A7"], 1, 9, "Bb")).toEqual(["A7"]);
  });
});

describe("the changes a jam plays", () => {
  it("are the form's when there is no progression", () => {
    expect(chordsForJam(BLUES12, A_BLUES)).toEqual(chordsForForm("blues12", 12, A_BLUES));
    expect(chordsForJam(BLUES12, A_BLUES, [])).toEqual(chordsForForm("blues12", 12, A_BLUES));
  });

  it("are yours where you wrote one and the form's everywhere else", () => {
    const progression = fitProgression([], 12);
    progression[4] = "Bbmaj7";
    const chords = chordsForJam(BLUES12, A_BLUES, progression);
    const form = chordsForForm("blues12", 12, A_BLUES);
    expect(chords[4]).toEqual(parseChordName("Bbmaj7"));
    expect(chords[0]).toEqual(form[0]);
    expect(chords[11]).toEqual(form[11]);
  });

  it("fall back to the form's chord for a bar that will not parse", () => {
    const progression = fitProgression([], 12);
    progression[2] = "??";
    const chords = chordsForJam(BLUES12, A_BLUES, progression);
    expect(chords[2]).toEqual(chordsForForm("blues12", 12, A_BLUES)[2]);
  });

  it("forgets which way an accidental was spelled and re-spells from the key", () => {
    // "A#m7" and "Bbm7" are one chord; what comes back on screen is the key's
    // spelling, not the typist's.
    const sharp = chordsForJam(BLUES12, A_BLUES, withChordAt([], 12, 0, "A#m7"));
    const flat = chordsForJam(BLUES12, A_BLUES, withChordAt([], 12, 0, "Bbm7"));
    expect(sharp[0]).toEqual(flat[0]);
    expect(chordName(sharp[0], { root: 5, mode: "major" })).toBe("Bbm7");
  });

  it("is exactly as long as the form whatever the progression says", () => {
    expect(chordsForJam(BLUES12, A_BLUES, ["A7"])).toHaveLength(12);
    expect(chordsForJam({ kind: "custom", bars: 5 }, A_BLUES, fitProgression([], 30))).toHaveLength(
      5,
    );
  });
});
