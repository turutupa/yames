/**
 * alphaTex fixtures, written by hand for the tests.
 *
 * Every one of these was typed here. **No real song is ever committed to this
 * repository** (`plans/SONGS.md` S0.4) — not as a Guitar Pro file, not as
 * MusicXML, and not transcribed into alphaTex either. Each fixture exists to
 * pin one behaviour of the importer, and is named after that behaviour rather
 * than after anything musical, because none of them is music.
 *
 * Only the tests import this file.
 */

/** Bytes, the way a file arrives from a picker or a drop. */
export function texBytes(tex: string): Uint8Array {
  return new TextEncoder().encode(tex);
}

/**
 * A repeat with a first and a second ending.
 *
 * Printed bars 0,1 are the repeated body, 2 is the first ending and 3 the
 * second, so the played order must be 0,1,2, 0,1,3. Bar 1 also carries the
 * hammer-on and bar 3 a tie, so one fixture answers three questions.
 */
export const REPEAT_WITH_ENDINGS = `\\title "Repeat and endings"
\\artist "Nobody"
\\tempo 100
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\ro \\ts 4 4 3.3.4 5.3.4 3.3.4 5.3.4 |
3.3{h}.4 5.3.4 3.3.4 5.3.4 |
\\ae 1 \\rc 2 7.3.4 7.3.4 7.3.4 7.3.4 |
\\ae 2 9.3.4 9.3.4 9.3.4 9.3{-}.4 |`;

/**
 * A tempo change on bar 2, and a 7/8 bar after it.
 *
 * The tempo must land on the bar line, and the 7/8 bar must measure
 * 7 × 480 = 3360 ticks rather than a bar of four.
 */
export const TEMPO_AND_SEVEN_EIGHT = `\\title "Tempo and meter"
\\tempo 100
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |
\\tempo 140 3.3.4 3.3.4 3.3.4 3.3.4 |
\\ts 7 8 3.3.8 3.3.8 3.3.8 3.3.8 3.3.8 3.3.8 3.3.8 |`;

/** A three-note chord, then three single notes: one onset, then three. */
export const CHORD_THEN_SINGLES = `\\title "Chord"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\ts 4 4 (0.1 2.2 2.3).4 3.3.4 5.3.4 7.3.4 |`;

/** Seven strings, low to high, so the string numbering can be checked. */
export const SEVEN_STRING = `\\title "Seven"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3 b2
\\ts 4 4 0.7.4 0.1.4 3.7.4 3.1.4 |`;

/** Drop D on a six-string: the sixth string down a tone. */
export const DROP_D = `\\title "Drop D"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 d3
\\ts 4 4 0.6.4 0.6.4 0.6.4 0.6.4 |`;

/** A capo, so the sounding pitch can be told from the fret. */
export const CAPO_TWO = `\\title "Capo"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\capo 2
\\ts 4 4 0.1.4 3.4.4 0.1.4 3.4.4 |`;

/** Two named sections over four bars. */
export const SECTIONS = `\\title "Sections"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\section Verse
\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |
3.3.4 3.3.4 3.3.4 3.3.4 |
\\section Chorus
5.3.4 5.3.4 5.3.4 5.3.4 |
5.3.4 5.3.4 5.3.4 5.3.4 |`;

/** A guitar track and a bass track, to check the picker's order. */
export const GUITAR_AND_BASS = `\\title "Two tracks"
\\tempo 120
.
\\track "Bass"
\\tuning d3 a2 d2 g1
\\ts 4 4 2.1.4 2.1.4 2.1.4 2.1.4 |
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |`;

/**
 * A file with nothing written on strings — a keyboard part, on a staff with
 * no tuning at all.
 *
 * The importer must refuse this with a sentence, rather than producing a score
 * with no notes in it and letting the player wonder where the song went.
 */
export const NO_STRINGS = `\\title "Keys only"
\\tempo 120
.
\\track "Keys"
\\instrument acousticgrandpiano
\\ts 4 4 c4.4 e4.4 g4.4 c5.4 |`;

/**
 * A whole band: the guitar you play, a drum kit, a bass, a piano and a horn.
 *
 * Written for `buildBacking`, and every track is there to answer one
 * question. The drums say that a General MIDI percussion number comes out the
 * far end (alphaTab hands back an articulation INDEX, not a note). The bass
 * is tuned as a bass and has no program that says so, so it is the
 * bass-tuned case. The piano is the keys case. The horn is the one the band
 * has nobody to play and must be NAMED rather than vanish. And bar three is
 * 7/8, so the transport's meter map is exercised on a bar that is not four
 * quarters long.
 *
 * `\articulation defaults` is what registers the drum names — without it
 * alphaTex will not parse a percussion note at all.
 */
export const BAND_WITH_SEVEN_EIGHT = `\\title "The band"
\\tempo 100
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |
3.3.4 3.3.4 3.3.4 3.3.4 |
\\ts 7 8 3.3.8 3.3.8 3.3.8 3.3.8 3.3.8 3.3.8 3.3.8 |
\\track "Drums"
\\instrument percussion
\\articulation defaults
\\ts 4 4 (KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
\\ts 7 8 KickHit.8 HiHatClosed.8 SnareHit.8 HiHatClosed.8 KickHit.8 HiHatClosed.8 SnareHit.8 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 3.4.4 3.4.4 5.4.4 5.4.4 |
3.4.4 3.4.4 5.4.4 5.4.4 |
\\ts 7 8 3.4.8 3.4.8 3.4.8 3.4.8 3.4.8 3.4.8 3.4.8 |
\\track "Piano"
\\instrument acousticgrandpiano
\\ts 4 4 c4.4 e4.4 g4.4 c5.4 |
c4.4 e4.4 g4.4 c5.4 |
\\ts 7 8 c4.8 e4.8 g4.8 c5.8 c4.8 e4.8 g4.8 |
\\track "Horn"
\\instrument frenchhorn
\\ts 4 4 c4.4 c4.4 c4.4 c4.4 |
c4.4 c4.4 c4.4 c4.4 |
\\ts 7 8 c4.8 c4.8 c4.8 c4.8 c4.8 c4.8 c4.8 |`;

/** A pull-off (down a fret) beside a hammer-on (up one). */
export const HAMMER_AND_PULL = `\\title "Hammer and pull"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\ts 4 4 5.3{h}.4 7.3.4 7.3{h}.4 5.3.4 |`;
