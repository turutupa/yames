/**
 * Jam — what to play over the chord you are on.
 *
 * Scales as interval sets, and a deterministic ranking of which of them fit a
 * given chord in a given key. Three suggestions at most, best first, because
 * a player reading this mid-chorus has room for one glance, not a lesson.
 *
 * The ranking is a table, not a model, and every rule in it is commented with
 * the musical reason. Where two answers are both right (dorian or natural
 * minor over a minor tonic, say) the order is decided by what the *other*
 * chords of the key's own forms need — the progressions in `harmony.ts` are
 * the context, so they get a vote.
 */

import type { Chord, Key, PitchClass } from "./harmony";
import { pitchClass } from "./harmony";

// ---------------------------------------------------------------------------
// The scales
// ---------------------------------------------------------------------------

export type ScaleId =
  | "major"
  | "naturalMinor"
  | "dorian"
  | "mixolydian"
  | "minorPentatonic"
  | "majorPentatonic"
  | "blues"
  | "harmonicMinor"
  | "altered";

export type ScaleDefinition = {
  id: ScaleId;
  /** Semitones above the root, ascending, root first. */
  intervals: readonly number[];
  /** i18n key for the UI. The UI owns the translations; this module owns the key. */
  labelKey: string;
};

export const SCALES: Record<ScaleId, ScaleDefinition> = {
  major: { id: "major", intervals: [0, 2, 4, 5, 7, 9, 11], labelKey: "scale.major" },
  naturalMinor: {
    id: "naturalMinor",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    labelKey: "scale.naturalMinor",
  },
  dorian: { id: "dorian", intervals: [0, 2, 3, 5, 7, 9, 10], labelKey: "scale.dorian" },
  mixolydian: { id: "mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10], labelKey: "scale.mixolydian" },
  minorPentatonic: {
    id: "minorPentatonic",
    intervals: [0, 3, 5, 7, 10],
    labelKey: "scale.minorPentatonic",
  },
  majorPentatonic: {
    id: "majorPentatonic",
    intervals: [0, 2, 4, 7, 9],
    labelKey: "scale.majorPentatonic",
  },
  // The minor pentatonic with the flat fifth wedged in between the fourth
  // and the fifth — the blue note.
  blues: { id: "blues", intervals: [0, 3, 5, 6, 7, 10], labelKey: "scale.blues" },
  harmonicMinor: {
    id: "harmonicMinor",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    labelKey: "scale.harmonicMinor",
  },
  // Every note that is not the root, third or seventh of the dominant is
  // altered. Its fifth mode of melodic minor identity is not needed here.
  altered: { id: "altered", intervals: [0, 1, 3, 4, 6, 8, 10], labelKey: "scale.altered" },
};

export const SCALE_IDS: readonly ScaleId[] = Object.keys(SCALES) as ScaleId[];

/**
 * Plain-English names, so a screen can render a suggestion before the fifteen
 * locales carry `labelKey`. The UI should prefer `labelKey` through i18n.
 */
export const SCALE_NAMES_EN: Record<ScaleId, string> = {
  major: "Major",
  naturalMinor: "Natural minor",
  dorian: "Dorian",
  mixolydian: "Mixolydian",
  minorPentatonic: "Minor pentatonic",
  majorPentatonic: "Major pentatonic",
  blues: "Blues",
  harmonicMinor: "Harmonic minor",
  altered: "Altered",
};

/** The pitch classes of a scale, ascending from its root. */
export function scaleNotes(root: PitchClass, scale: ScaleId): PitchClass[] {
  return SCALES[scale].intervals.map((interval) => pitchClass(root + interval));
}

// ---------------------------------------------------------------------------
// Which scale over which chord
// ---------------------------------------------------------------------------

export type ScaleSuggestion = {
  scale: ScaleId;
  /** The root the scale is played from — not always the chord root. */
  root: PitchClass;
  /** i18n key for the scale's name. */
  labelKey: string;
  /** The notes, ascending from `root`. */
  pitchClasses: PitchClass[];
};

function suggest(scale: ScaleId, root: PitchClass): ScaleSuggestion {
  return {
    scale,
    root: pitchClass(root),
    labelKey: SCALES[scale].labelKey,
    pitchClasses: scaleNotes(root, scale),
  };
}

function build(entries: Array<[ScaleId, PitchClass]>): ScaleSuggestion[] {
  return entries.slice(0, 3).map(([scale, root]) => suggest(scale, root));
}

/**
 * Up to three scales for a chord, best first.
 *
 * The rules, in the order they are tried:
 *
 * **Dominants** (`7`, `9`)
 * - In a blues key: mixolydian, then the minor pentatonic, then the blues
 *   scale — all from the chord root. This is the one every blues player
 *   already knows: the major-third scale that spells the chord, and the
 *   minor-third ones they bend against it.
 * - The V of a minor key: harmonic minor *from the key root*, which is the
 *   phrygian-dominant sound over that chord and keeps the b6 the rest of the
 *   progression is built on; then altered from the chord root for the players
 *   who want it; then the minor pentatonic of the key.
 * - Anywhere else (V of a major key, and every secondary dominant in rhythm
 *   changes): mixolydian, major pentatonic, blues, from the chord root.
 *
 * **Minor sevenths and minor triads**
 * - The ii of a major key: dorian — the ii-V answer — then the minor
 *   pentatonic.
 * - The tonic of a minor key: natural minor first, because the forms in
 *   `harmony.ts` put a bVI and a V in the same chorus and both want the b6;
 *   then dorian for a modal vamp, then the minor pentatonic.
 * - The tonic of a blues key: minor pentatonic and the blues scale first —
 *   this is a minor blues, and that is the vocabulary — then dorian.
 * - The vi of a major key: natural minor, minor pentatonic, dorian.
 * - Anything else minor: dorian, minor pentatonic, natural minor.
 *
 * **Major, major seventh, sixth**: in a major or blues key, the key's own
 * major scale first — over the IV of a major key that is the honest answer,
 * the chord is in the key and the key's scale fits it. In a minor key a major
 * chord is a borrowed one (the bVI and bVII of the Andalusian cadence), so
 * the scale comes from the chord's own root instead. Then the major
 * pentatonic from the chord root either way.
 *
 * **Half-diminished** (the iiø of a minor key): the key's natural minor,
 * which contains the chord, then the key's harmonic minor for the leading
 * tone the V is about to use.
 *
 * **Diminished sevenths** (the #ivdim7 passing chord of rhythm changes): the
 * harmonic minor a semitone above the chord root, which is the scale that
 * chord is the seventh of. One suggestion; the bar is half a bar long.
 */
export function scalesForChord(chord: Chord, key: Key): ScaleSuggestion[] {
  const root = pitchClass(chord.root);
  /** Where this chord sits in the key, in semitones above the tonic. */
  const degree = pitchClass(root - key.root);
  const isTonic = degree === 0;

  switch (chord.quality) {
    case "7":
    case "9": {
      if (key.mode === "blues") {
        return build([
          ["mixolydian", root],
          ["minorPentatonic", root],
          ["blues", root],
        ]);
      }
      if (key.mode === "minor" && degree === 7) {
        return build([
          ["harmonicMinor", key.root],
          ["altered", root],
          ["minorPentatonic", key.root],
        ]);
      }
      return build([
        ["mixolydian", root],
        ["majorPentatonic", root],
        ["blues", root],
      ]);
    }

    case "m7":
    case "min":
    case "m6": {
      if (chord.quality === "m6") {
        // A minor sixth chord has the natural sixth in it, so dorian, not
        // natural minor.
        return build([
          ["dorian", root],
          ["minorPentatonic", root],
        ]);
      }
      if (key.mode === "major" && degree === 2) {
        return build([
          ["dorian", root],
          ["minorPentatonic", root],
        ]);
      }
      if (key.mode === "major" && degree === 9) {
        return build([
          ["naturalMinor", root],
          ["minorPentatonic", root],
          ["dorian", root],
        ]);
      }
      if (isTonic && key.mode === "minor") {
        return build([
          ["naturalMinor", root],
          ["dorian", root],
          ["minorPentatonic", root],
        ]);
      }
      if (isTonic && key.mode === "blues") {
        return build([
          ["minorPentatonic", root],
          ["blues", root],
          ["dorian", root],
        ]);
      }
      return build([
        ["dorian", root],
        ["minorPentatonic", root],
        ["naturalMinor", root],
      ]);
    }

    case "maj":
    case "maj7":
    case "6": {
      return build([
        ["major", key.mode === "minor" ? root : key.root],
        ["majorPentatonic", root],
      ]);
    }

    case "m7b5": {
      return build([
        ["naturalMinor", key.root],
        ["harmonicMinor", key.root],
      ]);
    }

    case "dim7": {
      return build([["harmonicMinor", pitchClass(root + 1)]]);
    }
  }
}
