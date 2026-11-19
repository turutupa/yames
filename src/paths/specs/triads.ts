/**
 * Triads, a Theory Path. A draft: no teacher or guitarist has reviewed it.
 *
 * The first new Path on the harmony route (`plans/paths/NEW_PATHS.md`, "The
 * curriculum map"): for a player with no theory who wants to understand how
 * chords work on the guitar. It starts from the major scale counted as numbers,
 * takes steps 1, 3 and 5, and spends the rest of its time making those three
 * notes into shapes the hand knows in every part of the neck.
 *
 * What the grader carries: a triad played one note at a time is slow written
 * single notes, where the right-notes check is at its best. A strummed triad is
 * not graded, so nothing here is strummed for a grade.
 */
import { definePath } from "../spec";
import type { VariantParams } from "../spec";
import { handAt, ladder, moveChart, shiftFrets } from "../templates";
import { DIMINISHED, F_AND_G, MORE_MINORS } from "./harmony-more";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and note names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";


import { ROCK, bar, bars, ending, mid, named, roll, slow, toTop, top } from "./triadShapes";
import type { Shape } from "./triadShapes";


// The chords of C major on the top three strings, by which note is lowest.
const C_ROOT = top(5, 5, 3);
const C_FIRST = top(9, 8, 8);
const C_SECOND = top(12, 13, 12);
const F_ROOT = top(10, 10, 8);
const F_FIRST = top(14, 13, 13);
const F_SECOND = top(5, 6, 5);
const G_ROOT = top(12, 12, 10);
const G_FIRST = top(4, 3, 3);
const G_SECOND = top(7, 8, 7);
const AM_ROOT = top(14, 13, 12);
const AM_FIRST = top(5, 5, 5);
const AM_SECOND = top(9, 10, 8);
const DM_ROOT = top(7, 6, 5);
const EM_ROOT = top(9, 8, 7);
const CM_ROOT = top(5, 4, 3);

// The same chords on the D, G and B strings.
const C_MID_SECOND = mid(5, 5, 5);
const C_MID_ROOT = mid(10, 9, 8);
const C_MID_FIRST = mid(14, 12, 13);
const AM_MID_ROOT = mid(7, 5, 5);
const AM_MID_FIRST = mid(10, 9, 10);
const AM_MID_SECOND = mid(14, 14, 13);
const F_MID_FIRST = mid(7, 5, 6);
const G_MID_ROOT = mid(5, 4, 3);

/** Four strings at once: a shape on the middle set and the one above it share two strings. */
const four = (d: string, g: string, b: string, e: string) => `/8 ${d} ${g} ${b} ${e} ${b} ${g} ${d} ${g}`;

const SCALE_ON_B = `/4 2:1f1 2:3f1 2:5f1 2:6f1 | 2:8f1 2:10f1 2:12f1 2:13f1 | 2:12f1 2:10f1 2:8f1 2:6f1 | 2:5f1 2:3f1 /2 2:1f1`;
const ONE_THREE_FIVE = `/4 2:1f1 2:5f1 2:8f1 2:5f1 | 2:1f1 2:5f1 /2 2:8f1 | /4 2:13f1 2:8f1 2:5f1 2:8f1 | 2:13f1 2:8f1 /2 2:5f1`;

const FOUR_CHORDS_LOW = bars(C_ROOT, AM_FIRST, F_SECOND, G_FIRST);
const FOUR_CHORDS_MID = bars(C_FIRST, AM_SECOND, F_ROOT, G_SECOND);
const SONG_LOW = [C_ROOT, G_FIRST, AM_FIRST, F_SECOND];
const SONG_MID = [C_FIRST, G_SECOND, AM_SECOND, F_ROOT];
const SONG = bars(...SONG_LOW, ...SONG_MID);
const STAY_MID = bars(C_FIRST, F_ROOT, G_SECOND, C_FIRST);

/** A line in C moved up the neck to other keys; the chart and the band move with it. */
function inKeys(tab: string, chart: string, shifts: Readonly<Record<string, number>>) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, shifts[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords: moveChart(chart, shifts[p.key]),
        jam: ROCK(p.key),
        harmony: { chordTones: true as const },
      };
    },
  };
}

/** A warm-up: one shape rolled on the first, fourth and fifth chords of a key and home. */
type Moved = { shape: Shape; moves: readonly number[] };
const UP = [0, 5, 7, 0] as const;
const DOWN = [0, -7, -5, 0] as const;
/** Keep a moved bar on the neck: an octave down past fret 15, an octave up below fret 1. */
function onTheNeck(one: string, by: number): string {
  const frets = (tab: string) => [...tab.matchAll(/:(\d+)/g)].map((m) => Number(m[1]));
  for (const shift of [by, by - 12, by + 12]) {
    const moved = shiftFrets(one, shift);
    const all = frets(moved);
    if (frets(one).every((f) => f + shift >= 1) && Math.max(...all) <= 15) return moved;
  }
  return shiftFrets(one, by);
}
function shapeWarmup(shapes: Readonly<Record<string, Moved>>, keys: Readonly<Record<string, number>>, minor: boolean) {
  return {
    values: { key: Object.keys(keys), shapeOrder: Object.keys(shapes) },
    pooled: ["key", "shapeOrder"] as const,
    label: (p: VariantParams) => `${p.key}${minor ? " minor" : ""}, ${p.shapeOrder}`,
    build: (p: VariantParams) => {
      const { shape, moves } = shapes[p.shapeOrder];
      const one = bar(shape);
      const tab = moves.map((by) => onTheNeck(one, keys[p.key] + by)).join(" | ");
      const chords = moveChart(minor ? "Am | Dm | Em | Am" : "C | F | G | C", keys[p.key]);
      return { tab, position: handAt(tab), shifts: true, chords, harmony: { chordTones: true as const } };
    },
  };
}

export default definePath({
  id: "triads",
  title: "Triads",
  kind: "theory",
  category: "harmony",
  goal: "Know what a triad is, play major and minor triads in three places on the top strings and on the middle strings, and move between the chords of a song with the nearest shapes.",
  level: "beginner",
  assumes:
    "You can fret and pick single notes and play eighth notes with a click at 60 BPM, and you can find C on the B string or will learn it in the first Exercise. No theory is assumed: this Path starts from counting the notes of one scale. The minutes listed are one pass through the material; these shapes are worth months.",
  prerequisites: {
    paths: [
      { path: "know-the-neck", level: "beginner" },
      { path: "scales-and-modes", level: "beginner" },
    ],
    skills: ["Clean single notes", "Eighth notes with a click at 60 BPM"],
  },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "The major scale counted as numbers comes first, because a triad is defined by them: notes one, three and five. Then the three shapes one triad has on the top three strings, one at a time, since the top strings are the easiest to hear and to hold. Moving one shape to make three chords comes before the nearest-shape idea: it is easier, and it shows that a shape is a chord type and a fret is a chord name. Minor arrives as one changed note, never as a new set of shapes to memorise. The four chords most songs use come next, in two parts of the neck and then in other keys, before a second set of strings: a second set before the first is secure doubles the load and teaches nothing new. Seeing the open and barre chords as these same three notes comes near the end, when the three notes are familiar enough to recognise. A whole song form is last.",
  gradingLimits:
    "Every graded Exercise is played one note at a time: after the take, the app checks that you played the written notes, counts them and times them. It cannot tell which string a pitch came from, so a right note in the wrong place passes, and it cannot hear whether you held the shape down like a chord or lifted each finger. Strummed chords are not graded anywhere in this Path. The band Exercises have only been tried on computer-made guitar sound, so direct input or headphones are the honest way to play them. Choosing your own shapes is 'your turn', self-checked and labelled 'not checked yet'.",
  steps: [
    {
      id: "one-three-five",
      title: "One, three, five",
      goal: "Count the C major scale along one string, pick out its first, third and fifth notes, and play those three under one hand.",
      why: "A chord is not a shape someone invented. Take a major scale, count its notes from one to seven, and play numbers one, three and five together: that is a major chord, and the three notes are called a triad. Every major chord you already play is three notes like these, some of them played more than once. Once you can count to five on one string, you can build a chord anywhere.",
      howTo: [
        "The C major scale is C, D, E, F, G, A, B, and then C again. Count them: C is one, E is three, G is five.",
        "On one string, a scale is a row of frets. On the B string, C major is frets 1, 3, 5, 6, 8, 10, 12 and 13.",
        "One is called the root, and it gives the chord its name. Three is the third and five is the fifth. The C at fret 13 is one again, an octave up: the same note, higher.",
      ],
      payoff: "You can say what a C chord is made of, and play its three notes without looking them up.",
      exercises: [
        {
          id: "count-the-scale",
          title: "Count the scale on the B string",
          purpose: "The C major scale along one string, up and back, so each note has a number. One finger does all of it, which leaves your attention for counting.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "B string, first finger only: frets 1, 3, 5, 6, 8, 10, 12, 13, then back down to fret 1. Say the numbers as you go up: one, two, three, four, five, six, seven, and one again at fret 13.",
            "Most notes are two frets apart. Two pairs are only one fret apart: three and four (frets 5 and 6), and seven and the top (frets 12 and 13).",
          ],
          coach: "Right notes and steady quarter notes after the take. The app can't hear you count, so that part is yours.",
          tab: SCALE_ON_B,
          position: 1,
          shifts: true,
          loops: false,
          harmony: { scale: ["C", "major"], cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 5,
        },
        {
          id: "pick-three",
          title: "One, three and five on one string",
          purpose: "Only the first, third and fifth notes of the scale: C, E and G. Played alone they already sound like a chord, and the C at fret 13 is one again, higher.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90. B string, first finger only.",
            "Bars 1 and 2: frets 1, 5, 8, 5, then 1, 5, and 8 held. That is C, E, G. Bars 3 and 4 start from the high C at fret 13: 13, 8, 5, 8, then 13, 8, and 5 held.",
            "Say each note's number as you play it: bars 1 and 2 go one, three, five, three, and bars 3 and 4 go one, five, three, five.",
          ],
          coach: "Three notes, a long way apart on one string. Right notes after the take.",
          tab: ONE_THREE_FIVE,
          position: 1,
          shifts: true,
          loops: false,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 5,
        },
        {
          id: "under-one-hand",
          title: "The same three notes under one hand",
          purpose: "C, E and G again, on three strings this time, so the hand does not have to travel: C on the G string, E on the B string, G on the top string. This is a triad shape.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "G string fret 5 with the third finger, B string fret 5 with the fourth, top string fret 3 with the first. Put all three down and leave them down.",
            "Play low, middle, high, middle, and in bar 2 stop on the high note. Say 'one, three, five, three'.",
          ],
          coach: "The first triad shape. Right notes and steady quarters after the take.",
          tab: `${slow(C_ROOT)} | ${ending(C_ROOT)}`,
          position: 3,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 4,
        },
      ],
    },
    {
      id: "three-shapes",
      title: "Three shapes for one chord",
      goal: "Play the C triad in its three shapes on the top three strings and know which of its notes is on top in each.",
      why: "C, E and G can be stacked three ways on three strings: with C lowest, with E lowest, or with G lowest. Each way makes a different small shape, and the three shapes sit one after another up the neck, so between them the chord is never more than a few frets from your hand. They are the same chord: the letters do not change, only the order. Musicians call them inversions.",
      howTo: [
        "Shape one, around fret 5: C, E, G from low to high. Shape two, around fret 8: E, G, C. Shape three, around fret 12: G, C, E. Shape one has the root as its lowest note, shape two the third, shape three the fifth, and that holds for every chord.",
        "The lowest note of one shape moves to the top of the next. Watch the C: it is on the G string, then on the top string, then on the B string.",
        "Hold each shape down like a small chord and pick the strings one at a time.",
      ],
      payoff: "C major in three places, and you can say which note is on top of each.",
      exercises: [
        {
          id: "first-two",
          title: "Shape one and shape two",
          purpose: "The shape you know at fret 5, and the next one up: G string fret 9, B and top strings at fret 8. Two bars each, so the hand has time to settle.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bars 1 and 2: G string 5 (third finger), B string 5 (fourth finger), top string 3 (first finger), rolled low, middle, high, middle. Bars 3 and 4: G string 9 with the second finger, B string 8 and top string 8 under the first finger laid flat.",
            "In shape one the top note is G, the fifth. In shape two the top note is C, the root.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: bars(C_ROOT, C_ROOT, C_FIRST, C_FIRST),
          position: 3,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "second-and-third",
          title: "Shape two and shape three",
          purpose: "From the shape at fret 8 to the one at fret 12: G string 12, B string 13, top string 12. In shape three the top note is E, the third.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bars 1 and 2: G string 9, B string 8, top string 8. Bars 3 and 4: the first finger lies across fret 12 on the G and top strings, and the second finger takes fret 13 on the B string.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: bars(C_FIRST, C_FIRST, C_SECOND, C_SECOND),
          position: 8,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "all-three",
          title: "All three, up and back",
          purpose: "One bar on each shape: fret 5, fret 8, fret 12, and back to fret 8. The chord stays C the whole way while the sound climbs.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bar 1: frets 5, 5, 3. Bar 2: 9, 8, 8. Bar 3: 12, 13, 12. Bar 4: 9, 8, 8 again. The G string's fret is given first each time.",
            "Move the whole hand at the bar line, and look at the fret you are going to before you leave.",
          ],
          coach: "Three shapes and a shift at every bar line. Right notes and even eighths after the take.",
          tab: bars(C_ROOT, C_FIRST, C_SECOND, C_FIRST),
          position: 3,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    F_AND_G,
    {
      id: "three-chords",
      title: "One shape, three chords",
      goal: "Play C, F and G by moving one shape, then by staying in one place and changing shape, over a band.",
      why: "A shape is a kind of chord, and the fret you put it on is the chord's name. Move the C shape up five frets and it is F; two more and it is G. That is the easy way to change chord. The better way is the opposite: stay where you are and change to the shape of the next chord that is already under your hand. Both are worth having, and the second is what makes a rhythm part sound smooth.",
      howTo: [
        "Build a chord on notes one, four and five of the C scale and you get C, F and G: the first, fourth and fifth chords of the key of C, and the three chords of a great many songs. F is F, A, C and G is G, B, D.",
        "Moving one shape: C at fret 5, F at fret 10, G at fret 12, counted on the G string.",
        "Staying put around fret 8: C is 9, 8, 8. F is 10, 10, 8. G is 7, 8, 7. The top string hardly moves.",
      ],
      payoff: "Three chords over a band, played two ways, and the same three in two more keys.",
      exercises: [
        {
          id: "move-the-shape",
          title: "C, F and G with one shape",
          purpose: "Shape one moved along the neck: C at fret 5, F at fret 10, G at fret 12, and back to C. The fingers never change, only the place.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, F, G, C.",
            "C: G string 5, B string 5, top string 3. F: 10, 10, 8. G: 12, 12, 10. Keep the fingers in their shape as the hand slides.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_ROOT, F_ROOT, G_ROOT, C_ROOT),
          position: 3,
          shifts: true,
          chords: "C | F | G | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "stay-put",
          title: "C, F and G without leaving fret 8",
          purpose: "The same three chords from three different shapes that sit on top of each other between frets 7 and 10. The hand stays; the fingers change.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, F, G, C.",
            "C: G string 9, B string 8, top string 8. F: 10, 10, 8. G: 7, 8, 7. The note on the top string is C, C, B, C: almost nothing moves up there.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: STAY_MID,
          position: 7,
          shifts: true,
          chords: "C | F | G | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "stay-put-high",
          title: "C, F and G around fret 12",
          purpose: "Once more in the third part of the neck: C in shape three, F in shape two, G in shape one. Between this and the last Exercise, you have each of the three chords in two places.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, F, G, C.",
            "C: G string 12, B string 13, top string 12. F: 14, 13, 13. G: 12, 12, 10.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_SECOND, F_FIRST, G_ROOT, C_SECOND),
          position: 10,
          shifts: true,
          chords: "C | F | G | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "stay-put-keys",
          title: "The same three chords in a new key",
          purpose: "The stay-put shapes moved along the neck: two frets up they are D, G and A, four frets up they are E, A and B, and two frets down they are B flat, E flat and F. The first, fourth and fifth chords of a new key, with the same hand.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "In D: G string 11, B string 10, top string 10; then 12, 12, 10; then 9, 10, 9. Everything from the key of C, two frets higher.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(STAY_MID, "C | F | G | C", { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(STAY_MID, 2),
          position: 9,
          shifts: true,
          chords: "D | G | A | D",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "minor",
      title: "One note makes it minor",
      goal: "Turn a major triad into a minor one by lowering its third, and play A minor in three shapes.",
      why: "The difference between a major chord and a minor chord is one note moved one fret. Lower the third and C major becomes C minor: the root and the fifth stay exactly where they were. So there are no new shapes to memorise. Find the third in a major shape you know, pull it back a fret, and you have the minor shape.",
      howTo: [
        "In shape one of C (frets 5, 5, 3), the third is E on the B string. Move it from fret 5 to fret 4 and the chord is C minor: E has become E flat, the note one fret lower.",
        "A major is A, C sharp and E. Lower the C sharp one fret to C and you have A minor: A, C and E. A minor shares two of its three notes with C major: only the G has become an A.",
        "Listen for the change of mood when the third moves. That one fret is the whole difference.",
      ],
      payoff: "You can hear and play the one fret that separates major from minor.",
      difficultyException:
        "Two of the three Exercises here have no band and no chord changes to follow, both of which the metric counts on a Theory Path. The new demand is hearing one note change the chord, which it does not count.",
      exercises: [
        {
          id: "c-to-c-minor",
          title: "C major to C minor",
          purpose: "Shape one of C, then the same shape with the third lowered a fret, back and forth. The root and the fifth stay where they are while the note on the B string changes.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80. One bar each: C, C minor, C, C minor.",
            "C: G string 5, B string 5, top string 3. C minor: G string 5, B string 4, top string 3. The third finger stays on the G string and the first on the top string. Lift the fourth finger and put the second on fret 4.",
          ],
          coach: "Right notes and even eighths after the take. Listen to what the one fret does.",
          tab: bars(C_ROOT, CM_ROOT, C_ROOT, CM_ROOT),
          position: 3,
          chords: "C | Cm | C | Cm",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "a-minor-three",
          title: "A minor in three places",
          purpose: "The three shapes of A minor up the neck: all three strings at fret 5, then around fret 9, then around fret 13, and back.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bar 1: the first finger across fret 5 on all three strings. Bar 2: G string 9, B string 10, top string 8. Bar 3: G string 14, B string 13, top string 12. Bar 4: back to 9, 10, 8.",
            "For A minor the shape at fret 5 is shape two, with C lowest. Shape one, with A lowest, is the one at fret 14.",
            "The letters are A, C and E every time.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: bars(AM_FIRST, AM_SECOND, AM_ROOT, AM_SECOND),
          position: 5,
          shifts: true,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "c-and-a-minor",
          title: "C and A minor, side by side",
          purpose: "C major and A minor in the same place, twice: at fret 5 and at fret 9. Each time one note changes and two stay.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar each: C, A minor, C, A minor.",
            "Bars 1 and 2: C is 5, 5, 3 and A minor is 5, 5, 5: only the top string moves. Bars 3 and 4: C is 9, 8, 8 and A minor is 9, 10, 8: only the B string moves.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_ROOT, AM_FIRST, C_FIRST, AM_SECOND),
          position: 3,
          shifts: true,
          chords: "C | Am | C | Am",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    MORE_MINORS,
    {
      id: "four-chords",
      title: "The four chords of a thousand songs",
      goal: "Play C, A minor, F and G with the nearest shapes in two parts of the neck, walk the first four chords of the key, and do it in other keys.",
      why: "C, A minor, F and G are the first, sixth, fourth and fifth chords of the key of C, and in one order or another they are a very large share of popular music. With triads they fit under one hand: each change moves one or two notes by a fret or two. Learn them in two places and you can play the same song low and warm or high and bright.",
      howTo: [
        "Around fret 5: C is 5, 5, 3. A minor is 5, 5, 5. F is 5, 6, 5. G is 4, 3, 3.",
        "Around fret 8: C is 9, 8, 8. A minor is 9, 10, 8. F is 10, 10, 8. G is 7, 8, 7.",
        "Before each change, ask which notes stay. Between C and A minor two do; between A minor and F two do.",
      ],
      payoff: "A whole chord progression under one hand, in two places and three keys.",
      exercises: [
        {
          id: "low",
          title: "C, A minor, F, G around fret 5",
          purpose: "The four chords with the hand almost still. From C to A minor one note moves, G up to A, and the first finger lies across fret 5 to play all three. From A minor to F one finger is added. G is the only real change.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C: G string 5, B string 5, top string 3. A minor: 5, 5, 5. F: 5, 6, 5. G: 4, 3, 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: FOUR_CHORDS_LOW,
          position: 3,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "mid",
          title: "C, A minor, F, G around fret 8",
          purpose: "The same four chords one shape higher. The top string holds C for three bars out of four.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C: G string 9, B string 8, top string 8. A minor: 9, 10, 8. F: 10, 10, 8. G: 7, 8, 7.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: FOUR_CHORDS_MID,
          position: 7,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "walk-the-key",
          title: "C, D minor, E minor, F",
          purpose: "The first four chords of the key in order, each built on the next note of the scale. The root climbs the G string, C, D, E, F, and the shape over it comes out major, minor, minor, major: the scale chooses, not you.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C: G string 5, B string 5, top string 3. D minor: 7, 6, 5. E minor: 9, 8, 7. F: 10, 10, 8. The root is on the G string every time: C, D, E, F.",
            "The two minor chords have their B-string note a fret lower than the major shape would. D minor is D, F, A because the scale has F and not F sharp.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_ROOT, DM_ROOT, EM_ROOT, F_ROOT),
          position: 3,
          shifts: true,
          chords: "C | Dm | Em | F",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "four-chords-keys",
          title: "The four chords in a new key",
          purpose: "The fret-5 version moved along the neck: two frets higher it is D, B minor, G and A; four frets higher it is E, C sharp minor, A and B; two frets lower it is B flat, G minor, E flat and F.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "In D: G string 7, B string 7, top string 5; then 7, 7, 7; then 7, 8, 7; then 6, 5, 5.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(FOUR_CHORDS_LOW, "C | Am | F | G", { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(FOUR_CHORDS_LOW, 2),
          position: 5,
          shifts: true,
          chords: "D | Bm | G | A",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "top-note",
      title: "The top note is a melody",
      goal: "Choose shapes so the highest note of each chord makes a line, and play C, G, A minor, F that way in two places.",
      why: "When you change chord, a listener follows the highest note. If it jumps about, the part sounds like separate chords; if it steps or stays, the part sounds like music. Because every triad has three shapes, you can nearly always pick one whose top note is next door to the last one. Musicians call this voice leading, and it is most of what makes a small chord part sound finished.",
      howTo: [
        "For each chord, say what its top note is before you play it.",
        "High version: C with E on top (fret 12), G with D on top (fret 10), A minor with C on top (fret 8), F with C on top (fret 8). The top line is E, D, C, C.",
        "Low version: the top line is G, G, A, A, all at frets 3 and 5.",
      ],
      payoff: "A chord progression whose top notes you could sing.",
      difficultyException:
        "The last Exercise is a self-checked one and the written ones hold a note at the end of every bar, so the note rate sits under the Step before. The new demand is a choice, which shape, and the metric cannot count a choice.",
      exercises: [
        {
          id: "falling-line",
          title: "A line that steps down",
          purpose: "C, G, A minor and F with shapes chosen so the top note falls E, D, C and stays. Each bar ends on its top note, held, so you hear the line.",
          howTo: [
            "Straight eighths and a quarter note at the end of each bar, 60 BPM up to a pass at 90.",
            "C: G string 12, B string 13, top string 12. G: 12, 12, 10. A minor: 9, 10, 8. F: 10, 10, 8.",
            "Each bar rolls the shape and stops on the top string for a beat.",
          ],
          coach: "Band on. Right notes and time after the take. Listen to the last note of each bar.",
          tab: [C_SECOND, G_ROOT, AM_SECOND, F_ROOT].map(toTop).join(" | "),
          position: 8,
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
          id: "low-line",
          title: "The same song around fret 5",
          purpose: "C, G, A minor, F again with the nearest shapes low on the neck. The top note is G for two bars and A for two.",
          howTo: [
            "Straight eighths and a quarter note at the end of each bar, 60 BPM up to a pass at 90.",
            "C: G string 5, B string 5, top string 3. G: 4, 3, 3. A minor: 5, 5, 5. F: 5, 6, 5.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: SONG_LOW.map(toTop).join(" | "),
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
          id: "your-line",
          title: "Your turn: choose the shapes",
          purpose: "C, G, A minor and F with any shapes you like, chosen so the top note moves as little as you can make it.",
          howTo: [
            "Straight eighths with a quarter note at the end of each bar, or any rhythm you like, 60 to 90 BPM, four bars that loop.",
            "Start on any C shape. For each next chord, find the shape whose top note is the same or one step away. The written line is one answer.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen to the top notes alone.",
          tab: SONG_LOW.map(toTop).join(" | "),
          position: 3,
          shifts: true,
          chords: "C | G | Am | F",
          jam: ROCK("C"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Could you say the top note of each chord before you played it?",
            "Did the top note stay within two frets at every change?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "middle-strings",
      title: "The same triads on the middle strings",
      goal: "Play C major and A minor in three shapes on the D, G and B strings, and the four chords there.",
      why: "The top three strings are bright and cut through a band. One set lower, on the D, G and B strings, the same triads are warmer and sit better under a singer. The idea has not changed: three notes, three orders, three shapes. The shapes themselves are a little different, because the B string is tuned differently from the others.",
      howTo: [
        "C on the middle strings: all three at fret 5 (G, C, E), which is shape three. Then D string 10, G string 9, B string 8 (C, E, G), shape one. Then 14, 12, 13 (E, G, C), shape two.",
        "A minor: D string 7, G and B strings 5 (A, C, E). Then 10, 9, 10 (C, E, A). Then 14, 14, 13 (E, A, C).",
        "Let the underside of the finger on the B string lean lightly on the top string so it stays quiet.",
      ],
      payoff: "Every triad you know, in a second, warmer part of the guitar's range.",
      difficultyException:
        "A new Level and a new set of strings, with the shapes played alone before the band comes back, so the rate sits under the Step before. The demand is six new shapes.",
      exercises: [
        {
          id: "c-middle",
          title: "C major on the middle strings",
          purpose: "The three shapes of C on the D, G and B strings: fret 5, fret 8 to 10, fret 12 to 14, and back.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bar 1: the first finger across fret 5 on the D, G and B strings. Bar 2: D string 10, G string 9, B string 8. Bar 3: D string 14, G string 12, B string 13. Bar 4: back to 10, 9, 8.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: bars(C_MID_SECOND, C_MID_ROOT, C_MID_FIRST, C_MID_ROOT),
          position: 5,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "a-minor-middle",
          title: "A minor on the middle strings",
          purpose: "The three shapes of A minor on the same strings: fret 5 to 7, fret 9 to 10, fret 13 to 14, and back.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bar 1: D string 7, G string 5, B string 5. Bar 2: D string 10, G string 9, B string 10. Bar 3: D string 14, G string 14, B string 13. Bar 4: back to 10, 9, 10.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: bars(AM_MID_ROOT, AM_MID_FIRST, AM_MID_SECOND, AM_MID_FIRST),
          position: 5,
          shifts: true,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "four-chords-middle",
          title: "C, A minor, F, G on the middle strings",
          purpose: "The four chords between frets 3 and 7 on the D, G and B strings, with the band.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C: all three strings at fret 5. A minor: D string 7, G string 5, B string 5. F: D string 7, G string 5, B string 6. G: D string 5, G string 4, B string 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_MID_SECOND, AM_MID_ROOT, F_MID_FIRST, G_MID_ROOT),
          position: 3,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "two-sets",
      title: "Two sets of strings, one chord",
      goal: "Join the middle-string shape and the top-string shape of a chord into one four-string shape, and move one C triad all the way up the neck and back.",
      why: "The shape on the middle strings and the shape on the top strings in the same place share two strings. Put them together and you have four strings of the chord under one hand, which is most of the way to the full chord shapes you may already know. And because every shape leads to the next, one chord can be walked from the bottom of the neck to the top.",
      howTo: [
        "Around fret 5, C on the middle strings is 5, 5, 5 and C on the top strings is 5, 5, 3: together, D string 5, G string 5, B string 5, top string 3.",
        "The four-string shape has one note twice: here G is on the D string and on the top string.",
        "Roll up through four strings, back down, and play one more note on the G string to finish the bar.",
      ],
      payoff: "Four strings of any chord under one hand, and C major from fret 3 to fret 14.",
      exercises: [
        {
          id: "c-four-strings",
          title: "C on four strings, in three places",
          purpose: "The joined shape in each part of the neck: around fret 5, around fret 9, and around fret 12, and back to fret 9.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80. Up through four strings, back down, and the G string once more, in each bar.",
            "Bar 1: D string 5, G string 5, B string 5, top string 3. Bar 2: 10, 9, 8, 8. Bar 3: 14, 12, 13, 12. Bar 4: 10, 9, 8, 8 again.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: [
            four("4:5f2", "3:5f3", "2:5f4", "1:3f1"),
            four("4:10f3", "3:9f2", "2:8f1", "1:8f1"),
            four("4:14f3", "3:12f1", "2:13f2", "1:12f1"),
            four("4:10f3", "3:9f2", "2:8f1", "1:8f1"),
          ].join(" | "),
          position: 3,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "four-chords-four-strings",
          title: "The four chords on four strings",
          purpose: "C, A minor, F and G around fret 5 with a fourth string under each shape. It sounds like a full chord part now.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C: D string 5, G string 5, B string 5, top string 3. A minor: 7, 5, 5, 5. F: 7, 5, 6, 5. G: 5, 4, 3, 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: [
            four("4:5f2", "3:5f3", "2:5f4", "1:3f1"),
            four("4:7f3", "3:5f1", "2:5f1", "1:5f1"),
            four("4:7f3", "3:5f1", "2:6f2", "1:5f1"),
            four("4:5f3", "3:4f2", "2:3f1", "1:3f1"),
          ].join(" | "),
          position: 3,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "up-the-neck",
          title: "One chord, the whole neck",
          purpose: "C major from fret 3 to fret 14 and back: up through the three top-string shapes, down through the three middle-string shapes. Six shapes, one chord.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80. Half a bar on each shape, except the last bar.",
            "Bar 1: top strings at 5, 5, 3, then 9, 8, 8. Bar 2: top strings at 12, 13, 12, then middle strings at 14, 12, 13. Bar 3: middle strings at 10, 9, 8, then 5, 5, 5. Bar 4: the first shape again, stopping on its top note.",
          ],
          coach: "Five shifts in four bars. Right notes and even eighths after the take.",
          tab: `/8 ${roll(C_ROOT)} ${roll(C_FIRST)} | ${roll(C_SECOND)} ${roll(C_MID_FIRST)} | ${roll(C_MID_ROOT)} ${roll(C_MID_SECOND)} | ${ending(C_ROOT)}`,
          position: 3,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 100, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    DIMINISHED,
    {
      id: "chords-from-triads",
      title: "The chords you know are triads",
      goal: "Find the triad inside an open C chord and a barre chord, and hear what one more note, the seventh, does to a chord.",
      why: "An open C chord has five strings and only three different notes: C, E, G, C, E. A six-string barre chord has only three as well. Every big major or minor chord shape is a triad with some notes played twice, which is why the small shapes you have learned sound like the same chord. Going the other way, add the seventh note of the scale to a triad and you have a seventh chord: the next family of chords, built the same way.",
      howTo: [
        "Open C, low to high: C (A string, fret 3), E (D string, fret 2), G (open G string), C (B string, fret 1), E (open top string).",
        "A G barre chord at fret 3, low to high: G, D, G, B, D, G. Its top three strings are the G triad you know: 4, 3, 3.",
        "B is the seventh note of the C scale: add it to C, E and G and you have C major seven. Lower it one fret to B flat and you have C seven. On three strings you leave out G, the fifth, which the ear does not miss, and keep C and E with the new note on top.",
      ],
      payoff: "You can look at a chord shape and name the three notes it is made of.",
      difficultyException:
        "Slow on purpose, with no band: the Exercises are for looking at chord shapes and naming their notes, which the metric does not count.",
      exercises: [
        {
          id: "inside-open-c",
          title: "Inside the open C chord",
          purpose: "The open C chord one string at a time, up and most of the way back, then the triad in the middle of it: E on the D string, the open G, and C on the B string.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90. Hold the C chord down throughout.",
            "Bar 1: A string 3, D string 2, open G string, B string 1. Bar 2: open top string, B string 1, open G, D string 2. Bars 3 and 4, the three middle strings only: D string 2, open G, B string 1, open G, then D string 2, open G, and stop on the C.",
            "Say the letters: C, E, G, C, E. Three notes, five strings.",
          ],
          coach: "Right notes and steady quarters after the take.",
          tab: `/4 5:3f3 4:2f2 3:0 2:1f1 | 1:0 2:1f1 3:0 4:2f2 | 4:2f2 3:0 2:1f1 3:0 | 4:2f2 3:0 /2 2:1f1`,
          position: 1,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 5,
        },
        {
          id: "inside-a-barre",
          title: "Inside a barre chord",
          purpose: "A G barre chord at fret 3 one string at a time, then the two triads hiding in it: the top three strings, and the D, G and B strings.",
          howTo: [
            "Quarter notes, except bar 3, which is eighths with a quarter note on the last beat, 60 BPM up to a pass at 80. Hold the barre chord down if you can; if not, fret each note as it comes.",
            "Bar 1: low E string 3, A string 5, D string 5, G string 4. Bar 2: B string 3, top string 3, B string 3, G string 4. Bar 3: the top triad rolled, G string 4, B string 3, top string 3. Bar 4: the middle triad, D string 5, G string 4, and B string 3 held.",
          ],
          coach: "Right notes and time after the take.",
          tab: `/4 6:3f1 5:5f3 4:5f4 3:4f2 | 2:3f1 1:3f1 2:3f1 3:4f2 | ${toTop(G_FIRST)} | /4 4:5f4 3:4f2 /2 2:3f1`,
          position: 3,
          harmony: { arpeggio: "G", cover: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "add-a-seventh",
          title: "Add one note: seventh chords",
          purpose: "C and E held under the first finger, with G left out, while the top note steps down a fret at a time: C, then B for C major seven, then B flat for C seven, which pulls the last bar to an F chord.",
          howTo: [
            "Straight eighths and a quarter note at the end of each bar, 50 BPM up to a pass at 80.",
            "The first finger lies across fret 5 on the G and B strings for the first three bars. The top string is fret 8 with the fourth finger, then fret 7 with the third, then fret 6 with the second. Bar 4 is F: G string 5, B string 6, top string 5.",
            "Listen to each one: with C on top it is plain, major seven is soft, seven wants to move on, and F is where it goes.",
          ],
          coach: "Right notes and time after the take.",
          tab: [top(5, 5, 8), top(5, 5, 7), top(5, 5, 6), F_SECOND].map(toTop).join(" | "),
          position: 5,
          chords: "C | Cmaj7 | C7 | F",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "a-song",
      title: "A whole song in triads",
      goal: "Play a four-bar chord progression twice, low then high, eight bars in all, in three keys, and then with shapes of your own choosing.",
      why: "Everything so far has been four bars. A song is longer, and the skill it needs is staying with the form while the hand changes shape every bar. This is the progression of a great many songs, C, G, A minor, F, played low the first time and higher the second, the way a second guitar part lifts a second verse.",
      howTo: [
        "Bars 1 to 4 around fret 5: C is 5, 5, 3. G is 4, 3, 3. A minor is 5, 5, 5. F is 5, 6, 5.",
        "Bars 5 to 8 around fret 8: C is 9, 8, 8. G is 7, 8, 7. A minor is 9, 10, 8. F is 10, 10, 8.",
        "There are two big moves: from bar 4 to bar 5, and from bar 8 back to the start. Look at the fret you are going to during the last beat before each.",
      ],
      payoff: "Eight bars of rhythm guitar made of small shapes, in any of three keys.",
      exercises: [
        {
          id: "eight-bars",
          title: "C, G, A minor, F, low then high",
          purpose: "Eight bars over the band: the four chords around fret 5, then the same four around fret 8.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "First time: 5, 5, 3, then 4, 3, 3, then 5, 5, 5, then 5, 6, 5. Second time: 9, 8, 8, then 7, 8, 7, then 9, 10, 8, then 10, 10, 8.",
          ],
          coach: "Eight bars with the band. Right notes and time after the take.",
          tab: SONG,
          position: 3,
          shifts: true,
          chords: "C | G | Am | F | C | G | Am | F",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "eight-bars-keys",
          title: "The same song in a new key",
          purpose: "The eight bars moved along the neck: in D the chords are D, A, B minor and G; in E they are E, B, C sharp minor and A; in B flat they are B flat, F, G minor and E flat.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "In D, everything is two frets higher than in C: the first shape is G string 7, B string 7, top string 5.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(SONG, "C | G | Am | F | C | G | Am | F", { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(SONG, 2),
          position: 5,
          shifts: true,
          chords: "D | A | Bm | G | D | A | Bm | G",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "your-song",
          title: "Your turn: your own part",
          purpose: "The same eight bars with shapes, strings and rhythm of your choosing. Roll them, play two notes at a time, leave gaps: it is your part.",
          howTo: [
            "Straight time, any rhythm you like, 60 to 90 BPM, eight bars that loop.",
            "Use any of the shapes you know on the top or middle strings. Keep the top note moving as little as you can. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen as if someone else were playing.",
          tab: SONG,
          position: 3,
          shifts: true,
          chords: "C | G | Am | F | C | G | Am | F",
          jam: ROCK("C"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did you change chord with the band every bar, all eight bars?",
            "Did you use shapes in at least two parts of the neck?",
          ],
          minutes: 4,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: what a triad is",
      summary: "The major scale counted as numbers, one, three and five as a chord, the three shapes of C on the top strings, the same three for F and G, and C, F and G two ways.",
      startHereIf: [
        "You can play eighth notes with a click at 60 BPM.",
        "You play chords from shapes and could not say which 3 notes are in a C chord.",
        "You know the C major scale, or are willing to learn it on 1 string.",
      ],
      steps: ["one-three-five", "three-shapes", "f-and-g", "three-chords"],
      warmups: [
        {
          id: "shape-one-keys",
          title: "Shape one, three chords",
          purpose: "The first major shape, with the root on the G string, rolled on the first, fourth and fifth chords of a key and home. A different key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Keep the fingers in their shape and move the whole hand at the bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: shapeWarmup({ "shape one": { shape: C_ROOT, moves: UP } }, { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9 }, false),
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "three-shapes.first-two", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: minor, and the nearest shape",
      summary: "Minor as one lowered note, A minor, D minor and E minor in three places each, the four chords most songs use in two parts of the neck and in other keys, and choosing shapes so the top note makes a line.",
      startHereIf: [
        "You can play a C major triad in 3 places on the top strings at 80 BPM.",
        "You can play C, F and G with triads over a band.",
        "You change chord by moving the whole hand, and your parts sound jumpy.",
      ],
      steps: ["minor", "more-minors", "four-chords", "top-note"],
      warmups: [
        {
          id: "major-shapes",
          title: "One major shape, three chords",
          purpose: "One of the three major shapes on the top strings, rolled on the first, fourth and fifth chords of a key and home. A different shape and key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Keep the fingers in their shape and move the whole hand at the bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: shapeWarmup({ "shape one": { shape: C_ROOT, moves: UP }, "shape two": { shape: C_FIRST, moves: DOWN }, "shape three": { shape: C_SECOND, moves: DOWN } }, { C: 0, D: 2, E: 4 }, false),
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "three-chords.move-the-shape", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: more strings, and whole chords",
      summary: "The same triads on the middle strings, two sets joined into four-string shapes, the diminished triad, the triads inside open and barre chords, seventh chords, and an eight-bar song.",
      startHereIf: [
        "You can play C, A minor, F and G with the nearest shapes on the top strings at 90 BPM.",
        "You can say the top note of each of the 3 shapes of a triad.",
        "You only know triads on the top 3 strings, or you can't yet see them inside the chords you strum.",
      ],
      steps: ["middle-strings", "two-sets", "diminished", "chords-from-triads", "a-song"],
      warmups: [
        {
          id: "minor-shapes",
          title: "One minor shape, three chords",
          purpose: "One of the three minor shapes on the top strings, rolled on three minor chords, the first, fourth and fifth, and home. A different shape and key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Keep the fingers in their shape and move the whole hand at the bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: shapeWarmup({ "shape one": { shape: AM_ROOT, moves: DOWN }, "shape two": { shape: AM_FIRST, moves: UP }, "shape three": { shape: AM_SECOND, moves: DOWN } }, { A: 0, B: 2, C: 3 }, true),
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "minor.a-minor-three", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
  ],
});
