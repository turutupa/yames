import type { RecipeCases } from "./types";

/**
 * German: "h" is B and "b" is B flat, so a line holding a bare "b" is not read; "fis", "cis", "gis", "dis",
 * "ais", "as", "ges" are names that are no other word. "es" and "des" are left out (the pronoun, the article).
 * "ab" is "from" in a line and A flat as a letter pair: it is a key only right before a scale.
 */
export const CASES: RecipeCases = {
  language: "de",
  lines: [
    ["mach mir a moll pentatonik achtel im 5. bund", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["erstelle ein c dur arpeggio 2 takte", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["mach e moll pentatonik drei töne pro saite", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["erstelle eine g dur box übung", { root: "G", scale: "major", shape: "box" }],
    ["mach eine chromatische übung", { shape: "chromatic" }],
    ["mach fis moll pentatonik sechzehntel", { root: "F#", scale: "minorPentatonic", subdivision: 4 }],
    ["mach h moll pentatonik achtel", { root: "B", scale: "minorPentatonic", subdivision: 2 }],
    ["mach a moll achteltriolen im 7. bund", { root: "A", scale: "naturalMinor", subdivision: 3, position: 7 }],
    ["a moll pentatonik achtel ab 5. bund", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["mach ab dem 5. bund a moll pentatonik achtel", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["erstelle d dorisch 4 takte", { root: "D", scale: "dorian", bars: 4 }],
    ["mach as dur viertel", { root: "Ab", scale: "major", subdivision: 1 }],
    ["mach c dur achtel ab 5. bund", { root: "C", scale: "major", subdivision: 2, position: 5 }],
    ["mach c# moll pentatonik achtel", { root: "C#", scale: "minorPentatonic", subdivision: 2 }],
    ["erstelle a moll 7 arpeggio", { root: "A", chord: "m7", shape: "arpeggio" }],
  ],
  none: [
    "was ist a moll pentatonik",
    "a moll pentatonik",
    "a moll pentatonik box im 5. bund",
    "zeig mir a moll pentatonik",
    "mach b moll pentatonik achtel",
    "mach c dur pentatonik achtel in b",
    "mach c dur pentatonik achtel im 20. bund",
    "mach a moll pentatonik 12 takte",
    "mach es dur achtel",
    "mach des dur achtel",
  ],
  yours: ["erstelle a moll pentatonik achtel aufnahme"],
};
