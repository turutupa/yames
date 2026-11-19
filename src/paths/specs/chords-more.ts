/**
 * Chords in a Key: the second round of consolidation Steps (2026-11-19).
 * Drafts, like the Path they belong to.
 *
 * Chords in a Key is meant to be long (`plans/paths/NEW_PATHS.md`, "How long
 * each Path is"). These Steps take what the first version taught once and give
 * it to more keys (A in full, the four-chord song by number, E minor), add a
 * sixteen-bar form, the three chords songs borrow most, and the seventh chords
 * of the key, which is where Arpeggios over Changes picks up. Every id is new,
 * so nobody's progress moves.
 */
import type { StepSpec } from "../spec";
import { ladder, shiftFrets } from "../templates";
import { ROCK, bars, fingered, inKeys, mid, named, top } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and chord names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

// The chords of C major on the top three strings, as the Path names them.
const C_LOW = top(5, 5, 3);
const C_MID = top(9, 8, 8);
const DM_LOW = top(7, 6, 5);
const EM_LOW = top(4, 5, 3);
const EM_MID = top(9, 8, 7);
const F_LOW = top(5, 6, 5);
const F_MID = top(10, 10, 8);
const G_LOW = top(4, 3, 3);
const G_MID = top(7, 8, 7);
const AM_LOW = top(5, 5, 5);
const AM_MID = top(9, 10, 8);
const D_LOW = top(2, 3, 2);
const D_MID = top(7, 7, 5);

// --- The key of A ---------------------------------------------------------------

const A_LOW = top(6, 5, 5);
const E_LOW = top(4, 5, 4);
const FSM_LOW = top(6, 7, 5);
const BM_BAR = top(7, 7, 7);

/** Intermediate, after the key of G: a third key, in full. */
export const KEY_OF_A: StepSpec = {
  id: "key-of-a",
  title: "The key of A, in full",
  goal: "Play the seven chords of A major, its one, four and five in an eight-bar form, and its one, six, two, five.",
  why: "G moved the whole key to a new place. A does it once more, and this time you can start to notice what never changes: the pattern of major and minor, which chords are one, four and five, and how their shapes sit next to each other. A is also a key the guitar likes. Its one, four and five are A, D and E, three of the first chords most players learn, and here they are as small shapes in the middle of the neck.",
  howTo: [
    "A major has three sharps: C sharp, F sharp and G sharp. Its seven chords are A, B minor, C sharp minor, D, E, F sharp minor and G sharp diminished.",
    "One, four and five are A, D and E. Two, three and six are B minor, C sharp minor and F sharp minor.",
    "Between frets 4 and 7, on the G, B and top strings: A is 6, 5, 5. D is 7, 7, 5. E is 4, 5, 4. F sharp minor is 6, 7, 5. B minor is 7, 7, 7.",
  ],
  payoff: "Three keys you know by number: C, G and A.",
  exercises: [
    {
      id: "seven-in-a",
      title: "The seven chords of A",
      purpose: "Eight bars: a chord on every note of the A major scale, root lowest. The first four are on the D, G and B strings and the last four on the top three.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "Bars 1 to 4, D, G and B strings, D string first: A is 7, 6, 5. B minor is 9, 7, 7. C sharp minor is 11, 9, 9. D is 12, 11, 10.",
        "Bars 5 to 8, top three strings, G string first: E is 9, 9, 7. F sharp minor is 11, 10, 9. G sharp diminished is 13, 12, 10. A is 14, 14, 12.",
        "Say the pattern: major, minor, minor, major, major, minor, diminished, major.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(mid(7, 6, 5), mid(9, 7, 7), mid(11, 9, 9), mid(12, 11, 10), top(9, 9, 7), top(11, 10, 9), top(13, 12, 10), top(14, 14, 12)),
      position: 5,
      shifts: true,
      chords: "A | Bm | C#m | D | E | F#m | G#dim | A",
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 7,
    },
    {
      id: "one-four-five-a",
      title: "One, four, five in A",
      purpose: "The eight-bar form with A, D and E between frets 4 and 7: one, one, four, four, five, four, one, one.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "On the G, B and top strings: A is 6, 5, 5. D is 7, 7, 5. E is 4, 5, 4. Follow the form: A, A, D, D, E, D, A, A.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(A_LOW, A_LOW, D_MID, D_MID, E_LOW, D_MID, A_LOW, A_LOW),
      position: 5,
      shifts: true,
      chords: "A | A | D | D | E | D | A | A",
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "one-six-two-five-a",
      title: "One, six, two, five in A",
      purpose: "A, F sharp minor, B minor, E between frets 4 and 7. Between A and F sharp minor only one note moves.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "A is 6, 5, 5. F sharp minor is 6, 7, 5. B minor is the first finger across fret 7. E is 4, 5, 4.",
        "Say the numbers: one, six, two, five.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(A_LOW, FSM_LOW, BM_BAR, E_LOW),
      position: 5,
      shifts: true,
      chords: "A | F#m | Bm | E",
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- One, five, six, four ---------------------------------------------------------

const ONE_FIVE_SIX_FOUR = bars(C_LOW, G_LOW, AM_LOW, F_LOW);
/** C held so that, after E minor at 4, 5, 3, only the second finger moves: one fret up the G string. */
const C_AFTER_EM_LOW = fingered(C_LOW, [2, 3, 1]);

/** Intermediate, after the key of A: the most-used progression, by number, in the guitar's keys. */
export const FOUR_CHORD_SONGS: StepSpec = {
  id: "four-chord-songs",
  title: "One, five, six, four",
  goal: "Play one, five, six, four in G and in A, the same four chords in the order one, six, four, five, and one, five, six, four in keys that change.",
  why: "If one progression had to stand for the popular music of the last sixty years, it would be one, five, six, four. In C it is C, G, A minor, F: the eight-bar song in Triads. Start the same loop on its third chord and it is six, four, one, five, which you have played too. Put the chords in the order one, six, four, five and you have the sound of the nineteen-fifties. The same four chords every time. Knowing them by number, in the keys guitarists use most, means you can play along with a few hundred songs after hearing four bars.",
  howTo: [
    "In G, one, five, six, four is G, D, E minor, C. In A it is A, E, F sharp minor, D.",
    "In G, low on the neck, on the G, B and top strings: G is 4, 3, 3. D is 2, 3, 2. E minor is 4, 5, 3. C is 5, 5, 3.",
    "When you hear a song, listen for the bass note. If it goes home, up to the fifth, up one more step and down to the fourth, it is this.",
  ],
  payoff: "The most-used progression in popular music, by number, in five keys.",
  exercises: [
    {
      id: "one-five-six-four-g",
      title: "One, five, six, four in G",
      purpose: "G, D, E minor, C between frets 2 and 5. Every chord is within two frets of the last.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "G is 4, 3, 3. D is 2, 3, 2. E minor is 4, 5, 3. C is 5, 5, 3.",
        "From E minor to C only the second finger moves, one fret up the G string. Hold C with the second, third and first fingers here.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(G_LOW, D_LOW, EM_LOW, C_AFTER_EM_LOW),
      position: 3,
      shifts: true,
      chords: "G | D | Em | C",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-five-six-four-a",
      title: "One, five, six, four in A",
      purpose: "A, E, F sharp minor, D between frets 4 and 7: the same four shapes two frets higher. A new key costs nothing but a move of the hand.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "A is 6, 5, 5. E is 4, 5, 4. F sharp minor is 6, 7, 5. D is 7, 7, 5.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(A_LOW, E_LOW, FSM_LOW, D_MID),
      position: 5,
      shifts: true,
      chords: "A | E | F#m | D",
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-six-four-five-g",
      title: "One, six, four, five in G",
      purpose: "The same four chords of G in the older order: G, E minor, C, D. The top string holds one note, G, for three bars, and steps up to A on the D chord.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "G is 4, 3, 3. E minor is 4, 5, 3. C is 5, 5, 3. D is 7, 7, 5.",
        "Between G and E minor one note moves, and between E minor and C one note moves: the second finger slides one fret up the G string. Hold C with the second, third and first fingers, and move that shape up two frets for D.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(G_LOW, EM_LOW, C_AFTER_EM_LOW, fingered(D_MID, [2, 3, 1])),
      position: 3,
      shifts: true,
      chords: "G | Em | C | D",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-five-six-four-keys",
      title: "One, five, six, four in a new key",
      purpose: "The shapes of C, G, A minor and F around fret 5, moved along the neck. In D the chords are D, A, B minor and G; in E they are E, B, C sharp minor and A; in F they are F, C, D minor and B flat.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "In D: G string 7, B string 7, top string 5; then 6, 5, 5; then 7, 7, 7; then 7, 8, 7.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(ONE_FIVE_SIX_FOUR, "C | G | Am | F", { D: 2, E: 4, F: 5 }),
      tab: shiftFrets(ONE_FIVE_SIX_FOUR, 2),
      position: 5,
      shifts: true,
      chords: "D | A | Bm | G",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- E minor ---------------------------------------------------------------------

/** C held so only the first finger moves when it follows E minor at fret 9. */
const C_AFTER_EM = fingered(C_MID, [3, 2, 1]);

/** Intermediate, after the minor key: the minor key in a second key. */
export const MINOR_KEY_E: StepSpec = {
  id: "minor-key-e",
  title: "The minor key again: E minor",
  goal: "Play the main chords of E minor, walk down from home to a major fifth chord, and hear G major and E minor as two homes for one set of chords.",
  why: "A minor was the relative minor of C. Every major key has one, on its sixth note, and E minor is G's: the same seven chords as the key of G, with E minor as home. Going through the minor key a second time, with chords you already know from the other side, is what turns it from a list into a pattern. One, four and five are minor. Six and seven are the two major chords just below home. And five is often made major so that it pulls harder.",
  howTo: [
    "In the key of E minor, one is E minor, four is A minor, and five is B minor or B major. Six and seven are C and D.",
    "Around fret 8, on the G, B and top strings: E minor is 9, 8, 7. A minor is 9, 10, 8. B minor is the first finger across fret 7. C is 9, 8, 8. D is 11, 10, 10.",
    "B major is B, D sharp, F sharp: 4, 4, 2. The D sharp is one fret below E, and that is the pull.",
  ],
  payoff: "The minor key in two keys, and the same chords heard from two homes.",
  exercises: [
    {
      id: "e-minor-one-four-five",
      title: "E minor, A minor, B minor",
      purpose: "One, four and five of the minor key, all minor chords, between frets 7 and 10. From E minor to A minor the note on the G string does not change: it is E.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, and E minor again to finish.",
        "E minor is 9, 8, 7. A minor is 9, 10, 8. B minor is the first finger across fret 7.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(EM_MID, AM_MID, BM_BAR, EM_MID),
      position: 7,
      shifts: true,
      chords: "Em | Am | Bm | Em",
      jam: ROCK("E minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "e-minor-six-seven",
      title: "E minor, C, D",
      purpose: "Home, then the two major chords just below it, and home again. One, six, seven, one in the minor key.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "E minor is 9, 8, 7. C is 9, 8, 8. D is 11, 10, 10. E minor again.",
        "From E minor to C only the first finger moves, from fret 7 to fret 8 on the top string: B becomes C. Keep the third and second fingers down.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(EM_MID, C_AFTER_EM, top(11, 10, 10), EM_MID),
      position: 7,
      shifts: true,
      chords: "Em | C | D | Em",
      jam: ROCK("E minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "down-to-b",
      title: "E minor, D, C, B",
      purpose: "The walk down from home to the fifth chord, played as B major. Each shape sits lower than the last, and the B major pulls you back to the top.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "E minor is 9, 8, 7. D is 7, 7, 5. C is 5, 5, 3. B major is 4, 4, 2.",
        "D, C and B are the same shape, two frets and then one fret lower each time. Say the numbers: one, seven, six, five.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(EM_MID, D_MID, C_LOW, top(4, 4, 2)),
      position: 7,
      shifts: true,
      chords: "Em | D | C | B",
      jam: ROCK("E minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "two-homes",
      title: "One set of chords, two homes",
      purpose: "Eight bars from the same four chords. Bars 1 to 4 start on G and sound major: G, D, E minor, C. Bars 5 to 8 start on E minor, higher on the neck, and sound minor: E minor, C, G, D.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "Bars 1 to 4, between frets 2 and 5: G is 4, 3, 3. D is 2, 3, 2. E minor is 4, 5, 3. C is 5, 5, 3.",
        "Bars 5 to 8, between frets 5 and 9: E minor is 9, 8, 7. C is 9, 8, 8. G is 7, 8, 7. D is 7, 7, 5.",
        "The same four chords in both halves. Which one the phrase starts and rests on decides whether you hear G major or E minor.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(G_LOW, D_LOW, EM_LOW, C_AFTER_EM_LOW, EM_MID, C_AFTER_EM, G_MID, D_MID),
      position: 3,
      shifts: true,
      chords: "G | D | Em | C | Em | C | G | D",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
  ],
};

// --- Sixteen bars -----------------------------------------------------------------

const A_SECTION = [C_LOW, AM_LOW, DM_LOW, G_LOW];
const BRIDGE = [F_MID, EM_MID, DM_LOW, G_MID];
const AABA = bars(...A_SECTION, ...A_SECTION, ...BRIDGE, ...A_SECTION);
const A_CHART = "C | Am | Dm | G";
const BRIDGE_CHART = "F | Em | Dm | G";
const AABA_CHART = `${A_CHART} | ${A_CHART} | ${BRIDGE_CHART} | ${A_CHART}`;

/** Advanced, after the verse and chorus: a longer form with a bridge. */
export const SIXTEEN_BARS: StepSpec = {
  id: "sixteen-bars",
  title: "Sixteen bars: A, A, B, A",
  goal: "Play a sixteen-bar form made of one four-bar section played twice, a bridge, and the first section again, in C and in other keys, and then write a bridge of your own.",
  why: "A great many songs are built from four sections of four bars: the same section twice, something different, and the first section again. Musicians write that as AABA and call the different part the bridge. The A sections here are one, six, two, five, which you know. The bridge leaves home on purpose: it starts on four, higher on the neck, and walks down until five sends it back. The new skill is holding sixteen bars in your head and knowing which A you are in.",
  howTo: [
    "The A section, around fret 5: C is 5, 5, 3. A minor is 5, 5, 5. D minor is 7, 6, 5. G is 4, 3, 3.",
    "The bridge starts around fret 9: F is 10, 10, 8. E minor is 9, 8, 7. D minor is 7, 6, 5. G is 7, 8, 7. Four, three, two, five.",
    "Count sections, not bars: A, A again, bridge, last A.",
  ],
  payoff: "A sixteen-bar song form with a bridge, in four keys.",
  difficultyException:
    "The same shapes and note rate as the Step before, with one self-checked Exercise at the end, so the median does not rise. The demand is a form twice as long, and the metric does not count length.",
  exercises: [
    {
      id: "bridge",
      title: "The bridge: four, three, two, five",
      purpose: "F, E minor, D minor and G. The first three have the root lowest, and it walks down the G string: F at fret 10, E at fret 9, D at fret 7.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "F is 10, 10, 8. E minor is 9, 8, 7. D minor is 7, 6, 5. G is 7, 8, 7.",
        "E minor and D minor are one shape, two frets apart.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(...BRIDGE),
      position: 8,
      shifts: true,
      chords: BRIDGE_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "aaba",
      title: "A, A, bridge, A",
      purpose: "Sixteen bars over the band: one, six, two, five twice around fret 5, the bridge from fret 10 down, and one, six, two, five once more.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "Bars 1 to 8: C, A minor, D minor, G, twice. Bars 9 to 12: F, E minor, D minor, G. Bars 13 to 16: C, A minor, D minor, G.",
        "The G chord is played in two places: 4, 3, 3 at the end of each A section, and 7, 8, 7 at the end of the bridge.",
      ],
      coach: "Sixteen bars with the band. Right notes and time after the take.",
      tab: AABA,
      position: 3,
      shifts: true,
      chords: AABA_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 8,
    },
    {
      id: "aaba-keys",
      title: "The sixteen bars in a new key",
      purpose: "The whole form moved along the neck. In D the A section is D, B minor, E minor, A and the bridge is G, F sharp minor, E minor, A. It also comes in E and in B flat.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "In D, everything is two frets higher than in C: the A section starts on G string 7, B string 7, top string 5, and the bridge starts on 12, 12, 10.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(AABA, AABA_CHART, { D: 2, E: 4, Bb: -2 }, ROCK, { parts: ["the A section", "the A section", "the bridge", "the A section"] }),
      tab: shiftFrets(AABA, 2),
      position: 5,
      shifts: true,
      chords: "D | Bm | Em | A | D | Bm | Em | A | G | F#m | Em | A | D | Bm | Em | A",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 8,
    },
    {
      id: "your-bridge",
      title: "Your turn: your own bridge",
      purpose: "The same sixteen bars with a bridge you write: four bars from the chords of C, starting on a chord other than C and ending on G, so the last A section can begin.",
      howTo: [
        "Straight time, any rhythm you like, 60 to 90 BPM, sixteen bars that loop.",
        "Keep the A sections as they are. For the bridge, start on four or six, use any shapes you know, and finish on five. The written bridge is one answer.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for whether the bridge sounds like somewhere else.",
      tab: AABA,
      position: 3,
      shifts: true,
      chords: AABA_CHART,
      jam: ROCK("C"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did you know which of the four sections you were in at every moment?",
        "Did your bridge end on the fifth chord, so the last section could start on one?",
      ],
      minutes: 5,
    },
  ],
};

// --- Borrowed chords ----------------------------------------------------------------

/** F held like a small D chord turned round, so the first finger can slide back a fret for F minor. */
const F_BEFORE_FM = fingered(F_LOW, [2, 3, 1]);
const FLAT_SEVEN = bars(C_LOW, top(3, 3, 1), top(2, 1, 1), C_LOW);

/** Advanced, after the sixteen bars: three chords from outside the key. */
export const BORROWED: StepSpec = {
  id: "borrowed",
  title: "Chords from outside the key",
  goal: "Play the three chords songs most often take from outside the key, the flat seven, the major two and the minor four, and hear the one note each of them changes.",
  why: "The seven chords of a key are the ones a song can use without surprising anyone. Songs surprise people on purpose. Three outside chords turn up again and again, and each is made by changing a single note of the scale. Lower the seventh note and a major chord appears a whole step below home: in C, B flat. Raise the fourth note and the two chord turns major: D instead of D minor. Lower the sixth note and the four chord turns minor: F minor instead of F. You do not need the theory to use them. You need to know where they sit beside the chords you have.",
  howTo: [
    "The flat seven is the one chord moved two frets down, same shape. C is 5, 5, 3, so B flat is 3, 3, 1.",
    "The major two: D minor is 7, 6, 5 and D major is 7, 7, 5. The new note is F sharp, one fret under G, which is why it leans toward the five chord.",
    "The minor four: F is 5, 6, 5 and F minor is 5, 6, 4. The new note is A flat, one fret above G, and it falls to the G of a C chord.",
  ],
  payoff: "Three chords that are not in the key and belong in its songs, each found from a chord you know.",
  difficultyException:
    "Four-bar lines after a Step of sixteen-bar forms, and a self-checked Exercise at the end, so the median dips. The demand is hearing a note from outside the scale, which the metric does not count.",
  exercises: [
    {
      id: "flat-seven",
      title: "One, flat seven, four, one",
      purpose: "C, B flat, F, C. B flat is the C shape two frets lower, and F sits right under it.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "On the G, B and top strings: C is 5, 5, 3. B flat is 3, 3, 1. F is 2, 1, 1. C again.",
        "B flat is not one of the seven chords of C: its root is one fret lower than the scale's seventh note. Listen for how it loosens the key.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: FLAT_SEVEN,
      position: 3,
      shifts: true,
      chords: "C | Bb | F | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "major-two",
      title: "The two chord made major",
      purpose: "C, D major, G, C, each a shape higher than the last. The top note climbs the scale: G, A, B, C.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "C is 5, 5, 3. D major is 7, 7, 5: the C shape two frets up. G is 7, 8, 7. C is 9, 8, 8.",
        "The F sharp in the D chord, B string fret 7, moves up one fret to G in the next bar. That half step is why this D wants to go to G.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_LOW, D_MID, G_MID, C_MID),
      position: 3,
      shifts: true,
      chords: "C | D | G | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "minor-four",
      title: "The four chord turned minor",
      purpose: "C, F, F minor, C around fret 5. The top note goes G, A, A flat, G: up a step and back down by half steps.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "C is 5, 5, 3. F is 5, 6, 5. F minor is 5, 6, 4. C again.",
        "Hold F with the second finger on the G string, the third on the B string and the first on the top string. For F minor only the first finger moves, back one fret.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_LOW, F_BEFORE_FM, top(5, 6, 4), C_LOW),
      position: 3,
      shifts: true,
      chords: "C | F | Fm | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "your-borrowed",
      title: "Your turn: one chord from outside",
      purpose: "Four bars of your own in C that start and end on C and use one outside chord: B flat, D major or F minor.",
      howTo: [
        "Straight time, any rhythm you like, 60 to 90 BPM, four bars that loop.",
        "Put the outside chord in bar 2 or bar 3 and choose the other middle chord by ear. The written line, C, B flat, F, C, is one answer.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for the bar where the key bends.",
      tab: FLAT_SEVEN,
      position: 3,
      shifts: true,
      chords: "C | Bb | F | C",
      jam: ROCK("C"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Can you say which note of the outside chord is not in the C major scale?",
        "Did the four bars still sound like they were in C?",
      ],
      minutes: 4,
    },
  ],
};

// --- Seventh chords -------------------------------------------------------------------
// Four-string shapes, lowest string first. Root on the A string: A, D, G and B
// strings. Root on the low E string: E, D, G and B strings, the A string left
// out. Fingers are written so that a chord and the seventh chord made from it
// share as many as they can.

type Four = readonly [string, string, string, string];
/** Up through the four strings, back down, and the second-lowest once more. */
const roll4 = (n: Four) => `/8 ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[2]} ${n[1]} ${n[0]} ${n[1]}`;
const rolls = (...chords: Four[]) => chords.map(roll4).join(" | ");

const aMajor = (x: number): Four => [`5:${x}f1`, `4:${x + 2}f3`, `3:${x + 2}f3`, `2:${x + 2}f3`];
const aMajor7 = (x: number): Four => [`5:${x}f1`, `4:${x + 2}f3`, `3:${x + 1}f2`, `2:${x + 2}f4`];
const aMinor = (x: number): Four => [`5:${x}f1`, `4:${x + 2}f3`, `3:${x + 2}f4`, `2:${x + 1}f2`];
const aMinor7 = (x: number): Four => [`5:${x}f1`, `4:${x + 2}f3`, `3:${x}f1`, `2:${x + 1}f2`];
const aSeven = (x: number): Four => [`5:${x}f1`, `4:${x + 2}f3`, `3:${x}f1`, `2:${x + 2}f4`];
const aDiminished = (x: number): Four => [`5:${x}f1`, `4:${x + 1}f2`, `3:${x + 2}f4`, `2:${x + 1}f3`];
const aHalfDiminished = (x: number): Four => [`5:${x}f1`, `4:${x + 1}f2`, `3:${x}f1`, `2:${x + 1}f3`];
const eMajor7 = (x: number): Four => [`6:${x}f1`, `4:${x + 1}f3`, `3:${x + 1}f4`, `2:${x}f2`];
const eMinor7 = (x: number): Four => [`6:${x}f1`, `4:${x}f1`, `3:${x}f1`, `2:${x}f1`];
const eSeven = (x: number): Four => [`6:${x}f1`, `4:${x}f1`, `3:${x + 1}f2`, `2:${x}f1`];
const eHalfDiminished = (x: number): Four => [`6:${x}f2`, `4:${x}f3`, `3:${x}f4`, `2:${x - 1}f1`];

const CMAJ7 = aMajor7(3);
const DM7 = aMinor7(5);
const G7_LOW = eSeven(3);
const AM7 = eMinor7(5);
const TWO_FIVE_ONE_SEVENTHS = rolls(DM7, G7_LOW, CMAJ7, CMAJ7);
const TURN_SEVENTHS = rolls(CMAJ7, AM7, DM7, G7_LOW);
const TURN_SEVENTHS_CHART = "Cmaj7 | Am7 | Dm7 | G7";

/** Advanced, near the end: one more third on every chord of the key. */
export const SEVENTHS: StepSpec = {
  id: "sevenths",
  title: "Four notes: the seventh chords of the key",
  goal: "Add the seventh to each chord of the key, play the four kinds of chord that come out, and play all seven in order with the root on the A string and then on the low E string.",
  why: "A triad is every other note of the scale, three of them: one, three, five. Take one more, the seventh, and you have a seventh chord. Do that on each note of the C scale, using only the scale's notes, and four kinds come out. C and F become major seven chords, soft and open. D minor, E minor and A minor become minor seven, smoother than plain minor. G becomes G seven, the one restless chord of the key, which is why five leads home. B becomes B half-diminished: the diminished triad with a seventh on top. Once again you did not choose. The scale did. These are four-string shapes with the root on the A string or the low E string, and they are the chords of soul, bossa nova, jazz and a good deal of pop.",
  howTo: [
    "The pattern, to say until it is automatic: major seven, minor seven, minor seven, major seven, seven, minor seven, half-diminished.",
    "Root on the A string, then the D, G and B strings. C major seven: 3, 5, 4, 5. D minor seven: 5, 7, 5, 6. G seven: 10, 12, 10, 12. B half-diminished, written Bm7b5: 2, 3, 2, 3.",
    "Root on the low E string, leave out the A string, then the D, G and B strings. G seven: 3, 3, 4, 3. A minor seven: the first finger across fret 5. C major seven: 8, 9, 9, 8.",
    "Each bar goes up through the four strings, back down, and plays the second-lowest string of the shape once more.",
  ],
  payoff: "The four kinds of seventh chord a key contains, and all seven of them in order.",
  difficultyException:
    "Three of the four Exercises have no band and change only one note between chords, so the metric reads them as easier than the Step before. The demand is new four-string shapes and a fourth chord note.",
  exercises: [
    {
      id: "major-seven",
      title: "C and F become major seven",
      purpose: "C, then C major seven; F, then F major seven. In each pair one note moves: the root on the G string drops one fret and becomes the seventh.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each chord: up through the four strings, back down, and the D string once more.",
        "C: A string 3, then the third finger laid flat across fret 5 on the D, G and B strings. C major seven: A string 3, D string 5, G string 4, B string 5. The third finger stays on the D string, the second finger takes the G string and the fourth takes the B string.",
        "F and F major seven are the same two shapes five frets higher: A string 8 with fret 10 above it, and then 8, 10, 9, 10.",
      ],
      coach: "Right notes and even eighths after the take. Listen to what the one fret does.",
      tab: rolls(aMajor(3), aMajor7(3), aMajor(8), aMajor7(8)),
      position: 3,
      shifts: true,
      chords: "C | Cmaj7 | F | Fmaj7",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "minor-seven",
      title: "D minor and E minor become minor seven",
      purpose: "D minor, then D minor seven; E minor, then E minor seven. In each pair the root on the G string drops two frets and becomes the seventh.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each chord: up through the four strings, back down, and the D string once more.",
        "D minor: A string 5, D string 7, G string 7, B string 6. D minor seven: 5, 7, 5, 6. Lift the fourth finger, and let the first finger lie flat so it holds the G string at fret 5 as well.",
        "E minor and E minor seven are the same two shapes two frets higher: 7, 9, 9, 8 and then 7, 9, 7, 8.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: rolls(aMinor(5), aMinor7(5), aMinor(7), aMinor7(7)),
      position: 5,
      shifts: true,
      chords: "Dm | Dm7 | Em | Em7",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "seven-and-half-diminished",
      title: "G seven and B half-diminished",
      purpose: "The two kinds that appear once each in a key. G, then G seven: the chord that pulls home. B diminished, then B half-diminished.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each chord: up through the four strings, back down, and the D string once more.",
        "G: A string 10, then the third finger across fret 12 on the D, G and B strings. G seven: 10, 12, 10, 12. The first finger lies flat and takes the G string at fret 10, and the fourth finger takes the B string.",
        "B diminished: A string 2, D string 3, G string 4, B string 3. B half-diminished: 2, 3, 2, 3. Lift the fourth finger and the first finger, lying flat, takes the G string at fret 2.",
        "It is a long move from fret 10 down to fret 2 between bars 2 and 3. Look at the second fret before you leave.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: rolls(aMajor(10), aSeven(10), aDiminished(2), aHalfDiminished(2)),
      position: 10,
      shifts: true,
      chords: "G | G7 | Bdim | Bm7b5",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "seven-sevenths",
      title: "All seven, with their sevenths",
      purpose: "Eight bars: a seventh chord on every note of the scale. The first four have their root on the A string, the last four on the low E string, at the same four frets.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "Bars 1 to 4, root on the A string at frets 3, 5, 7 and 8: C major seven is 3, 5, 4, 5. D minor seven is 5, 7, 5, 6. E minor seven is 7, 9, 7, 8. F major seven is 8, 10, 9, 10.",
        "Bars 5 to 8, root on the low E string at frets 3, 5, 7 and 8, with the A string left out: G seven is 3, 3, 4, 3. A minor seven is 5, 5, 5, 5. B half-diminished is 7, 7, 7, 6. C major seven is 8, 9, 9, 8.",
        "The roots spell the scale: C, D, E, F on the A string, then G, A, B, C on the low E string.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: rolls(aMajor7(3), aMinor7(5), aMinor7(7), aMajor7(8), eSeven(3), eMinor7(5), eHalfDiminished(7), eMajor7(8)),
      position: 3,
      shifts: true,
      chords: "Cmaj7 | Dm7 | Em7 | Fmaj7 | G7 | Am7 | Bm7b5 | Cmaj7",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 7,
    },
  ],
};

/** Advanced, last: the progressions the player knows, in seventh chords. */
export const SEVENTHS_IN_SONGS: StepSpec = {
  id: "sevenths-in-songs",
  title: "Sevenths in the progressions you know",
  goal: "Play two, five, one and one, six, two, five in seventh chords, move them to other keys, and then play them as whole chords in your own rhythm.",
  why: "Nothing about a progression changes when its chords gain a seventh: two, five, one is still two, five, one. What changes is the colour, and how smoothly one chord hands over to the next, because with four notes there is nearly always one that stays. These chords, in these shapes, are the first thing a player learns when they start on jazz or bossa nova. They are also the doorway to the next Path, Arpeggios over Changes, which plays the same chords one note at a time as a melody.",
  howTo: [
    "Two, five, one: D minor seven with its root on the A string at fret 5, G seven with its root on the low E string at fret 3, C major seven with its root on the A string at fret 3. The roots go D, G, C.",
    "One, six, two, five: C major seven, A minor seven with its root on the low E string at fret 5, D minor seven, G seven.",
    "The roots swap between the two lowest strings, and the hand stays between frets 3 and 7.",
  ],
  payoff: "The two most-used progressions of jazz and soul in seventh chords, in four keys.",
  exercises: [
    {
      id: "two-five-one-sevenths",
      title: "Two, five, one in sevenths",
      purpose: "D minor seven, G seven, and two bars of C major seven between frets 3 and 7. The note on the B string falls from F to D and then rises to E.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "D minor seven: A string 5, D string 7, G string 5, B string 6. G seven: low E string 3, D string 3, G string 4, B string 3. C major seven: A string 3, D string 5, G string 4, B string 5.",
        "In G seven the low E string is followed by the D string: the pick skips the A string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TWO_FIVE_ONE_SEVENTHS,
      position: 3,
      shifts: true,
      chords: "Dm7 | G7 | Cmaj7 | Cmaj7",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-six-two-five-sevenths",
      title: "One, six, two, five in sevenths",
      purpose: "C major seven, A minor seven, D minor seven, G seven: the turn you know, with four notes in every chord.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "C major seven: A string 3, D string 5, G string 4, B string 5. A minor seven: the first finger across fret 5, played on the low E, D, G and B strings. D minor seven: 5, 7, 5, 6 from the A string. G seven: 3, 3, 4, 3 from the low E string.",
        "The first finger stays across fret 5 from A minor seven into D minor seven.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TURN_SEVENTHS,
      position: 3,
      shifts: true,
      chords: TURN_SEVENTHS_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "sevenths-keys",
      title: "The turn in sevenths, in a new key",
      purpose: "One, six, two, five in seventh chords, moved along the neck. In D the chords are D major seven, B minor seven, E minor seven and A seven; in B flat they are B flat major seven, G minor seven, C minor seven and F seven; in F they are F major seven, D minor seven, G minor seven and C seven.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "In D: D major seven is A string 5, D string 7, G string 6, B string 7. B minor seven is the first finger across fret 7, from the low E string. E minor seven is 7, 9, 7, 8 from the A string. A seven is 5, 5, 6, 5 from the low E string.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(TURN_SEVENTHS, TURN_SEVENTHS_CHART, { D: 2, Bb: -2, F: 5 }),
      tab: shiftFrets(TURN_SEVENTHS, 2),
      position: 5,
      shifts: true,
      chords: "Dmaj7 | Bm7 | Em7 | A7",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "your-sevenths",
      title: "Your turn: play them as chords",
      purpose: "One, six, two, five in sevenths as whole chords: all four strings of each shape sounded together, in a rhythm of your own.",
      howTo: [
        "Straight time, any rhythm you like, 60 to 90 BPM, four bars that loop.",
        "Pluck the four strings together with the thumb and three fingers. If you strum instead, the strings that are not part of the shape have to stay quiet: let the fingers that are down lean on them lightly. Try one chord on beat 1 and one on the 'and' of 2. The written line is the same four shapes, one note at a time.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for all four notes of each chord.",
      tab: TURN_SEVENTHS,
      position: 3,
      shifts: true,
      chords: TURN_SEVENTHS_CHART,
      jam: ROCK("C"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did all four notes of each chord sound, with no dead string?",
        "Did you change chord with the band every bar?",
      ],
      minutes: 4,
    },
  ],
};
