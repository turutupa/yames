/**
 * The one translation between the chord on the screen and the chord the bass
 * player reads.
 *
 * `harmony.ts` names sixteen qualities because the chord-shape library can
 * draw all sixteen. `bassline.ts` knows eleven: the ten a form can put under a
 * bass line, plus the power chord, which a rock jam really does play. The five
 * that are left over — dim, aug, sus2, sus4, add9 — reach the bass only if a
 * future form starts using them, and this file is where they are given an
 * answer rather than a crash.
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
  // The one quality that is NOT translated. A power chord has no third on
  // purpose, and a bass that supplied one would be telling the room the
  // guitarist is playing a major chord when they are not, which is the whole
  // reason `bassline.ts` grew a two-note chord of its own.
  "5": "5",
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
  // The extended chords (2026-09-19). The bass plays the chord's SKELETON,
  // and a ninth, an eleventh or a thirteenth is not part of one: the note
  // that matters down there is the third and the seventh, and the upper
  // extension is the guitarist's or the keys player's business. So each maps
  // to the seventh chord it is built on.
  maj9: "maj7",
  m9: "m7",
  "11": "7",
  "13": "7",
  m11: "m7",
  m13: "m7",
  // Suspended sevenths have no third, exactly like sus2 and sus4 above.
  "7sus4": "7",
  "7sus2": "7",
  // Nothing in the bass table raises a fifth — the same gap `aug` hits.
  "7sharp5": "7",
  "69": "6",
  madd9: "min",
  // Altering the ninth changes the colour on top and not the skeleton under
  // it; both are a dominant seventh down there.
  "7b9": "7",
  "7sharp9": "7",
  maj13: "maj7",
  "9sus4": "7",
  // Minor triad, MAJOR seventh. Mapping it to m7 would put a flat seventh
  // under a chord whose whole character is the natural one, so the bass
  // keeps to the triad and lets the chord say the rest.
  mMaj7: "min",
};

/** A chord from the form, as the bass line generator wants it. */
export function bassChordFrom(chord: Chord): BassChord {
  return {
    rootMidi: BASS_OCTAVE_BASE + chord.root,
    quality: BASS_QUALITY[chord.quality],
  };
}
