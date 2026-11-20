/**
 * Scales and Modes, Advanced Level: three more Steps (2026-11-19). Drafts,
 * like the Path they belong to.
 *
 * The Level taught each mode one way, as a scale the player knows with one
 * note changed, over one pair of chords. Three things a teacher adds before
 * calling the modes known:
 *
 * - `box-plus-two` (after Mixolydian): the minor pentatonic box is five of the
 *   seven notes. Add B and F and it is A natural minor; B and F# and it is A
 *   Dorian. A major pentatonic plus D and G is A Mixolydian.
 * - `same-notes-new-home` (after the second key): the other way of seeing a
 *   mode. A Dorian, D Mixolydian and G major are one set of seven notes from
 *   three homes, and their chords are two, five and one in G.
 * - `choosing-again` (last): one note follows the chord. F over F and F# over
 *   D; G# over E and G over G; then two "your turn" Exercises.
 *
 * Every id is new, so nobody's progress moves. Helpers the Path file also has
 * are copied or come from `triadShapes.ts`, never from the Path: it imports
 * these Steps.
 */
import type { StepSpec } from "../spec";
import { ladder } from "../templates";
import { ROCK, named } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

/** One finger to a fret: every note gets the finger its fret has with the first finger at `first`. */
const inPosition = (tab: string, first: number) =>
  tab.replace(/(\d):(\d+)/g, (_all, string, fret) => `${string}:${fret}f${Number(fret) - first + 1}`);

// --- The box, plus two notes ---------------------------------------------------------

// The top three strings of the A minor pentatonic box at fret 5: up to C, down to the G string, back to a long A.
const BOX_TOP = `/8 1:5 1:8 1:5 2:8 2:5 3:7 3:5 3:7 | /8 2:5 2:8 /2. 1:5`;
// The same place with B on the top string and the sixth on the B string: F at fret 6, then F# at fret 7.
const MINOR_TOP = `/8 1:5 1:7 1:8 1:7 1:5 2:8 2:6 2:5 | /8 3:7 2:5 2:6 2:8 /2 1:5`;
const DORIAN_TOP = `/8 1:5 1:7 1:8 1:7 1:5 2:8 2:7 2:5 | /8 3:7 2:5 2:7 2:8 /2 1:5`;
const BOX_THEN_TWO = inPosition(`${BOX_TOP} | ${MINOR_TOP} | ${DORIAN_TOP}`, 5);
// Mostly box. F# starts and ends the first bar over D; B sits either side of the top C.
const BOX_PHRASE = inPosition(
  `/8 1:5 1:8 1:5 2:8 /4 2:5 2:8 | /8 2:7 2:5 3:7 2:5 /2 2:7 | /8 2:5 2:8 1:5 1:7 /4 1:8 1:7 | /8 1:5 2:8 2:7 2:5 /2 3:7`,
  5,
);
// A major pentatonic inside the Mixolydian shape at fret 4, then the shape itself: D and G added.
const MAJOR_FIVE = `/8 6:5 6:7 5:4 5:7 4:4 4:7 4:4 5:7 | /8 5:4 6:7 /2. 6:5`;
const MIXO_OCTAVE = `/8 6:5 6:7 5:4 5:5 5:7 4:4 4:5 4:7 | 4:5 4:4 5:7 5:5 5:4 6:7 hold`;
const FIVE_THEN_TWO = inPosition(`${MAJOR_FIVE} | ${MIXO_OCTAVE}`, 4);
// The bars over A are the five notes alone; D and G come with the G chord.
const MAJOR_FIVE_PHRASE = inPosition(
  `/8 6:5 6:7 5:4 5:7 /4 4:4 5:7 | /8 4:5 5:7 5:5 5:7 /2 4:5 | /8 5:7 4:4 4:7 4:4 /4 5:7 5:4 | /8 6:7 5:5 5:7 4:4 /2 4:5`,
  4,
);

/** Advanced, after Mixolydian: the two modes found inside the pentatonic the player already uses. */
export const BOX_PLUS_TWO: StepSpec = {
  id: "box-plus-two",
  title: "The box you know, plus two notes",
  goal: "Find A natural minor and A Dorian around the A minor pentatonic box, and A Mixolydian around A major pentatonic, and play a Dorian phrase and a Mixolydian phrase that are mostly five notes with the two added ones as colour.",
  why: "A seven-note scale is not a separate thing to learn beside the pentatonic box. The box is five of its notes. A minor pentatonic is A, C, D, E and G. Add B and F and you have A natural minor. Add B and F# instead and you have A Dorian. The sixth is one of the two missing notes, which is why the box alone cannot tell natural minor from Dorian: it has neither F nor F#. The major side works the same way. A major pentatonic is A, B, C#, E and F#, and adding D and G makes A Mixolydian. So a mode is five notes you may already play, with two more placed among them.",
  howTo: [
    "The top of the box at fret 5: G string 5 and 7, B string 5 and 8, top string 5 and 8. First finger on fret 5, third on 7, fourth on 8. The notes are C and D, E and G, A and C. If the box is new to you, these six notes are all of it you need here.",
    "B goes on the top string at fret 7, under the third finger. The sixth goes on the B string, between the two notes of the box: F at fret 6 for natural minor, F# at fret 7 for Dorian.",
    "In the low octave you have played all of this already. The minor shape is the box plus B at the low E string's fret 7 and F at the A string's fret 8. The Dorian shape swaps that F for F# at the D string's fret 4.",
    "A major pentatonic sits inside the Mixolydian shape at fret 4: low E string 5 and 7, A string 4 and 7, D string 4 and 7. The two notes it leaves out are D, the A string's fret 5, and G, the D string's fret 5.",
    "In a phrase, stay on the five notes most of the time. Let the added ones pass by, or land on one when its chord arrives: F# over D, G over G.",
  ],
  payoff: "Two phrases over a band that are five-note playing with two more notes in it: one in A Dorian over Am and D, one in A Mixolydian over A and G.",
  exercises: [
    {
      id: "box-then-two-notes",
      title: "The top of the box, then two more notes",
      purpose: "The top three strings of the A minor pentatonic box, then the same part of the neck with B and F added, which makes it A natural minor, then with B and F#, which makes it A Dorian.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80; every second bar ends on a long A.",
        "Bars 1 and 2 are the box alone: top string 5 and 8, B string 5 and 8, G string 5 and 7. Up to C, down to the G string and back up to A.",
        "Bars 3 and 4 add two notes: B, the top string's fret 7, and F, the B string's fret 6. That is A natural minor.",
        "Bars 5 and 6 are bars 3 and 4 again with F#, the B string's fret 7, in place of F. That is A Dorian.",
        "First finger on fret 5, second on 6, third on 7, fourth on 8. The hand does not move.",
      ],
      coach: "Right notes and even eighths after the take. B, F and F# are the notes to listen for.",
      tab: BOX_THEN_TWO,
      position: 5,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "box-phrase",
      title: "A box phrase with F# and B",
      purpose: "Four bars over a band going from Am to D and back. Most of it is the box. F# arrives with the D chord, and B sits either side of the top C in bar 3.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
        "Bar 1 is the box alone, from A on the top string's fret 5. Bar 2, over D, starts and ends on F#, the B string's fret 7.",
        "Bar 3 crosses from the B string to the top string, climbs through B, fret 7, to C and steps back to B. Bar 4 starts on A and comes down through F# to a long D, the G string's fret 7.",
        "The hand stays at fret 5. The third finger takes both added notes: fret 7 on the B string and fret 7 on the top string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: BOX_PHRASE,
      position: 5,
      chords: "Am | D | Am | D",
      jam: ROCK("A minor"),
      harmony: { scaleOverChords: ["A", "dorian"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "five-then-two-notes",
      title: "Five notes of A major, then two more",
      purpose: "A major pentatonic up and back, then the same octave with D and G added, which makes it A Mixolydian: the shape from the Mixolydian Step.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "Bars 1 and 2 are the five notes A, B, C#, E and F#: low E string 5 and 7, A string 4 and 7, D string 4 and 7, and back down to a long A.",
        "Bars 3 and 4 add D, the A string's fret 5, and G, the D string's fret 5. Bar 4 stops on B, and the loop steps down to A again.",
        "First finger on the frets at 4, second on 5, fourth on 7. Both added notes are at fret 5, under the second finger.",
      ],
      coach: "Right notes and even eighths after the take. D and G are the notes to listen for.",
      tab: FIVE_THEN_TWO,
      position: 4,
      harmony: { scale: ["A", "mixolydian"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 85,
      ...named(),
      minutes: 5,
    },
    {
      id: "five-note-phrase",
      title: "A five-note phrase with D and G",
      purpose: "Four bars over a band going from A to G and back. The bars over A use only the five notes of A major pentatonic. D and G arrive with the G chord.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
        "Bar 1 climbs from A on the low E string's fret 5 to F#, the D string's fret 4, and steps back to E. Bar 3 starts on E, the A string's fret 7, and ends on C#, the A string's fret 4.",
        "Bar 2 starts on G, the D string's fret 5, dips to D, the A string's fret 5, and returns to a long G. Bar 4 starts on B and climbs through D to a long G.",
        "All of it sits at fret 4 on the low three strings.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: MAJOR_FIVE_PHRASE,
      position: 4,
      chords: "A | G | A | G",
      jam: ROCK("A"),
      harmony: { scaleOverChords: ["A", "mixolydian"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- One scale, three homes ------------------------------------------------------------

// The seven notes of G major around fret 5, one octave up and back from A, from D and from G.
const FROM_A = `/8 6:5f1 6:7f3 6:8f4 5:5f1 5:7f3 4:4f1 4:5f2 4:7f4 | 4:5f2 4:4f1 5:7f3 5:5f1 6:8f4 6:7f3 /4 6:5f1`;
const FROM_D = `/8 5:5f2 5:7f4 4:4f1 4:5f2 4:7f4 3:4f1 3:5f2 3:7f4 | 3:5f2 3:4f1 4:7f4 4:5f2 4:4f1 5:7f4 /4 5:5f2`;
const FROM_G = `/8 4:5f2 4:7f4 3:4f1 3:5f2 3:7f4 2:5f1 2:7f3 2:8f4 | 2:7f3 2:5f1 3:7f4 3:5f2 3:4f1 4:7f4 /4 4:5f2`;
// Root, third and fifth from each home: A minor, D, G.
const HOME_CHORDS = `/4 6:5f1 6:8f4 5:7f3 6:8f4 | /4 5:5f2 4:4f1 4:7f4 4:4f1 | /4 4:5f2 3:4f1 3:7f4 3:4f1 | /4 3:7f4 3:4f1 /2 4:5f2`;
// Five notes up the scale and back to the third, from each chord's root; then a turn round G.
const THREE_HOMES_LINE = `/8 6:5f1 6:7f3 6:8f4 5:5f1 /4 5:7f3 6:8f4 | /8 5:5f2 5:7f4 4:4f1 4:5f2 /4 4:7f4 4:4f1 | /8 4:5f2 4:7f4 3:4f1 3:5f2 /4 3:7f4 3:4f1 | /8 4:5f2 3:4f1 4:7f4 4:4f1 /2 4:5f2`;

/** Advanced, after the second key: a mode as a major scale from another home, and the chords that come with it. */
export const SAME_NOTES_NEW_HOME: StepSpec = {
  id: "same-notes-new-home",
  title: "One scale, three homes",
  goal: "Hear A Dorian, D Mixolydian and G major as the same seven notes started from A, from D and from G, and play a line over Am, D and G where only the home changes.",
  why: "So far a mode has been a scale you know with one note changed: A Dorian is A natural minor with F# for F. There is a second way to see it, and you met it in the Beginner Level, where C major and A minor were the same seven notes with two homes. A Dorian's notes are A, B, C, D, E, F# and G. G major's are G, A, B, C, D, E and F#. They are the same seven. Start from A and they are A Dorian, start from D and they are D Mixolydian, start from G and they are G major. Both ways of seeing a mode are true, because a mode is a set of notes and a home: comparing it with the minor or major scale on the same home tells you how it sounds and when to choose it, and seeing it as a major scale started from another note tells you where its notes are and which chords come with it. Those chords lead to two later Paths, Chords in a Key and Arpeggios over Changes. Build a chord on A, on D and on G from these seven notes and you get A minor, D and G: the second, fifth and first chords of the key of G.",
  howTo: [
    "The three homes are at fret 5 on three neighbouring strings: A on the low E string, D on the A string, G on the D string.",
    "Dorian's home is the second note of its major scale and Mixolydian's is the fifth. A is note two of G major and D is note five.",
    "No fret changes between the three scales. What changes is where you start and stop.",
    "Over the band, each chord's first bar starts on its root. The band moves the home: Am, then D, then G.",
  ],
  payoff: "One set of seven notes played from three homes, and a line over the second, fifth and first chords of G that follows them.",
  difficultyException:
    "This Step looks at notes the player already has from three starting points, at the pace of the shape Exercises, and its band changes chord twice in four bars where the phrases of the Step before change three times. The demand is hearing the home move.",
  exercises: [
    {
      id: "three-homes",
      title: "The same seven notes, three homes",
      purpose: "One octave up and back from A, then from D, then from G. The names are A Dorian, D Mixolydian and G major, and no note is different between them. The Beginner Level's C major and A minor were two homes in the same way.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80; each scale ends on a quarter note.",
        "Bars 1 and 2, from A: low E string 5, 7 and 8; A string 5 and 7; D string 4, 5 and 7. This is the Dorian shape.",
        "Bars 3 and 4, from D: A string 5 and 7; D string 4, 5 and 7; G string 4, 5 and 7. Bars 5 and 6, from G: D string 5 and 7; G string 4, 5 and 7; B string 5, 7 and 8.",
        "From A the first finger starts at fret 5. For the D string the hand moves back one fret, as in the Dorian shape: fingers 1, 2 and 4 on frets 4, 5 and 7. It returns for the A string on the way down. From D the hand stays at fret 4, second finger on the D. From G it starts at fret 4 and moves up one fret for the B string.",
        "Listen to the last note of each scale: A, then D, then G. Ask of each whether it sounds like home.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: `${FROM_A} | ${FROM_D} | ${FROM_G}`,
      position: 5,
      shifts: true,
      harmony: { scale: ["G", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "three-home-chords",
      title: "A chord from each home",
      purpose: "Root, third and fifth from A, from D and from G, all taken from the same seven notes, while a band plays the chords they spell: A minor, D and G.",
      howTo: [
        "Quarter notes, one to a beat, 60 BPM up to a pass at 90; the last note is a half note.",
        "Bar 1: A, C, E, C. Bar 2: D, F#, A, F#. Bar 3: G, B, D, B. Bar 4 comes back down the G chord: D, B and a long G.",
        "Each root is at fret 5: on the low E string, then the A string, then the D string. From A the third is on the same string, three frets up at fret 8. From D and from G it is on the next string, at fret 4.",
        "Counted along one string, C is three frets above A, and F# and B are four frets above D and G. That is one minor chord and two major chords from the same seven notes.",
        "Bar 1 has the first finger at fret 5. From bar 2 on the hand is one fret lower, with the second finger on the roots at fret 5.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: HOME_CHORDS,
      position: 5,
      shifts: true,
      chords: "Am | D | G | G",
      jam: ROCK("G"),
      harmony: { scaleOverChords: ["G", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 5,
    },
    {
      id: "two-five-one-line",
      title: "One line, three homes: Am, D and G",
      purpose: "Four bars over a band on Am, D, G and G: the second, fifth and first chords of G major. Bars 1, 2 and 3 play the same figure, five notes up the scale and back to the third, each from the root of its chord.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
        "Bar 1 starts on A, the low E string's fret 5. Bar 2 starts on D, the A string's fret 5. Bars 3 and 4 start on G, the D string's fret 5.",
        "The figure is the same count of scale notes each time. From A the third note, C, is three frets above the root. From D and from G the thirds, F# and B, are four frets above, counted along one string, so bars 2 and 3 are one fingering on two sets of strings. Nothing was changed but the home.",
        "Bar 4 circles G: G, B, A, F# and a long G.",
        "Bar 1 has the first finger at fret 5. From bar 2 on the hand is one fret lower, with the second finger on the roots at fret 5.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: THREE_HOMES_LINE,
      position: 5,
      shifts: true,
      chords: "Am | D | G | G",
      jam: ROCK("G"),
      harmony: { scaleOverChords: ["G", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- The chords choose, a second time ---------------------------------------------------

// Am, F, Am, D: the bars over Am are box notes; bars 2 and 4 differ only in the sixth, F then F#.
const SIXTH_FOLLOWS = `/8 6:5f1 6:8f4 5:5f1 5:7f3 /4 4:5f1 5:7f3 | /8 4:7f3 4:5f1 5:8f4 5:7f3 /2 5:8f4 | /8 5:7f3 5:5f1 6:8f4 5:5f1 /4 5:7f3 4:5f1 | /8 4:7f4 4:5f2 4:4f1 5:7f4 /2 4:4f1`;
// A, E, A, G: the bars over A leave the seventh out; bars 2 and 4 differ only in it, G# then G.
const SEVENTH_FOLLOWS = inPosition(
  `/8 4:7 4:4 5:7 5:4 /4 5:7 4:4 | /8 4:6 4:4 5:7 4:4 /2 4:6 | /8 5:7 5:4 6:5 5:4 /4 5:7 4:4 | /8 4:5 4:4 5:7 4:4 /2 4:5`,
  4,
);
// Examples for the two "your turn" Exercises: a long note on each chord's own note, then four eighths.
const DORIAN_EXAMPLE = inPosition(
  `/2 4:7 /8 4:5 5:7 5:5 5:7 | /2 4:4 /8 4:5 4:7 4:5 5:7 | /2 5:7 /8 4:5 4:7 3:5 4:7 | /2 4:4 /8 5:7 5:5 5:7 4:5`,
  4,
);
const D_MIXO_EXAMPLE = inPosition(
  `/2 4:4 /8 4:7 3:4 4:7 4:4 | /2 3:5 /8 3:4 4:7 4:5 4:7 | /2 4:7 /8 4:4 5:7 4:4 4:7 | /2 3:5 /8 4:7 4:5 5:7 4:5`,
  4,
);

/** Advanced, the last Step: four chords that do not share one scale, and the one note that follows them. */
export const CHOOSING_AGAIN: StepSpec = {
  id: "choosing-again",
  title: "One note follows the chord",
  goal: "Play a phrase that changes its sixth from F to F# when the band goes to F and then to D, another that changes its seventh from G# to G when the band goes to E and then to G, and then choose the notes yourself over Am and D and over D and C.",
  why: "In the Step before, each phrase stayed in one mode, because its chords all fitted one scale. A song does not always keep to chords like that. Over Am, F, Am and D the band plays F in the F chord and F# in the D chord, so no one scale fits all four bars: A natural minor fits the first three and A Dorian fits the last. You do not need a new shape for that, and the hand moves one fret at most. You change one note, the sixth, in the bar whose chord has it. Over A, E, A and G the same thing happens to the seventh: the E chord has G# in it, which is A major, and the G chord is built on G, which is A Mixolydian. Harmonic minor did this in the Intermediate Level, where the raised seventh belonged to one chord. Here the note that follows the chord is the note that names the mode.",
  howTo: [
    "Read the chart before you play and find the chord that has the changed note in it. F has F and D has F#. E has G# and G has G.",
    "The sixth of A is F at the A string's fret 8, or F# at the D string's fret 4. The seventh of A is G# at the D string's fret 6, or G at fret 5.",
    "Each written phrase keeps its changing note out of the bars over the home chord: no F or F# over Am in the first, no G# or G over A in the second. So each is heard only where its chord is.",
    "In the two 'your turn' Exercises one scale fits both chords again. Name it from the chords before you start.",
  ],
  payoff: "Two phrases where one note changes with the chord, and two of your own over chords you can read the scale from.",
  exercises: [
    {
      id: "sixth-follows-the-chord",
      title: "F over F, F# over D",
      purpose: "A written phrase over Am, F, Am and D with a band. Bars 2 and 4 are the same five notes but for the sixth: F over the F chord, which is A natural minor, and F# over the D chord, which is A Dorian.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 95.",
        "Bars 1 and 3, over Am, use only the box: A, C, D, E and G. Neither F nor F# is in them.",
        "Bar 2: A, G, F, E and a long F. The F is the A string's fret 8, under the fourth finger.",
        "Bar 4: A, G, F#, E and a long F#. The F# is the D string's fret 4. For this bar the hand moves back one fret: the first finger takes the F# and the fourth takes the A and the E at fret 7.",
        "F is the root of the F chord and F# is the third of the D chord. The chord has the note in it, and the line takes it from the chord.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: SIXTH_FOLLOWS,
      position: 5,
      shifts: true,
      chords: "Am | F | Am | D",
      jam: ROCK("A minor"),
      harmony: { scaleOverChords: ["A", "naturalMinor"], allowed: ["F#"] },
      rungs: ladder(60, 120, 10),
      passAt: 95,
      ...named(),
      minutes: 6,
    },
    {
      id: "seventh-follows-the-chord",
      title: "G# over E, G over G",
      purpose: "A written phrase over A, E, A and G with a band. Bars 2 and 4 are the same five notes but for the seventh: G# over the E chord, which is A major, and G over the G chord, which is A Mixolydian.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 95.",
        "Bars 1 and 3, over A, use A, C#, E and F# and leave the seventh out. Each ends on F#, the D string's fret 4, just below the seventh that is coming.",
        "Bar 2: G#, F#, E, F# and a long G#. The G# is the D string's fret 6, under the third finger.",
        "Bar 4: G, F#, E, F# and a long G. The G is the D string's fret 5, under the second finger. F# and E are not in the G chord; they pass on the way back to G, so do not hold them.",
        "G# is the third of the E chord and G is the root of the G chord. All of it sits at fret 4 on the low three strings.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: SEVENTH_FOLLOWS,
      position: 4,
      chords: "A | E | A | G",
      jam: ROCK("A"),
      harmony: { scaleOverChords: ["A", "major"], allowed: ["G"] },
      rungs: ladder(60, 120, 10),
      passAt: 95,
      ...named(),
      minutes: 6,
    },
    {
      id: "your-dorian",
      title: "Your turn: Am and D",
      purpose: "Free playing over Am and D, your notes. A minor chord and the major chord a fourth above it: the scale is A Dorian. The one rule is to be on F# when the D chord arrives and on A, C or E when the Am chord does.",
      howTo: [
        "Straight eighths or longer, 60 to 90 BPM.",
        "Start with two notes a bar and F# on beat 1 of the D bars. Add notes only when the landing is sure. The written line is an example.",
        "The example holds A, F#, E and F# for two beats each: the D string's fret 7, its fret 4, the A string's fret 7, and the D string's fret 4 again. It stays at fret 4 on the A, D and G strings, first finger on the F#.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen to beat 1 of each bar.",
      tab: DORIAN_EXAMPLE,
      position: 4,
      chords: "Am | D | Am | D",
      jam: ROCK("A minor"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did you land on F# when the D chord arrived?",
        "Could you name the scale from the two chords before the band started?",
      ],
      minutes: 5,
    },
    {
      id: "your-mixolydian-in-d",
      title: "Your turn: D and C",
      purpose: "Free playing over D and C, your notes. A major chord and the major chord a whole step below it: the scale is D Mixolydian. The one rule is to be on C when the C chord arrives and on D, F# or A when the D chord does.",
      howTo: [
        "Straight eighths or longer, 60 to 90 BPM.",
        "The changed note is C, the G string's fret 5, where D major has C# at fret 6. Start with two notes a bar and C on beat 1 of the C bars. The written line is an example.",
        "The example stays at fret 4 on the A, D and G strings. It holds F#, C, A and C for two beats each: the D string's fret 4, the G string's fret 5, the D string's fret 7, and the G string's fret 5 again. D, the home note, is the A string's fret 5 and the G string's fret 7.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen to beat 1 of each bar.",
      tab: D_MIXO_EXAMPLE,
      position: 4,
      chords: "D | C | D | C",
      jam: ROCK("D"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did you land on C when the C chord arrived?",
        "Could you find C, and keep off C#, without looking?",
      ],
      minutes: 5,
    },
  ],
};
