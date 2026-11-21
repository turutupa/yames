/**
 * Typed recipe lines, Italian (leg t2d). Hand-written. Notes are read as letters (A to G):
 * fixed-do names (do re mi fa sol la si) stay out ("la", "mi" are articles and pronouns), so
 * "la minore" is not read. "e" means "and": it is the root E only after in / di / su; otherwise the
 * line has no key and the tool asks. "a" is a preposition, but a bare "a minore" is a chart's A minor.
 */
import type { RecipeCases } from "./types";

export const CASES: RecipeCases = {
  language: "it",
  lines: [
    ["a minore pentatonica crome tasto 5", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["fammi un esercizio in e blues", { root: "E", scale: "blues" }],
    ["fai c maggiore tre note per corda al tasto 8", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
    ["fai un arpeggio di g maggiore 2 battute", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["fammi un arpeggio di a minore 7", { root: "A", chord: "m7", shape: "arpeggio" }],
    ["esercizio cromatico tasto 1", { shape: "chromatic", position: 1 }],
    ["d dorico su una corda quarti", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
    ["f diesis pentatonica minore terzine tasto 2", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
    ["crea un esercizio di b bemolle pentatonica maggiore", { root: "Bb", scale: "majorPentatonic" }],
    ["fai un esercizio di e minore pentatonica semicrome tasto 12", { root: "E", scale: "minorPentatonic", subdivision: 4, position: 12 }],
    ["fammi una scatola di a minore pentatonica in crome", { root: "A", scale: "minorPentatonic", shape: "box", subdivision: 2 }],
    ["a minore pentatonica 2 battute", { root: "A", scale: "minorPentatonic", bars: 2 }],
    ["a minore pentatonica crome 5º tasto", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
  ],
  keyless: [
    ["fai un esercizio di crome e minore pentatonica", { scale: "minorPentatonic", subdivision: 2 }],
    ["fai un esercizio di tre note per corda e blues", { scale: "blues", shape: "threePerString" }],
  ],
  none: [
    "cos'è a minore pentatonica?",
    "a minore pentatonica",
    "a minore pentatonica box",
    "a minore pentatonica tasto 5",
    "fai un esercizio di la minore pentatonica",
    "fai un esercizio di la minore",
    "fammi un esercizio di mi minore crome",
    "fai do maggiore crome",
    "fai un arpeggio di re minore",
    "fai a minore pentatonica crome tasto 17",
    "a minore pentatonica 9 battute",
    "voglio un esercizio di a minore pentatonica",
    "fai un esercizio di pentatonica minore",
    "fai una scala pentatonica minore di a crome",
  ],
  yours: ["registra a minore pentatonica crome tasto 5", "cancella il mio esercizio a minore pentatonica crome"],
};
