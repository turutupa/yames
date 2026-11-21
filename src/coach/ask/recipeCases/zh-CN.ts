import type { RecipeCases } from "./types";

// Note letters as a Chinese guitarist types them (A小调五声). The native names
// (甲, 乙, 降B…) stay out: such lines fall through.
export const CASES: RecipeCases = {
  language: "zh-CN",
  lines: [
    ["做个A小调五声音阶 八分音符 5品", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["做个A小调五声音阶的八分音符练习 第5品", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["生成C大调琶音 2小节", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["做个E小调五声 每弦三音", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["生成G大调五声 box", { root: "G", scale: "majorPentatonic", shape: "box" }],
    ["生成半音阶 十六分音符", { shape: "chromatic", subdivision: 4 }],
    ["做个F#小调五声 八分音符", { root: "F#", scale: "minorPentatonic", subdivision: 2 }],
    ["A小调五声音阶 八分音符 第5品", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["做个Bb大调五声 4小节", { root: "Bb", scale: "majorPentatonic", bars: 4 }],
    ["生成D小七琶音 第12品", { root: "D", chord: "m7", shape: "arpeggio", position: 12 }],
    ["做个A布鲁斯 三连音 7品", { root: "A", scale: "blues", subdivision: 3, position: 7 }],
    ["生成C大调琶音 7品", { root: "C", chord: "maj", shape: "arpeggio", position: 7 }],
    ["生成C大调琶音 7小节", { root: "C", chord: "maj", shape: "arpeggio", bars: 7 }],
  ],
  none: [
    "A小调五声音阶是什么",
    "A小调五声音阶",
    "A小调五声音阶 box",
    "A小调五声音阶 5品",
    "做个甲小调五声音阶",
    "做个降B大调五声音阶",
    "做个A小调五声音阶 16品",
    "做个A小调五声音阶 9小节",
    "做个五声音阶练习",
    "开始 A小调五声音阶 八分音符",
    "播放 A小调五声音阶 八分音符",
    "显示 A小调五声音阶 八分音符",
    "怎么做个A小调五声音阶 八分音符",
    "不要做个A小调五声音阶 八分音符",
  ],
  yours: ["做个A小调五声音阶 八分音符 录音"],
};
