import type { RecipeCases } from "./types";

/**
 * Dutch: "b" is B natural (as in English), "bes" is B flat; "fis", "cis", "gis", "dis", "ais", "ges", "es",
 * "as" are the other names. No article is a letter a to g, so no `article` group.
 */
export const CASES: RecipeCases = {
  language: "nl",
  lines: [
    ["maak een a mineur pentatoniek achtsten op fret 5", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["maak een c majeur arpeggio 2 maten", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["maak e mineur pentatoniek drie noten per snaar", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["maak een g majeur box oefening", { root: "G", scale: "major", shape: "box" }],
    ["maak een chromatische oefening", { shape: "chromatic" }],
    ["maak fis mineur pentatoniek zestiende noten", { root: "F#", scale: "minorPentatonic", subdivision: 4 }],
    ["maak bes majeur achtsten", { root: "Bb", scale: "major", subdivision: 2 }],
    ["maak b mineur pentatoniek achtsten", { root: "B", scale: "minorPentatonic", subdivision: 2 }],
    ["a mineur pentatoniek achtsten vanaf fret 5", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["maak d dorisch 4 maten", { root: "D", scale: "dorian", bars: 4 }],
    ["maak a mineur 7 arpeggio", { root: "A", chord: "m7", shape: "arpeggio" }],
    ["maak een a mineur achtste triolen op de 7e fret", { root: "A", scale: "naturalMinor", subdivision: 3, position: 7 }],
    ["maak cis mineur pentatoniek achtsten", { root: "C#", scale: "minorPentatonic", subdivision: 2 }],
    ["maak as majeur kwartnoten", { root: "Ab", scale: "major", subdivision: 1 }],
    ["maak een es majeur achtsten", { root: "Eb", scale: "major", subdivision: 2 }],
  ],
  none: [
    "wat is a mineur pentatoniek",
    "a mineur pentatoniek",
    "toon me a mineur pentatoniek",
    "a mineur pentatoniek box op fret 5",
    "maak c majeur achtsten op fret 20",
    "maak a mineur pentatoniek 12 maten",
    "maak een pentatoniek achtsten",
    // "es" and "as" as ordinary words (ash, axis), and a tempo (review t2d, Q6).
    "maak een oefening op de as",
    "maak een achtsten oefening voor es",
    "maak een a mineur pentatoniek oefening op 90",
    "maak een a mineur pentatoniek oefening op 90 bpm",
    // "a mol" may be a German-style "a-moll" (A minor) as easily as A flat: "mol" is not read (review t2d, L3).
    "maak een a mol pentatoniek oefening",
    "maak een e mol majeur oefening",
    // Leg t2dc, a sonnet writer's lines: a bar's place, a tempo.
    "maak a mineur achtsten vanaf maat 4",
    "maak a mineur achtsten in de 4e maat",
    "maak a mineur achtsten op tempo 90",
    "maak a mineur achtsten met 90 slagen per minuut",
  ],
  yours: ["maak een a mineur pentatoniek achtsten opname"],
};
