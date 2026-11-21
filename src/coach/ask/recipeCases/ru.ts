import type { RecipeCases } from "./types";

/**
 * Russian: keys are typed as Latin letters ("a", "f#"). Guitarists vary on "b" (English habit: B flat is "bb"
 * and "b" is B; German habit: "b" is B flat and "h" is B), so a line holding a bare "b" is not read, and "h"
 * is B. Cyrillic letters and fixed-do names ("ля") stay out: they fall through.
 */
export const CASES: RecipeCases = {
  language: "ru",
  lines: [
    ["сделай упражнение a минорная пентатоника восьмыми с 5 лада", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["сделай c мажор арпеджио 2 такта", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["сделай e минорная пентатоника три ноты на струне", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["сделай упражнение g мажор бокс", { root: "G", scale: "major", shape: "box" }],
    ["сделай хроматическое упражнение", { shape: "chromatic" }],
    ["сделай f# минорная пентатоника шестнадцатыми", { root: "F#", scale: "minorPentatonic", subdivision: 4 }],
    ["сделай d минор восьмыми триолями с 7 лада", { root: "D", scale: "naturalMinor", subdivision: 3, position: 7 }],
    ["сделай a минор 7 арпеджио", { root: "A", chord: "m7", shape: "arpeggio" }],
    ["a минорная пентатоника восьмыми с 5 лада", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["сделай e дорийский 4 такта", { root: "E", scale: "dorian", bars: 4 }],
    ["сделай h минор восьмыми", { root: "B", scale: "naturalMinor", subdivision: 2 }],
    ["сделай c диез минор восьмыми", { root: "C#", scale: "naturalMinor", subdivision: 2 }],
    ["сделай e бемоль мажор четвертями", { root: "Eb", scale: "major", subdivision: 1 }],
  ],
  none: [
    "что такое a минорная пентатоника",
    "a минорная пентатоника",
    "покажи a минорная пентатоника",
    "a минорная пентатоника коробочка с 5 лада",
    "сделай b мажор восьмыми",
    "сделай ля минор восьмыми",
    "сделай c мажор восьмыми с 20 лада",
    "сделай a минор 12 тактов",
  ],
  yours: ["сделай a минор восьмыми запись"],
};
