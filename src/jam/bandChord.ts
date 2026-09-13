/**
 * The one translation between the chord on the screen and the chord the bass
 * player reads.
 *
 * `harmony.ts` names fifteen qualities because the chord-shape library can
 * draw all fifteen. `bassline.ts` knows ten, because those are the ten a form
 * can put under a bass line. The five that are left over — dim, aug, sus2,
 * sus4, add9 — reach the bass only if a future form starts using them, and
 * this file is where they are given an answer rather than a crash.
 *
 * The rule for the mapping is the bass player's, not the theorist's: a bass
 * line uses the root, the third and the fifth and almost nothing else, so
 * each leftover quality becomes the ten-quality chord whose root, third and
 * fifth are nearest to it. A sus chord has no third to translate, so it goes
 * to the major triad and the bass plays the two notes it does have.
 */

import type { Chord, ChordQuality } from "./harmony";
import type { BassChord, BassChordQuality } from "./bassline";

/**
 * Middle of a bass player's octave. `bassline.ts` folds a root into E1–D#2
 * by pitch class before it uses it, so only the note matters, not the octave
 * it arrives in; C2 is the one that reads least like an accident.
 */
const BASS_OCTAVE_BASE = 36;

const BASS_QUALITY: Record<ChordQuality, BassChordQuality> = {
  maj: "maj",
  min: "min",
  // Root, minor third, flat fifth: the half-diminished chord is the one in
  // the bass's own table that has all three.
  dim: "m7b5",
  // Nothing in the bass table raises a fifth. A major triad keeps the root
  // and the third right; the styles that reach for a fifth reach for the
  // perfect one, which over an augmented chord is the one note to avoid, so
  // this is the mapping to revisit the day a form plays one.
  aug: "maj",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  m7b5: "m7b5",
  dim7: "dim7",
  // No third at all. The bass has the root and the fifth either way, and
  // guessing a third would be the bass contradicting the chord.
  sus2: "maj",
  sus4: "maj",
  "6": "6",
  m6: "m6",
  add9: "maj",
  "9": "9",
};

/** A chord from the form, as the bass line generator wants it. */
export function bassChordFrom(chord: Chord): BassChord {
  return {
    rootMidi: BASS_OCTAVE_BASE + chord.root,
    quality: BASS_QUALITY[chord.quality],
  };
}
