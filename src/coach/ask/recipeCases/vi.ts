import type { RecipeCases } from "./types";

// Vietnamese: root first ("a ngũ cung thứ"), words with diacritics are distinct tokens ("à" is not "a").
// Do-re-mi names (la thứ) are not read.
export const CASES: RecipeCases = {
  language: "vi",
  lines: [
    ["a ngũ cung thứ móc đơn phím 5", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["tạo bài tập g trưởng rải hợp âm 2 ô nhịp", { root: "G", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["tạo c trưởng ba nốt mỗi dây ở phím 8", { root: "C", scale: "major", shape: "threePerString", position: 8 }],
    ["e blues thế hộp phím 12 móc kép", { root: "E", scale: "blues", shape: "box", position: 12, subdivision: 4 }],
    ["tạo bài tập chromatic phím 1", { shape: "chromatic", position: 1 }],
    ["d dorian trên một dây nốt đen", { root: "D", scale: "dorian", shape: "oneString", subdivision: 1 }],
    ["f thăng ngũ cung thứ liên ba phím 2", { root: "F#", scale: "minorPentatonic", subdivision: 3, position: 2 }],
    ["tạo b giáng trưởng rải hợp âm", { root: "Bb", chord: "maj", shape: "arpeggio" }],
    ["tạo bài tập e ngũ cung 4 ô nhịp", { root: "E", scale: "minorPentatonic", bars: 4 }],
    ["tạo a thứ móc đơn", { root: "A", scale: "naturalMinor", subdivision: 2 }],
    ["tạo a thứ 7 rải hợp âm", { root: "A", chord: "m7", shape: "arpeggio" }],
  ],
  none: [
    "a ngũ cung thứ là gì",
    "a ngũ cung thứ",
    "a ngũ cung thứ thế hộp phím 5",
    "tạo bài tập la thứ ngũ cung",
    "tạo a ngũ cung thứ phím 16 móc đơn",
    "tạo a ngũ cung 9 ô nhịp",
    "tạo bài tập ngũ cung thứ móc đơn",
    "tạo bài tập à thứ móc đơn",
    "tạo a ngũ cung thứ vị trí 2 móc đơn",
    "tạo đô thứ rải hợp âm",
    "xem a ngũ cung thứ thế hộp",
    "tạo a ngũ cung thứ móc đơn phím 20",
    "a thứ rải hợp âm là gì",
  ],
  yours: ["tạo a ngũ cung thứ móc đơn ghi âm"],
};
