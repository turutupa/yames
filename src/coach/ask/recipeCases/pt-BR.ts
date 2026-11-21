/**
 * Typed recipe lines, Brazilian Portuguese (leg t2d). Hand-written. Notes are read as letters (A to G):
 * fixed-do names (do re mi fa sol la si) stay out, so "lá menor" is not read. "a" (the article) and
 * "e" ("and") are also letters: each is a root only after em / do (not "de": "de a" is also "da"); otherwise the line has no key
 * and the tool asks ("faça a pentatônica" is never A minor pentatonic).
 */
import type { RecipeCases } from "./types";

export const CASES: RecipeCases = {
  language: "pt-BR",
  lines: [
    ["faça c maior três por corda na casa 8", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
    ["faça um arpejo de g maior 2 compassos", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["exercício cromático casa 1", { shape: "chromatic", position: 1 }],
    ["d dórico em uma corda semínimas", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
    ["f sustenido pentatônica menor tercinas casa 2", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
    ["crie um exercício de b bemol pentatônica maior", { root: "Bb", scale: "majorPentatonic" }],
    ["monte um exercício em e menor pentatônica semicolcheias casa 12", { root: "E", scale: "minorPentatonic", subdivision: 4, position: 12 }],
    ["faça uma caixa de d menor pentatônica em colcheias", { root: "D", scale: "minorPentatonic", shape: "box", subdivision: 2 }],
    ["g maior pentatônica 2 compassos", { root: "G", scale: "majorPentatonic", bars: 2 }],
    ["g maior pentatônica colcheias 5ª casa", { root: "G", scale: "majorPentatonic", subdivision: 2, position: 5 }],
  ],
  keyless: [
    ["faça a pentatônica", { scale: "minorPentatonic" }],
    ["faça a pentatônica menor", { scale: "minorPentatonic" }],
    ["faça um exercício de tercinas e blues", { scale: "blues", subdivision: 3 }],
    ["a pentatônica colcheias", { scale: "minorPentatonic", subdivision: 2 }],
    // Leg t2d, second read: "de a" is also "da" typed apart ("de a pentatônica" = of the pentatonic), so
    // "de" is not a word after which "a" is surely the note: these ask which key rather than guess A.
    ["faça um exercício de a menor pentatônica colcheias casa 5", { scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["faça um arpejo de a menor 7", { chord: "m7", shape: "arpeggio" }],
    ["faça um exercício de a pentatônica", { scale: "minorPentatonic" }],
  ],
  none: [
    "o que é a menor pentatônica?",
    "a menor pentatônica",
    "a menor pentatônica caixa",
    "a menor pentatônica casa 5",
    "faça um exercício de lá menor pentatônica",
    "faça um exercício de mi menor",
    "faça sol maior colcheias",
    "faça um arpejo de ré menor",
    "faça um exercício de a menor pentatônica colcheias casa 17",
    "faça um exercício de a menor pentatônica 9 compassos",
    "quero um exercício de a menor pentatônica",
    "faça um exercício de pentatônica menor",
    "faça uma escala pentatônica menor de a colcheias",
    "faça um exercício a menor velocidade colcheias",
  ],
  yours: ["grave a pentatônica colcheias casa 5", "apague meu exercício de a menor pentatônica colcheias"],
};
