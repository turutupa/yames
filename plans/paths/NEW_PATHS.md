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

| Fretboard knowledge (note names, octaves, thirds, triads, the boxes joined up) | Yes | Slow written single notes are what the right-notes check is surest of. The app cannot hear a name said out loud or tell which string a pitch came from, and the Path says so. |

| Scales and modes (major, relative minor, sequences, harmonic minor, Dorian, Mixolydian) | Yes | The same right-notes check, and the validator already holds every written note to its declared scale and every downbeat to its chord, so a mode lesson cannot contain a wrong note. |

So five new Paths: **Rhythm Foundations**, **Legato**, **Metal Rhythm**, **Know the Neck** and **Scales and Modes**.

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

## How they fit Today's planner

Nothing in the planner changes: it reads `steps`, `levels`, warm-ups and
`progressKey` as it does for the five Paths. The new Paths are added to
`RUNNABLE_PATH_IDS`, and to the first-run order after the owner's five (his order
is kept; whether Rhythm Foundations should come first for a beginner is his call).
Legato and Metal Rhythm are deep dives like Alternate Picking and Sweep Picking;
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
