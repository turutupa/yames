/**
 * Typed recipe lines, Spanish (leg t2d). Hand-written. Notes are read as letters (A to G):
 * fixed-do names (do re mi fa sol la si) stay out, so a line that names "la menor" is not read.
 * "a" is also the preposition; the table has no article rule, because a bare "a" before a scale
 * word ("a menor") is how a chord chart writes A minor, and a preposition there is not natural.
 */
import type { RecipeCases } from "./types";

export const CASES: RecipeCases = {
  language: "es",
  lines: [
    ["a menor pentatónica corcheas traste 5", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["hazme un ejercicio de e blues", { root: "E", scale: "blues" }],
    ["haz c mayor tres por cuerda en el traste 8", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
    ["haz un arpegio de g mayor 2 compases", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["hazme un arpegio de a menor 7", { root: "A", chord: "m7", shape: "arpeggio" }],
    ["ejercicio cromático en el traste 1", { shape: "chromatic", position: 1 }],
    ["d dórico en una cuerda negras", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
    ["f sostenido pentatónica menor tresillos traste 2", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
    ["crea un ejercicio de b bemol pentatónica mayor", { root: "Bb", scale: "majorPentatonic" }],
    ["e menor pentatónica semicorcheas traste 12", { root: "E", scale: "minorPentatonic", subdivision: 4, position: 12 }],
    ["hazme una caja de a menor pentatónica en corcheas", { root: "A", scale: "minorPentatonic", shape: "box", subdivision: 2 }],
    ["a menor pentatónica 2 compases", { root: "A", scale: "minorPentatonic", bars: 2 }],
    ["a menor pentatónica corcheas 5º traste", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
  ],
  none: [
    "¿qué es a menor pentatónica?",
    "a menor pentatónica",
    "a menor pentatónica caja",
    "a menor pentatónica en el traste 5",
    "haz un ejercicio de la menor pentatónica",
    "haz un ejercicio de la menor",
    "hazme un ejercicio de mi menor corcheas",
    "haz sol mayor corcheas",
    "haz un arpegio de re menor",
    "haz a menor pentatónica corcheas traste 17",
    "a menor pentatónica 9 compases",
    "quiero un ejercicio de a menor pentatónica",
    "haz un ejercicio de pentatónica menor",
    "haz un ejercicio a mayor velocidad",
    "haz un ejercicio a menor velocidad corcheas",
    "haz una escala pentatónica menor de a corcheas",
    // "a menor / mayor escala" is "on a smaller / larger scale", never A minor (review t2d, H1).
    "hazme un ejercicio a menor escala",
    "haz un ejercicio a mayor escala",
    "hazme un ejercicio a gran escala",
    "haz corcheas a mayor escala",
    "hazme un ejercicio de corcheas a menor escala",
    // "a" as the preposition before a recipe word (leg t2dc): each falls through.
    "hazme un ejercicio a menor tempo",
    "haz un ejercicio de corcheas a mayor ritmo",
    "hazme un arpegio a 7 compases",
    "haz un ejercicio en corcheas a 4 compases",
    "haz un ejercicio a 90 corcheas",
  ],
  yours: ["graba a menor pentatónica corcheas traste 5", "borra mi ejercicio a menor pentatónica corcheas"],
};
