/**
 * The model names, the app resolves: words to things, numbers to what the app
 * allows. One table per helper.
 */

import { describe, expect, it } from "vitest";
import type { Exercise } from "../../paths/format";
import {
  MAX_CHOICES,
  matchByTitle,
  normalizeWords,
  resolveExercise,
  resolvePath,
  resolveStep,
  snapMinutes,
  snapPart,
  snapToRung,
  titleMatch,
  wholeTitleWords,
} from "./resolve";
import { ALT, ALT_BLUES, LEGATO_ES, TEST_PATHS } from "./testPaths";

describe("wholeTitleWords: what typed text may open at once (review t1b2c, finding 5)", () => {
  it("the whole title, or a run of two or more of its words", () => {
    expect(wholeTitleWords("classic rock", "Classic Rock")).toBe(true);
    expect(wholeTitleWords("Triads", "Triads")).toBe(true);
    expect(wholeTitleWords("first chords", "First Chords and Strumming")).toBe(true);
    expect(wholeTitleWords("rock clasico", "Rock clásico")).toBe(true);
    expect(wholeTitleWords("オルタネイトピッキング", "オルタネイト・ピッキング")).toBe(true);
  });
  it("not a prefix, one word of a longer title, or words out of order", () => {
    expect(wholeTitleWords("class", "Classic Rock")).toBe(false);
    expect(wholeTitleWords("first", "First Chords and Strumming")).toBe(false);
    expect(wholeTitleWords("over", "Arpeggios over Changes")).toBe(false);
    expect(wholeTitleWords("rock classic", "Classic Rock")).toBe(false);
    expect(wholeTitleWords("ブルース", "ブルースとペンタトニック")).toBe(false);
    expect(wholeTitleWords("", "Triads")).toBe(false);
  });
});

describe("normalizeWords", () => {
  it.each([
    ["Alternate-Picking", "alternate picking"],
    ["  Légato!  ", "legato"],
    ["Step 7: Crossing", "step 7 crossing"],
    ["交替拨弦", "交替拨弦"],
  ])("%s -> %s", (input, out) => {
    expect(normalizeWords(input)).toBe(out);
  });
});

describe("titleMatch", () => {
  it.each([
    ["alternate picking", "Alternate Picking", 2],
    ["alternate-picking", "Alternate Picking", 2],
    ["alt pick", "Alternate Picking", 1],
    ["picking", "Alternate Picking", 1],
    ["icking", "Alternate Picking", 0],
    ["sweep", "Alternate Picking", 0],
    ["ligado", "Ligado", 2],
    ["", "Ligado", 0],
    ["拨弦", "交替拨弦", 1],
    ["扫弦", "交替拨弦", 0],
    // Typed run together, as the router hands it over (review t1b2b, finding 4).
    ["얼터네이트피킹", "얼터네이트 피킹", 1],
    ["블루스와펜타토닉", "블루스와 펜타토닉", 1],
    ["オルタネイトピッキング", "オルタネイト・ピッキング", 1],
    ["피킹얼터네이트", "얼터네이트 피킹", 0],
  ] as const)("%s in %s = %i", (query, title, score) => {
    expect(titleMatch(query, title)).toBe(score);
  });
});

describe("matchByTitle", () => {
  const items = ["Alternate Picking", "Alternate Blues", "Legato", "Alternate"];
  const id = (s: string) => s;

  it("one clear match is found", () => {
    expect(matchByTitle("legato", items, id)).toEqual({ found: "Legato" });
  });
  it("an exact title wins over the partial ones", () => {
    expect(matchByTitle("alternate", items, id)).toEqual({ found: "Alternate" });
  });
  it("several partial matches are choices, in the given order", () => {
    expect(matchByTitle("alt", items, id)).toEqual({ several: ["Alternate Picking", "Alternate Blues", "Alternate"] });
  });
  it("none is none", () => {
    expect(matchByTitle("tapping", items, id)).toEqual({ none: true });
  });
  it("never more than MAX_CHOICES choices", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Box ${String(i)}`);
    const got = matchByTitle("box", many, id);
    expect("several" in got && got.several.length).toBe(MAX_CHOICES);
  });
});

describe("resolvePath, in the player's language", () => {
  it.each([
    ["ligado", "legato"],
    ["alternate picking", "alternate-picking"],
    ["alternate-picking", "alternate-picking"],
    ["blues", "blues-pentatonics"],
  ])("%s -> %s", (query, id) => {
    const got = resolvePath(query, TEST_PATHS);
    expect("found" in got && got.found.id).toBe(id);
  });

  it("the English title is not matched when the player reads Spanish", () => {
    expect(resolvePath("legato", TEST_PATHS)).toEqual({ none: true });
  });

  it("two Paths that both fit are a question", () => {
    const got = resolvePath("alternate", TEST_PATHS);
    expect("several" in got && got.several.map((p) => p.id)).toEqual(["alternate-picking", "blues-pentatonics"]);
  });
});

describe("resolveStep", () => {
  it("by its number on the Path", () => {
    const got = resolveStep({ path: ALT }, { number: 2 });
    expect("found" in got && got.found.step.id).toBe("ap-2");
  });
  it("a number the Path does not have is none", () => {
    expect(resolveStep({ path: ALT }, { number: 9 })).toEqual({ none: true });
  });
  it("a number with no Path to count on is none", () => {
    expect(resolveStep({ paths: TEST_PATHS }, { number: 1 })).toEqual({ none: true });
  });
  it("by words, on one Path", () => {
    const got = resolveStep({ path: ALT }, { query: "three strings" });
    expect("found" in got && got.found.step.id).toBe("ap-3");
  });
  it("by words that fit two Steps", () => {
    const got = resolveStep({ path: ALT }, { query: "crossing" });
    expect("several" in got && got.several.map((h) => h.step.id)).toEqual(["ap-2", "ap-3"]);
  });
  it("by words, across every Path", () => {
    const got = resolveStep({ paths: TEST_PATHS }, { query: "crossing two" });
    expect("found" in got && [got.found.path.id, got.found.step.id]).toEqual(["alternate-picking", "ap-2"]);
    const both = resolveStep({ paths: TEST_PATHS }, { query: "crossing" });
    expect("several" in both && both.several.map((h) => h.step.id)).toEqual(["ap-2", "ap-3", "lg-2"]);
  });
  it("no Step by those words", () => {
    expect(resolveStep({ path: LEGATO_ES }, { query: "sweep" })).toEqual({ none: true });
  });
});

describe("resolveExercise", () => {
  it("one, with its Step", () => {
    const got = resolveExercise("outside", { path: ALT });
    expect("found" in got && [got.found.step.id, got.found.exercise.id]).toEqual(["ap-2", "ap-2-a"]);
  });
  it("several", () => {
    const got = resolveExercise("picking", { path: ALT });
    expect("several" in got && got.several.map((h) => h.exercise.id)).toEqual(["ap-2-a", "ap-2-b"]);
  });
  it("across Paths, and none", () => {
    const got = resolveExercise("box one", { paths: [ALT, ALT_BLUES] });
    expect("found" in got && got.found.path.id).toBe("blues-pentatonics");
    expect(resolveExercise("tapping", { paths: TEST_PATHS })).toEqual({ none: true });
  });
});

describe("snapToRung: a tempo to a graded rung", () => {
  const ex = ALT.steps[1].exercises[0]; // graded 60, 72; 90 self-checked
  it.each([
    [40, 60],
    [60, 60],
    [65, 60],
    [66, 60], // a tie goes to the slower
    [67, 72],
    [90, 72], // 90 is a rung, but not a graded one
    [300, 72],
  ])("%i -> %i", (bpm, rung) => {
    expect(snapToRung(ex, bpm)).toBe(rung);
  });

  it("no graded rung: the nearest of any kind; no rung: null", () => {
    const selfOnly = { tempo: { rungs: [{ bpm: 50, grading: "selfCheck" }, { bpm: 70, grading: "selfCheck" }] } } as unknown as Exercise;
    expect(snapToRung(selfOnly, 66)).toBe(70);
    expect(snapToRung({ tempo: { rungs: [] } } as unknown as Exercise, 80)).toBeNull();
  });
});

describe("snapMinutes: one of four", () => {
  it.each([
    [0, 5],
    [5, 5],
    [7, 5], // a tie goes to the shorter
    [8, 10],
    [12, 10],
    [13, 15],
    [18, 20],
    [60, 20],
  ])("%i -> %i", (minutes, snapped) => {
    expect(snapMinutes(minutes)).toBe(snapped);
  });
});

describe("snapPart: a part number to one that exists", () => {
  it.each([
    [1, 4, 0],
    [3, 4, 2],
    [4, 4, 3],
    [9, 4, 3],
    [0, 4, 0],
    [-2, 4, 0],
    [1, 0, null],
  ])("part %i of %i -> index %s", (part, count, index) => {
    expect(snapPart(part, count)).toBe(index);
  });
});
