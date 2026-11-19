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
| Strumming, funk ghost strokes | Not yet | A strummed chord is several onsets smeared together, and the app does not separate a muted stroke from a loud neighbour (`muting` is on the not-graded list). |
| Fingerstyle / Travis | Not yet | Ringing notes make the note check give up, and thumb-and-finger pairs are one onset. Timing-only would work; it needs its own profile and a real-guitar test first. |
| Arpeggios across the neck | Covered | Sweep Picking and Classic Rock already teach them. |

So three new Paths: **Rhythm Foundations**, **Legato**, **Metal Rhythm**.

## The shape every Path keeps

Three open Levels, three Steps each (nine Steps), three or four Exercises a Step,
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
| Advanced: almost no pick | Hammer-ons from nowhere; six-string runs with shifts; long lines in sextuplets and over a band | A full legato line, both directions, held for sixteen bars. |

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
| Advanced: speed and stamina | Triplet gallops and tremolo bursts; pedal riffs with skips; a riff over the band and a stamina minute | A full riff at tempo for a minute, and with a band. |

Strokes are taught in words (the plan is `free`): a gallop is down, down-up, which
strict alternation cannot print. Palm muting and stroke direction are on the
not-graded list and the coach says so.

## How they fit Today's planner

Nothing in the planner changes: it reads `steps`, `levels`, warm-ups and
`progressKey` as it does for the five Paths. The new Paths are added to
`RUNNABLE_PATH_IDS` and to the first-run order after Shred:
Rhythm Foundations is the natural first Path for a beginner; Legato and Metal
Rhythm are deep dives like Alternate Picking and Sweep Picking. Every graded
Exercise goes through `path_exercises` as a Session Take, as the others do.

## The five existing Paths: level audit

Written in phase 2, after the fingering round merges. See the end of this file.
