import type { RecipeCases } from "./types";

// Turkish: verb last ("... oluştur"), suffixes glued to words. Only the forms listed in the table are read;
// "alıştırması", "perdesinden", "A'nın" and the like fall through. Do-re-mi names (la minör) are not read.
export const CASES: RecipeCases = {
  language: "tr",
  lines: [
    ["a minör pentatonik sekizlik 5. perde", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["bana g majör arpej 2 ölçü oluştur", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["c majör gam telde üç nota 8. perdede oluştur", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
    ["e blues kutu 12. perde onaltılık", { root: "E", scale: "blues", shape: "box", position: 12, subdivision: 4 }],
    ["kromatik alıştırma 1. perde", { shape: "chromatic", position: 1 }],
    ["d dorian tek telde dörtlük notalar", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
    ["f diyez minör pentatonik triole 2. perde", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
    ["b bemol majör arpej oluştur", { root: "Bb", chord: "maj", shape: "arpeggio" }],
    ["bana e minör pentatonik alıştırma 4 ölçü oluştur", { root: "E", scale: "minorPentatonic", bars: 4 }],
    ["oluştur a majör gam sekizlik", { root: "A", scale: "major", subdivision: 2 }],
    ["a minör 7 arpej hazırla", { root: "A", chord: "m7", shape: "arpeggio" }],
  ],
  none: [
    "a minör pentatonik nedir",
    "a minör pentatonik",
    "a minör pentatonik kutu 5. perde",
    "la minör pentatonik sekizlik",
    "la minör pentatonik oluştur",
    "a minör pentatonik 16. perde sekizlik",
    "a minör pentatonik 9 ölçü oluştur",
    "minör pentatonik sekizlik oluştur",
    "a minör pentatonik pozisyon 2 sekizlik oluştur",
    "do minör arpej oluştur",
    "a minör pentatonik gamını göster",
    "a minör pentatonik sekizlik 20. perde oluştur",
    "a minör arpej nasıl çalınır",
    // "4." is the fourth bar, not four bars (review t2d, L1).
    "a minör pentatonik sekizlik 4. ölçü oluştur",
  ],
  yours: ["a minör pentatonik sekizlik 5. perde kaydet"],
};
