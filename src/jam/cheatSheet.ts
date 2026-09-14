// W25 stub — W24 replaces this file wholesale.
/**
 * What the cheat sheet asks the theory for (JAM_UX_DECISIONS A10).
 *
 * The signatures are the contract in plans/tasks/jam-v2/W24-CHEATSHEET-DATA.md
 * §3 and they are fixed; the bodies here are the simplest true answer to each,
 * written so the screen could be built against them while W24 built the real
 * thing beside it. Two of them are deliberately short of the real answer, and
 * both places say so:
 *
 * - **Power chords are not a chord type yet.** `"5"` joins `ChordQuality` in
 *   W24's work, not here, so `"power"` below returns the key's degrees as
 *   plain triads with the degree relabelled ("I5"). The card shows the right
 *   name and the wrong grip until W24 lands, which is the honest failure: the
 *   screen that draws it is finished, the library it draws from is not.
 * - **`qualitiesInFamily("basic")` is four qualities, not five**, for the
 *   same reason.
 *
 * Everything else — what fits a key, the colours, the roots as the key spells
 * them — is the real rule, because the real rule was no harder to write than
 * a placeholder would have been.
 *
 * Pure, no React, no i18n: what comes out are chord names, never sentences.
 */

import {
  type Chord,
  type ChordQuality,
  type Key,
  type KeyMode,
  type PitchClass,
  chordNotes,
  parseKey,
} from "./harmony";
import { chordsInKey, chordPitchClasses, noteName, seventhsInKey } from "./diatonic";
import type { DiatonicChord } from "./diatonic";
import type { Jam } from "./types";

/** The four ways to read the chords of a key. */
export type ChordFlavour = "triads" | "sevenths" | "colours" | "power";

export const CHORD_FLAVOURS: readonly ChordFlavour[] = [
  "triads",
  "sevenths",
  "colours",
  "power",
];

/**
 * The colour chords, in the order a player reaches for them.
 *
 * Suspensions first because they are what a guitarist actually plays over a
 * held chord, then the added ninth, then the sixth, then the ninth — which is
 * the most flavoured and the least often in the key.
 */
const COLOUR_ORDER: readonly { quality: ChordQuality; minorOnly?: boolean; majorOnly?: boolean }[] = [
  { quality: "sus4" },
  { quality: "sus2" },
  { quality: "add9" },
  { quality: "6", majorOnly: true },
  { quality: "m6", minorOnly: true },
  { quality: "9" },
];

/** Whether a degree's own quality has a minor third in it. */
function isMinorDegree(quality: ChordQuality): boolean {
  return quality === "min" || quality === "m7" || quality === "m6" || quality === "m7b5" ||
    quality === "dim" || quality === "dim7";
}

/**
 * The roman degree with its accidentals but without its own quality mark —
 * "vii°" becomes "vii", "V7" becomes "V", "Imaj7" becomes "I".
 *
 * The colour and power labels are built from the degree rather than from the
 * chord, so a Csus4 in C major reads "Isus4" and not "Imajsus4".
 */
function bareDegree(degree: string): string {
  const match = /^([b#]*[IViv]+)/.exec(degree);
  return match ? match[1] : degree;
}

/**
 * The chords of the key at one flavour, in degree order.
 *
 * `"triads"` and `"sevenths"` are the two lists the key strip has always
 * shown. `"colours"` and `"power"` are A10's additions.
 */
export function chordsAtFlavour(
  root: PitchClass,
  mode: KeyMode,
  flavour: ChordFlavour,
): DiatonicChord[] {
  if (flavour === "sevenths") return seventhsInKey(root, mode);
  if (flavour === "triads") return chordsInKey(root, mode);

  if (flavour === "power") {
    // Every degree as a two-note chord, upper case with a 5 after it: a power
    // chord has no third, so it is neither major nor minor and a lower-case
    // roman would be claiming something the chord does not say. A diminished
    // degree loses its ° for the same reason.
    return chordsInKey(root, mode).map((chord) => ({
      degree: `${bareDegree(chord.degree).toUpperCase()}5`,
      root: chord.root,
      // W24: this becomes `"5"`. Until then the shape drawn is a triad's, and
      // the name under it is the only true thing on the card.
      quality: "maj" as ChordQuality,
      role: chord.role,
    }));
  }

  // Colours: for each degree, the flavoured chords on that root whose every
  // note is already in the key. Nothing borrowed, nothing to explain — if it
  // is on the page you can play it over the whole tune.
  const notes = keyNoteSet(root, mode);
  const out: DiatonicChord[] = [];
  for (const chord of chordsInKey(root, mode)) {
    const minor = isMinorDegree(chord.quality);
    for (const colour of COLOUR_ORDER) {
      if (colour.minorOnly && !minor) continue;
      if (colour.majorOnly && minor) continue;
      if (!fitsNotes({ root: chord.root, quality: colour.quality }, notes)) continue;
      out.push({
        degree: `${bareDegree(chord.degree)}${suffixOf(colour.quality)}`,
        root: chord.root,
        quality: colour.quality,
        role: chord.role,
      });
    }
  }
  return out;
}

/** The colour's mark on a degree label. `m6` on a minor degree reads "6". */
function suffixOf(quality: ChordQuality): string {
  return quality === "m6" ? "6" : quality;
}

/**
 * The flavour a jam's sheet opens on.
 *
 * A rock player's first chord is a power chord and a jazz player's is a
 * seventh, so the sheet should already be on the page they were going to
 * choose. The vibe answers first because it is the more specific statement;
 * the key's mode answers when there is no vibe.
 */
export function defaultFlavour(jam: Pick<Jam, "vibe" | "key">): ChordFlavour {
  if (jam.vibe === "rock" || jam.vibe === "hardRock" || jam.vibe === "metal") return "power";
  if (jam.vibe === "jazz" || jam.vibe === "blues") return "sevenths";
  if (jam.vibe) return "triads";
  const key = jam.key ? parseKey(jam.key) : null;
  return key?.mode === "blues" ? "sevenths" : "triads";
}

/**
 * The notes the key contains, derived from the chords already listed for it.
 *
 * One rule and no second scale table (A10). For a major key this comes out as
 * exactly the seven scale notes; for a minor key it adds the raised seventh
 * that the borrowed V7 carries, which is the note every player actually uses;
 * for a blues it is the union of the five blues chords, which is not a scale
 * at all and should not be made to look like one.
 */
export function keyNoteSet(root: PitchClass, mode: KeyMode): ReadonlySet<PitchClass> {
  const notes = new Set<PitchClass>();
  for (const chord of [...chordsInKey(root, mode), ...seventhsInKey(root, mode)]) {
    for (const pc of chordPitchClasses({ root: chord.root, quality: chord.quality })) {
      notes.add(pc);
    }
  }
  return notes;
}

/** Every note of the chord is in the key's note set. */
export function fitsKey(chord: Chord, root: PitchClass, mode: KeyMode): boolean {
  return fitsNotes(chord, keyNoteSet(root, mode));
}

/** The same rule, against a note set already worked out. */
function fitsNotes(chord: Chord, notes: ReadonlySet<PitchClass>): boolean {
  return chordNotes(chord).every((pc) => notes.has(pc));
}

/** The three drawers of the browser page. */
export type ChordFamily = "basic" | "sevenths" | "colours";

export const CHORD_FAMILIES: readonly ChordFamily[] = ["basic", "sevenths", "colours"];

const FAMILIES: Record<ChordFamily, readonly ChordQuality[]> = {
  // W24 adds `"5"` here, between `min` and `dim`.
  basic: ["maj", "min", "dim", "aug"],
  sevenths: ["7", "maj7", "m7", "m7b5", "dim7"],
  colours: ["sus2", "sus4", "add9", "6", "m6", "9"],
};

export function qualitiesInFamily(family: ChordFamily): readonly ChordQuality[] {
  return FAMILIES[family];
}

/**
 * The twelve roots as this key spells them — flats in a flat key — from C up.
 *
 * From C rather than from the key's own root because the row is a keyboard,
 * and a keyboard that started on a different note for every jam would be a
 * row you had to read rather than one you could point at.
 */
export function rootNames(key: Key): { pc: PitchClass; name: string }[] {
  return Array.from({ length: 12 }, (_unused, pc) => ({ pc, name: noteName(pc, key) }));
}
