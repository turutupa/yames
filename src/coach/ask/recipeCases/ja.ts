import type { RecipeCases } from "./types";

// Note letters as a Japanese guitarist types them (Aマイナーペンタ). The native names
// (イ短調, ハ長調) stay out: such lines fall through.
export const CASES: RecipeCases = {
  language: "ja",
  lines: [
    ["Aマイナーペンタトニック 8分音符 5フレット 作って", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["Aマイナーペンタトニックを8分音符で5フレットから作って", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["Cメジャーアルペジオ 2小節 作って", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["Eマイナーペンタ 3ノートパーストリング 作って", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["Gメジャーペンタ ボックス 作って", { root: "G", scale: "majorPentatonic", shape: "box" }],
    ["クロマチック 16分音符 作って", { shape: "chromatic", subdivision: 4 }],
    ["F#マイナーペンタ 8分音符 作って", { root: "F#", scale: "minorPentatonic", subdivision: 2 }],
    ["Aマイナーペンタトニック 8分音符 5フレット", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["Bbメジャーペンタ 4小節 作って", { root: "Bb", scale: "majorPentatonic", bars: 4 }],
    ["Eフラットメジャーペンタ 4小節 作って", { root: "Eb", scale: "majorPentatonic", bars: 4 }],
    ["Dマイナー7アルペジオ 12フレット 作って", { root: "D", chord: "m7", shape: "arpeggio", position: 12 }],
    ["Aブルース 3連符 7フレット 作って", { root: "A", scale: "blues", subdivision: 3, position: 7 }],
    ["Cメジャースケールの課題 作って", { root: "C", scale: "major" }],
  ],
  none: [
    "Aマイナーペンタって何ですか",
    "Aマイナーペンタトニック",
    "Aマイナーペンタ ボックス",
    "Aマイナーペンタ 5フレット",
    "イ短調のペンタ 作って",
    "ハ長調のスケール 作って",
    "Aマイナーペンタ 16フレット 作って",
    "Aマイナーペンタ 9小節 作って",
    "ペンタ 作って",
  ],
  yours: ["Aマイナーペンタ 録音 作って"],
};
