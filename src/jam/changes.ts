/**
 * The changes — named chord progressions a form can play (2026-09-16).
 *
 * Until now every form had ONE progression per key mode, so an eight-bar loop
 * in a major key was I–V–vi–IV whether the drummer was playing rock, pop or
 * country, and a funk vamp in E minor got the Andalusian cadence. This is the
 * library that replaces "one per form": each entry is a progression players
 * actually call for, written in roman numerals so it works in any key, and
 * tagged with the forms and key modes it fits and the styles it belongs to.
 *
 * ## How a jam picks one
 *
 * - `Jam.changes` names an entry, or is `auto` / absent.
 * - `auto` asks `defaultChangesFor(form, mode, family)`: the first entry for
 *   that form and mode that lists the groove's family, and failing that the
 *   form's classic (`FORM_CLASSICS`), which is exactly what the form played
 *   before this file existed.
 * - A named entry that does not fit the form or the mode (the jam changed key
 *   from major to minor, say) falls back to `auto` rather than playing a
 *   progression written for the other mode.
 * - Typed chords (`Jam.progression`) still win bar by bar, on top of all of it.
 *
 * ## Chord colour lives here too
 *
 * A jazz entry is written in sevenths, a pop entry sprinkles add9s, a rock
 * entry is plain triads. The colour is part of the progression rather than a
 * separate knob, because it is part of what makes a progression sound like
 * the style it belongs to — and everything downstream (the bass, the keys,
 * the chord sheet) already reads the chord's quality.
 *
 * Every entry fills its form: `bars` roman bars exactly, so the length rule of
 * `barsForForm` (repeat from the top) never has to invent anything.
 */
import type { GrooveFamily } from "./grooves";
import type { KeyMode } from "./harmony";
import type { JamFormKind } from "./types";

/** One bar: a chord, or a pair played half a bar each. */
export type ChangesBar = string | [string, string];

export type ChangesEntry = {
  id: string;
  /** The form it fills. */
  form: Exclude<JamFormKind, "custom">;
  /** The key modes it is written for. */
  modes: readonly KeyMode[];
  /** Styles it is the natural choice for, in order of preference. */
  families: readonly GrooveFamily[];
  bars: readonly ChangesBar[];
};

const twice = (bars: ChangesBar[]): ChangesBar[] => [...bars, ...bars];

/**
 * The library. Order matters: for `auto`, the first entry that fits the form,
 * the mode and the family wins.
 */
export const CHANGES: readonly ChangesEntry[] = [
  // ---- Eight-bar loops, major ------------------------------------------------
  {
    // The four chords of a thousand pop songs, with the added ninth a keys
    // player reaches for on the one and the four.
    id: "pop",
    form: "loop8",
    modes: ["major"],
    families: ["pop"],
    bars: twice(["Iadd9", "V", "vi", "IVadd9"]),
  },
  {
    // I–bVII–IV: the Mixolydian rock loop, plain triads.
    id: "rock",
    form: "loop8",
    modes: ["major"],
    families: ["rock", "metal"],
    bars: twice(["I", "bVII", "IV", "I"]),
  },
  {
    // I–IV–I–V, and the V turns the loop round.
    id: "country",
    form: "loop8",
    modes: ["major"],
    families: ["country", "world"],
    bars: ["I", "IV", "I", "V", "I", "IV", ["I", "V"], "I"],
  },
  {
    // I–vi–IV–V, the fifties progression.
    id: "doowop",
    form: "loop8",
    modes: ["major"],
    families: [],
    bars: twice(["I", "vi", "IV", "V"]),
  },
  {
    // Two dominant chords a fourth apart — the soul and funk vamp.
    id: "funkVamp",
    form: "loop8",
    modes: ["major"],
    families: ["funk"],
    bars: twice(["I9", "I9", "IV9", "IV9"]),
  },
  {
    // Four minor-seven-to-dominant moves: the jazz-pop loop.
    id: "jazzLoop",
    form: "loop8",
    modes: ["major"],
    families: ["jazz", "latin"],
    bars: twice(["Imaj7", "vi7", "ii7", "V7"]),
  },
  {
    // The classic, kept by name: what the loop always played.
    id: "axis",
    form: "loop8",
    modes: ["major"],
    families: [],
    bars: twice(["I", "V", "vi", "IV"]),
  },

  // ---- Eight-bar loops, minor ------------------------------------------------
  {
    // i–bVI–bVII–i: the minor rock and metal loop.
    id: "minorRock",
    form: "loop8",
    modes: ["minor"],
    families: ["metal", "rock"],
    bars: twice(["i", "bVI", "bVII", "i"]),
  },
  {
    // i–bVI–bIII–bVII: the natural-minor loop of a great deal of rock and pop.
    id: "aeolian",
    form: "loop8",
    modes: ["minor"],
    families: ["pop", "country"],
    bars: twice(["i", "bVI", "bIII", "bVII"]),
  },
  {
    // Dorian vamp: minor seventh to the major IV, the funk and soul minor.
    id: "dorianVamp",
    form: "loop8",
    modes: ["minor"],
    families: ["funk", "world"],
    bars: twice(["i7", "i7", "IV7", "IV7"]),
  },
  {
    // A minor ii–V–i, twice: the jazz and bossa minor loop.
    id: "minorTwoFive",
    form: "loop8",
    modes: ["minor"],
    families: ["jazz", "latin"],
    bars: twice(["i7", "i7", "iim7b5", "V7"]),
  },
  {
    // The Andalusian cadence — the classic, kept by name.
    id: "andalusian",
    form: "loop8",
    modes: ["minor"],
    families: [],
    bars: twice(["i", "bVII", "bVI", "V"]),
  },

  // ---- Eight-bar loops, blues ------------------------------------------------
  {
    id: "bluesVamp",
    form: "loop8",
    modes: ["blues"],
    families: [],
    bars: ["I7", "IV7", "I7", "IV7", "I7", "IV7", "I7", "IV7"],
  },
  {
    // One chord for six bars and a turnaround: the boogie vamp.
    id: "boogieVamp",
    form: "loop8",
    modes: ["blues"],
    families: ["rock", "country", "blues"],
    bars: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "V7"],
  },

  // ---- Twelve-bar blues -------------------------------------------------------
  {
    // The quick change: IV in bar two, back to I in bar three.
    id: "quickChange",
    form: "blues12",
    modes: ["major", "blues"],
    // Not the blues family's default: the slow change is the twelve-bar a
    // blues player assumes unless somebody calls the quick one.
    families: ["rock", "country"],
    bars: ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
  },
  {
    // The jazz blues: a ii–V into IV, the #IVdim, and a turnaround.
    id: "jazzBlues",
    form: "blues12",
    modes: ["major", "blues"],
    families: ["jazz", "funk", "latin"],
    bars: [
      "I7",
      "IV7",
      "I7",
      ["v7", "I7"],
      "IV7",
      "#ivdim7",
      "I7",
      "VI7",
      "ii7",
      "V7",
      ["I7", "VI7"],
      ["ii7", "V7"],
    ],
  },
  {
    // The slow change — the classic, kept by name.
    id: "blues",
    form: "blues12",
    modes: ["major", "blues"],
    families: [],
    bars: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
  },
  {
    id: "minorBlues",
    form: "blues12",
    modes: ["minor"],
    families: [],
    bars: ["i7", "i7", "i7", "i7", "iv7", "iv7", "i7", "i7", "bVI7", "V7", "i7", "V7"],
  },

  // ---- Sixteen bars -----------------------------------------------------------
  {
    // Verse and chorus: four bars of the pop loop, then the lift to IV.
    id: "verseChorus",
    form: "bars16",
    modes: ["major"],
    families: ["pop", "rock", "country", "metal"],
    bars: [
      "I", "V", "vi", "IV",
      "I", "V", "vi", "IV",
      "IV", "V", "vi", "vi",
      "IV", "V", "I", "V",
    ],
  },
  {
    // Two turnarounds and two cadences — the classic, kept by name.
    id: "sixteen",
    form: "bars16",
    modes: ["major"],
    families: [],
    bars: ["I", "vi", "ii", "V", "I", "vi", "ii", "V", "IV", "V", "I", "I", "IV", "V", "I", "V"],
  },
  {
    id: "sixteenMinor",
    form: "bars16",
    modes: ["minor"],
    families: [],
    bars: [
      "i", "bVI", "iim7b5", "V7",
      "i", "bVI", "iim7b5", "V7",
      "iv", "V7", "i", "i",
      "iv", "V7", "i", "V7",
    ],
  },
  {
    // Minor verse and a relative-major chorus.
    id: "minorVerseChorus",
    form: "bars16",
    modes: ["minor"],
    families: ["pop", "rock", "metal", "latin"],
    bars: [
      "i", "bVI", "bIII", "bVII",
      "i", "bVI", "bIII", "bVII",
      "bVI", "bVII", "bIII", "bIII",
      "bVI", "bVII", "i", "V",
    ],
  },
  {
    id: "sixteenBlues",
    form: "bars16",
    modes: ["blues"],
    families: [],
    bars: ["I7", "I7", "I7", "I7", "I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
  },

  // ---- One chord --------------------------------------------------------------
  {
    id: "oneChord",
    form: "one",
    modes: ["major", "minor", "blues"],
    families: [],
    bars: ["@tonic", "@tonic", "@tonic", "@tonic"],
  },
];

/**
 * What each form played before this library, per mode. `auto` falls back to
 * these, and `aaba32` has no alternatives yet — rhythm changes is the form.
 */
export const FORM_CLASSICS: Partial<Record<JamFormKind, Partial<Record<KeyMode, string>>>> = {
  loop8: { major: "axis", minor: "andalusian", blues: "bluesVamp" },
  blues12: { major: "blues", blues: "blues", minor: "minorBlues" },
  bars16: { major: "sixteen", minor: "sixteenMinor", blues: "sixteenBlues" },
  one: { major: "oneChord", minor: "oneChord", blues: "oneChord" },
};

export function changesById(id: string | null | undefined): ChangesEntry | undefined {
  return id ? CHANGES.find((c) => c.id === id) : undefined;
}

/** The entries a form and a key mode can play, in library order. */
export function changesFor(form: JamFormKind, mode: KeyMode): ChangesEntry[] {
  return CHANGES.filter((c) => c.form === form && c.modes.includes(mode));
}

/** What `auto` plays: the style's choice, or the form's classic. */
export function defaultChangesFor(
  form: JamFormKind,
  mode: KeyMode,
  family: GrooveFamily | null | undefined,
): ChangesEntry | undefined {
  const options = changesFor(form, mode);
  if (family) {
    const styled = options.find((c) => c.families.includes(family));
    if (styled) return styled;
  }
  return changesById(FORM_CLASSICS[form]?.[mode]);
}

/**
 * The entry a jam plays: the one it names if that one fits this form and
 * mode, otherwise the `auto` choice.
 */
export function resolveChanges(
  requested: string | null | undefined,
  form: JamFormKind,
  mode: KeyMode,
  family: GrooveFamily | null | undefined,
): ChangesEntry | undefined {
  const named = requested && requested !== "auto" ? changesById(requested) : undefined;
  if (named && named.form === form && named.modes.includes(mode)) return named;
  return defaultChangesFor(form, mode, family);
}
