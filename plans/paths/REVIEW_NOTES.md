# Agent review notes: the first three Paths

> 2026-11-08, on `paths-v1`. These are the reasoning of one agent running the three
> briefs in `plans/PATHS_PIPELINE.md` against its own drafts. **This is not a teacher
> review, and no guitarist has played any of it.** The review status stays `draft`.

## What the validator found, before any review

Written first, then run. These were real faults in the first draft, and all are fixed.

- **Reach:** F at fret 8 with a hammer to fret 13 is 102 mm under one hand. It now
  slides. Three Exercises were affected.
- **Reach:** a position that didn't contain the first note (B string melody), and a
  jump to fret 10 from a no-shift position.
- **Picking:** box 1 up and down was declared "both" and is all inside crossings: the
  turn lands the next downstroke on fret 5. The how-to said the descent was outside,
  which was wrong. Fixed in the text, too.
- **Picking:** odd stroke counts in bursts flipped the first stroke on the next pass.
  This led to a rule: a beat or more between onsets lets the hand reset.
- **Music:** a C on the downbeat of an A7 bar in "both boxes": C is the blue third, and
  this Path says it isn't a landing yet.
- **Looping:** runs that ended two octaves from where they began are now single-pass.
- **Bars:** a half-bar melody with a bar line in it.

## Teacher brief: findings

| Exercise | Problem | Done |
|---|---|---|
| All Blues Exercises with a band | **Straight eighths written over a shuffle band.** A player swings them, and at 90 BPM that is 110 ms from the score: a correct take reads wrong. The worst fault in the draft | Written in shuffle by `swing()`. New rule `backing.feel` |
| `pentatonic-patterns.threes-down` | How-to said a group lands on the beat "every third group". In triplets every group does | Rewritten: each group starts on the opposite stroke |
| `three-per-string` Step, `three-strings` | Fingerings described wrongly, and a shape change misdescribed | Rewritten against the tab |
| `speed-bursts` | Pass rungs too high for this level: one-beat at 140 and two-beat at 120, when clean tempo at this point is near 90 | Lowered to 120, 110 and 100. The ladder still goes higher |
| `over-the-progression` triplet Exercises | Triplets over a straight rock groove sit oddly | Now over `rockTwelveEight`; the sixteenth version stays on `rock8` |
| `turnaround.minor-mid` | Told the player to roll where the shape is one finger per note | Rewritten |
| `five-strings.g-five` | Named the notes without the top D | Fixed |
| `question-answer.aab` | Said "fifteen notes per phrase", when it's about seven | Fixed |
| `two-boxes.box-two` | Named an A at fret 12 on the A string, which is outside box 2 | Fixed |
| `slow-blues.play-less` | Said six bars of music, and there are seven | Fixed |
| `blues-scale` | The goal had a pun where an instruction should be | Fixed |

## Player brief: findings

- **Fixed:** "Above the graded rungs" on Exercises whose every rung is graded; the player
  would look for rungs that aren't there.
- **Fixed:** "Keep the turn at the bottom smooth: the last upward note and the first
  downward note are the same note" made no sense without a teacher in the room.
- **Left for a teacher:** Alternate Picking Step 4 is the wall, and the how-to can only
  describe the pick path in words. A short video would do it better. The Exercise
  format has no field for that, and doesn't need one yet.
- **Left for a teacher:** a player at the sweep level may not know what a "barre roll"
  feels like. There is one Exercise on it and one sentence. It may need more.
- **Good:** every Step has a phrase you can play for someone, and "the app plays, you
  answer" should feel different from any other screen in the app.

## Honesty brief: findings

| Where | Problem | Done |
|---|---|---|
| Detection sentence, three coach lines | **Claimed an unheard slide costs nothing. It doesn't:** `schedule.ts` marks only hammers and pulls soft, so a slid-to note is a miss | Sentence corrected. New rule `honesty.slideBar`, and lower bars on the two slide-heavy sweep Exercises. Slide fix listed as a runtime need |
| `bends.bends-on-time` | Listed "right notes" as graded while its only bar was notes heard. A bend's pitch reading is unknown | New `attacksOnly` profile: it declares what it grades |
| `gradingLimits` for Sweep | Said the fast half of Steps 4 to 7 sits above the line. The data says only sixteenths above 100 BPM and triplets above 133 do | Rewritten from the numbers |
| `moving-shapes.am-f-c-g` | Coach line said "see" | Reworded. The lint doesn't catch a figure of speech, and that's fine |
| Lint | Honest sentences like "I can't see your hands" were first flagged | Lint allows a negated claim, with tests both ways |

The lint can't read meaning. It catches claims with a speaker and a sense in them, and
a paraphrase could get past it. A person must still read coach lines.

## Open: things this review cannot settle

1. **Every threshold.** 0.85 evenness, 150 ms for sweeps, 75 ms for picking: design values.
   The first real-guitar session should change them.
2. **Landing window.** Blues players land behind the beat on purpose. The landing grader's
   window isn't specified, and too narrow would punish exactly the right feel.
3. **Is noise from a sweep heard as extra notes?** The `sweep` bar allows 4 per 4 bars, a guess.
4. **Outside before inside.** Many players find it easier. Some teachers do it the other way.
5. **Pick slanting isn't named.** Step 4 describes the motion without the idea of a slant,
   which some teachers would make central. A teacher should decide; it may need a Step.
6. **Major pentatonic is absent from Blues.** The Path stays with minor pentatonic over
   dominant chords, plus the blue third to C#. It's the natural next Path.
7. **Tuning on the starter shelf** reads an octave above a real guitar. See the pipeline doc.

## How it looks

Screenshots of each page on a 1280-wide desktop and an iPhone 13 profile: no horizontal
overflow on any page, no console errors, tab readable on both, including the 12-note and
16-note bars on a phone, and a note lights as it plays. I read the tab on several
Exercises against the spec, with no mismatch. The audio hasn't been heard by anyone: the
headless browser only proves it runs.

---

# Second pass: Levels, variation, warm-ups, linked arpeggios

> Same day, same caveat: one agent, reasoning, against its own drafts. All three Paths
> stay `draft`. Nothing is researched from any course; progressions and shapes are
> common vocabulary, and every phrase is written here.

## Disagreements and judgement calls, for the owner

1. **Six-string sweeps are in, as one Step.** They add reach and discipline more than
   music, and they aren't what makes Advanced good. If you want more of them, say so.
2. **No major ii-V-I Step.** It was an example in the request. This Path is minor-key, so
   the minor ii°-V-i has that place. A major version is one more `vary` value.
3. **Qualities come before the link, not after.** You can't link to a major V you can't
   name, and it delays the backbone by one Step.
4. **Five-string shapes get a Step before they are chained.** A long shape makes a bad
   link worse, so the link is learned on three strings first.
5. **One chord a bar is a limit, not a choice.** Jam's grid can't change every two beats,
   which is common in this style. Worth reconsidering if linked runs turn out to be what
   people come for.
6. **Warm-ups can't fail you.** They carry a light bar and report it, and they never move
   progress. A warm-up you can fail stops being one.

## Teacher brief: findings

| Exercise | Problem | Done |
|---|---|---|
| `neoclassical.walking-triads` | Claimed each shape was a step higher, and voice leading kept it down around fret 1, with a slide from 1 to 7. Wrong and ugly | Fixed positions climbing the neck, once through, leaving out the augmented III |
| `minor-two-five-one` | A diminished triad's top note is six frets away, so a slide on every loop | Bdim7: same pull, top note in reach |
| `minor-progressions.linked-with-the-v` | Half notes made one pass two bars long, so chords and bars disagreed. The validator caught it | Quarter notes |
| `six-strings.major-six` | Bars didn't fill. The validator caught it | Rewritten |
| Five-string and low-key three-string shapes | Top hammers too wide in some keys. The validator caught 13 of them | `sweepChain` slides where a hammer won't reach, and three-string shapes have a home fret per key |
| `octave-jump`, `inversion-runs` | Ran off the neck in high keys. Caught | Keys chosen so that the top shape fits |
| `speed-bursts.one-beat` | Fret 3 at 170 BPM is a stretch nobody needs | High positions only |

## Player brief: findings

- **Fixed:** "Pick the Bars' chords by ear" was gibberish.
- **Fixed:** how-to text naming frets went wrong once an Exercise moved. Moving Exercises
  now describe the shape, and the Notes line gives the variant's own.
- **Left for a teacher:** `the-link.link-alone` has thirty variants of four notes. A player
  won't need them all, and the seeded order means they'll see them in turn.
- **Left for a teacher:** Intermediate is ten Steps, much the longest Level. It may want
  splitting, but linking is the thread, and the owner asked for it to be the backbone.

## Honesty brief: findings

| Where | Problem | Done |
|---|---|---|
| Pass bars | Lowering a bar for slides on the whole Exercise meant one sliding variant made every variant pass at 70%. A wrong take could get through | The bar now belongs to the variant: only the 20 variants of 271 whose slides need it carry a lower one |
| Advanced Sweep | Self-checked rungs were visible only as dashed chips | The card now says "Grading stops at X BPM" in words |
| Warm-up copy | Could read as if it were checking you | Coach line says it reports and decides nothing |
| Audio on the review page | Nobody has heard it, and it now plays hundreds of variants | Still says so |

## Open

1. Is 30% the right spread for pooling? It's a guess. The real test is whether clean tempo
   really does carry across keys and progressions for a real player.
2. Are six variants enough for a warm-up not to feel the same? Only playing it will tell.
3. Whether a slid-to note should be `soft` in `schedule.ts` still matters more now, with so
   many links. It would let those 20 variants, and the sliding shapes, keep the full bar.
