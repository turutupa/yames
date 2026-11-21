/**
 * Typed recipe lines, French (leg t2d). Hand-written. Notes are read as letters (A to G):
 * fixed-do names (do re mi fa sol la si) stay out ("la" is an article), so "la mineur" is not read.
 * Plain "a" (a typed "à", or "has") has no article rule: a bare "a" before a scale word is a chart's A.
 */
import type { RecipeCases } from "./types";

export const CASES: RecipeCases = {
  language: "fr",
  lines: [
    ["a mineur pentatonique croches case 5", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["fais-moi un exercice en e blues", { root: "E", scale: "blues" }],
    ["fais c majeur trois par corde à la case 8", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
    ["fais un arpège de g majeur 2 mesures", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["fais-moi un arpège de a mineur 7", { root: "A", chord: "m7", shape: "arpeggio" }],
    ["exercice chromatique case 1", { shape: "chromatic", position: 1 }],
    ["d dorien sur une corde noires", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
    ["f dièse pentatonique mineure triolets case 2", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
    ["crée un exercice de b bémol pentatonique majeure", { root: "Bb", scale: "majorPentatonic" }],
    ["e mineur pentatonique doubles croches frette 12", { root: "E", scale: "minorPentatonic", subdivision: 4, position: 12 }],
    ["fais-moi une boîte de a mineur pentatonique en croches", { root: "A", scale: "minorPentatonic", shape: "box", subdivision: 2 }],
    ["a mineur pentatonique 2 mesures", { root: "A", scale: "minorPentatonic", bars: 2 }],
    ["a mineur pentatonique croches 5e case", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
  ],
  none: [
    "qu'est-ce que a mineur pentatonique ?",
    "a mineur pentatonique",
    "a mineur pentatonique boîte",
    "a mineur pentatonique case 5",
    "fais un exercice de la mineur pentatonique",
    "fais un exercice de la mineur",
    "fais-moi un exercice de mi mineur croches",
    "fais do majeur croches",
    "fais un arpège de ré mineur",
    "fais a mineur pentatonique croches case 17",
    "a mineur pentatonique 9 mesures",
    "je veux un exercice de a mineur pentatonique",
    "fais un exercice de pentatonique mineure",
    "fais un exercice à a mineur vitesse croches",
    "fais une gamme pentatonique mineure de a croches",
  ],
  yours: ["enregistre a mineur pentatonique croches case 5", "supprime mon exercice a mineur pentatonique croches"],
};
