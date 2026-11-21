import type { RecipeCases } from "./types";

/**
 * Polish: "h" is B and "b" is B flat, so a line holding a bare "b" is not read. "fis", "cis", "gis", "dis",
 * "ais", "des", "es", "ges" are names that are no other word; "as" is left out (it is also the word "ace").
 * Scale names are inflected and the table's scales are fixed, so a line reads only where the key comes right
 * before the scale word ("a molowa pentatonika", "c dur"); "pentatonika a moll" falls through.
 */
export const CASES: RecipeCases = {
  language: "pl",
  lines: [
    ["zrób ćwiczenie a molowa pentatonika ósemkami od 5 progu", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["zrób c dur arpeggio 2 takty", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["zrób e molowa pentatonika trzy dźwięki na strunie", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["zrób ćwiczenie g dur box", { root: "G", scale: "major", shape: "box" }],
    ["zrób ćwiczenie chromatyczne", { shape: "chromatic" }],
    ["zrób fis molowa pentatonika szesnastki", { root: "F#", scale: "minorPentatonic", subdivision: 4 }],
    ["zrób h moll ósemkami", { root: "B", scale: "naturalMinor", subdivision: 2 }],
    ["zrób a moll triole od 7 progu", { root: "A", scale: "naturalMinor", subdivision: 3, position: 7 }],
    ["a molowa pentatonika ósemkami od 5 progu", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["zrób d dorycka 4 takty", { root: "D", scale: "dorian", bars: 4 }],
    ["zrób a moll 7 arpeggio", { root: "A", chord: "m7", shape: "arpeggio" }],
    ["zrób des dur ósemkami", { root: "Db", scale: "major", subdivision: 2 }],
    ["zrób c# moll ósemkami", { root: "C#", scale: "naturalMinor", subdivision: 2 }],
  ],
  none: [
    "co to jest a molowa pentatonika",
    "a molowa pentatonika",
    "pokaż mi a molowa pentatonika",
    "a molowa pentatonika box od 5 progu",
    "zrób b moll ósemkami",
    "zrób c dur ósemkami w b",
    "zrób c dur ósemkami od 20 progu",
    "zrób a moll 12 taktów",
  ],
  yours: ["zrób a moll ósemkami nagranie"],
};
