/**
 * The starter shelf — the songs Yames ships with.
 *
 * `plans/SONGS.md` S0.9: "a small shelf of original and public-domain pieces
 * means the mode is never empty". A player who opens Songs before they have
 * imported anything should be able to press play, not read a paragraph about
 * Guitar Pro files.
 *
 * ## What may be in here, and what may not
 *
 * Every piece is either **written for Yames** — a study, a lick, a pattern,
 * nobody's music but ours — or **public domain worldwide**, which in practice
 * means a composer dead more than a hundred years. There is exactly one of
 * the second kind and it is the Ode to Joy theme (Beethoven, d. 1827), eight
 * bars of it, written out here note for note from the melody as everybody
 * knows it. **A wrong note in a famous tune is worse than not shipping it**,
 * so anything there was doubt about is an original instead. Nothing in this
 * folder is transcribed from a recording, and no real song will ever be
 * committed to this repository (`SONGS.md` S0.4 — S0.9 widens that to allow
 * exactly what is here, and nothing else).
 *
 * ## The shape of a piece
 *
 * alphaTex, because it is text a person can read and correct, and because it
 * goes through **the same importer as any file a player brings in** — there
 * is no second path into the library and no second idea of what a score is.
 *
 * Each one is eight bars in two named sections, with a drum track and a bass
 * track behind the part you play, so the band has something to do and the
 * mode is showing what it is for from the first press of play. The
 * `\artist` line carries the one-line "what this is for": it is the only
 * field that reaches the screen (it is drawn under the title), and a study
 * has no artist.
 *
 * Tunings and the numbering follow the fixtures beside this folder: string 1
 * is the highest, `e5 b4 g4 d4 a3 e3` is a guitar and `g2 d2 a1 e1` is a
 * bass, which is what alphaTab hands back as `[76, 71, 67, 62, 57, 52]` and
 * `[43, 38, 33, 28]`.
 */

/** One piece of the shelf, and which part of it the player plays. */
export type StarterPiece = {
  /**
   * Stable and never changed. The file name the importer is told, and — with
   * the bytes — what the song's id is a hash of. Renaming one would make a
   * second copy of it in the library of every player who has it.
   */
  fileName: string;
  /** The track the player plays, by index. The band is the others. */
  trackIndex: number;
  /** The alphaTex. */
  tex: string;
};

/** The drum kit, eight bars of ordinary time. `\articulation defaults` is
 *  what makes the drum names parse at all. */
const DRUMS_QUARTERS = `\\track "Drums"
\\instrument percussion
\\articulation defaults
\\ts 4 4 (KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |
(KickHit HiHatClosed).4 HiHatClosed.4 (SnareHit HiHatClosed).4 HiHatClosed.4 |`;

/** The same kit on eighths, for the two pieces that want it pushing. */
const DRUMS_EIGHTHS = `\\track "Drums"
\\instrument percussion
\\articulation defaults
\\ts 4 4 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |
(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |`;

// ---------------------------------------------------------------------------
// 1 — the picking study
// ---------------------------------------------------------------------------

const PICKING = `\\title "Picking study in A minor"
\\artist "Down-up across two strings, then three. Start slow."
\\tempo 84
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section TwoStrings
\\ts 4 4 5.4.8 5.3.8 7.4.8 7.3.8 5.4.8 5.3.8 7.4.8 7.3.8 |
7.4.8 7.3.8 5.4.8 5.3.8 7.4.8 7.3.8 5.4.8 5.3.8 |
5.4.8 7.4.8 5.3.8 7.3.8 5.4.8 7.4.8 5.3.8 7.3.8 |
5.4.4 5.3.4 7.4.4 7.3.4 |
\\section ThreeStrings
5.4.8 5.3.8 5.2.8 5.3.8 7.4.8 7.3.8 7.2.8 7.3.8 |
5.4.8 5.3.8 5.2.8 5.3.8 7.4.8 7.3.8 7.2.8 7.3.8 |
5.4.8 7.4.8 5.3.8 7.3.8 5.2.8 7.2.8 5.3.8 7.3.8 |
5.4.1 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 0.3.4 0.3.4 0.3.4 0.3.4 |
0.3.4 0.3.4 0.3.4 0.3.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
3.4.4 3.4.4 0.3.4 0.3.4 |
0.3.4 0.3.4 0.3.4 0.3.4 |
0.3.4 0.3.4 0.3.4 0.3.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
0.3.1 |
${DRUMS_QUARTERS}`;

// ---------------------------------------------------------------------------
// 2 — the legato run
// ---------------------------------------------------------------------------

const LEGATO = `\\title "Legato run in A minor"
\\artist "Only the first note of each pair is picked. The rest is your left hand."
\\tempo 76
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section Climbing
\\ts 4 4 5.3{h}.8 7.3.8 5.3{h}.8 7.3.8 5.2{h}.8 8.2.8 5.2{h}.8 8.2.8 |
8.2{h}.8 5.2.8 8.2{h}.8 5.2.8 7.3{h}.8 5.3.8 7.3{h}.8 5.3.8 |
5.4{h}.8 7.4.8 5.3{h}.8 7.3.8 5.2{h}.8 8.2.8 5.1{h}.8 8.1.8 |
8.1{h}.2 5.1.2 |
\\section Falling
8.1{h}.8 5.1.8 8.2{h}.8 5.2.8 7.3{h}.8 5.3.8 7.4{h}.8 5.4.8 |
5.4{h}.8 7.4.8 5.3{h}.8 7.3.8 5.2{h}.8 8.2.8 5.1{h}.8 8.1.8 |
8.1{h}.8 5.1.8 8.2{h}.8 5.2.8 7.3{h}.8 5.3.8 7.4{h}.8 5.4.8 |
5.4.1 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 0.3.2 0.3.2 |
3.4.2 3.4.2 |
0.3.2 0.3.2 |
3.4.2 3.4.2 |
0.3.2 0.3.2 |
3.4.2 3.4.2 |
0.3.2 0.3.2 |
0.3.1 |
${DRUMS_QUARTERS}`;

// ---------------------------------------------------------------------------
// 3 — the bending phrase
// ---------------------------------------------------------------------------

const BENDING = `\\title "Bending phrase in G minor"
\\artist "One bend, held. Listen to where it lands before you let it go."
\\tempo 72
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section BendAndHold
\\ts 4 4 6.2.4 8.2{b (0 4)}.2 6.2.4 |
6.3.4 5.3.4 3.3{v}.2 |
6.2.4 8.2{b (0 4)}.2 6.2.4 |
3.2.4 6.3.4 5.3.4 3.3{v}.4 |
\\section BendAndRelease
8.2{b (0 4 0)}.2 6.2.4 3.2.4 |
6.3.4 5.3.4 3.3.4 6.3.4 |
8.2{b (0 4)}.2 6.2{v}.2 |
3.3.1 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 3.4.4 3.4.4 3.4.4 3.4.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
1.3.4 1.3.4 1.3.4 1.3.4 |
1.3.4 1.3.4 3.4.4 3.4.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
1.3.4 1.3.4 1.3.4 1.3.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
3.4.1 |
${DRUMS_QUARTERS}`;

// ---------------------------------------------------------------------------
// 4 — the blues lick
// ---------------------------------------------------------------------------

const BLUES = `\\title "Blues lick in A"
\\artist "The first box, up and back down. Say it, then answer it."
\\tempo 92
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section Say
\\ts 4 4 5.5.8 7.5.8 5.4.8 7.4.8 5.3.8 7.3.8 5.2.8 8.2.8 |
5.1.4 8.1.4 5.1.4 8.1.4 |
8.2{b (0 4)}.4 5.2.4 7.3.4 5.3.4 |
7.4.2 5.4.2 |
\\section Answer
5.3.8 7.3.8 5.2.8 8.2.8 5.1.8 8.1.8 5.1.8 8.1.8 |
8.1{b (0 4)}.2 5.1.2 |
5.2.8 8.2.8 5.3.8 7.3.8 5.4.8 7.4.8 5.5.8 7.5.8 |
5.5.1 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 0.3.4 0.3.4 0.3.4 0.3.4 |
0.3.4 0.3.4 0.3.4 0.3.4 |
0.2.4 0.2.4 0.2.4 0.2.4 |
0.2.4 0.2.4 0.3.4 0.3.4 |
2.2.4 2.2.4 0.2.4 0.2.4 |
0.3.4 0.3.4 0.3.4 0.3.4 |
0.2.4 0.2.4 2.2.4 2.2.4 |
0.3.1 |
${DRUMS_EIGHTHS}`;

// ---------------------------------------------------------------------------
// 5 — the bass groove
//
// The one piece where the part you play is the BASS, so the band behind it is
// drums and keys: doubling the bass under a bass study would hide exactly the
// thing the study is about.
// ---------------------------------------------------------------------------

const BASS_GROOVE = `\\title "Bass groove in E"
\\artist "Eights on the low string, with the last two notes walking you back."
\\tempo 100
.
\\track "Bass"
\\tuning g2 d2 a1 e1
\\section Straight
\\ts 4 4 0.4.8 0.4.8 0.4.8 0.4.8 0.4.8 0.4.8 3.4.8 2.4.8 |
0.3.8 0.3.8 0.3.8 0.3.8 0.3.8 0.3.8 2.3.8 0.3.8 |
0.4.8 0.4.8 0.4.8 0.4.8 0.4.8 0.4.8 3.4.8 2.4.8 |
2.3.4 0.3.4 0.4.2 |
\\section Pushing
0.4.8 0.4.8 3.4.8 0.4.8 5.4.8 0.4.8 3.4.8 2.4.8 |
0.3.8 0.3.8 3.3.8 0.3.8 0.3.8 2.3.8 0.3.8 3.3.8 |
0.4.8 0.4.8 3.4.8 0.4.8 5.4.8 0.4.8 3.4.8 2.4.8 |
0.4.1 |
\\track "Keys"
\\instrument acousticgrandpiano
\\ts 4 4 e3.4 g3.4 b3.4 g3.4 |
a3.4 c4.4 e4.4 c4.4 |
e3.4 g3.4 b3.4 g3.4 |
b3.4 a3.4 e3.2 |
e3.4 g3.4 b3.4 g3.4 |
a3.4 c4.4 e4.4 c4.4 |
e3.4 g3.4 b3.4 g3.4 |
e3.1 |
${DRUMS_EIGHTHS}`;

// ---------------------------------------------------------------------------
// 6 — the fingerstyle pattern
// ---------------------------------------------------------------------------

const FINGERSTYLE = `\\title "Fingerstyle pattern in C"
\\artist "Thumb on the bass, fingers on the top three. Let every note ring."
\\tempo 68
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section TheRoll
\\ts 4 4 3.5{lr}.8 0.3{lr}.8 1.2{lr}.8 0.3{lr}.8 3.5{lr}.8 0.3{lr}.8 0.1{lr}.8 0.3{lr}.8 |
0.5{lr}.8 2.3{lr}.8 1.2{lr}.8 2.3{lr}.8 0.5{lr}.8 2.3{lr}.8 0.1{lr}.8 2.3{lr}.8 |
3.5{lr}.8 2.3{lr}.8 1.2{lr}.8 2.3{lr}.8 3.5{lr}.8 2.3{lr}.8 1.1{lr}.8 2.3{lr}.8 |
3.6{lr}.8 0.3{lr}.8 0.2{lr}.8 0.3{lr}.8 3.6{lr}.8 0.3{lr}.8 3.1{lr}.8 0.3{lr}.8 |
\\section MelodyOnTop
3.5{lr}.8 0.3{lr}.8 1.2{lr}.8 0.3{lr}.8 3.5{lr}.8 0.3{lr}.8 3.1{lr}.8 0.3{lr}.8 |
0.5{lr}.8 2.3{lr}.8 1.2{lr}.8 2.3{lr}.8 0.5{lr}.8 2.3{lr}.8 1.1{lr}.8 2.3{lr}.8 |
3.5{lr}.8 2.3{lr}.8 1.2{lr}.8 2.3{lr}.8 3.5{lr}.8 2.3{lr}.8 0.1{lr}.8 2.3{lr}.8 |
(3.5 2.4 0.3 1.2 0.1).1 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 3.3.2 3.3.2 |
0.3.2 0.3.2 |
3.4.2 3.4.2 |
5.4.2 5.4.2 |
3.3.2 3.3.2 |
0.3.2 0.3.2 |
3.4.2 3.4.2 |
3.3.1 |
${DRUMS_QUARTERS}`;

// ---------------------------------------------------------------------------
// 7 — the one piece nobody here wrote
//
// The Ode to Joy theme. Beethoven died in 1827, so it is public domain in
// every country there is — life plus seventy is the longest term anywhere and
// this is life plus a hundred and ninety-odd. Eight bars, the melody only,
// in C so it sits in first position, written out from the tune as it is
// universally known:
//
//   E E F G | G F E D | C C D E | E. D D |
//   E E F G | G F E D | C C D E | D. C C |
//
// The two dotted bars are the whole character of it and are the reason this
// is the public-domain piece on the shelf rather than something squarer: a
// player who can hold that dotted quarter while the band goes past is doing
// the thing Songs is for.
// ---------------------------------------------------------------------------

const ODE = `\\title "Ode to Joy (Beethoven)"
\\artist "A tune everybody knows, so you can hear when your timing slips."
\\tempo 96
.
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\section FirstTime
\\ts 4 4 5.2.4 5.2.4 6.2.4 3.1.4 |
3.1.4 6.2.4 5.2.4 3.2.4 |
1.2.4 1.2.4 3.2.4 5.2.4 |
5.2.4{d} 3.2.8 3.2.2 |
\\section TheAnswer
5.2.4 5.2.4 6.2.4 3.1.4 |
3.1.4 6.2.4 5.2.4 3.2.4 |
1.2.4 1.2.4 3.2.4 5.2.4 |
3.2.4{d} 1.2.8 1.2.2 |
\\track "Bass"
\\tuning g2 d2 a1 e1
\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
3.3.4 3.3.4 3.3.4 3.3.4 |
3.4.4 3.4.4 3.3.4 3.3.4 |
3.3.4 3.3.4 3.3.4 3.3.4 |
3.4.4 3.4.4 3.4.4 3.4.4 |
3.3.4 3.3.4 0.3.4 0.3.4 |
3.4.4 3.4.4 3.3.2 |
${DRUMS_QUARTERS}`;

/**
 * The shelf, in the order it is seeded.
 *
 * Seeded oldest-first so that the last one in this list is the one at the top
 * of the library on a fresh install — the library sorts by what was last
 * opened, falling back to when it arrived. Ode to Joy is last on purpose: of
 * the seven it is the one somebody will recognise, and recognising something
 * is the fastest way to understand what a mode is for.
 */
export const STARTER_SHELF: StarterPiece[] = [
  { fileName: "Picking study in A minor.alphatex", trackIndex: 0, tex: PICKING },
  { fileName: "Legato run in A minor.alphatex", trackIndex: 0, tex: LEGATO },
  { fileName: "Bending phrase in G minor.alphatex", trackIndex: 0, tex: BENDING },
  { fileName: "Blues lick in A.alphatex", trackIndex: 0, tex: BLUES },
  { fileName: "Fingerstyle pattern in C.alphatex", trackIndex: 0, tex: FINGERSTYLE },
  { fileName: "Bass groove in E.alphatex", trackIndex: 0, tex: BASS_GROOVE },
  { fileName: "Ode to Joy.alphatex", trackIndex: 0, tex: ODE },
];
