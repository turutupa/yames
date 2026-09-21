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
  | "lydian"
  | "phrygian"
  | "majorBlues"
  | "melodicMinor"
  | "altered"
  // The rest of what a scales card prints (2026-09-19). The seventh mode,
  // the two symmetrical scales, the two dominant modes a player actually
  // reaches for, and the two harmonic-family scales.
  | "locrian"
  | "wholeTone"
  | "diminishedWholeHalf"
  | "diminishedHalfWhole"
  | "phrygianDominant"
  | "lydianDominant"
  | "harmonicMajor"
  | "hungarianMinor"
  // The rest of what the printed posters carry (2026-09-19). The fourth
  // symmetrical scale, the three bebop scales, and the chromatic.
  | "augmentedScale"
  | "bebopDominant"
  | "bebopMajor"
  | "bebopMinor"
  | "chromatic";

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
  /* The three added 2026-09-18, when the owner asked what else is commonly
     used. Each earns its place by being a scale a player in one of the vibes
     this app ships actually reaches for.

     Lydian is the major mode with the raised fourth — the one a guitarist
     goes to over a major chord that is not the tonic, and the only major-key
     colour the list was missing.

     Phrygian is the minor mode with the flat second: flamenco, and every
     metal riff that leans on the semitone above the root. The app ships a
     metal vibe and had nothing to offer it.

     Major blues is the major pentatonic with the flat third wedged in, as
     the blues scale is the minor pentatonic with the flat fifth wedged in.
     It is the country and the major-key blues sound, and its absence left
     "blues" meaning only one of the two things players mean by it.

     Deliberately NOT here: locrian, melodic minor, whole tone and the
     diminished scales. They are real scales that a cheat sheet for a jam is
     the wrong place for — `altered` already answers the one dominant-chord
     case that comes up, and every extra chip is one more to read past. */
  lydian: { id: "lydian", intervals: [0, 2, 4, 6, 7, 9, 11], labelKey: "scale.lydian" },
  phrygian: { id: "phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], labelKey: "scale.phrygian" },
  majorBlues: {
    id: "majorBlues",
    intervals: [0, 2, 3, 4, 7, 9],
    labelKey: "scale.majorBlues",
  },
  /* The minor scale with the sixth and seventh raised — the one a player
     goes to when harmonic minor's gap between the flat sixth and the natural
     seventh is too far to sing. It sits beside harmonic minor on every
     printed cheat sheet, which is where the owner's came from. */
  melodicMinor: {
    id: "melodicMinor",
    intervals: [0, 2, 3, 5, 7, 9, 11],
    labelKey: "scale.melodicMinor",
  },
  // altered. Its fifth mode of melodic minor identity is not needed here.
  altered: { id: "altered", intervals: [0, 1, 3, 4, 6, 8, 10], labelKey: "scale.altered" },
  // The seventh mode. It completes the set — the other six have been here
  // since the beginning and a card that prints six of seven modes is a card
  // with a hole in it.
  locrian: { id: "locrian", intervals: [0, 1, 3, 5, 6, 8, 10], labelKey: "scale.locrian" },
  // Six notes, all a tone apart: the scale with no leading note anywhere in
  // it, which is what makes an augmented chord sound like it is floating.
  wholeTone: { id: "wholeTone", intervals: [0, 2, 4, 6, 8, 10], labelKey: "scale.wholeTone" },
  // Eight notes, alternating. The whole-half is the one for a diminished
  // chord; the half-whole is the one for a dominant with altered notes on it.
  diminishedWholeHalf: {
    id: "diminishedWholeHalf",
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    labelKey: "scale.diminishedWholeHalf",
  },
  diminishedHalfWhole: {
    id: "diminishedHalfWhole",
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    labelKey: "scale.diminishedHalfWhole",
  },
  // The fifth mode of the harmonic minor — the flamenco sound, and the one
  // that fits a 7b9 without any of the altered scale's other business.
  phrygianDominant: {
    id: "phrygianDominant",
    intervals: [0, 1, 4, 5, 7, 8, 10],
    labelKey: "scale.phrygianDominant",
  },
  // The fourth mode of the melodic minor: a dominant seventh with a sharp
  // eleventh, which is the sound of nearly every jazz blues turnaround.
  lydianDominant: {
    id: "lydianDominant",
    intervals: [0, 2, 4, 6, 7, 9, 10],
    labelKey: "scale.lydianDominant",
  },
  harmonicMajor: {
    id: "harmonicMajor",
    intervals: [0, 2, 4, 5, 7, 8, 11],
    labelKey: "scale.harmonicMajor",
  },
  hungarianMinor: {
    id: "hungarianMinor",
    intervals: [0, 2, 3, 6, 7, 8, 11],
    labelKey: "scale.hungarianMinor",
  },
  /*
   * The fourth symmetrical scale. Every scales poster prints four of them —
   * half-whole, whole-half, augmented, whole tone — and this app had three.
   * A minor third and a semitone, over and over: the augmented triad's own
   * scale.
   */
  augmentedScale: {
    id: "augmentedScale",
    intervals: [0, 3, 4, 7, 8, 11],
    labelKey: "scale.augmentedScale",
  },
  /*
   * The bebop scales: a seven-note scale with one passing note added, so
   * that playing it in eighths from the root puts the chord tones on the
   * beats. That is the whole idea, and it is why there are three of them —
   * one for each of the chords a ii-V-I is made of.
   */
  bebopDominant: {
    id: "bebopDominant",
    intervals: [0, 2, 4, 5, 7, 9, 10, 11],
    labelKey: "scale.bebopDominant",
  },
  bebopMajor: {
    id: "bebopMajor",
    intervals: [0, 2, 4, 5, 7, 8, 9, 11],
    labelKey: "scale.bebopMajor",
  },
  bebopMinor: {
    id: "bebopMinor",
    intervals: [0, 2, 3, 4, 5, 7, 9, 10],
    labelKey: "scale.bebopMinor",
  },
  // All twelve. It lights the whole neck, which is exactly what it is: the
  // picture that says every note is available and the choosing is yours.
  chromatic: {
    id: "chromatic",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    labelKey: "scale.chromatic",
  },
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
  melodicMinor: "Melodic minor",
  lydian: "Lydian",
  phrygian: "Phrygian",
  majorBlues: "Major blues",
  altered: "Altered",
  locrian: "Locrian",
  wholeTone: "Whole tone",
  diminishedWholeHalf: "Diminished (whole-half)",
  diminishedHalfWhole: "Diminished (half-whole)",
  phrygianDominant: "Phrygian dominant",
  lydianDominant: "Lydian dominant",
  harmonicMajor: "Harmonic major",
  hungarianMinor: "Hungarian minor",
  augmentedScale: "Augmented",
  bebopDominant: "Bebop dominant",
  bebopMajor: "Bebop major",
  bebopMinor: "Bebop minor",
  chromatic: "Chromatic",
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

/**
 * `limit` is three because the NOW block draws a chord's scales as one line
 * of text under the chord name, and a fourth name wraps it. A KEY's scales
 * are a row of chips you pick from rather than a line to read, so they pass
 * their own number — which is why this is a parameter and not a constant.
 */
function build(entries: Array<[ScaleId, PitchClass]>, limit = 3): ScaleSuggestion[] {
  return entries.slice(0, limit).map(([scale, root]) => suggest(scale, root));
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
/**
 * The scale for a KEY, not for a chord — the box the neck draws and leaves
 * alone (JAM_UX_DECISIONS A8).
 *
 * "The fretboard and the chords are amazing, but they shouldn't keep
 * changing." A scale chosen per chord swaps under your hands every four bars,
 * and the thing a player actually wants on the wall is one box for the tune:
 * minor pentatonic for a blues, natural minor for a minor key, the major
 * scale for a major one. Best first, and the list is short on purpose.
 */
/**
 * The scales a key offers, best first.
 *
 * Longer lists since 2026-09-18. The chord sheet drew only the first of
 * these, so the length did not matter; now they are a row of chips you pick
 * from, and two options for a major key was a row that barely existed. The
 * owner: "what scales did we add? Common scales I think should be there?"
 *
 * The first is always the one to reach for without thinking, and the rest
 * are ordered by how often a player would actually want them — not by
 * theory. Two additions are worth naming: harmonic minor was in this file
 * all along and no KEY ever offered it, and the major pentatonic over a
 * blues is not an oversight but the point — mixing it with the minor
 * pentatonic is the blues guitar sound.
 */
export function scalesForKey(key: Key): ScaleSuggestion[] {
  if (key.mode === "blues") {
    return build([
      ["minorPentatonic", key.root],
      ["blues", key.root],
      ["majorPentatonic", key.root],
      ["majorBlues", key.root],
      ["mixolydian", key.root],
    ], 5);
  }
  if (key.mode === "minor") {
    return build([
      ["minorPentatonic", key.root],
      ["naturalMinor", key.root],
      ["dorian", key.root],
      ["harmonicMinor", key.root],
      ["melodicMinor", key.root],
      ["phrygian", key.root],
    ], 6);
  }
  return build([
    ["majorPentatonic", key.root],
    ["major", key.root],
    ["majorBlues", key.root],
    ["lydian", key.root],
    ["mixolydian", key.root],
  ], 5);
}

export function scalesForChord(chord: Chord, key: Key): ScaleSuggestion[] {
  const root = pitchClass(chord.root);
  /** Where this chord sits in the key, in semitones above the tonic. */
  const degree = pitchClass(root - key.root);
  const isTonic = degree === 0;

  switch (chord.quality) {
    case "7":
    case "9":
    // The extended dominants (2026-09-19). A ninth, an eleventh or a
    // thirteenth on top of a dominant seventh does not change which scale
    // fits it — mixolydian already contains all three — so they answer with
    // the seventh's own answer rather than an entry each.
    case "11":
    case "13": {
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
    case "m6":
    // The same, on the minor side: dorian holds the 9, the 11 and the 13.
    case "m9":
    case "m11":
    case "m13":
    case "madd9": {
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
    case "6":
    // A major triad with a ninth on top. Nothing about the ninth changes
    // which scale fits: it is already the second degree of both answers.
    case "add9":
    case "maj9":
    case "maj13":
    case "69": {
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

    /**
     * The triad the key strip offers that the forms never play: vii° of a
     * major key, ii° of a minor one. Both live inside the key, so the key's
     * own scale is the honest first answer — and a diminished triad is a
     * dominant seventh with its root left off, so the harmonic minor a
     * semitone above it is the same second answer `dim7` gets.
     */
    case "dim": {
      return build([
        [key.mode === "minor" ? "naturalMinor" : "major", key.root],
        ["harmonicMinor", pitchClass(root + 1)],
      ]);
    }

    /**
     * An augmented triad is a raised fifth, which is an alteration and not a
     * key. Altered from the chord root spells it; the key's harmonic minor is
     * where the chord occurs naturally (on its third degree).
     */
    case "aug":
    // The augmented seventh is the altered dominant the altered scale was
    // named for, and it is the one place that scale is the FIRST answer
    // rather than a colour.
    case "7sharp5":
    // A flattened or sharpened ninth is the other way a dominant is
    // altered, and the altered scale is named for exactly these.
    case "7b9":
    case "7sharp9": {
      return build([
        ["altered", root],
        ["harmonicMinor", key.root],
      ]);
    }

    /**
     * A minor triad with a major seventh. The melodic minor is the scale
     * that has both of those in it — this chord is the reason it exists —
     * and the harmonic minor is the near neighbour that also does.
     */
    case "mMaj7": {
      return build([
        ["melodicMinor", root],
        ["harmonicMinor", root],
      ]);
    }

    /**
     * Sus chords have no third, so they say nothing about major or minor and
     * the scale has to come from the key rather than from the chord. The
     * second suggestion is the pentatonic that contains the suspended note
     * itself — the ninth for sus2, the fourth for sus4.
     */
    case "sus2":
    case "sus4":
    // A seventh on a suspension changes what the chord is going to DO and
    // not what fits over it: still no third, still the key's own scale.
    case "7sus2":
    case "7sus4":
    case "9sus4": {
      return build([
        [key.mode === "minor" ? "naturalMinor" : "major", key.root],
        [chord.quality === "sus2" || chord.quality === "7sus2"
          ? "majorPentatonic"
          : "minorPentatonic", root],
      ]);
    }

    /**
     * A power chord has no third either, but where a sus chord is waiting to
     * resolve, a power chord is the finished article — and whoever is holding
     * one is playing rock. The minor pentatonic on its own root is what goes
     * over it, the blues scale is the same thing with the extra note, and the
     * key's own scale is there for anyone who wants the third the chord is
     * deliberately not playing.
     */
    case "5": {
      return build([
        ["minorPentatonic", root],
        ["blues", root],
        [key.mode === "minor" ? "naturalMinor" : "major", key.root],
      ]);
    }
  }
}
