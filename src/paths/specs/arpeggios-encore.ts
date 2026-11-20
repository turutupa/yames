/**
 * Arpeggios over Changes: three more consolidation Steps (2026-11-19, second
 * round). Drafts, like the Path they belong to.
 *
 * The Beginner Level met each idea once, in C, and the Intermediate Level
 * then added sevenths and two octaves together. These Steps let the first
 * ideas settle: the one-octave arpeggios and the four-chord line in a second
 * key (G), the nearest-note line in a new order and in that key, and the
 * seventh arpeggios and the two, five, one line in G before two octaves
 * arrive. Nothing here is new for the hand: the shapes, the fingers and the
 * tempos are the ones the Steps around them use. Every id is new, so nobody's
 * progress moves.
 */
import type { StepSpec } from "../spec";
import { handAt, ladder, shiftFrets } from "../templates";
import { ROCK, inKeys, named } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and chord names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

// ---------------------------------------------------------------------------
// The Path's one-octave shapes, copied (a Path and its extra Steps cannot
// import each other). Root on the D string, one note a string. Major is frets
// x, x-1, x-2, x-2; minor is x, x-2, x-2, x-2; the sevenths lower the top note.
// ---------------------------------------------------------------------------

type Four = readonly [string, string, string, string];
const maj = (x: number): Four => [`4:${x}f3`, `3:${x - 1}f2`, `2:${x - 2}f1`, `1:${x - 2}f1`];
const min = (x: number): Four => [`4:${x}f3`, `3:${x - 2}f1`, `2:${x - 2}f1`, `1:${x - 2}f1`];
const maj7 = (x: number): Four => [`4:${x}f4`, `3:${x - 1}f3`, `2:${x - 2}f2`, `1:${x - 3}f1`];
const min7 = (x: number): Four => [`4:${x}f4`, `3:${x - 2}f2`, `2:${x - 2}f3`, `1:${x - 4}f1`];
const dom7 = (x: number): Four => [`4:${x}f4`, `3:${x - 1}f3`, `2:${x - 2}f2`, `1:${x - 4}f1`];

const up = (a: Four) => `/4 ${a.join(" ")}`;
const down = (a: Four) => `/4 ${[...a].reverse().join(" ")}`;
const upDown = (a: Four) => `/8 ${a[0]} ${a[1]} ${a[2]} ${a[3]} ${a[2]} ${a[1]} ${a[0]} ${a[1]}`;

// --- One, six, four, five in G ---------------------------------------------------

const G = maj(5);
const EM = min(14);
const C = maj(10);
const D = maj(12);
const G_CHART = "G | Em | C | D";

/** Beginner, after the four chords of C: the same Step in the key of G. */
export const FOUR_CHORDS_IN_G: StepSpec = {
  id: "four-chords-in-g",
  title: "The four chords of a second key",
  goal: "Find the roots of G, E minor, C and D on the D string by name, and play each chord's arpeggio from its root over a band in the key of G.",
  why: "Four arpeggios in one key can be learned as four places on the neck. A second key shows what you really have: two shapes, and a way to find any root by its name. In G the numbers are the same and the names change: one is G, six is E minor, four is C, five is D. Nothing is new for the fingers. The major shape and the minor shape are the ones you used in C, and each goes where its root is. What is new is the distance: nine frets between G and E minor, where the key of C never asked for more than five.",
  howTo: [
    "Roots on the D string: G is fret 5, E is fret 14, C is fret 10, D is fret 12.",
    "E is at fret 2 as well. The minor shape puts its other three notes two frets below its root, and from fret 2 those would be open strings, which ring on after you play them. So E minor starts from the E at fret 14, twelve frets higher. Fret 14 is high: on many acoustic guitars it is where the neck meets the body, or just past it. Drop the thumb low behind the neck so the fingers can reach.",
    "G, C and D use the major shape: 5, 4, 3, 3 for G, 10, 9, 8, 8 for C, 12, 11, 10, 10 for D. E minor uses the minor shape: 14, 12, 12, 12. The D string's fret is given first each time.",
    "From G to E minor the hand moves nine frets up the neck, and from D back to G seven frets down. Look at the fret you are going to before you leave.",
  ],
  payoff: "One, six, four, five as arpeggios in two keys, from the same two shapes.",
  exercises: [
    {
      id: "roots-by-name",
      title: "The four roots in G",
      purpose: "Only the roots, two to a bar: G, E, C and D on the D string, so the hand knows the four places before the notes above arrive.",
      howTo: [
        "Half notes, 60 BPM up to a pass at 90. D string, third finger: fret 5, fret 14, fret 10, fret 12.",
        "Find them by name. C at fret 10 you know. D is two frets above C, at fret 12, and E is two frets above D, at fret 14. G at fret 5 was the five chord in the key of C.",
        "Say the chord's name as you land on it: G, E minor, C, D.",
      ],
      coach: "Band on. Eight notes, each the right root, each on time.",
      tab: `/2 4:5f3 4:5f3 | 4:14f3 4:14f3 | 4:10f3 4:10f3 | 4:12f3 4:12f3`,
      position: 3,
      shifts: true,
      chords: G_CHART,
      jam: ROCK("G"),
      harmony: { chordTones: true, cover: false },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 4,
    },
    {
      id: "up-and-down",
      title: "Up and down in G",
      purpose: "Quarter notes: G going up, E minor coming down, C going up, D coming down. Each bar starts on the string where the last one ended; only the hand moves along it.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "G up: D string 5, G string 4, B string 3, top string 3. E minor down: fret 12 on the top, B and G strings, then D string 14. C up: 10, 9, 8, 8. D down: top string 10, B string 10, G string 11, D string 12.",
        "The long moves: nine frets up the top string from G to E minor, and seven frets down the D string from D back to G. Let the last note of the bar be short and move the hand in that gap.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: `${up(G)} | ${down(EM)} | ${up(C)} | ${down(D)}`,
      position: 3,
      shifts: true,
      chords: G_CHART,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "g-and-e-minor",
      title: "G and E minor, in eighths",
      purpose: "The major shape on G and the minor shape on E minor over the band, a bar each, up to the top string and back. Between the two is the long move of this key: nine frets.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. One bar on each chord: G, E minor, G, E minor.",
        "G: D string 5 (third finger), G string 4 (second), B string 3 and top string 3 (first finger, rolled). E minor: D string 14 (third finger), then fret 12 on the G, B and top strings, all with the first finger rolled across.",
        "Each bar goes up the four strings, back down to the root on the D string, and adds one more note on the G string. Cut that last note short and move the hand in the gap, so the next root lands on the click.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: [G, EM, G, EM].map(upDown).join(" | "),
      position: 3,
      shifts: true,
      chords: "G | Em | G | Em",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "four-arpeggios",
      title: "Four chords in G, in eighths",
      purpose: "Each chord up to the top string and back, one bar each, with the band: one, six, four, five in the key of G.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. One bar on each chord.",
        "G from fret 5 on the D string, E minor from fret 14, C from fret 10, D from fret 12. Each bar ends with one extra note on the G string: use it to look at where the next root is.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: [G, EM, C, D].map(upDown).join(" | "),
      position: 3,
      shifts: true,
      chords: G_CHART,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- The nearest note, in a new order and a new key ------------------------------

// One, five, six, four in C: up C from its fifth, down G, up A minor, down F.
const NEW_ORDER = `/4 4:5f3 3:5f3 2:5f4 1:3f1 | 1:3f1 2:3f1 3:4f2 4:5f3 | 4:7f3 3:5f1 2:5f1 1:5f1 | 1:5f1 2:6f2 3:5f1 4:7f3`;
// One, six, four, five in G, under one hand: the notes of the Path's joined line in C, a fourth lower.
const G_LINE = `/4 4:5f3 3:4f2 2:3f1 1:3f1 | 1:3f1 2:5f4 3:4f2 4:5f3 | 4:5f3 3:5f3 2:5f4 1:3f1 | 1:2f1 2:3f2 3:2f1 4:4f3`;
// One, five, six, four in G: the new order, seven frets up.
const NEW_ORDER_IN_G = shiftFrets(NEW_ORDER, 7);

/** Beginner, after the nearest-note line: the same idea in another order and another key. */
export const NEAREST_NOTE_AGAIN: StepSpec = {
  id: "nearest-note-again",
  title: "Nearest notes in a new order and a new key",
  goal: "Play C, G, A minor and F as one line with no jump, then play the chords of G as one line in both orders.",
  why: "The line in the last Step can be learned as sixteen frets in a row. Change the order of the chords, or the key, and those frets are no use. What carries over is the question you ask at each bar line: which note of the next chord is closest to where the line is now. Asking it in a new order and in a new key is what turns one line you know into a habit.",
  howTo: [
    "A new order puts different chords next to each other, so the question has to be asked again at each change. C and G share G. G and A minor share none, so there the line moves two frets. A minor and F still share A and C.",
    "In G the same question has new answers. G and E minor share G and B. E minor and C share E and G. C and D share none, and D and G share D.",
    "Where the line stays on a note across a bar line, play it twice: once as the last note of one chord and once as the first note of the next.",
  ],
  payoff: "Three more four-bar lines with no jump in them, in two keys and two orders.",
  exercises: [
    {
      id: "new-order",
      title: "One, five, six, four as one line",
      purpose: "C, G, A minor and F: the four chords you know, in a new order. Up through C, down through G, up through A minor, down through F, and no change moves the line more than two frets.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Bar 1, C, starts on G: D string 5, G string 5, B string 5, top string 3: G, C, E, G. Bar 2, G, comes down from that same G: top string 3, B string 3, G string 4, D string 5.",
        "Bar 3, A minor: D string 7, then fret 5 on the G, B and top strings. Bar 4, F: top string 5, B string 6, G string 5, D string 7: A, F, C, A.",
        "The G on the top string is played twice, as the fifth of C and as the root of G. The A on the top string is played twice as well, as the root of A minor and as the third of F. On the D string the line moves two frets: G up to A, and A back down to G for the repeat.",
        "Fingers: the third finger plays every note on the D string. In bar 1 it rolls from the D string onto the G string, the way the first finger rolls in the A minor shape, and the fourth finger takes the B string and the first the top string at fret 3. Bars 2 and 3 are the G and A minor shapes with their usual fingers. In bar 4 the first finger stays flat across fret 5 and the second takes the F at fret 6 on the B string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: NEW_ORDER,
      position: 3,
      shifts: true,
      chords: "C | G | Am | F",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "line-in-g",
      title: "Four chords, one line, in G",
      purpose: "G up, E minor down, C up, D down, each starting on the nearest note of its chord. The note G is in the first three chords, and the line turns round on a G at the end of each of those bars: twice it plays the G again, and into D it steps down one fret to F sharp.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Bar 1, G: D string 5, G string 4, B string 3, top string 3. Bar 2, E minor: top string 3, B string 5, G string 4, D string 5: G, E, B, G.",
        "Bar 3, C: D string 5, G string 5, B string 5, top string 3: G, C, E, G. Bar 4, D: top string 2, B string 3, G string 2, D string 4: F sharp, D, A, F sharp.",
        "The whole line sits between frets 2 and 5. The last note, F sharp on the D string, is one fret below the G the line starts on.",
        "Fingers for bars 1 to 3: first finger at fret 3, second at fret 4, third at fret 5 on the D and G strings, fourth at fret 5 on the B string. For bar 4 the hand moves back one fret: first finger at fret 2, second at fret 3, third at fret 4.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: G_LINE,
      position: 3,
      shifts: true,
      chords: G_CHART,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "new-order-in-g",
      title: "One, five, six, four in G",
      purpose: "G, D, E minor and C: the new order in the new key. Up through G, down through D, up through E minor, down through C. It is the line from the first Exercise of this Step, seven frets higher.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Bar 1, G, starts on D: D string 12, G string 12, B string 12, top string 10: D, G, B, D. Bar 2, D, comes down from that same D: top string 10, B string 10, G string 11, D string 12.",
        "Bar 3, E minor: D string 14, then fret 12 on the G, B and top strings. Bar 4, C: top string 12, B string 13, G string 12, D string 14: E, C, G, E.",
        "Bars 2 and 3 are the D and E minor shapes you played from their roots in the key of G: D coming down, E minor going up.",
        "Fingers as in the first Exercise of this Step. In bar 1 the third finger plays the D string and rolls onto the G string at fret 12, the fourth finger takes the B string and the first the top string at fret 10. In bar 4 the first finger stays flat across fret 12 and the second takes the C at fret 13 on the B string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: NEW_ORDER_IN_G,
      position: 10,
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
      id: "your-line-in-g",
      title: "Your turn: no jumps, in G",
      purpose: "G, E minor, C and D with chord notes of your own choosing, one rule: at each change, move to a note of the new chord that is no more than two frets or one string away.",
      howTo: [
        "Quarter notes or any rhythm you like, 60 to 90 BPM, four bars that loop.",
        "Use only the three notes of each chord. G: G, B, D. E minor: E, G, B. C: C, E, G. D: D, F sharp, A. The written line is one answer.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for any place where the line leaps.",
      tab: G_LINE,
      position: 3,
      shifts: true,
      chords: G_CHART,
      jam: ROCK("G"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Was every note one of the three notes of the chord the band was on?",
        "Did you get through every change without a jump?",
      ],
      minutes: 4,
    },
  ],
};

// --- Sevenths in G -------------------------------------------------------------------

const GMAJ7 = maj7(5);
const EM7 = min7(14);
const AM7 = min7(7);
const D7 = dom7(12);
// The Path's two, five, one line in C, copied, for the key-moved Exercise.
const TWO_FIVE_ONE = `/8 4:12 3:10 2:10 1:8 1:10 1:8 2:10 3:10 | 3:7 2:6 2:8 1:7 1:10 1:7 2:8 2:6 | 2:5 2:8 1:7 1:8 1:7 2:8 2:5 3:4 | /1 3:5`;
const TWO_FIVE_ONE_CHART = "Dm7 | G7 | Cmaj7 | Cmaj7";
// The same line in G, a fourth lower, set where the hand can stay between frets 2 and 7.
const TWO_FIVE_ONE_IN_G = `/8 4:7f4 3:5f2 2:5f3 1:3f1 1:5f3 1:3f1 2:5f3 3:5f2 | 4:7f3 3:5f1 3:7f3 2:7f4 1:5f1 2:7f4 3:7f3 3:5f1 | 3:4f3 2:3f2 1:2f1 1:3f2 1:2f1 2:3f2 3:4f3 4:4f3 | /1 4:5f4`;

/** Intermediate, after the sevenths of C: the same four shapes and the two, five, one line in G. */
export const SEVENTHS_IN_G: StepSpec = {
  id: "sevenths-in-g",
  title: "Sevenths in a second key",
  goal: "Play G major seven, E minor seven, A minor seven and D seven as arpeggios from roots on the D string, then a two, five, one line in G: A minor seven, D seven, G major seven. Last, take the two, five, one line you learned in C to three more keys.",
  why: "Three shapes made the four seventh chords of C: major seven, minor seven and plain seven. The same three make the seventh chords of G, and this is the place to find that out, before the arpeggios grow to two octaves. One chord does not even move. A minor seven was the six chord in C. In G it is the two chord: the same notes in the same place, doing a different job. Playing one arpeggio in two jobs is a quick way to hear what a key does to a chord.",
  howTo: [
    "Roots on the D string: G is fret 5, E is fret 14, A is fret 7, D is fret 12.",
    "G major seven is G, B, D, F sharp: D string 5, G string 4, B string 3, top string 2. It is the shape C major seven had at fret 10.",
    "E minor seven is E, G, B, D: D string 14, G string 12, B string 12, top string 10. A minor seven is the same shape from fret 7: 7, 5, 5, 3.",
    "D seven is D, F sharp, A, C: D string 12, G string 11, B string 10, top string 8. It is the five chord of G, in the shape G seven had at fret 5 when it was the five chord of C.",
    "Fingers as before: in every one of these shapes the fourth finger is on the D string and the first is on the top string.",
  ],
  payoff: "The four seventh arpeggios in two keys, and the two, five, one line in five keys: C, G, D, E flat and B.",
  difficultyException:
    "A consolidation Step: the same shapes, note values and tempos as the Step before, in a new key. The two, five, one line, with its held last bar, is two of the four Exercises here and one of three there, which puts the median a little lower.",
  exercises: [
    {
      id: "g-major-seven-e-minor-seven",
      title: "G major seven and E minor seven",
      purpose: "The major seven and minor seven shapes in their places for the key of G: F sharp on top of G major, D on top of E minor.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. One bar each: G major seven, E minor seven, and again.",
        "G major seven: D string 5, G string 4, B string 3, top string 2, one finger per fret from the fourth down to the first. E minor seven: D string 14 with the fourth finger, G string 12 with the second, B string 12 with the third, top string 10 with the first.",
        "Each bar goes up the four strings, back down to the D string, and adds one more note on the G string. The move between the two chords is nine frets: make it after that last note.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: [GMAJ7, EM7, GMAJ7, EM7].map(upDown).join(" | "),
      position: 3,
      shifts: true,
      chords: "Gmaj7 | Em7 | Gmaj7 | Em7",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-six-two-five",
      title: "One, six, two, five in G, in sevenths",
      purpose: "G major seven, E minor seven, A minor seven and D seven, each going up from its root on the D string.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90. One bar on each chord.",
        "G major seven: 5, 4, 3, 2. E minor seven: 14, 12, 12, 10. A minor seven: 7, 5, 5, 3. D seven: 12, 11, 10, 8. The D string's fret is given first each time.",
        "The roots are a long way apart on the D string: nine frets up from G to E, seven down to A, five up to D, and seven down to G for the repeat. Look at the next root before you leave.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: [GMAJ7, EM7, AM7, D7].map(up).join(" | "),
      position: 3,
      shifts: true,
      chords: "Gmaj7 | Em7 | Am7 | D7",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "two-five-one",
      title: "Two, five, one in G",
      purpose: "A minor seven, D seven and two bars of G major seven as one line in eighths. It is the line you played in C, note for note, a fourth lower, set where the hand can stay between frets 2 and 7.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. The last bar is one long G.",
        "Bar 1, A minor seven: D string 7, G string 5, B string 5, top string 3, then top string 5 and 3, B string 5, G string 5. It is bar 1 of the line in C, five frets lower on the same strings.",
        "From bar 2 the layout is not the one you used in C: some notes move across to the next thicker string, so the whole line stays between frets 2 and 7. Bar 2, D seven: D string 7, G string 5 and 7, B string 7, top string 5, then back: B string 7, G string 7 and 5. Bar 3, G major seven, starts on B, one fret below the C you just played: G string 4, B string 3, top string 2 and 3, then top string 2, B string 3, G string 4, D string 4. Bar 4: G on the D string, fret 5, held.",
        "Fingers: the first finger is at fret 3 for A minor seven, at fret 5 for D seven and at fret 2 for G major seven. A minor seven is fingered as its shape is. For the A on the top string, let the third finger roll from the B string onto the top string at fret 5, then roll it back off so the G at fret 3 can sound again.",
        "For D seven the hand moves up two frets: third finger at fret 7 on the D and G strings, fourth finger at fret 7 on the B string. For G major seven it moves down three, one finger per fret from fret 2. The G on the top string is under the second finger: it rolls there from the B string and back, as the third finger did in bar 1. At the end the third finger rolls from the G string onto the F sharp on the D string, just before the fourth lands on the last G.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TWO_FIVE_ONE_IN_G,
      position: 4,
      shifts: true,
      chords: "Am7 | D7 | Gmaj7 | Gmaj7",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 7,
    },
    {
      id: "two-five-one-keys",
      title: "Two, five, one in other keys",
      purpose: "The two, five, one line as you first learned it in C, from fret 12 on the D string, moved along the neck: two frets up for D, three frets up for E flat, one fret down for B. It is that layout, not the one you just played in G.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. The last bar is one long note.",
        "In D the chords are E minor seven, A seven and D major seven, and the line starts at fret 14 on the D string. Its first four notes are the E minor seven shape from the first Exercise of this Step.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(TWO_FIVE_ONE, TWO_FIVE_ONE_CHART, { D: 2, Eb: 3, B: -1 }, ROCK, { kind: "line" }),
      tab: shiftFrets(TWO_FIVE_ONE, 2),
      position: handAt(shiftFrets(TWO_FIVE_ONE, 2)),
      shifts: true,
      chords: "Em7 | A7 | Dmaj7 | Dmaj7",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 7,
    },
  ],
};
