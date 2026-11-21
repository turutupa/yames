import type { RecipeCases } from "./types";

// Note letters as a Taiwanese guitarist types them (A小調五聲). The native names
// (甲, 乙, 降B…) stay out: such lines fall through.
export const CASES: RecipeCases = {
  language: "zh-TW",
  lines: [
    ["做個A小調五聲音階 八分音符 5品", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["做個A小調五聲音階的八分音符練習 第5品", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["生成C大調琶音 2小節", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["做個E小調五聲 每弦三音", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["生成G大調五聲 box", { root: "G", scale: "majorPentatonic", shape: "box" }],
    ["生成半音階 十六分音符", { shape: "chromatic", subdivision: 4 }],
    ["做個F#小調五聲 八分音符", { root: "F#", scale: "minorPentatonic", subdivision: 2 }],
    ["A小調五聲音階 八分音符 第5品", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["做個Bb大調五聲 4小節", { root: "Bb", scale: "majorPentatonic", bars: 4 }],
    ["生成D小七琶音 第12品", { root: "D", chord: "m7", shape: "arpeggio", position: 12 }],
    ["做個A藍調 三連音 7品", { root: "A", scale: "blues", subdivision: 3, position: 7 }],
    ["生成C大調琶音 7品", { root: "C", chord: "maj", shape: "arpeggio", position: 7 }],
    ["生成C大調琶音 7小節", { root: "C", chord: "maj", shape: "arpeggio", bars: 7 }],
  ],
  none: [
    "A小調五聲音階是什麼",
    "A小調五聲音階",
    "A小調五聲音階 box",
    "A小調五聲音階 5品",
    "做個甲小調五聲音階",
    "做個降B大調五聲音階",
    "做個A小調五聲音階 16品",
    "做個A小調五聲音階 9小節",
    "做個五聲音階練習",
    "開始 A小調五聲音階 八分音符",
    "播放 A小調五聲音階 八分音符",
    "顯示 A小調五聲音階 八分音符",
    "怎麼做個A小調五聲音階 八分音符",
    "不要做個A小調五聲音階 八分音符",
  ],
  yours: ["做個A小調五聲音階 八分音符 錄音"],
};
