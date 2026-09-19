/**
 * The cheat sheet's data.
 *
 * The owner's complaint about the first chord sheet was that it was honest
 * but small: "only major and 7ths chords? … the user should be able to see
 * ALL chords for all keys, or filter by the chords the user can play in the
 * key of the current jam." JAM_UX_DECISIONS A10 is the answer, and this file
 * is the theory half of it. The screen half is elsewhere; nothing here knows
 * about React, i18n or the store, and every name it produces is a chord name
 * rather than a sentence.
 *
 * Two pages, two shapes of question:
 *
 * - **In key** asks "what can I play over this jam?", at one of four
 *   flavours — triads, sevenths, colours, power. `chordsAtFlavour` answers,
 *   in degree order, and `defaultFlavour` picks the one a jam opens on.
 * - **All chords** asks "how do I play a Bbm7b5?" — every root, every chord
 *   type, grouped into three families a player recognises. `rootNames` and
 *   `qualitiesInFamily` lay that grid out, and `fitsKey` puts the small mark
 *   on the ones that belong to the jam you are in.
 *
 * ## One rule for "fits the key", and no second scale table
 *
 * A chord fits when every one of its notes is in the key's note set, and that
 * set is derived from the chords the app ALREADY lists for the key
 * (`chordsInKey`). No scale table is written down twice, so the sheet cannot
 * come to disagree with itself: if the key strip says a chord is in the key,
 * the key contains its notes, by construction.
 */

import { chordTones, chordsInKey, noteName, seventhsInKey } from "./diatonic";
import type { DiatonicChord } from "./diatonic";
import { chordNotes, chordSuffix, parseKey, pitchClass } from "./harmony";
import type { Chord, ChordQuality, Key, KeyMode, PitchClass } from "./harmony";
import type { PlacedShape } from "./chordShapes";
import { VIBE_IDS } from "./vibesContract";
import type { Jam } from "./types";

// ---------------------------------------------------------------------------
// The in-key page: four flavours of the same seven chords
// ---------------------------------------------------------------------------

/**
 * How the chords of the key are shown. Four ways of playing the same
 * harmony, not four different harmonies: I is still I at every flavour.
 */
export type ChordFlavour = "triads" | "sevenths" | "colours" | "power";

/** In the order the flavour switch draws them, plainest first. */
export const CHORD_FLAVOURS: readonly ChordFlavour[] = [
  "triads",
  "sevenths",
  "colours",
  "power",
];

/**
 * The accidental and the roman numeral of a degree, with everything the
 * quality wrote after it taken off: "vii°" → "vii", "iiø7" → "ii",
 * "IIImaj7" → "III", "bVII" → "bVII".
 *
 * The CASE is kept, because a player reads case as major or minor and a
 * colour chord on the ii of a major key should still look like a ii.
 */
function degreeStem(degree: string): string {
  const match = /^([b#]?)([ivIV]+)/.exec(degree);
  return match ? match[1] + match[2] : degree;
}

/**
 * A degree as a power chord: "vii°" → "VII5", "bVII" → "bVII5", "V7" → "V5".
 *
 * Always upper case, because a power chord has no third and so is neither
 * major nor minor — writing "ii5" would be promising a minor third that the
 * two notes do not contain.
 */
function powerDegree(degree: string): string {
  const match = /^([b#]?)([ivIV]+)/.exec(degree);
  return match ? `${match[1]}${match[2].toUpperCase()}5` : `${degree}5`;
}

/** Every degree of the key as a two-note power chord, in degree order. */
function powerChordsInKey(root: PitchClass, mode: KeyMode): DiatonicChord[] {
  const out: DiatonicChord[] = [];
  const seen = new Set<string>();
  for (const chord of chordsInKey(root, mode)) {
    const degree = powerDegree(chord.degree);
    // A minor key lists both the natural v and the V7 every player borrows.
    // Stripped to their fifths they are the same two notes, and printing the
    // card twice would read as a bug rather than as theory.
    const key = `${degree}:${String(chord.root)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ degree, root: chord.root, quality: "5", role: chord.role });
  }
  return out;
}

/**
 * The colour chords, in the order a player reaches for them.
 *
 * Suspensions first — they are the ones every style uses — then the added
 * ninth, then the sixth, then the dominant ninth, which is the one that fits
 * the fewest keys. Each is kept only if `fitsKey` says so, so a degree may
 * yield five colours, one, or none at all.
 */
const COLOUR_QUALITIES: readonly ChordQuality[] = ["sus4", "sus2", "add9", "6", "9"];

/** True when this degree's own chord has a minor third in it. */
function isMinorDegree(quality: ChordQuality): boolean {
  return chordTones(quality).includes(3);
}

/**
 * The colours of one degree, in priority order.
 *
 * The sixth follows the degree: a major degree takes the major sixth, a minor
 * one the minor sixth, because a chord written "iim6" over a minor ii is what
 * a player would actually finger. Everything else is the same chord over
 * either.
 */
function coloursOfDegree(degree: DiatonicChord, root: PitchClass, mode: KeyMode): DiatonicChord[] {
  const stem = degreeStem(degree.degree);
  const out: DiatonicChord[] = [];
  for (const wanted of COLOUR_QUALITIES) {
    const quality: ChordQuality =
      wanted === "6" && isMinorDegree(degree.quality) ? "m6" : wanted;
    const chord: Chord = { root: degree.root, quality };
    if (!fitsKey(chord, root, mode)) continue;
    out.push({
      degree: stem + chordSuffix(quality),
      root: degree.root,
      quality,
      role: degree.role,
    });
  }
  return out;
}

/**
 * The chords of the key at one flavour, in degree order.
 *
 * Colours come back as a flat list that keeps the degree order, several
 * entries to a degree; the screen groups them on the degree's root. A flat
 * list rather than a nested one because every other flavour is a flat list
 * and the caller should not have to branch on which one it asked for.
 */
export function chordsAtFlavour(
  root: PitchClass,
  mode: KeyMode,
  flavour: ChordFlavour,
): DiatonicChord[] {
  switch (flavour) {
    case "sevenths":
      return seventhsInKey(root, mode);
    case "power":
      return powerChordsInKey(root, mode);
    case "colours":
      return chordsInKey(root, mode).flatMap((degree) => coloursOfDegree(degree, root, mode));
    case "triads":
      return chordsInKey(root, mode);
  }
}

/** The three vibes that open on power chords, and the two that open on sevenths. */
const POWER_VIBES: readonly string[] = ["rock", "hardRock", "metal"];
const SEVENTH_VIBES: readonly string[] = ["jazz", "blues"];

/**
 * The flavour a jam's sheet opens on.
 *
 * The vibe knows best, because it is the one thing on the screen that says
 * what kind of music this is: a metal jam should not open on a page of major
 * triads. A jam with no vibe — an old record, or one built by hand — falls
 * back to its key, where only a blues has an opinion. Nothing else, and a jam
 * with neither, opens on triads.
 */
export function defaultFlavour(jam: Pick<Jam, "vibe" | "key">): ChordFlavour {
  const vibe = jam.vibe;
  if (vibe !== undefined && (VIBE_IDS as readonly string[]).includes(vibe)) {
    if (POWER_VIBES.includes(vibe)) return "power";
    if (SEVENTH_VIBES.includes(vibe)) return "sevenths";
    return "triads";
  }
  const key = jam.key ? parseKey(jam.key) : null;
  return key?.mode === "blues" ? "sevenths" : "triads";
}

// ---------------------------------------------------------------------------
// What fits the key
// ---------------------------------------------------------------------------

/**
 * The notes of a key, from the chords the app lists for it.
 *
 * Not a scale table — A10 is explicit that there must not be a second one.
 * For a major key this comes out as exactly the seven scale notes; for a
 * minor key it is those seven plus the raised seventh the borrowed V7
 * carries; for a blues it is the union of the five blues chords, which is
 * nine notes and contains none of the three the blues does not use.
 *
 * The sevenths are not folded in, and that is the interesting decision. In a
 * major or a minor key they would add nothing — every degree's seventh is
 * already in the key. In a BLUES they would add the flat seven of bIII7 and
 * of bVII7, two notes an A blues player would not call part of A. So the set
 * is the chords themselves, exactly as A10 words it.
 */
export function keyNoteSet(root: PitchClass, mode: KeyMode): ReadonlySet<PitchClass> {
  const notes = new Set<PitchClass>();
  for (const chord of chordsInKey(root, mode)) {
    for (const pc of chordNotes({ root: chord.root, quality: chord.quality })) notes.add(pc);
  }
  return notes;
}

/**
 * True when every note of the chord is in the key's note set.
 *
 * The whole of "fits the key" — the mark on a card in the browser, the switch
 * that hides the rest, and the filter that decides which colours a degree
 * offers. One rule, used everywhere, so the three can never disagree.
 */
export function fitsKey(chord: Chord, root: PitchClass, mode: KeyMode): boolean {
  const inKey = keyNoteSet(root, mode);
  return chordNotes(chord).every((pc) => inKey.has(pc));
}

// ---------------------------------------------------------------------------
// The browser: every chord type there is
// ---------------------------------------------------------------------------

/**
 * How the browser groups the sixteen chord types.
 *
 * Not by theory but by when a player meets them: the ones you learn first,
 * the ones a jazz chart is made of, and the ones you add when the plain
 * chord has stopped being interesting.
 */
export type ChordFamily = "major" | "minor" | "dominant" | "other";

export const CHORD_FAMILIES: readonly ChordFamily[] = ["major", "minor", "dominant", "other"];

/**
 * The four families, and the order the chart's columns come in.
 *
 * They used to be "basic / sevenths / colours" — grouped by when a player
 * MEETS a chord, which is a fine way to teach and a useless way to find
 * something. A guitarist looking at a chart is asking "where are the minor
 * ones", and the owner asked for exactly that: "clicking on minor it focuses
 * the minor chords". So the grouping is by what the chord IS.
 *
 * Every quality appears once, and the test beside this file checks that
 * against `CHORD_QUALITIES` — a twenty-eighth chord type added to the union
 * and forgotten here fails the build rather than vanishing off the chart.
 */
const FAMILY_QUALITIES: Record<ChordFamily, readonly ChordQuality[]> = {
  major: ["maj", "6", "maj7", "maj9", "maj13", "69", "add9", "sus2", "sus4"],
  minor: ["min", "m6", "m7", "mMaj7", "m9", "m11", "m13", "madd9"],
  dominant: ["7", "9", "11", "13", "7b9", "7sharp9", "7sus2", "7sus4", "9sus4", "7sharp5"],
  // The ones that are none of the three: no third at all, or a fifth that
  // has been moved.
  other: ["5", "dim", "dim7", "m7b5", "aug"],
};

/**
 * The chord types in a family, in the order the browser draws them.
 *
 * Between them the three families hold every quality the library knows and
 * hold none of them twice — the test beside this file checks that against
 * `CHORD_QUALITIES`, so a sixteenth chord type added to the union and
 * forgotten here fails the build rather than quietly vanishing off the page.
 */
export function qualitiesInFamily(family: ChordFamily): readonly ChordQuality[] {
  return FAMILY_QUALITIES[family];
}

/**
 * The twelve roots, spelled the way this key spells them.
 *
 * Pitch class 0..11 in order from C, so the row is the chromatic scale and
 * not a circle of fifths: this is the row you scan to find a chord, and C D E
 * is where a reader's eye expects to start. The names follow the key
 * signature, so in F the sixth button reads Gb and in D it reads F#.
 */
export function rootNames(key: Key): { pc: PitchClass; name: string }[] {
  return Array.from({ length: 12 }, (_unused, i) => {
    const pc = pitchClass(i);
    return { pc, name: noteName(pc, key) };
  });
}

// ---------------------------------------------------------------------------
// The poster: every root, every chord type, in one table
// ---------------------------------------------------------------------------

/**
 * One cell of the poster: a chord, one grip for it, and whether it fits.
 *
 * `shape` is null only for a chord the library has no grip for. There are
 * none today — every quality has at least one shape at every root, which
 * `chordShapes.test.ts` asserts — but a seventeenth quality added to the
 * union without seeds would land here, and a cell that says so is better
 * than a blank the reader has to interpret.
 */
export type SheetCell = {
  chord: Chord;
  shape: PlacedShape | null;
  /** Every note of it is in the key. */
  fits: boolean;
};

export type SheetRow = {
  root: PitchClass;
  /** The root spelled the way this key spells it. */
  name: string;
  cells: SheetCell[];
};

/**
 * The one grip a page like this should draw for a chord.
 *
 * "The open one or the first barre" (JAM_UX_DECISIONS A8). Not simply the
 * first shape the library returns: the lowest thing on the neck for a minor
 * seventh is often a three-string triad, which is a fine grip and a terrible
 * introduction. A page you glance at should show the chord the way you would
 * teach it.
 *
 * It lived in the container until the poster needed it too, which is the
 * moment a rule about what to draw stopped being one screen's business.
 */
export function basicShape(shapes: readonly PlacedShape[]): PlacedShape | null {
  return (
    shapes.find((s) => s.size === "open") ??
    shapes.find((s) => s.size === "barre") ??
    shapes[0] ??
    null
  );
}

/**
 * The whole library as a table: twelve roots down, every chord type across.
 *
 * This is the printed card a guitarist already owns, and the owner asked for
 * it in those words — "should the cheatsheet organize the chords by
 * triads/7ths/minor/minor6/min7/... take a look at the kind of cheatsheets i
 * attached, that's what i want to build". The pieces all existed: the roots,
 * the qualities, the grips and the in-key rule. Nothing crossed them, so the
 * browser could only ever show you one root at a time and the page read as a
 * list rather than a reference.
 *
 * Both axes are fixed and complete: every row has a cell for every quality
 * in `columns`, in the same order, whether or not it fits the key. A table
 * whose rows have different lengths is not a table, and the mark on a cell
 * is what says "this one belongs to your jam" — not its absence.
 */
export function sheetGrid(
  key: Key,
  columns: readonly ChordQuality[],
  shapesFor: (root: PitchClass, quality: ChordQuality) => readonly PlacedShape[],
): SheetRow[] {
  return rootNames(key).map(({ pc, name }) => ({
    root: pc,
    name,
    cells: columns.map((quality) => {
      const chord: Chord = { root: pc, quality };
      return {
        chord,
        shape: basicShape(shapesFor(pc, quality)),
        fits: fitsKey(chord, key.root, key.mode),
      };
    }),
  }));
}
