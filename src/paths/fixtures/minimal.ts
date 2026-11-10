/**
 * A small correct Path for the validator's tests. Each rule's fixture breaks one
 * thing about this, so a rule that fires here has only one reason to.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, PathSpec } from "../spec";
import { repeat } from "../templates";

const words = {
  purpose: "A purpose long enough to teach something real.",
  howTo: ["Play it evenly."],
  coach: "I can time these notes.",
};

export function exercise(overrides: Partial<ExerciseSpec> & { id: string }): ExerciseSpec {
  return {
    title: overrides.id,
    ...words,
    position: 5,
    rungs: [60, 70, 80],
    grade: "timing",
    minutes: 2,
    ...overrides,
  };
}

const WARM: ExerciseSpec = exercise({
  id: "warm",
  tab: "",
  grade: "warmup",
  vary: {
    values: { key: ["0", "2", "3", "5", "7", "9"] },
    pooled: ["key"],
    build: (p) => {
      const up = Number(p.key);
      const fret = 3 + up;
      return {
        tab: `/8 ${repeat(`5:${fret} 5:${fret + 2} 5:${fret + 3} 5:${fret + 2}`, 1)} ${repeat(`5:${fret + 5} 5:${fret + 7} 5:${fret + 8} 5:${fret + 7}`, 1)}`,
        position: fret,
        shifts: true,
        chords: "A7",
      };
    },
  },
  warmup: { start: 0.6, top: 0.8, reference: "plain.scale", fallback: 60 },
  rungs: [60, 70, 80],
  minutes: 3,
});

/** Everything the validator needs to see, each thing once. */
export const MINIMAL_SPEC: PathSpec = definePath({
  id: "minimal",
  title: "Minimal",
  kind: "mechanics",
  goal: "Be a correct Path for tests.",
  level: "intermediate",
  assumes: "Nothing.",
  orderRationale: "In order of difficulty.",
  gradingLimits: "Unproven on a real guitar.",
  steps: [
    {
      id: "plain",
      title: "Plain",
      goal: "Time.",
      why: "A why long enough to pass as a reason for this Step to exist.",
      howTo: ["Play evenly."],
      payoff: "You hear even notes at last.",
      exercises: [
        exercise({ id: "scale", tab: `/8 ${repeat("5:5 5:8 5:10 5:8", 2)}`, shifts: true, harmony: { scale: ["D", "minorPentatonic"], cover: false } }),
        exercise({ id: "outside", tab: `/8 ${repeat("3:5 2:5", 4)}`, crossing: "outside" }),
        exercise({
          id: "self",
          tab: `/8 ${repeat("3:5 3:7", 4)}`,
          grade: "selfChecked",
          selfCheck: ["Did it feel even?"],
        }),
      ],
    },
    {
      id: "swept",
      title: "Swept",
      goal: "Sweep.",
      why: "Another why long enough to pass as a reason for this Step to exist.",
      howTo: ["Push through."],
      payoff: "You hear an arpeggio at last.",
      exercises: [
        exercise({
          id: "arp",
          pick: "sweep",
          grade: "sweep",
          tab: `/8t ${repeat("3:14 2:13 1:12 1:17h 1:12p 2:13", 2)}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: [60, 70, 80],
          selfCheck: ["Did notes ring?"],
        }),
        exercise({
          id: "arp2",
          pick: "sweep",
          grade: "sweep",
          tab: `/8t ${repeat("3:14 2:13 1:12 1:17h 1:12p 2:13", 2)}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: [60, 70, 80],
          selfCheck: ["Did notes ring?"],
        }),
        exercise({
          id: "chained",
          pick: "sweep",
          grade: "sweep",
          tab: `/8t ${repeat("3:14 2:13 1:12 1:17h 1:12p 2:13", 2)} | ${repeat("3:14 2:13 1:13 1:17h 1:13p 2:13", 2)}`,
          position: 12,
          chords: "Am | F",
          chain: { maxJointFrets: 3 },
          harmony: { chordTones: true },
          rungs: [60, 70, 80],
          selfCheck: ["Did notes ring?"],
        }),
      ],
    },
    {
      id: "band",
      title: "Band",
      goal: "Land.",
      why: "One more why long enough to pass as a reason for this Step to exist.",
      howTo: ["Listen."],
      payoff: "You hear yourself land on the chord.",
      difficultyException: "Notes slow down on purpose: the new demand is choosing them.",
      exercises: [
        exercise({
          id: "landings",
          pick: "free",
          tab: `/1 3:2 | 3:7`,
          position: 2,
          shifts: true,
          chords: "A7 | D7",
          jam: { groove: "bluesTexas", key: "A blues", feel: "shuffle" },
          landings: { at: "bar", accept: "chordTone" },
          grade: "landing",
          rungs: [200, 220, 240],
        }),
        exercise({
          id: "line",
          pick: "free",
          tab: `/4 4:7 3:5 3:7 2:5 | 3:7 3:5 4:7 3:5`,
          position: 5,
          chords: "A7 | D7",
          jam: { groove: "bluesTexas", key: "A blues", feel: "shuffle" },
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          grade: "written",
          rungs: [200, 220, 240],
        }),
        exercise({
          id: "free",
          pick: "free",
          tab: `/8 ${repeat("4:7 3:5 3:7 2:5", 2)}`,
          grade: "practiceOnly",
          rungs: [200, 220, 240],
        }),
      ],
    },
  ],
  levels: [
    { id: "beginner", title: "B", summary: "First.", startHereIf: ["You can play eighths at 60 BPM.", "Your sixteenths are uneven."], steps: ["plain"], warmups: [WARM] },
    { id: "intermediate", title: "I", summary: "Next.", startHereIf: ["You can sweep 3 strings at 80 BPM.", "Your links stop."], steps: ["swept"], warmups: [WARM] },
    { id: "advanced", title: "A", summary: "Last.", startHereIf: ["You can land on 4 chords in a row.", "You get lost in the form."], steps: ["band"], warmups: [WARM] },
  ],
});
