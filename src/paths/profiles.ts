/**
 * Grading profiles: named sets of what is graded and how high the bar is.
 *
 * The bars are design values. Clean is the mock's "85% even for 4 bars" from
 * `yames-concept/mocks/README.md`, question 1, and nothing here has been tried
 * on a real guitar. Expect to move them when it has; move them here, regenerate
 * and every Exercise follows.
 */
import type { FeedbackTiming, GradingMode, PassBar } from "./format";
import type { GradeProfile } from "./spec";

export type GradingProfile = {
  mode: GradingMode;
  graded: string[];
  passBars: PassBar[];
  feedback: FeedbackTiming;
  example?: boolean;
};

const evenness = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });
const identity = (min: number, overBars = 4): PassBar => ({ metric: "noteIdentity", min, overBars });

export const GRADING_PROFILES: Readonly<Record<GradeProfile, GradingProfile>> = {
  timing: {
    mode: "graded",
    graded: ["timingEvenness", "notesHeard", "extraNotes", "cleanTempo"],
    passBars: [evenness(0.85), heard(0.95), extras(2)],
    feedback: "livePerNote",
  },
  timingNotes: {
    mode: "graded",
    graded: ["timingEvenness", "notesHeard", "extraNotes", "cleanTempo", "noteIdentity"],
    passBars: [evenness(0.85), heard(0.95), extras(2), identity(0.9)],
    feedback: "afterTake",
  },
  accents: {
    mode: "graded",
    graded: ["timingEvenness", "notesHeard", "extraNotes", "accentPlacement"],
    passBars: [
      evenness(0.8),
      heard(0.9),
      extras(3),
      { metric: "accentPlacement", min: 0.7, overBars: 4 },
    ],
    feedback: "afterTake",
  },
  sweep: {
    mode: "graded",
    graded: ["noteIdentity", "notesHeard", "extraNotes", "timingEvenness"],
    passBars: [identity(0.85), heard(0.85), evenness(0.75), extras(4)],
    feedback: "afterTake",
  },
  stamina: {
    mode: "graded",
    graded: ["timingEvenness", "notesHeard", "evennessHold", "extraNotes"],
    passBars: [
      evenness(0.8, 16),
      heard(0.9, 16),
      { metric: "evennessHold", min: 0.75, overBars: 4 },
    ],
    feedback: "afterTake",
  },
  written: {
    mode: "graded",
    graded: ["noteIdentity", "notesHeard", "extraNotes"],
    passBars: [identity(0.9), heard(0.9), extras(4)],
    feedback: "afterTake",
  },
  attacksOnly: {
    mode: "graded",
    graded: ["notesHeard", "extraNotes"],
    passBars: [heard(0.9), extras(4)],
    feedback: "afterTake",
  },
  writtenRhythm: {
    mode: "graded",
    graded: ["notesHeard", "scaleMembership"],
    passBars: [heard(0.85), { metric: "scaleMembership", min: 0.85, overBars: 4 }],
    feedback: "afterTake",
    example: true,
  },
  inScale: {
    mode: "graded",
    graded: ["scaleMembership"],
    passBars: [{ metric: "scaleMembership", min: 0.9, overBars: 4 }],
    feedback: "afterTake",
    example: true,
  },
  rests: {
    mode: "graded",
    graded: ["restsKept", "scaleMembership"],
    passBars: [
      { metric: "restsKept", min: 0.9, overBars: 4 },
      { metric: "scaleMembership", min: 0.85, overBars: 4 },
    ],
    feedback: "afterTake",
    example: true,
  },
  landing: {
    mode: "landings",
    graded: ["landingChordTone"],
    passBars: [{ metric: "landingChordTone", min: 0.75, overBars: 4 }],
    feedback: "afterTake",
    example: true,
  },
  warmup: {
    mode: "graded",
    graded: ["timingEvenness", "notesHeard"],
    passBars: [evenness(0.7), heard(0.8)],
    feedback: "afterTake",
  },
  selfChecked: {
    mode: "selfChecked",
    graded: [],
    passBars: [],
    feedback: "none",
  },
  practiceOnly: {
    mode: "practiceOnly",
    graded: [],
    passBars: [],
    feedback: "none",
    example: true,
  },
};
