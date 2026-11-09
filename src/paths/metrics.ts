/**
 * What may be graded, what is not, and what is hard to hear.
 *
 * Three controlled lists, and the validator holds every Exercise to them. The
 * evidence for each entry is `yames-concept/audit/CONVERSION_AUDIT.md` §3 and
 * the code it cites. **Nothing here has met a real guitar**: the audit found
 * no real guitar audio in the repository, so every threshold below is a design
 * value waiting for that test, and no text may call it proven.
 */

export type MetricStatus =
  /** The number is already in `ScheduleReport`. */
  | "in-report"
  /** The maths exists in `pitch.rs` or `srs.rs`; nothing feeds it from an Exercise. */
  | "exists-unwired"
  /** Small, specified, not built. */
  | "new-grader";

export type Metric = {
  id: string;
  label: string;
  unit: "ratio" | "perFourBars" | "bpm";
  /** Where the number comes from. */
  source: string;
  status: MetricStatus;
  /** What a player must not read into it. */
  caveat: string;
};

export const METRICS: readonly Metric[] = [
  {
    id: "timingEvenness",
    label: "Timing evenness",
    unit: "ratio",
    source: "ScheduleReport.interval_consistency (score.rs)",
    status: "in-report",
    caveat:
      "Survives a constant input delay until alignment breaks (audit §3). 0.85 means a spread of about 14 ms at sixteenths, 120 BPM.",
  },
  {
    id: "notesHeard",
    label: "Notes heard (missed notes)",
    unit: "ratio",
    source: "ScheduleReport.hit_completeness (score.rs)",
    status: "in-report",
    caveat:
      "A soft hammer-on or pull-off that is not heard costs nothing. The `score` number ignores this on guitar, so a pass bar must use this field.",
  },
  {
    id: "extraNotes",
    label: "Extra notes",
    unit: "perFourBars",
    source: "ScheduleReport.extras (score.rs)",
    status: "in-report",
    caveat: "Open-string noise and ghosts of the detector count here too, so the bar is forgiving.",
  },
  {
    id: "cleanTempo",
    label: "Clean tempo",
    unit: "bpm",
    source: "Highest rung with evenness and notes heard over their bars; srs.rs update_ceiling",
    status: "exists-unwired",
    caveat: "The arithmetic exists and nothing calls it yet. It is a result, never a promise.",
  },
  {
    id: "accentPlacement",
    label: "Accent placement (rough)",
    unit: "ratio",
    source: "ScheduleReport.accent_agreement (score.rs)",
    status: "in-report",
    caveat: "Rough: louder than the neighbours or not. Reported, not yet priced in the score (LP C3).",
  },
  {
    id: "noteIdentity",
    label: "Right notes (single notes)",
    unit: "ratio",
    source: "pitch.rs NoteVerdict over a take's dry stem",
    status: "exists-unwired",
    caveat:
      "After the take only, under the take opt-in. Single notes only: chords are NotAssessed. No fixture has a band bleeding in.",
  },
  {
    id: "landingChordTone",
    label: "Landings on the asked-for notes",
    unit: "ratio",
    source: "New: pitch of the onset nearest each landing moment, against the chord (audit §4)",
    status: "new-grader",
    caveat: "Only the landing moments are judged. The notes in between are the player's own business.",
  },
  {
    id: "scaleMembership",
    label: "Notes inside the scale",
    unit: "ratio",
    source: "New: share of pitch.rs notes inside the declared scale",
    status: "new-grader",
    caveat: "Says a note was in the scale, not that it was a good choice.",
  },
  {
    id: "restsKept",
    label: "Rests kept",
    unit: "ratio",
    source: "New: share of the written rest windows with no onset in them",
    status: "new-grader",
    caveat: "On a microphone the band's own sound can land in the rest; direct input is the honest case.",
  },
  {
    id: "evennessHold",
    label: "Evenness held to the end",
    unit: "ratio",
    source: "New: interval consistency over the last quarter of the take, from OnsetResult",
    status: "new-grader",
    caveat: "Long unbroken playing is where the onset noise floor may close (audit §3 hazard 1).",
  },
];

export const METRIC_IDS: readonly string[] = METRICS.map((m) => m.id);

/** Numbers in the report a pass bar must not use, and why. */
export const FORBIDDEN_METRICS: Readonly<Record<string, string>> = {
  score: "`score` ignores missed notes on guitar: hc and oe weigh 0 (audit §3 defect 1).",
  gridAlignment:
    "The known-score path has no latency calibration, so a real rig reads as late (audit §3 defect 2).",
};

/** What is said out loud as not graded. */
export const NOT_GRADED: Readonly<Record<string, string>> = {
  pickDirection: "Pick direction: the app has only sound, and a downstroke and an upstroke can sound alike.",
  muting: "Muting: the app does not separate a muted string from a loud neighbour.",
  posture: "Posture: the app has no picture of you.",
  tension: "Tension: only you can feel it, and it comes before it can be heard.",
  handAttribution: "Which hand caused a problem: a late note sounds the same from either hand.",
  fingering: "Which finger played the note: the same pitch sounds the same.",
  tone: "Tone and touch: not measured.",
  feel: "Feel and whether it sounds good: not measured or claimed (D0.9).",
  bendPitch: "How far a bend travelled: bends are not measured today.",
  vibrato: "Vibrato width and speed: not measured today.",
  noteChoice: "Whether the notes between landings were good choices.",
  notesWritten: "Which notes you played: this Exercise times your notes and does not check their pitch.",
};

/** Asked of every Exercise, because every Exercise teaches some of them. */
export const ALWAYS_NOT_GRADED: readonly string[] = [
  "pickDirection",
  "muting",
  "posture",
  "tension",
  "handAttribution",
];

/** What makes an Exercise hard to hear, and the sentence that says so. */
export const DETECTION_FLAGS: Readonly<Record<string, string>> = {
  fastSweep:
    "Swept notes have soft attacks and can ring into each other. Detection of them is unproven, so only slow rungs are graded and the fast ones are self-checked.",
  ringingNotes:
    "Notes that ring together are hard to separate: the note checks may give up, and the app says so rather than guessing.",
  softLegato:
    "Hammer-ons, pull-offs and slides may be too quiet to detect. An unheard hammer-on or pull-off costs nothing. An unheard slid-to note still counts as missed today, so the bar here allows for it.",
  bandBleed:
    "With a microphone and speakers the band reaches the same input as you. Direct input or headphones are the honest way to grade this; without them it is untested.",
  fastPicking:
    "At this speed a real rig's input delay can push notes out of their matching window, which reads as late or missed. Evenness is the number to trust here, and only once the delay is calibrated.",
  sustainedPlaying:
    "Long unbroken playing, especially high-gain, is where the onset noise floor may close and stop hearing you. Unproven either way; if the app says it did not catch enough, believe that before you doubt your hands.",
  bendPitch: "A bend is one attack. The app can time it; it does not measure how far it travelled.",
  roughAccents:
    "Accents are measured roughly, as louder than the notes either side. Compression and high gain flatten them.",
};

/**
 * The fastest grid each kind of playing may be graded at, as a gap between
 * onsets. These are policy, from synthetic tests only, and `validate.ts`
 * refuses a `graded` rung tighter than them.
 *
 * - Picked single notes: 75 ms is sixteenths at 200 BPM, the fastest the audit
 *   ran through the shipped detector, on synthetic plucks.
 * - Swept notes: 150 ms is sixteenths at 100 BPM or eighth triplets at 133. No
 *   test covers sweeps at all; this is deliberately the slow end of what the
 *   detector has been shown to separate, because a sweep's attack is softer
 *   and its notes ring on adjacent strings.
 */
export const GRADED_MIN_GAP_MS = { picked: 75, swept: 150 } as const;

/** At or under this gap, the `fastPicking` flag is required. */
export const FAST_PICKING_GAP_MS = 150;

/** At or over this length of continuous playing, `sustainedPlaying` is required. */
export const SUSTAINED_PLAYING_SECONDS = 30;
