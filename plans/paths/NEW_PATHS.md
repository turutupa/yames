# New Paths, and the levels inside every Path

> **Status:** 2026-11-18, branch `mvp-paths-content`. Drafts, as every Path is: no
> teacher or guitarist has reviewed them and nothing has met a real guitar.
> Read with `PATHS_PIPELINE.md` (how a Path is built and checked) and
> `LEARNING_PATHS_DECISIONS.md` (what a Path is).

## What the grader can carry

The Session grades **onset timing** (evenness), **notes heard**, **extra notes**,
rough **accents**, and **right notes** on single notes after the take. That decides
which Paths are worth writing now:

| Candidate | Fits? | Why |
|---|---|---|
| Legato (hammer-ons, pull-offs) | Yes | Picked notes anchor the timing; an unheard hammer or pull costs nothing, so the bar stays honest. Shred has two legato Steps and nothing below them. |
| Rhythm on single notes (rests, ties, syncopation, sixteenth figures, triplets) | Yes | It is exactly what onset timing measures, and it is the missing true-beginner Path. |
| Metal rhythm (palm-muted downstrokes, gallops, pedal riffs) | Yes | Single low notes and two-note power chords are one attack each; timing and notes heard grade them. Palm muting itself is taught in words and listed as not graded. |
| String skipping | Yes, later | The difficulty metric already prices a skip. Narrow; a good fourth. |
| Strumming, funk ghost strokes | Timing only, since 2026-11-19 | A strummed chord is several strings struck within a few tens of milliseconds. Written as notes on one tick it is ONE expected onset (`schedule.ts`), and the detector's refractory window (40 to 50 ms at least, wider at slow tempos) is meant to keep it one heard onset. So a strum can be timed and counted, as a power chord is; it cannot be checked for which strings rang or for pitch, and nobody has tried it on a real guitar. First Chords and Strumming is built on exactly that (below). Ghost strokes still cannot be told from loud ones. |
| Fingerstyle / Travis | Not yet | Ringing notes make the note check give up, and thumb-and-finger pairs are one onset. Timing-only would work; it needs its own profile and a real-guitar test first. |
| Arpeggios across the neck | Covered | Sweep Picking and Classic Rock already teach them. |

| Fretboard knowledge (note names, octaves, thirds, triads, the boxes joined up) | Yes | Slow written single notes are what the right-notes check is surest of. The app cannot hear a name said out loud or tell which string a pitch came from, and the Path says so. |

| Scales and modes (major, relative minor, sequences, harmonic minor, Dorian, Mixolydian) | Yes | The same right-notes check, and the validator already holds every written note to its declared scale and every downbeat to its chord, so a mode lesson cannot contain a wrong note. |

| Tapping | Yes | A tap is a loud attack with no stroke, which the schedule already expects to hear; the pull-offs and hammer-ons between taps are soft and cost nothing. So the taps carry the timing, exactly as picked notes do in Legato. Shred has one tapping Step and nothing below or above it. |

| Funk single-note lines (sixteenths with strokes left out, two-note stabs, octaves) | Yes | The strummed, scratched funk part still cannot be graded (row above), but its single-note cousin can: every sound is one picked note or one double stop, and a stroke left out is a rest the schedule already knows. The hand keeps swinging through the holes; the app hears only what is played, and the Path says so. |

So seven new Paths: **Rhythm Foundations**, **Legato**, **Metal Rhythm**, **Tapping**, **Funk Lines**, **Know the Neck** and **Scales and Modes**. Two more came after the owner's note on the harmony route, **Triads** and **Chords in a Key**: see "The curriculum map".

## The shape every Path keeps

Three open Levels, three Steps each to start with (Legato's and Metal Rhythm's
Advanced Levels have since grown a fourth), three or four Exercises a Step,
one warm-up a Level with at least six variants. A player can start at any Level; the
"start here if" lines are things they can check on their own guitar, one with a
number in it.

Inside a Path, difficulty rises along the same six dials, one or two at a time:

1. **Tempo**: the pass tempo of the same figure rises from Level to Level.
2. **Subdivision**: quarters, eighths, triplets, sixteenths, sextuplets.
3. **String crossings**: one string, two neighbours, then across the neck, then skips.
4. **Stretch**: one finger per fret before any wider shape (`reachLevel` per Level).
5. **Shifts**: the hand stays put, then moves at a bar line, then inside a bar.
6. **Technique density**: how much of the bar is the new technique, and how little
   picking is left to lean on.

Beginner changes one dial at a time and always keeps something easy to lean on (a
click on every beat, a picked note on every beat, an open string). Intermediate
combines two. Advanced adds length (16-bar takes, a stamina minute) and a band.

Ladders are paced from the pass tempo (`paceLadders`): the first rung near 0.6 of
the pass, so a four-minute block can reach it.

### Warm-ups

The planner takes a Level's warm-ups in turn, one a Session (`planner.ts`
`warmupStep`: `own[sessions % own.length]`), until the focus Exercise has a clean
tempo of its own. One warm-up a Level means the same figure every day for the
first week, in a new key. So Rhythm Foundations and Legato carry two a Level, and
Metal Rhythm two in Intermediate and Advanced: the second works the Level's other
idea (pull-offs beside hammer-ons, rests beside steady notes, the reverse gallop
beside the gallop). Each has twelve to fifteen variants, a reference Exercise on
the same note grid, and printed fingers where the hand moves every bar.

## Rhythm Foundations (`rhythm-foundations`, mechanics)

**Who for:** the player who can fret a note and hold a pick and has never practised
with a click. Every other Path assumes eighths at 80 BPM; this one gets you there
and past it. Also the experienced player whose time is the weak part.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: on the beat | Quarter and half notes; eighths; rests | Playing with a click, counting out loud, silence in time. Entry to every other Path. |
| Intermediate: between the beats | Off-beats and dotted quarters; sixteenth figures; triplets and the shuffle | Syncopation and the three common ways a beat divides. |
| Advanced: changing gear | Sixteenth syncopation; gear changes (eighths, triplets, sixteenths in one line); riffs over a band | Rhythm that survives a band and a change of subdivision. |

Notes stay easy on purpose (open strings, the E minor pentatonic in open position,
a few frets at the fifth): the rhythm is the only hard thing. Graded on timing and
notes heard, with right notes where the line is a tune.

## Legato (`legato`, mechanics)

**Who for:** players who pick every note and want the smooth sound; blues and rock
players who use a pull-off without having trained one; anyone heading to Shred's
legato Steps, which start at sextuplets.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: one hammer, one pull | Hammer-ons; pull-offs; hammer and pull together | Two notes from one stroke, as loud as a picked note, at eighths and triplets. |
| Intermediate: three fingers | Rolls on one string; pentatonic legato across strings; three notes per string with one pick a string | A scale run with a third of the picking. Ready for Shred's Legato I. |
| Advanced: almost no pick | Hammer-ons from nowhere; six-string runs with shifts; fives and sixes from one pick; long lines over a band and for a minute | A full legato line in both directions, odd groupings, and a roll held for a minute. |

Every legato figure is paired with its picked twin first (the picked bar sets the
rhythm and volume the legato bar has to match). The pick is always on the beat while
the Level is Beginner. Stretch stays at one finger per fret until Intermediate's
three-per-string Step.

## Metal Rhythm (`metal-rhythm`, mechanics)

**Who for:** players who want tight heavy riffs: the palm-muted downstroke, the
gallop, the pedal-tone riff. Rhythm guitar is most of what a metal guitarist plays
and no Path taught it.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: the chug | Palm-muted eighths in downstrokes; power chords and stops; chug against chord | A riff of muted low notes and open accents that sits on the click. |
| Intermediate: the gallop | Gallop; reverse gallop and sixteenth pairs; alternate-picked sixteenths with accents | The three sixteenth figures heavy riffs are built from. |
| Advanced: speed and stamina | Triplet chugs, bursts and tremolo; pedal riffs with skips; stop-start riffs with silent sixteenths; a riff over the band and a stamina minute | A full riff at tempo for a minute, and with a band. |

Strokes are taught in words (the plan is `free`): a gallop is down, down-up, which
strict alternation cannot print. Palm muting and stroke direction are on the
not-graded list and the coach says so.

## Tapping (`tapping`, mechanics)

**Who for:** players who can hammer on and pull off and have never tapped, and
players who know the one famous triplet lick and nothing else. It assumes the
Beginner Level of Legato.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: one tap, one chord at a time | The first tap (tap and pull, the three-note cell, four notes from one tap); moving the tap; changing the chord | The tapped arpeggio in triplets through Am, G, F, E over a band. |
| Intermediate: sixteenths, strings and scales | Four-note loops and two taps a beat; the cell across three strings; a scale shape under the tap | Sixteenth-note tapping, string changes with the muting they need, and six notes from one tap. |
| Advanced: speed, two taps and a band | The cell in sextuplets; two tapped notes and string skips; two four-bar tapped lines over a band and a stamina minute | Tapping at the speed it is known for, and for long enough to be a solo section. |

Difficulty rises by subdivision (eighths, triplets, sixteenths, sextuplets), by
which hand moves (the tap first, then the fretting hand, then both), by strings
(one, two, three, a skip), and by how many notes each tap has to carry (one, two,
three, five). Every line is graded on timing and notes heard and none on pitch.

## Funk Lines (`funk-lines`, mechanics)

**Who for:** players who can pick steady sixteenths and whose rhythm playing is
still all chords. It assumes sixteenth notes with a click at 70 BPM and stopping
a note cleanly (the Intermediate Level of Rhythm Foundations covers both). Am7 and
D9, A minor with the Dorian F# late on, a funk band groove.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: the hand that never stops | The engine (sixteenths on one note with the accent on the beat, the 'and', two and four); leaving strokes out (the three one-hole figures); two lines with the band | A sixteenth-note hand that keeps its down-up while notes go missing, and a first two-bar line over a groove. |
| Intermediate: stabs and octaves | Two-note stabs on two and four, on the 'and', on single sixteenths; a line answered by a stab, Am7 to D9, the vamp with the band; octaves in eighths and sixteenths | The two sounds a funk rhythm part is made of besides the line, and the change between the two chords. |
| Advanced: across the beat, and the pocket | Three-sixteenth figures that slide across the beat, lines that start on the 'e', a two-bar phrase; the Dorian sixth and hammer-ons; four bars of everything and two one-minute Takes | Displacement, the F# that makes it Dorian, and holding one bar still for a minute. |

Difficulty rises by how many strokes are left out and where (none, one a beat,
most of the bar), by what is played (one note, a line, a double stop, an octave
with a muted string between), and last by where the figure sits against the beat.
Tempo rises little: funk is not a speed style, and the Advanced Level is harder
in placement, not in bpm. The three engine Exercises are graded on accents; lines
on timing and notes; stabs and octaves, being two notes at once, on timing only;
the two minutes on stamina. Pick direction is taught in the text (down on the
beat and the 'and', up on the 'e' and the 'a') and is not graded, so Exercises
with holes are `pick: "free"`. The muted scratch between notes is written as a
rest: if the app hears one it is an extra note, so the bar on extras is loose
(six), and the Path says the scratch is for the ear.

## Know the Neck (`know-the-neck`, theory)

**Who for:** the player who knows chord shapes and box 1 and could not say what
note is under a finger. It sits with Blues and Classic Rock under "what you choose
to play", and feeds both.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: the notes by name | The low E and A strings; octave shapes; the D, G and B strings | Any natural note on any string, found by name or by an octave shape. |
| Intermediate: the shapes of harmony | Thirds on two strings; roots, fourths and fifths; triads on the top three strings | The pieces chords are made of, each as one shape, and three chords under one hand over a band. |
| Advanced: the whole neck, and the changes | The five pentatonic boxes joined along two strings; arpeggios low to high and through Am, F, C, G in one position; landing on chord tones | Solos that leave box 1 and follow the chords. |

Difficulty rises by subdivision (quarters and halves, then eighths), by shifts
(one string walked with one finger, then shapes that move, then five positions),
and by harmony (one scale, then a chord a bar over a band). Speed is never the
point: no pass tempo is above eighths at 100. Fingers are printed nearly
everywhere, because the shapes are the lesson: the second finger guides thirds on
the G string, the first finger walks a string, triads use chord fingerings.

## Scales and Modes (`scales-and-modes`, theory)

**Who for:** the player who has the pentatonic box and some chords and wants the
seven-note scales: what a major scale is, why A minor has the notes of C major, and
what people mean by Dorian and Mixolydian.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: the major scale and its minor | The major scale in open position and as a formula on one string; one movable shape; the relative minor | A major and a minor scale in any key from one shape each, and a tune over three chords. |
| Intermediate: patterns, positions and one raised note | Sequences in threes, fours and thirds; two positions and three notes per string; harmonic minor over Am and E7 | A scale the fingers know in any order and beyond one position, and the first "one changed note" lesson. |
| Advanced: the modes over a band | Dorian over Am and D; Mixolydian over A and G; choosing the scale from the chords | The two modes a rock or blues player meets first, heard as one note against the scale already known. |

Every mode is taught the same way: the shape, then the same phrase with the old
note and the new one side by side, then a phrase over the two chords that ask for
it. The movable major shape is written in A at fret 4, not G at fret 2, because the
reach model (and a beginner's hand) refuses frets 2 to 5 at an early level. Know
the Neck comes first for a player who cannot name notes; this Path assumes nothing
from it but is easier after it.

## The curriculum map (2026-11-18)

The owner's correction: the Path names in his notes were examples. The set of
Paths is a teacher's call, inside what the grader can judge. His real goal, as
intent: *someone with no theory who wants to understand how chords, keys and
arpeggios work on the guitar, and use that in their playing, with structure.*

### Three tracks, one start

```
START HERE
  First Chords and Strumming   (open chords, changes, strumming: the other first Path)
  Rhythm Foundations ──┬─> Alternate Picking ──┬─> Sweep Picking
  (time, the click,    │        (I)            └─> Shred
   clean notes)        ├─> Legato ──(B)──┬────────> Tapping
                       │                 └──(B)──> Sweep Picking, Shred
                       ├─> Metal Rhythm
                       ├─(I)─> Funk Lines
                       ├─> Blues and Pentatonics
                       └─> Classic Rock

HOW HARMONY WORKS (the owner's route)
  Know the Neck ──(B)──> Scales and Modes ──(B)──┐
       └──────────────(B)────────────────────────┴─> Triads*  ──(I)──> Chords in a Key* ──(B)──┐
                                                        └──────────────(I)────────────────────┴─> Arpeggios over Changes* ··> Sweep Picking
  * All three are written (first versions).
  (B), (I): through that Level of the Path the arrow leaves.
```

An arrow is a recommendation and never a lock: the app may say "before this,
do X, or start anyway". Arrows are data now (`prerequisites.paths`, below).

| Track | Path | Builds on | Length | State |
|---|---|---|---|---|
| Foundations | Rhythm Foundations | nothing: the first Path for a beginner | 6 weeks | written |
| Foundations | **First Chords and Strumming** | nothing: the first Path for a beginner who wants songs | 14 Steps, 55 Exercises, about 11 weeks | written 2026-11-19, extended the same day |
| Technique | Alternate Picking | Rhythm Foundations (Beginner) | 9 weeks | written |
| Technique | Legato | Rhythm Foundations (Beginner) | 6 weeks | written |
| Technique | Tapping | Legato (Beginner) | 5 weeks | written |
| Technique | Sweep Picking | Alternate Picking (Intermediate), Legato (Beginner) | 12 weeks | written |
| Technique | Shred | Alternate Picking (Intermediate), Legato (Beginner) | 10 weeks | written |
| Technique | Metal Rhythm | Rhythm Foundations (Beginner) | 6 weeks | written |
| Technique | Funk Lines | Rhythm Foundations (Intermediate) | 5 weeks | written |
| Style | Blues and Pentatonics | Rhythm Foundations (Beginner) | 23 Steps, 92 Exercises, about 18 weeks | written, extended twice |
| Style | Classic Rock | Rhythm Foundations (Beginner) | 17 Steps, 61 Exercises, about 12 weeks | written, extended twice (2026-11-19) |
| Harmony | Know the Neck | nothing: the first Path for the harmony route | 15 Steps, 54 Exercises, about 11 weeks | written, extended twice (2026-11-19) |
| Harmony | Scales and Modes | Know the Neck (Beginner) | 6 weeks | written |
| Harmony | **Triads** | Know the Neck (Beginner), Scales and Modes (Beginner) | 18 Steps, 60 Exercises, about 12 weeks | written, extended twice (2026-11-19) |
| Harmony | **Chords in a Key** | Triads (Intermediate) | 20 Steps, 69 Exercises, about 14 weeks | written, extended three times (2026-11-19) |
| Harmony | **Arpeggios over Changes** | Triads (Advanced), Chords in a Key (Beginner) | 16 Steps, 54 Exercises, about 11 weeks | written, extended twice (2026-11-19) |

Nothing is renamed, split or merged: every existing Path teaches one thing a
teacher would teach as one thing, and its Exercise ids carry progress. Know the
Neck keeps its short triads Step as a first look; the Triads Path is where they
are learned.

### The owner's route, and where a teacher's differs from his wording

He wrote: what a triad is, moving it around the neck, building chords from it,
playing in a key, moving chords within the key, sweep arpeggios on top. The
intent is right and the destination is right. The order a teacher would use:

1. **Note names on the neck** (Know the Neck, Beginner). Not in his list, and
   first: a triad is three named notes, and "move it" means "find those names
   somewhere else". Without names, shapes are all there is.
2. **The major scale, and counting its steps** (Scales and Modes, Beginner).
   Also not in his list. A triad is defined as steps 1, 3 and 5 of a scale, and
   a key *is* a major scale. So "playing in a key" is not a late topic: the
   scale comes before the triad, and the key is met here for the first time.
3. **Triads** (new Path): 1-3-5; major, minor and diminished as one changed
   note; the three shapes each triad has on a set of three strings; the same
   triad in three places; then other string sets. This is his "what a triad is"
   and "move it around the neck", and it is the longest part, with every shape
   revisited in new keys before the next arrives.
4. **Chords from triads** (the Advanced Level of Triads): the open and barre
   chords he already plays are these same three notes with some doubled, and a
   seventh chord is a triad with one more third on top. His "build chords from
   it". It sits inside Triads, not in its own Path, because it is the payoff of
   that Path and not a new subject.
5. **Chords in a Key** (new Path): stack 1-3-5 on every note of the scale and
   seven triads come out, always major, minor, minor, major, major, minor,
   diminished. Roman numerals; I-IV-V; the vi and the ii; the progressions most
   songs use; the same progression in another key; the minor key. His "play in
   a key" and "move chords within that key" are one subject, in that order.
6. **Arpeggios over Changes** (new Path): each chord of a progression played one
   note at a time, in time, changing to the nearest note of the next chord. His
   "sweep arpeggios on top", with one correction: sweeping is a picking
   technique and has its own Path with its own entry (Alternate Picking first).
   This Path teaches *which notes*, slowly, with any picking; it ends on two-
   and three-string shapes that are the first Steps of Sweep Picking, and sends
   the player there for speed.

Running alongside, and missing from his list: **rhythm** (Rhythm Foundations
from the first day: harmony played out of time teaches nothing) and **the
ear**. The app cannot grade singing or naming a chord by ear, so ear work is
written into these Paths as self-checked "your turn" Exercises (play the third,
then sing it; play I-IV-V and say which is which), labelled "not checked yet"
like every other one.

What the grader can carry on this route: arpeggiated triads and scales are slow
written single notes, where the right-notes check is at its best. Two- and
three-note chord stabs are graded on timing only. A strummed chord is several
onsets smeared together and is not graded: where a Path needs a strum, it is a
self-checked Exercise that says so. Nothing on the route depends on strumming.

### Triads (`triads`, theory): the first Path of the route, written

**Who for:** the owner's player: plays some chords from shapes, knows no
theory, wants to know what a chord *is*. It assumes eighth notes at 60 BPM and
nothing else; the first Exercise counts the C major scale along one string.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: what a triad is | One, three, five (the scale counted on the B string; notes 1, 3, 5; the same three under one hand). Three shapes for one chord. One shape, three chords (C, F, G by moving one shape; by staying put in two places; in D, E and B flat) | What a chord is made of, C major in three places, and three chords over a band. |
| Intermediate: minor, and the nearest shape | One note makes it minor. The four chords of a thousand songs (C, Am, F, G low and mid; C, Dm, Em, F; other keys). The top note is a melody | Minor as one lowered note, a whole progression under one hand, and voice leading as a choice of shape. |
| Advanced: more strings, and whole chords | The same triads on the D, G and B strings. Two sets joined into four-string shapes; one chord along the whole neck. The triads inside an open C and a barre chord; sevenths. An eight-bar song in three keys | A second register, the link to the big chord shapes he already plays, and a first look at seventh chords. |

Every tab is generated from a three-fret shape (`top(5, 5, 3)`), with fingers
worked out once by rule, so the notes, the fingering and the transpositions
cannot drift apart. Warm-ups stay behind the lessons on purpose: the Beginner
one uses only shape one, the Intermediate one the three major shapes learned in
Beginner, the Advanced one the minor shapes learned in Intermediate.

**Grown to its intended length (2026-11-19, `src/paths/specs/triads-more.ts`).**
Five more Steps, 19 Exercises, all new ids: F and G on the middle strings and
D minor and E minor there (both in the Intermediate Level, with `middle-strings`
moved down to open them, because Chords in a Key's Beginner Level already plays
middle-string shapes and builds on Triads only through Intermediate); the A, D
and G strings (C and A minor in three shapes, the four chords); C, F and G and
the four chords in other keys down there, and one C chord on three sets of
strings in one place (the barre chord seen as three triads); a second song,
sixteen bars in G with the verse on the middle strings and the chorus climbing
the top strings, in four keys. A second Advanced warm-up rolls the middle-string
shapes. Levels are now 4 / 7 / 7 Steps.

Left for later, if a teacher wants more: the low E, A and D strings (same
fingerings as A, D and G, said in the text and not drilled); augmented triads;
triads in 3/4 (the pipeline writes 4/4 only).

### Chords in a Key (`chords-in-a-key`, theory): the second Path of the route, written

**Who for:** a player who has the first two Levels of Triads and asks the next
question: which chords go together, and why.

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: seven chords from one scale | A chord on every note (the upper four, all seven, three major and three minor). Chords have numbers (one, four, five on the middle strings; an eight-bar form; other keys). Two, three and six (each minor chord as the partner of a major one; one, six, two, five) | The pattern major, minor, minor, major, major, minor, diminished, and chords named by number. |
| Intermediate: progressions, keys, and the minor key | Two, five, one; six, four, one, five; one, three, four, five. The seven chords of D; progressions in keys that change. The minor key (i, iv, v; VI and VII; the major V) | A handful of progressions by name, in any key, and the main chords of a minor key. |
| Advanced: forms, and songs of your own | One progression in two parts of the neck. The twelve-bar form, low, high and in other keys. A verse and a chorus from four chords, in other keys, then the player's own eight bars | Forms longer than four bars, and numbers used to build something. |

It reuses the shape helpers of Triads, so the same rule fingers both Paths.
Chord numbers are written as words in the copy ("one, four, five") because
that is how they are said, with the Roman numerals named once.

**Grown to its intended length (2026-11-19, `src/paths/specs/chords-more.ts`).**
Seven more Steps, 27 Exercises, all new ids. Intermediate: the key of A in
full; one, five, six, four by number in G, A and keys that change, with one,
six, four, five beside it; the minor key a second time in E minor, ending on
eight bars that put the same four chords under two homes (G major, then E
minor). Advanced: sixteen bars, AABA, with a bridge that starts on four; three
chords from outside the key (the flat seven, the major two, the minor four),
each found from a chord the player knows by moving one note; the seventh chords
of the key as four-string shapes with the root on the A string and on the low
E string (triad, then the same chord with one finger moved, for each of the
four kinds; all seven in order: C, D, E, F on the A string and G, A, B, C on
the low E string at the same four frets); two, five, one and one, six, two,
five in those sevenths, in four keys, ending on a self-checked "play them as
chords". That last Step is the hand-off to Arpeggios over Changes, whose
Intermediate Level opens on the same four chords. Levels are now 3 / 7 / 7.

Fingering decisions worth a teacher's eye: A-string-root shapes are fingered so
a triad and its seventh share fingers (C `1 3 3 3` to Cmaj7 `1 3 2 4`, Dm
`1 3 4 2` to Dm7 `1 3 1 2`, Bdim `1 2 4 3` to Bm7b5 `1 2 1 3`); the low-E-root
minor seven is one first-finger barre, which works because the roll never
sounds the A string and would need muting when strummed (the "your turn" says
so). E minor to C at frets 3 to 5 is fingered 2-3-1 to 2-3-1 so one finger
slides.

### Arpeggios over Changes (`arpeggios-over-changes`, theory): the third Path, written 2026-11-19

Written to the plan below, with three differences: one-octave arpeggios run from
a root on the D string (the four-string shapes Triads ends on, so nothing new
for the hand); the Path builds on Triads through its Advanced Level for that
reason; and the sweeps are timed and counted but not pitch-checked
(`sweepTiming`, as in Sweep Picking). Consolidation Steps added to the other two
Paths the same night are in `src/paths/specs/harmony-more.ts`: F and G in three
places, D minor and E minor in three places, the diminished triad (Triads), and
the key of G in full (Chords in a Key). The shape helpers moved to
`src/paths/specs/triadShapes.ts` so a Path and its extra Steps can share them.

The original plan

Builds on Triads (Intermediate) and Chords in a Key (Beginner). The plan, for
whoever writes it (the helpers in `triads.ts` are exported for this):

| Level | Steps | Notes for the author |
|---|---|---|
| Beginner: one chord, one octave | A triad as a line, not a shape: root, third, fifth, root up one octave across three strings, and back (C, then A minor). The same over I-vi-IV-V with the band, one bar each, starting each bar on its root. Then starting on the nearest note instead of the root | Quarter notes then eighths. `harmony: { chordTones: true }` holds every note to its chord. Lift each finger as the next lands: these are lines, so the note check wants them not to ring together. |
| Intermediate: two octaves, and sevenths | Two-octave major and minor arpeggios in the E and A shapes. Add the seventh (maj7, m7, 7) on ii-V-I. Arpeggio up one chord, down the next. A written chorus of arpeggios over the twelve-bar form | Reuse the keys of Chords in a Key through `inKeys`. A "your turn" that connects two chords by the nearest note. |
| Advanced: the first sweeps | Three-string triad shapes played with one pick stroke per direction, slowly, as the same notes the player already knows. Two-string and three-string shapes over I-V-vi-IV. Hand-off: the last Step's Exercises are the first Step of Sweep Picking at half its tempo, and its payoff sends the player there | Sweep Picking grades ringing sweeps with a looser note bar (see its `gradingLimits`); copy its grading for these three Exercises only. Do not teach speed here. |

**Arpeggios over Changes, grown (2026-11-19, `src/paths/specs/arpeggios-more.ts`).**
Four more Steps, 15 Exercises: the two-octave shapes on G, D minor and through
one, four, five of G and of A minor; seventh arpeggios across six strings (A
minor seven as the pentatonic box with D left out, C major seven, G seven) and
a two, five, one that crosses the neck; two, five, one in a minor key (B
half-diminished, E seven, A minor seven: the arpeggios, a written line, three
more minor keys, a your-turn); and two more swept fingerings before the song
(the one-finger barre that has to roll, and the root-lowest minor shape Sweep
Picking starts from). Levels are now 3 / 5 / 5.

### First Chords and Strumming (`first-chords`, mechanics, foundations): written 2026-11-19

**Who for:** the true beginner who wants to play songs: no chords yet, or two
that buzz. Builds on nothing. It was "not built" until the scorer was read
closely: a strum written on one tick is one expected onset, so it can be timed
and counted today. What cannot be heard is taught in words, checked another
way, or left to the player and labelled so.

| What a teacher wants to know | How this Path finds out |
|---|---|
| Does every string of the chord ring? | "Check every string": the chord held and picked one string at a time in slow quarter notes, graded on right notes. A dead or muted string is a missing note. One for each of the ten chords that needs it (E minor, A minor, C, G, D, A, D minor, the small F). |
| Is the strum on the beat, and is the next chord there in time? | Strums graded on timing, strums heard and extras (`grade: "timing"`, evenness 0.75, heard 0.85 because upstrokes are quiet, extras 6). A late change is a late or missing strum. |
| Did the hand keep its down-up swing through the strokes left out? | Not hearable. Taught in the text, asked in a self-check question. |
| Louder on two and four? | `accents` profile, with a low bar (0.6): the readout is rough. |
| Can they choose a pattern, play a real song? | Two "your turn" Exercises, self-checked. |

| Level | Steps | What it unlocks |
|---|---|---|
| Beginner: three chords and a steady hand | E minor (strings, one strum a bar, four); A minor and the first change (one, two, then four strums a bar, with the band); C, one finger from A minor, and an eight-bar tune | Three chords that ring, changes that land on the beat, a first tune. |
| Intermediate: five chords and the upstroke | G (held with fingers 2, 3 and 4, so E minor keeps one finger and C is the same two-finger move as E minor to A minor); D, and G, C, D two ways; eighth notes down and up; patterns as the swing with strokes left out, ending on down, down-up, up-down-up through G, D, E minor, C | The three chords of a thousand songs and the strum of a thousand more. |
| Advanced: ten chords, and a whole song | A and E (A to D on a sliding third finger), an eight-bar A, D, E form; D minor, F major seven, then the small F, and A minor, F, C, G; accents, a stop, bass note and strum; a sixteen-bar song with a different strum for verse and chorus, and "a song you know" | Ten chords including the F that stops beginners, dynamics, a whole song. |

Decisions a teacher should look at first: the 2-3-4 G fingering; E minor with
fingers 2 and 3; upstrokes written as the top three strings only; the small F
(four strings) instead of the full barre; the pass tempos (70, 80, then 85 to
90). Warm-ups cannot be chord changes, because the validator wants a warm-up to
move along the neck (`warmup.moves`) and open chords sit under one hand: they
are a one-finger scale walk along one string (minor in quarters, major in
eighths, six strings each) and, in the last Level, a two-string first-finger
barre moved up the neck, which is strength work for F.

`difficulty.ts` counts onsets, not notes (since 2026-11-19; before that a
six-string strum was six notes, and strummed Exercises read 9 to 18 where a
single-note line at the same rate read 2). A strum is one attack, so the
strummed Exercises now read 0.3 to 4, and the Steps run from 0.9 to 2.7. The
metric still does not see the fretting hand's work inside a strum, so the Step
order is a teacher's where a new chord arrives on fewer strums a bar, and the
exceptions say so.

For the UI (not built here): strum direction is not drawn. `pickPlan` is
`free`, so no stroke marks are printed; a down or up arrow over each strum
would help a beginner more than anything else on the screen. And the first-run
step does not know this Path (it comes last, through the unknown-runnable
rule): a player who says they want to play songs should be offered it first.

### Other foundations a beginner needs, not built

- **Ear training** as its own Path: not gradable today.
- **Fingerstyle**: same limit as before (ringing notes).

### Dependencies in the format

`PathDoc.prerequisites.paths` is now `PathPrerequisite[]`: `{ path, level? }`.
`level` means "through that Level of that Path"; without it, having started the
Path counts. A spec writes `prerequisites: { paths: ["legato"] }` or
`{ path: "legato", level: "beginner" }`. Guidance only.

- `src/paths/curriculum.ts`: `checkCurriculum(docs)` (every reference exists, no
  Path builds on itself, no duplicates, Levels are real, no cycles, each loop
  reported once and spelled out), `curriculumOrder(docs)` (every Path after
  what it builds on), `unmetPrerequisites`, `buildsOn`. Twelve tests, one of
  which runs the check over the shipped specs.
- `npm run paths -- check` runs it over every pack and prints a `curriculum:`
  line; a bad graph fails the check like any other error.
- `src/session/prerequisites.ts`: `unmetPathPrerequisites(progress, paths,
  path)` for one player. Through a Level means being on a Step after its last,
  or on its last with that Step passed; choosing a higher Level counts, because
  that is the player saying they know the lower one. Four tests.
- Ten of the twelve Paths now name what they build on (table above). The pack
  schema version is unchanged: every pack before this had an empty list.

### Categories in the format

The app shows a Path's `kind`: "Technique" for mechanics and "Styles" for
theory. That is right for Blues and Classic Rock and wrong for Triads, Chords
in a Key, Know the Neck and Scales and Modes, which are theory and are not
styles. `kind` cannot simply gain a value: it decides how a Path is graded and
measured (the difficulty metric, the Theory Path tests), and those four are
theory in that sense.

So `PathDoc.category` is new and separate: `foundations`, `technique`, `style`
or `harmony` (`PATH_CATEGORIES` in `format.ts`). It is optional in a pack;
`categoryOf(doc)` in `curriculum.ts` falls back to the old split. Every shipped
Path now declares one, `paths check` refuses a value outside the list, and a
test holds the four harmony Paths to "harmony".

| Category | Paths |
|---|---|
| foundations | Rhythm Foundations |
| technique | Alternate Picking, Legato, Tapping, Sweep Picking, Shred, Metal Rhythm, Funk Lines |
| style | Blues and Pentatonics, Classic Rock |
| harmony | Know the Neck, Scales and Modes, Triads, Chords in a Key, Arpeggios over Changes |

For the UI worker (not built here): the tag on a Path and the groups on the
Paths list should read `categoryOf(path)`, with four strings
(`session.category.foundations` "Foundations", `.technique` "Technique",
`.style` "Styles", `.harmony` "Harmony") in 15 locales, in the order
foundations, harmony, technique, style or as the first-run recommendation
needs. `session.kind.theory` ("Styles") should stop being used as a Path's
label; the Take screen's Mechanics/Theory distinction can stay on `kind`.

### UI spec for prerequisites (not built: for a UI worker)

Small, and all the data is ready. Nothing below touches Today or the daily mix.

1. **Path page (`PathDetail` in `src/containers/session/PathsView.tsx`), under
   the goal line.** If `path.prerequisites.paths` is not empty, one quiet line:
   "Builds on: Rhythm Foundations (Beginner), Legato (Beginner)". Each name is a
   link that opens that Path's page (`place.move({ pathId })`). The Level name in
   brackets only when the prerequisite has a `level`; use the Level's short name
   (`levelSubtitle`'s first part), not its full title.
2. **Same page, only when `unmetPathPrerequisites(progress, session.paths,
   path)` is not empty and the player has not started this Path.** A calm
   one-line suggestion above the Start button, never instead of it: "Start with
   Rhythm Foundations first, or start anyway." "Rhythm Foundations" opens that
   Path; Start stays exactly as it is. Name only the first unmet one. Once the
   Path is started the line goes away for good: the player has decided.
3. **Paths list (`PathList`).** No badge and no lock. Optionally order the list
   with `curriculumOrder(session.paths)` inside each group so a Path never sits
   above what it builds on; the owner's first-run order (`START_PATH_ORDER`) is
   his and stays.
4. **Strings** (15 locales, `session.paths.*`): `buildsOn` ("Builds on: {{list}}"),
   `startFirst` ("Start with {{path}} first, or start anyway."), and the list
   joiner if the locale files have none.
5. **Tests**: `PathsView.test.tsx` (line shows with links; suggestion shows only
   when unmet and not started; Start still starts), a layout check that the
   line wraps inside the page at the four widths, and one screenshot per theme.
6. **Planner (reading only, for whoever owns it)**: when the mix has room for
   one more Path, prefer one whose `unmetPathPrerequisites` is empty. Not done
   here: Today focus and the daily mix were just merged and are under review.

## How long each Path is (owner's note, 2026-11-18)

Paths are not the same length and are not meant to be. A narrow technique is
done when the technique is in the hand; a style is something a player lives in
for months, and it needs Steps that add nothing new and take the last idea to
another key, feel, form or position before the next idea arrives. So length is
set per Path from what it teaches.

The weeks below are a rough model, not a measurement: an Exercise takes about
four Sessions to pass, a fifteen-to-twenty-minute Session holds three or four
of them, six Sessions a week. That comes to about a week for every five
Exercises. A teacher should correct it once real players have been through.

| Path | Kind of thing | Steps (B / I / A) | Exercises | Intended length |
|---|---|---|---|---|
| Blues and Pentatonics | A style | 6 / 6 / 6 | 74 | Long: about 14 weeks. Extended on purpose (below). |
| Sweep Picking | A deep technique | 5 / 9 / 4 | 65 | Long: about 12 weeks. The middle Level is the technique. |
| Shred | Several techniques joined | 3 / 7 / 5 | 54 | About 10 weeks. |
| Alternate Picking | A core technique | 3 / 3 / 5 | 45 | About 9 weeks. |
| Classic Rock | A style | 3 / 4 / 4 | 39 | About 7 weeks. A candidate to grow the way Blues did. |
| Rhythm Foundations | Fundamentals | 3 / 3 / 3 | 34 | About 6 weeks. |
| Legato | A technique | 3 / 3 / 4 | 34 | About 6 weeks. |
| Metal Rhythm | A technique in a style | 3 / 3 / 4 | 30 | About 6 weeks. |
| Know the Neck | Knowledge | 3 / 3 / 3 | 30 | About 6 weeks; should grow (triads on every string set, below). |
| Scales and Modes | Knowledge | 3 / 3 / 3 | 30 | About 6 weeks. |
| Funk Lines | A narrow technique | 3 / 3 / 3 | 27 | Short: about 5 weeks. |
| Tapping | A narrow technique | 3 / 3 / 3 | 27 | Short: about 5 weeks. |

**What the pipeline assumes about length: nothing that blocks a long Path.**
Checked in `validate.ts`, `difficulty.ts`, `pace.ts` and the planner:

- There is no limit on Steps in a Path or in a Level. The only count rule is
  three to five Exercises in a Step. Sweep Picking already had eighteen Steps
  and a nine-Step Level before this work; Blues now has eighteen in three sixes.
- `progress.difficulty` asks each Step's median to be no lower than the one
  before. A consolidation Step often is lower, because it replays known material
  somewhere new, and the rule already has the answer: `difficultyException`
  with the reason written down. Blues needed two new ones (`bends`, after the
  quick-change chorus, and `two-boxes`, the plain start of a new Level). No
  rule was loosened.
- `pace.ts` works on one Exercise's ladder, and the planner walks `steps`,
  `levels` and warm-ups by id. Neither reads a Path's length.
- One test was tied to the old order (`rotation.test.ts` took "Blues' second
  Step" by index to find a self-checked Exercise). It now names the Step.

### Blues and Pentatonics, extended

Seven Steps and 26 Exercises added (`src/paths/specs/blues-more.ts`), none
replacing anything: 11 Steps and 48 Exercises became 18 and 74. Existing ids are
untouched, so nobody's progress moves.

| Level | New Step | What it consolidates |
|---|---|---|
| Beginner | The box in other keys | Box 1 in G, C and E, and the first chorus in a key that changes. |
| Beginner | The same notes, a straight feel | The box over a straight rock band: even eighths, a low-string riff, twelve bars of riffs. |
| Beginner | Landing on the third, in new keys | The arpeggio-and-lick in G and C, and a chorus whose phrases stop on C#, F# and G#, then in G, C or D. |
| Intermediate | The quick change | The same form with D7 in bar 2: roots, the boogie line, a written chorus. |
| Intermediate | The minor blues | Am7, Dm7, E7: the F the box does not have, the turn, a written minor chorus, a your-turn. |
| Advanced | Boxes 3 and 4 | Two more shapes, the second door, one line from the fifth fret to the twelfth. |
| Advanced | Sixths | Two-note sixths for A7, D7 and E7, the form in sixths, a lick that ends on one (timing only: double stops are not pitch-checked). |

Still to do for Blues, in the same spirit: box 5 and a line that enters box 4;
the form in E in open position with its turnarounds; a jump or uptempo shuffle;
slow blues in a second key; a three-chorus solo with a shape.

### Classic Rock, extended (2026-11-19)

Two Steps and 7 Exercises added (`src/paths/specs/classic-rock-more.ts`), none
replacing anything: 11 Steps and 39 Exercises became 13 and 46.

| Level | New Step | What it consolidates |
|---|---|---|
| Beginner | The same riffs in E | The root line five frets lower, where half its notes become open strings; the fourths and the pedal riff on the same frets one string lower. Two ways to move a riff: by frets, or by strings. |
| Intermediate | The next box up | Box 2 of A minor pentatonic, which the two-string extension was the top of: the shape, a four-bar line through box 1 into box 2 and home, a lick that lives in box 2, a your-turn. |

Still to do for Classic Rock, in the same spirit: the licks of `box-extension`
and `repeating-licks` in E at the twelfth fret; double stops over a second
progression; a chord-tone Step over I, IV, V (the Path only has I, flat VII,
IV); a second, shorter solo in E that uses box 2 and the open-position riffs.

### The second pass (2026-11-19, evening)

Written by authoring agents from `plans/paths/AUTHOR_BRIEF.md`, each proof-read
against the pack's notes and corrected before translation.

| Path | New Steps (Level) | Now |
|---|---|---|
| Classic Rock | `box-at-twelve` (B): the box licks in E at fret 12. `double-stops-in-e` (I): double stops over E, A, B and a twelve-bar chorus. `chord-tones-ade` (I): chord tones over one, four, five. `solo-in-e` (A): a twelve-bar solo in E before the sixteen-bar one | 17 Steps, 61 Exercises |
| Blues and Pentatonics | `open-e-blues`: the form in E at the nut with its turnarounds. `fast-shuffle`: known lines at a jump tempo. `box-five`: the last box, joined to boxes 1 and 4. `three-choruses`: a solo with a shape. `slow-blues-in-c`: the slow feel in a second key | 23 Steps, 92 Exercises |
| First Chords and Strumming | `strums-between-beats` (I): a rest, off-beat upstrokes, a pattern that leaves room for the change. `sevenths-blues` (A): A7, D7, E7 and a twelve-bar blues in A. `sixteenth-strums` (A): four strokes to a beat at slow tempos | 14 Steps, 55 Exercises, thirteen chords |

### The third pass: the harmony route takes its time (2026-11-19, night)

Three Paths of the owner's route had a Level where each idea was met once. Nine consolidation Steps,
36 Exercises, nothing new for the hand, written and proof-read the same way as the second pass
(`src/paths/specs/*-encore.ts`):

| Path | New Steps (Level) | Now |
|---|---|---|
| Know the Neck | `roots-other-keys` (I): the roots of one, four, five and of one, six, four, five in G and in D. `boxes-second-key` (A): the five boxes in E minor, box 1 at the nut (and once at fret 12). `changes-in-g` (A): landing on chord tones over G, E minor, C and D | 15 Steps, 54 Exercises, Levels 5 / 5 / 5 |
| Chords in a Key | All Beginner. `one-four-five-again`: the three major chords of C in new orders and an eight-bar form, on both string sets. `coming-home`: lines that stop on five against lines that come home to one, with an ear "your turn". `numbers-in-f`: the same numbers found chord by chord in F (not G: `key-of-g` already writes G out) | 20 Steps, 69 Exercises, Levels 6 / 7 / 7 |
| Arpeggios over Changes | `four-chords-in-g` (B) and `nearest-note-again` (B): the one-octave arpeggios, the four-chord line and the nearest-note line a second time, in G and in a new order. `sevenths-in-g` (I): the four sevenths and two, five, one in G, and the line in keys that change | 16 Steps, 54 Exercises, Levels 5 / 6 / 5 |

Decisions a teacher should look at: E minor's one-octave arpeggio starts at fret 14 on the D string
(fret 2 would need open strings), so G to E minor is a nine-fret move, and the text says so; the G two,
five, one is the C line a fourth lower re-strung into frets 2 to 7; B flat in F keeps the rule's
fingering (7, 6, 6 with fingers 2, 1, 1: the G shape three frets up); the ear Exercise `your-turn-home`
uses a click and not the band, so the band does not play the one for the player; the D bar of
`changes-in-g.g-arpeggios` is fingered 3, 1, 2, 1 (a one-fret slide down from C) after the proof-reader
found the engine's 4, 1, 3, 2 crossed fingers.

**Per-variant text.** A variant may now carry its own `purpose` and `howTo`
(`plans/PATHS_PIPELINE.md`). The key-moved Exercises of Triads, Chords in a
Key and Arpeggios over Changes use it: 38 variants whose how-to is generated
from their own notes by `src/paths/specs/keyText.ts`. The Take screen needs a
UI change to show it (it reads the base Exercise); the review pages show it.
Every other varied Exercise still has one text for all its variants.

## Proof-reading (2026-11-18)

Four independent readers checked the words of every new Exercise against its
notes by script: note names from MIDI, frets, fingers against the pinned
fingering, counting text against onsets, counts and shapes against the tab,
theory statements, tempo sentences against the ladders. About ninety confirmed
defects were fixed, most of them a sentence that was true of one bar and written
as if of all (a count, a "throughout", a "twice round"), a few real ones: a
double tap described in a way no hand can play, "fifths and sixths" that were
fourths and thirds, a Mixolydian rule stated as Dorian's, an example line that
broke its own rule, two finger descriptions that disagreed with the neck.

One finding is structural and only softened: a varied Exercise has one text,
written for its first variant, so its frets and note names are wrong for the
others. Legato, Tapping and two Know the Neck Exercises now end their how-to with
one sentence saying so; Rhythm Foundations dropped the key variants on four lines
that are named "at the fifth fret"; Metal Rhythm names both strings. The real fix
is text per variant in the format, which is a pipeline change and not made here.
The five older Paths have the same seam.

Two defects found in older content are fixed (2026-11-19):
`neoclassical.i-iv-dim-i` spelled the diminished chord of E minor as Ebdim7 (the
notes are D#, F#, A, C); `moveChord` now spells a diminished chord on a leading
tone as a sharp, with a test. `over-a-heavy-band.band-big-chain` promised a V
chord that one of its progressions does not have; its purpose now says so.

## How they fit Today's planner

Nothing in the planner changes: it reads `steps`, `levels`, warm-ups and
`progressKey` as it does for the five Paths. The new Paths are added to
`RUNNABLE_PATH_IDS`, and to the first-run order after the owner's five (his order
is kept; whether Rhythm Foundations should come first for a beginner is his call).
Legato, Tapping, Funk Lines and Metal Rhythm are deep dives like Alternate Picking and Sweep Picking;
Know the Neck and Scales and Modes sit with the Styles. Every graded
Exercise goes through `path_exercises` as a Session Take, as the others do.

## The five existing Paths: level audit

Audited 2026-11-18, after the fingering round merged, from the packs: each Step's
difficulty, each Exercise's pass tempo, ladder and note grid, and each Level's
"start here if" lines. Read as a teacher would: is Beginner beginner, is there a
cliff, does Advanced go further than Intermediate.

| Path | Beginner | Intermediate | Advanced | Verdict |
|---|---|---|---|---|
| Alternate Picking | Eighths pass 100, sixteenths 85 to 90, accents 75 to 80. A true beginner Level. | Crossings at 75 to 90, pentatonic patterns, three per string at 80. Even climb. | Bursts, skips, a stamina minute, the band: but nothing passed faster than sixteenths at 85, the Intermediate figure. | **Advanced did not go faster than Intermediate.** Fixed: a new Step. |
| Shred | Sixteenths pass at 100 to 120 from the first Exercise, sextuplets at 75 in Step 2. Not a beginner's Level: it is the entry Level of an intermediate Path, as the owner's outline says (`tasks/mvp/CONTENT.md`: one-string sixteenths to 110 to 120). | Seven Steps, well spread. | Legato, sweeps, tapping, five Steps; sextuplet legato at 85 to 90 is the outline's own figure. | **Tempos left as the outline set them.** The gap is below the Path, not in it. Fixed in words: `assumes` now says where to go first, and Rhythm Foundations and Legato are the on-ramps. |
| Sweep Picking | Starts on a three-string triad loop at triplets 100. A first-time sweeper has never made the rest stroke on two strings. | Nine Steps, the long middle of the Path; the link Step drops to half notes on purpose (exception declared). | Six strings, fast shifts, neoclassical, a heavy band. Goes further. | **A missing first rung.** Fixed: a two-string push-and-pull Exercise opens Step 1. |
| Blues and Pentatonics | Box 1 at eighths 80 with a band from the first Exercise; chord tones; call and response. Beginner for a Theory Path. | Blues scale, the form, bends, question and answer. | Two boxes, guide tones, slow blues. Harder in listening and choosing, which the metric does not price (exceptions declared). | **Consistent, but Advanced never left the minor pentatonic.** Fixed: a Step mixing major and minor over the changes. |
| Classic Rock | Step 1 riffs at eighths 110, then Step 2 asked for sixteenths at 90 and sextuplets at 70, more than the Intermediate Level's own "start here if" (a sixteenth lick at 80). | Repeating licks, double stops, embellishment, chord tones. | Melody, call and response, a sixteen-bar solo: phrasing, and nothing fast. | **A cliff inside Beginner, and a Level label that contradicted it; an Advanced Level with no peak.** Fixed: the two pass tempos come down, and a climax Step is added. |

### What changed

- **Alternate Picking, new Step `up-to-tempo`** (Advanced, after the cross-string
  runs): both licks at sixteenths 105, three strings of three-per-string at 100
  from three starting strings, the six-note lick looped in sextuplets at 75, and
  the six-string run in sixteenths at 90. Figures the player already knows, so
  speed is the only new thing. Four new Exercise ids; nothing renamed.
- **Blues, new Step `major-and-minor`** (Advanced, after the two boxes): A major
  pentatonic at the fifth fret, a four-bar phrase that plays C# over A7 and C over
  D7, a tenth-fret phrase ending on the sixth, and a "your turn". Four new ids.
- **Classic Rock, new Step `climax`** (Advanced, before the solo): the run up the
  box, the repeating lick at speed, the tumble down in pull-offs, and the three
  joined in four bars, all in sixteenths passing at 90 to 95. The Advanced Level
  was phrasing only; a solo also needs a peak. Four new ids. `solo-etude` now
  declares a difficulty exception, since it follows fast licks.
- **Classic Rock, Step `box-extension`:** `page-descent` passes at 80 (was 90) and
  `sixes-down` at 60 (was 70). The ladders still climb to 110 and 90. A lower pass
  tempo can only turn an old near-miss into a pass, so no stored progress is hurt.
- **Sweep Picking, Step `triads`:** a new first Exercise, `two-string-push`: two
  notes of the triad in one push, a silent beat, the same two in one pull. Three
  variants. The ids after it are unchanged.
- **Shred:** `assumes` names the tempo the first Step passes at and points a player
  below it to Rhythm Foundations or Alternate Picking's Beginner Level.

- **Alternate Picking, how-to text:** the seven thinnest how-tos (one sentence
  each, no frets or fingers) now say the subdivision, the notes and fingers, and
  what to listen for: `outside-moving`, `inside-moving`, `six-note-up`,
  `one-beat`, `two-beats`, `box-minute`, `etude-eighths`. Words only.

- **Sweep Picking, how-to text:** six one-sentence how-tos now say the
  subdivision, how many loops a chord, and what to listen for:
  `with-the-v-three`, `the-pull`, `chain-four`, `band-big-chain`, `i-iv-dim-i`,
  `link-chains.one-pass-each`. Words only.

### How progress is keyed (why these are safe)

Clean tempo and Takes are stored by `pathId/exerciseId` (`session/progress.ts`
`ceilingKey`), and a variant pool by `exerciseId::pool` (`variants.ts`
`progressKey`). Nothing reads `step.order`. So adding a Step or an Exercise is
safe, and so is changing a tempo or a sentence; only renaming or moving an
Exercise to another Step would orphan progress, and nothing here does.

### Left for a teacher

- Shred's Beginner Level by name: it could be called what it is (the entry Level
  of an intermediate Path) once a real beginner has tried it.
- Sweep Picking's `picked-turn` (sixteenths at 85 in Step 1) and `triad-pair`
  (triplets at 110 in Step 3) are the high notes of their Steps; a player can pass
  the Step without them (three of four), so they stay.
- The four new Steps (`up-to-tempo`, `major-and-minor`, `climax`, and Sweep's
  `two-string-push` Exercise) are drafts like the rest: tempos are a teacher's
  estimate and none has been played into the app.
