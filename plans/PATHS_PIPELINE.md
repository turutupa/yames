# The learning-path pipeline

> **Status:** Built 2026-11-08 on `paths-v1`. The three Paths in it are **drafts**:
> no teacher or guitarist has reviewed them, and nothing has been tried on a real
> guitar in the app.
> **Runtime rule:** Path content is authored ahead of time and checked by these
> tools. The app's model never writes an Exercise at runtime
> (`LEARNING_PATHS_DECISIONS.md` D0.3, D0.4).

A new Path is: write a short spec, run a command, read the errors, review the page.

```sh
npm run paths -- new <id> "<Title>" <mechanics|theory>   # start a spec, registered
npm run paths -- gen [id]                                # spec to pack JSON and fixtures
npm run paths -- check [id]                              # validate; prove packs match specs
npm run paths -- validate <file.json>                    # validate any pack file
npm run paths -- review [id] [--out dir]                 # one HTML page per Path
npm run paths -- all                                     # gen, check, review
```

Review pages go to `../yames-concept/paths-review/` unless `--out` says otherwise.

## What lives where

| Path | What |
|---|---|
| `src/paths/format.ts` | The contract: `PathDoc`, `Step`, `Exercise`, `PATH_SCHEMA_VERSION` |
| `src/paths/metrics.ts` | The three controlled lists: metrics, not-graded, detection flags, and the trust limits |
| `src/paths/profiles.ts` | Named grading profiles and their bars. Move a bar here and regenerate |
| `src/paths/spec.ts` | What an author writes |
| `src/paths/tabDsl.ts` | The compact tab notation, and stroke marking |
| `src/paths/templates.ts` | Parametric templates |
| `src/paths/generate.ts` | Spec to pack. Pure; same input, same bytes |
| `src/paths/reach.ts` | The reachability model |
| `src/paths/honesty.ts` | The banned-claims lint |
| `src/paths/validate.ts` | Every rule, by id, in `RULES` |
| `src/paths/difficulty.ts` | The stated difficulty metric |
| `src/paths/toScore.ts` | An Exercise as a `SongScore` and as alphaTex |
| `src/paths/review.ts`, `reviewClient.ts` | The review page and its play-along |
| `src/paths/specs/*.ts` | **The content.** One file per Path |
| `src/paths/packs/*.json` | **Generated, checked in.** What the app will bundle |
| `src-tauri/tests/path_exercises.rs` | Every target Exercise through `match_attempt` |
| `scripts/paths.mjs` | The CLI: bundles `src/paths` with esbuild and does the file I/O |

## Does the existing score format fit? (`SONGS.md` A2)

Yes for the notes, no for the rest, so a pack wraps it rather than replaces it.

- **Reused as is:** ticks at 960 per quarter, strings counted from the highest,
  `hammer` and `pull` on the arrival note and `slide` on the departure, `SongScore`,
  `buildSchedule`, `ScoreSchedule`, `match_attempt`. `toScore.ts` is the adapter,
  and it writes alphaTex that goes through the real `importSong`. A test holds the
  two to each other, note for note, for every Exercise.
- **Added around it:** pick marks, rests as data, why and how-to text, ladders, pass
  bars, graded and not-graded lists, landings, guide parts, backing. `SongScore`
  has no place for these and should not grow one.
- **Reused theory data:** pitch classes from `src/jam/scales.ts` and
  `src/jam/harmony.ts`; grooves from `src/jam/grooves.ts`; charts parsed by
  `src/jam/chart.ts`, so a chart that validates is a chart Jam can play.
- **Added theory:** spelling. The jam data names pitch classes with one key-wide
  preference, which is right on a chord sheet and wrong in a lesson that must say
  Eb in A blues and G# in E7. `theory.ts` adds letter tables and takes the pitch
  classes from the jam data.

**A format trap this found.** alphaTex `\tuning e5 b4 g4 d4 a3 e3` imports as MIDI
76 to 52, an octave above a real guitar (E4 is 64). That is how
`src/songs/starter/pieces.ts` and the fixtures are written. Packs use `e4 b3 g3 d3
a2 e2`, which gives 64 to 40, the same as a Guitar Pro file. `pitch.rs` compares
against `midi`, so note checks on the starter shelf look likely to read as a wrong
octave on a real guitar. Not changed here; see the open questions.

## The format (schemaVersion 1)

A reader refuses a version it doesn't know. One JSON file per Path, one note per
line so a diff is reviewable.

**Path:** `id`, `title`, `kind` (`mechanics`: how hands play; `theory`: what you
choose to play), `goal`, `level`, `assumes`, `prerequisites`, `tuning`,
`review { status, history }`, `orderRationale`, `gradingLimits`,
`estimatedMinutes`, `steps`.

**Step:** `id`, `order`, `title`, `goal`, `why`, `howTo`, `payoff` (what they will
hear themselves gain), `prerequisites`, `difficulty`, optional
`difficultyException`, `exercises` (3 to 5).

**Exercise:**

| Field | Meaning |
|---|---|
| `purpose`, `howTo`, `coachLine` | Why it exists, technique in words, what the Coach may say |
| `grading` | `graded`, `landings`, `selfChecked`, `practiceOnly` |
| `feedback` | `afterTake`, `livePerNote`, `livePerBar`, `none`; `feedbackNote` says what it needs |
| `meter`, `bars`, `loops`, `holdSeconds` | Shape |
| `position` | `{ fret, shifts }`: index finger's fret, and whether the hand moves |
| `pickPlan`, `crossing`, `pickFlipsOnLoop` | `alternate`, `sweep` or `free`; `inside`, `outside`, `both`, `none`. Guidance, and never graded |
| `notesRole` | `target` is scored against; `example` is one way to do it and never scored |
| `notes`, `rests`, `guide` | `{ string, fret, midi, tick, dur, tech, pick?, accent?, bend? }`. `beat = tick / 960`. `guide` is what the app plays: the call in a call and response |
| `chords`, `harmony`, `landings` | Symbol per bar; declared scale, arpeggio or chord tones, with spelling; the graded moments |
| `tempo` | `rungs` of `{ bpm, grading }`, and `passAtBpm` |
| `passBars` | `{ metric, min|max, overBars }`, only from the controlled list |
| `selfCheck` | Questions the player answers. Required on any self-checked rung |
| `graded`, `notGraded` | Controlled ids, said out loud |
| `detection` | `{ flags, notes }`: what makes it hard to hear, and the sentence that says so |
| `backing` | `click` with a subdivision, or `jam` with `grooveId`, `feel`, `key`, `chart` |
| `estimatedMinutes` | One pass |
| `tab` | The source, expanded, in the notation below |
| `computed` | Note count, tightest gap, hand shifts, fastest fingering, difficulty. Recomputed by the validator, so it can't go stale |

Review status: `draft`, then `agent-reviewed`, `teacher-reviewed`, `played`. Past
draft, the validator wants an entry in `review.history` with who and when.

## Writing a spec

Compact tab, in `tabDsl.ts`: `/16 5:5 5:6> 3:7b2v | /4 r hold`. `/8` sets the value
until changed (`.` dotted, `t` triplet), `s:f` is string and fret, suffixes are `h`
hammer, `p` pull, `s` slides out, `b2` bend two semitones, `v` vibrato, `>` accent,
`m` palm mute, `l` let ring, `d` or `u` a stroke. `r` rests, `rest` rests to the bar
line, `hold` lengthens the last note to it, `|` is a bar check that throws.

Templates, in `templates.ts`, return that same notation and take their pitches from
the theory data, so a wrong shape is an impossible thing to type:

```ts
tab: `/16 ${repeat("5:5 5:6 5:7 5:8", 4)}`                    // one cell, repeated
tab: `/8t ${pentatonic({ root: "A", box: 1, sequence: "threesDown" })} hold`
tab: `/16 ${threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 3, sequence: "updown" })}`
tab: `/16 ${inPositions(cell, [0, 0, 5, 7])}`                  // this pattern in these keys
tab: `/8t ${sweepLoop({ chord: "Am", strings: [5, 4, 3, 2, 1], near: 12, doubleLow: true })}`
tab: swing(`/2 4:7 /8 3:5 3:7 3:5 3:7`)                        // for a shuffle band
```

The generator derives what the author could forget: strokes, flags, the not-graded
list, which rungs may be graded, difficulty. The author declares what is a teaching
claim (crossings, harmony, position), and the validator checks it against the notes.

## The validator

Each rule has an id in `RULES` and a broken fixture in `validate.fixtures.test.ts`;
a rule with no fixture fails the suite. `npm run paths -- check` runs them all and
also fails if a pack isn't what its spec generates.

- **Schema:** version, shape, controlled lists, unique ids, stale `computed`, no TODOs.
- **Tab:** string and fret range, tab and MIDI agree, values are notatable, notes and
  rests fill every bar, no note crosses a bar line, bends carry a distance.
- **Looping:** first note on beat 1 (or a guide), no absurd leap at the seam, no
  stuttered repeat, alternation survives the seam.
- **Reachability (`reach.ts`):** physical, on a 25.5" scale. A hand covers a span in
  mm, set by the Path's level and tightening to 85% as notes get fast. Shifts take
  time (a Fitts-style cost). A dynamic programme searches for the cheapest fingering
  from the declared position at the top rung, and reports the bar and beat it dies on
  and the fastest tempo that would work. The numbers are a teacher's estimate; what
  they buy is that the impossible fails. It caught a real one: F at fret 8 with a
  hammer to fret 13.
- **Picking:** strokes alternate or sweep as declared, legato notes carry none, and
  the declared crossing is what the strokes produce. It caught a real one: box 1 up
  and down is all inside crossings, and the draft said otherwise.
- **Music:** every note in the declared scale or chord (a bend by its target), covered
  when asked, downbeats on chord tones for lines over changes, spelling correct,
  landings agree with their chord, and the example obeys its own landings.
- **Backing:** groove exists and fits the meter, Jam reads the key and the chart as
  the same chords, and no straight eighths over a shuffle band.
- **Ladders:** rise, no jump over 25%, pass rung is graded, nothing graded above a
  self-checked rung, nothing graded above the trust limit.
- **Progression:** Step order, difficulty non-decreasing or an exception declared,
  prerequisites exist and have no cycles, 3 to 5 Exercises, why, how-to and payoff
  present, at least one measurable or self-checked bar per Step, minutes add up.
- **Honesty:** the banned-claims lint, pass bars only on controlled metrics that are
  declared graded, the required not-graded ids, detection flags with their sentences,
  grading mode agreeing with everything else, feedback that doesn't over-promise, no
  status past draft without a record, and no notes-heard bar a correct take could fail
  because its slides were too quiet.
- **Runtime:** the Exercise produces a usable schedule through the real `buildSchedule`.

**The difficulty metric** (`difficulty.ts`) is notes per second at the pass tempo,
times `1 + 0.4 crossings + 0.6 skips + 0.3 shifts (+ 0.25 if swept)`, plus 3 × the
share of legato or bent notes. Theory adds freedom (written 0, self-checked 0.5,
landings or practice-only 1.5) and 0.5 per chord change in four bars. A Step is the
median of its Exercises. It is a yardstick for ordering: it can't count control,
stamina, listening or choosing, so Steps that are harder in those ways declare an
exception, and those exceptions are worth a teacher's eye.

## Grading: what can be trusted

From `metrics.ts`, on the evidence of `yames-concept/audit/CONVERSION_AUDIT.md` §3.
**No real-guitar test exists, so every threshold is a design value.**

| Metric | Source | Status |
|---|---|---|
| `timingEvenness` | `ScheduleReport.interval_consistency` | in report |
| `notesHeard` | `hit_completeness` | in report |
| `extraNotes` | `extras` | in report |
| `accentPlacement` | `accent_agreement` (rough) | in report |
| `cleanTempo` | `srs.rs update_ceiling` | exists, unwired |
| `noteIdentity` | `pitch.rs` over a take's dry stem | exists, unwired |
| `landingChordTone` | pitch at the landing moment | new |
| `scaleMembership` | share of pitched notes in the scale | new |
| `restsKept` | no onset in the rest windows | new |
| `evennessHold` | evenness over the last quarter of a take | new |

Forbidden in a pass bar: `score` (ignores missed notes on guitar) and
`gridAlignment` (no latency calibration on the known-score path).

Trust limits as a gap between onsets: picked notes 75 ms (sixteenths at 200 BPM, the
fastest the audit ran through the shipped detector, on synthetic plucks); swept notes
150 ms (sixteenths at 100, triplets at 133, sextuplets at 66), a cautious policy with
no test behind it at all. Faster rungs must be self-checked.

## What the runtime still needs

1. **A loader and a Session.** Nothing reads a pack yet. `audit` §4 has the plan.
2. **The pass rule.** Bars over report fields, windowed by bars; the current `score`
   can't be it.
3. **Latency calibration on the known-score path** (audit defect 2), before any fast
   rung is believed. `path_exercises.rs` pins the failure, so it will tell you when it
   is fixed.
4. **The noise-floor and poll-feed hazards** (audit §3) before stamina or high gain.
5. **Slid-to notes as soft.** `schedule.ts` marks hammers and pulls soft, and not
   slides, so an unheard slid-to note is a miss. Small, but it moves song scoring, so
   it's not changed here. Until then `honesty.slideBar` keeps the bars forgiving.
6. **`noteIdentity` wired** from `analyze_take_pitch` to an Exercise's notes.
7. **The new graders:** `landingChordTone`, `scaleMembership`, `restsKept`, `evennessHold`.
8. **Live per-bar pitch** for the four `livePerBar` Exercises in Blues (land-any-tone,
   two-chords, follow-the-form, free-guide-tones). They fall back to after the take.
   Everything else in Blues is after the take, or has no feedback.
9. **Guide parts** played by the synth, for the call in Steps 3 and 7 of Blues.
10. **Bend measurement.** Not built; every bend is self-checked until it is.
11. **Band bleed.** Untested with a microphone. Direct input or headphones until then.

## The authoring workflow, and what done means

| Stage | Who | Done means |
|---|---|---|
| 1. Spec | Agent or author | The goal, level and order are written down, and every Exercise has a musical reason |
| 2. Generate | `paths -- gen` | Pack and fixtures written |
| 3. Validate | `paths -- check`, tests | Zero errors and zero warnings; exceptions read by a person |
| 4. Agent review | Three briefs below | Notes in `plans/paths/REVIEW_NOTES.md`, real problems fixed, new rules added for what a rule could catch. Status may become `agent-reviewed`, with a history entry |
| 5. Teacher review | A real teacher, with the review page | Every row on the sheet marked, the fixes made. `teacher-reviewed` |
| 6. Played | A real guitarist, on a real guitar, in the app | Each Step played at its pass tempo, with takes kept, the thresholds and trust limits revised from what the app actually heard. `played` |

**Adding a Path:** `npm run paths -- new`, fill in the spec, `gen`, `check`, `review`,
then stages 4 to 6. Add the JSON to the bundle when the runtime exists.

**A change of mind about a bar or a limit:** edit `profiles.ts` or `metrics.ts`, run
`gen`, and read the diff: every affected Exercise moves, and the validator says which
rungs no longer qualify.

### Agent review briefs

Paste one of these, with the Path's spec and pack paths, into a fresh session.

**A: A demanding teacher.**
> You have taught guitar for twenty years, and you are reviewing a draft curriculum
> in `<spec>` (the review page is `<html>`). Be harsh. For each Step: is the order
> right, or is something taught before what it depends on? Would you give this to
> this level? Is each Exercise musically real, or filler? For every Exercise, read
> the how-to against the tab, note by note: does the text describe what the notes
> actually do (fingers, strings, strokes, note names, bar counts)? Are the tempos
> honest for this level, at both the start and the pass rung? Where is a bad habit
> being taught? Does anything over a band fit that band's feel? What is missing?
> List only real problems, each with the Exercise id and the fix. Don't praise.

**B: A player at the target level.**
> You are a guitarist at exactly this level: `<level and assumes>`. You have no
> teacher. Work through `<spec>` in order. Where would you not understand the words?
> Where would you not know what to do with your hands? Where is the jump too big from
> the last Exercise? Which Exercise would make you give up, and which would make you
> feel you got somewhere? Is there an audible payoff in every Step, and would you
> notice it? List what you would get stuck on, with the Exercise id.

**C: The honesty check.**
> The app has only sound. It can measure note identity on single notes, timing
> evenness, missed and extra notes, clean tempo and rough accents, and it has not been
> tested on a real guitar. It can't hear pick direction, muting, posture, tension or
> which hand caused a problem, and it doesn't reliably separate fast sweeps or
> ringing notes. Read every sentence in `<spec>` that a player sees, especially
> coach lines, pass bars and self-checks, against
> `yames-concept/audit/CONVERSION_AUDIT.md`. Flag anything that implies more than
> that: a claim, a promise of feedback that isn't built, a pass bar a correct take
> could fail, a bar a wrong take could pass, or a statement about accuracy. Then ask
> what the validator's lint missed, and propose a rule for it.

## How the next Path is faster

- The format, the validator and the review page exist, and don't need thinking about.
- Templates carry over: a new key, position or scale is a parameter. Most Mechanics
  Exercises become one line of tab.
- Every mistake found so far became a rule, so it can't recur: reach, inside and
  outside, band feel, slide bars.
- The review briefs are ready.

An honest estimate: an agent writes and validates a ten-Step draft spec in about half
a day. The validator catches the mechanical faults in minutes, and reading the how-to
against the tab still takes time, because the words can't be checked by code.

## What remains human-only

- Whether it is musical, and whether a lick sounds good.
- Whether the order works on a real student, and whether the tempos are realistic for
  them.
- Whether the words teach. The validator can tell that a how-to exists, not that it's
  right; the sentence "the turn makes these outside crossings" was wrong in a draft,
  and only a rule written afterwards can catch that kind of thing.
- Whether a real guitar, in the app, gets heard. Nothing here substitutes for that, and
  the thresholds are placeholders until then.
