import type { RecipeCases } from "./types";

// Note letters as a Korean guitarist types them (A 마이너 펜타토닉). The native names
// (가단조, 다장조) stay out: such lines fall through.
export const CASES: RecipeCases = {
  language: "ko",
  lines: [
    ["A 마이너 펜타토닉 8분음표 5프렛 만들어줘", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["A 마이너 펜타토닉을 8분음표로 5프렛부터 만들어줘", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["C 메이저 아르페지오 2마디 만들어줘", { root: "C", chord: "maj", shape: "arpeggio", bars: 2 }],
    ["E 마이너 펜타토닉 한 줄에 세 음씩 만들어줘", { root: "E", scale: "minorPentatonic", shape: "threePerString" }],
    ["G 메이저 펜타토닉 박스 만들어줘", { root: "G", scale: "majorPentatonic", shape: "box" }],
    ["크로매틱 16분음표 만들어줘", { shape: "chromatic", subdivision: 4 }],
    ["F# 마이너 펜타토닉 8분음표 만들어줘", { root: "F#", scale: "minorPentatonic", subdivision: 2 }],
    ["A 마이너 펜타토닉 8분음표 5프렛", { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 }],
    ["Bb 메이저 펜타토닉 4마디 만들어줘", { root: "Bb", scale: "majorPentatonic", bars: 4 }],
    ["E플랫 메이저 펜타토닉 4마디 만들어줘", { root: "Eb", scale: "majorPentatonic", bars: 4 }],
    ["D 마이너 7 아르페지오 12프렛부터 만들어줘", { root: "D", chord: "m7", shape: "arpeggio", position: 12 }],
    ["A 블루스 셋잇단음표 7프렛 만들어줘", { root: "A", scale: "blues", subdivision: 3, position: 7 }],
  ],
  none: [
    "A 마이너 펜타토닉이 뭐야",
    "A 마이너 펜타토닉",
    "A 마이너 펜타토닉 박스",
    "A 마이너 펜타토닉 5프렛",
    "가단조 펜타토닉 만들어줘",
    "다장조 스케일 만들어줘",
    "A 마이너 펜타토닉 16프렛 만들어줘",
    "A 마이너 펜타토닉 9마디 만들어줘",
    "펜타토닉 과제 만들어줘",
  ],
  yours: ["A 마이너 펜타토닉 녹음 만들어줘"],
};
