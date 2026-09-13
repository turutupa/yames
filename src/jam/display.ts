/**
 * The changes as they are READ: spelled from the key, in the player's own
 * transposition, with the next chord worked out.
 *
 * The jam screen needed this and so does Zen, and two copies of "what chord
 * are we on" is two chances for the big chord on the stage and the big chord
 * in Zen to be different chords. So it lives here, once, and both call it.
 *
 * Transposition is a shift of the whole picture: shift the key and every
 * chord in it and nothing is left in concert pitch to contradict it. The
 * BAND always plays concert — `compileJam` reads the same progression through
 * `chordsForJam` without any of this — so a Bb player reads a Bb part over a
 * band in concert, which is what choosing Bb means.
 */
import { chordName, displayTransposition, sameChord, transposeChord, transposeKey } from "./harmony";
import type { Chord, Key } from "./harmony";
import { chordsForJam } from "./progression";
import { jamKey } from "./compile";
import { formBars } from "./forms";
import type { Jam } from "./types";

export type JamHarmony = {
  /** The key as the player reads it. */
  key: Key;
  /** The key the band is actually in — what a progression is written in. */
  concert: Key;
  /** One chord per bar of the chorus, in the read key. */
  chords: Chord[];
};

/** The changes of one chorus, in the pitch the player reads. */
export function jamHarmony(jam: Jam): JamHarmony {
  const concert = jamKey(jam);
  const semitones = displayTransposition(jam.transposition ?? "concert");
  const key = transposeKey(concert, semitones);
  const chords = chordsForJam(jam.form, concert, jam.progression).map((chord) =>
    transposeChord(chord, semitones),
  );
  return { key, concert, chords };
}

/**
 * The next chord that is DIFFERENT, and how far off it is.
 *
 * Different, not merely next. Over a twelve-bar blues bars 1 to 4 are all the
 * I, and "A7 in 1 bar" four times running tells you nothing. "D7 in 4 bars"
 * is the sentence a player holds in their head.
 *
 * Null when there is nothing else to say — a one-chord jam, or a form of one
 * bar. A blank is a better answer there than repeating the chord you are on.
 */
export function nextChange(
  chords: readonly Chord[],
  at: number,
  key: Key,
): { name: string; inBars: number } | null {
  const bars = chords.length;
  const chord = chords[at];
  if (!chord || bars <= 1) return null;
  for (let ahead = 1; ahead <= bars; ahead += 1) {
    const candidate = chords[(at + ahead) % bars];
    if (candidate && !sameChord(candidate, chord)) {
      return { name: chordName(candidate, key), inBars: ahead };
    }
  }
  return null;
}

/** Which bar's chord is under your hands: the one playing, or bar one. */
export function barInView(jam: Jam, formBar: number, isPlaying: boolean): number {
  const bars = formBars(jam.form);
  if (!isPlaying) return 0;
  return Math.min(Math.max(formBar, 0), Math.max(0, bars - 1));
}
