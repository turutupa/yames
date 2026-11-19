# Paths content: handoff (2026-11-19, afternoon PST)

For the agent (Opus 5.5) that continues the curriculum work. Read this, then
`plans/paths/NEW_PATHS.md` (the design doc: "The curriculum map", "First Chords
and Strumming" and "How long each Path is" matter most), then
`plans/PATHS_PIPELINE.md` if the pipeline is new to you. The handoff before this
one is in git (`git show 322695ed:plans/paths/HANDOFF.md`); everything in it
that still holds is repeated here.

Worktree: `/home/dgx-personal/projects/yames-mvp-paths2`, branch `mvp-paths2`
(started at `revamp` 3b7fea3f). Never push; the orchestrator merges into
`revamp`. Board: Personal board (`~/.local/bin/card`, project `Yames`), cards
#59 (harmony route), #65 (nobody has played any of this), #66 (first chords),
and the cards this session opened (listed in section 6).

## 1. What exists

Sixteen Paths, all status `draft`, all in 15 locales, `paths check` clean.

| Path | category | Steps | Exercises | Steps B/I/A | Builds on |
|---|---|---|---|---|---|
| rhythm-foundations | foundations | 9 | 34 | 3/3/3 | none |
| **first-chords** (new) | foundations | 11 | 42 | 3/4/4 | none |
| alternate-picking | technique | 11 | 45 | 3/3/5 | rhythm-foundations (B) |
| legato | technique | 10 | 34 | 3/3/4 | rhythm-foundations (B) |
| tapping | technique | 9 | 27 | 3/3/3 | legato (B) |
| sweep-picking | technique | 18 | 65 | 5/9/4 | alternate-picking (I), legato (B) |
| shred | technique | 15 | 54 | 3/7/5 | alternate-picking (I), legato (B) |
| metal-rhythm | technique | 10 | 30 | 3/3/4 | rhythm-foundations (B) |
| funk-lines | technique | 9 | 27 | 3/3/3 | rhythm-foundations (I) |
| blues-pentatonics | style | 18 | 74 | 6/6/6 | rhythm-foundations (B) |
| **classic-rock** (grown) | style | 13 | 46 | 4/5/4 | rhythm-foundations (B) |
| know-the-neck | harmony | 9 | 30 | 3/3/3 | none |
| scales-and-modes | harmony | 9 | 30 | 3/3/3 | know-the-neck (B) |
| **triads** (grown) | harmony | 18 | 60 | 4/7/7 | know-the-neck (B), scales-and-modes (B) |
| **chords-in-a-key** (grown) | harmony | 17 | 57 | 3/7/7 | triads (I) |
| **arpeggios-over-changes** (grown) | harmony | 13 | 42 | 3/5/5 | triads (A), chords-in-a-key (B) |

Commits of this session on `mvp-paths2`, oldest first (none merged yet):

1. `d212d2dd` the harmony route at its intended length, and the proof-read of
   `harmony-more.ts`. New spec files `triads-more.ts`, `chords-more.ts`,
   `arpeggios-more.ts`; shared helpers `low()`, `fingered()`, `chartIn()`,
   `inKeys()` in `triadShapes.ts`. 443 strings x 14 locales.
2. `f9ac66cb` First Chords and Strumming (`first-chords.ts`), registered in
   every list of Paths. 418 strings x 14 locales.
3. `bd0d9c09` Classic Rock, two consolidation Steps
   (`classic-rock-more.ts`): the three riffs in E, and box 2. 60 strings x 14.
4. (this commit) this handoff.

What each backlog item of the last handoff came to:

- **Proof-read of `harmony-more.ts`: done.** Three definite errors (F's nearest
  shape; two "only the top string moves" lines that the printed fingers
  contradicted) and wording. B minor is now fingered 4-3-2 in
  `minor-to-diminished` so one finger really does change.
- **Triads to about 12 weeks: done** (41 to 60 Exercises). `middle-strings`
  moved from the Advanced to the Intermediate Level, with two new Steps behind
  it, because Chords in a Key builds on Triads only through Intermediate and
  plays middle-string shapes in its first Level.
- **Chords in a Key to about 12 weeks: done** (30 to 57).
- **Arpeggios over Changes to about 8 weeks: done** (27 to 42).
- **First chords and strumming (#66): written.** See 2.1: it stands on an
  untested assumption.
- **Classic Rock: started** (39 to 46). The rest of the list is in
  `NEW_PATHS.md`, "Classic Rock, extended".
- **Per-variant text: not started.** Still task 5 below.

## 2. Unfinished, and exactly where

Nothing is half-written: the tree is clean and every gate passed at each
commit. What is knowingly incomplete:

1. **First Chords assumes a strum is heard as one onset.** The schedule says
   so (notes on one tick are one expected onset, `src/songs/schedule.ts`) and
   the detector's refractory window is at least 40 to 50 ms
   (`src-tauri/src/instrument.rs`), wider at slow tempos, and the Rust take
   test passes on synthetic plucks. No real guitar has been strummed into it.
   If a slow strum reads as two attacks, the first fix to try is the pass bar
   (`STRUM` in `first-chords.ts`: extras 6, heard 0.85), then the detector.
   Card #66 is waiting on the owner for exactly this test.
2. **The UI does not serve a chord Path yet** (not content, not built here;
   card #74):
   - The Neck view draws every place an Exercise uses at once, so an Exercise
     with three chords shows three shapes on top of each other
     (`~/projects/.preview/paths2/session-neck-first-chords-ember.png`). A
     chord Exercise needs the shape of the bar being played.
   - Strum direction is not drawn: the pick plan is `free`, and stroke marks
     are only printed for other plans. Down and up arrows over a strum would
     help a beginner most.
   - The first-run step (`StartStep.tsx`, `START_PATH_ORDER`) does not list
     `first-chords`; it appears last through the unknown-runnable rule, and
     `StartStep.test.tsx` says so. A player who wants to play songs should be
     offered it first. `src/session/tracks.ts` already orders it second in
     Foundations on the Paths list.
3. **`difficulty.ts` counts notes, not onsets**, so a six-string strum weighs
   six. First Chords' strummed Exercises read 9 to 18 against 2 for a
   single-note line at the same rate. Order there is by teaching judgement and
   two `difficultyException`s say so. Fixing the metric (group notes by tick)
   moves the numbers of every Path with double stops (Funk Lines, Metal
   Rhythm, Blues sixths, Classic Rock) and may need exceptions there. Card
   #75.
4. **Nobody has reviewed or played anything** (#65), now including 150 more
   Exercises. Things a guitarist should try first, because they are fingering
   decisions and not facts: the 2-3-4 G chord and E minor with fingers 2 and 3
   (First Chords); the A-string-root seventh shapes fingered so a triad and its
   seventh share fingers, and the one-finger barre for the low-E-root minor
   seven (Chords in a Key, `sevenths`); A minor on the A, D and G strings held
   with a flat third finger (Triads, `four-chords-low-set`); the three-fret
   reach of B diminished 4, 3, 1 (Triads, `diminished`).
5. **"Hand: index at N" can be one fret off** for shapes with explicit
   fingers when a later bar goes lower (`firstBase` in `fingering.ts` picks the
   cheapest start for the whole line: C at 12, 13, 12 shows "index at 11").
   Seen in the first proof-read, left alone: it is the fingering engine, it
   moves pins in every Path, and the printed fingers are right.
6. **Variant text is written for the first variant only** (unchanged).

## 3. How to work here

Environment (hard rules):

- `node_modules` is a symlink: never `npm install`, never delete it. No
  `tauri dev`. `sleep` is blocked. Never `pkill -f` a pattern that matches your
  own shell.
- Node: `export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$PATH"`.
- Rust: `export PATH=$HOME/.cargo/bin:$PATH CFLAGS='-std=gnu11 -Wno-implicit-function-declaration' CARGO_TARGET_DIR=/home/dgx-personal/projects/.target-<yours>`
  (about 7.5 GB; delete it when you are done. This session's
  `.target-paths2` was deleted at the end).
- Commits: `git -c user.name=turutupa -c user.email=44581951+turutupa@users.noreply.github.com commit`,
  conventional prefixes, small and gated, the attribution line your session
  gives you. Never push. No destructive git on uncommitted work.

Gates for every commit that touches content:

```sh
npm run paths -- gen            # packs + src-tauri/tests/path_fixtures/schedules.jsonl
npm run paths -- strings        # rewrites i18n/en/*.json from the packs
npm run paths -- check 2>&1 | grep -v "warn  strings"   # the ja/ko "different numbers" warnings are old and flood the screen
npx tsc --noEmit
npx vitest run                  # TabStage.render.test.tsx fails only in worktrees: ignore that one file
npm run build
(cd src-tauri && cargo test --test path_exercises)   # about 3.5 minutes warm; 11 tests
npx vitest run src/paths/fingering.test.ts -u        # re-pin src/paths/__fingering__/*.txt, then READ the diff
# when a list of Paths changed:
npm run test:layout -- paths-prereq planner phone-learning --workers=2
npx playwright test tests/layout/firstrun.spec.ts tests/layout/session.spec.ts --workers=2
# pictures (opt-in spec) and review pages:
PATHS_SHOTS_OUT=$HOME/projects/.preview/paths2 npx playwright test tests/layout/paths-content-shots.spec.ts --workers=2
npm run paths -- review --out $HOME/projects/.preview/paths2/review
```

Last full run, at the Classic Rock commit: check 16 Paths 0/0 and curriculum 0
errors, strings complete; tsc clean; vitest 354 files passed, 1 failed
(TabStage), 10670 tests; build OK; `path_exercises` 11 passed. Layout (run at
the First Chords commit, the last one that changed a list): paths-prereq,
planner, phone-learning 196 passed; firstrun and session 120 passed.

Do not regenerate packs while a layout run is going. The `paths` spec-name
filter is safe in this worktree (`yames-mvp-paths2` does not contain
`paths-prereq`), but a filter of plain `paths` would match the directory.

**The fixture is one file for all Paths.** `schedules.jsonl` is rewritten by
every `gen`, so two Paths changed in one working tree cannot be committed
separately unless you take one out again. What worked: `git diff -- <spec> >
/tmp/x.patch`, `git apply -R /tmp/x.patch`, `gen`, gates, commit the first;
`git apply /tmp/x.patch`, `gen`, merge its translations, gates, commit the
second. Translations for both can be made in one round before either commit.

Adding a Path: copy the shape of `first-chords.ts` (mechanics, chords),
`funk-lines.ts` (mechanics, lines) or `triads.ts` (theory); register it in
`specs/index.ts`; then `grep -rn '"first-chords"' src src-tauri tests` and add
the new id beside every hit that is a list (`session/packs.ts` and its
comment, `session/tracks.ts` and its test, `planner.test.ts`,
`toScore.test.ts`, `path_exercises.rs`, `theoryPaths.test.ts` for a theory
Path, `shots/scenarios.ts` scene and the `path?:` union,
`paths-content-shots.spec.ts`, `StartStep.test.tsx`). Give it a `category` and
`prerequisites.paths`. `src/session/packs.test.ts` fails until all 14 overlays
exist.

Adding Steps to an existing Path: put them in a `*-more.ts` file as exported
`StepSpec`s, splice them into the Path's `steps` array by name and into the
Level's `steps` list. Shared helpers must live in a third file
(`triadShapes.ts`): a Path importing its extra Steps while those Steps import
the Path is a circular import, and it fails at load with "top is not a
function". Small helpers a `*-more.ts` file needs from its Path (grading
profiles, `sweepBar`) are copied, not imported.

### Proof-reading, as a routine

Every new Step goes to a read-only agent BEFORE translation. The brief is
`plans/paths/PROOF_BRIEF.md` (give the agent that file's path, a scratch
directory of its own, the pack, the Step ids and what is special about
them: the per-Path prompts of this session are short and are in the session's
transcript only, so write your own from the Step you wrote).
This session: five agents, 12 definite errors and about 60 suggestions in 150
Exercises. They find what an author cannot: a count that was true of one bar,
a "stays" that the printed fingers contradict, a term used before it is
explained, a claim about the neck that a lower shape falsifies.

The brief, in short: read-only, scratch under its own `/tmp` directory; write
a script that prints every bar's notes as string:fret, note name, finger and
duration, with rungs, pass tempo, backing and chords, and each variant's
chords; then check every sentence against that and against theory (frets,
strings, letters, shape claims, "around fret N", what moves or stays against
BOTH notes and `finger`, tempo sentences against `rungs[0]` and `passAtBpm`,
band against `backing.kind`, key statements, the other keys named for a
varied Exercise against each variant's `chords`, Step text against its
Exercises, cross-references, style); report definite errors and suggestions
separately, with corrected sentences, and a count.

Two small scripts help while writing (also in `/tmp/yp2`, trivial to rewrite):
one that dumps an Exercise's bars with note names and fingers, and a lint that
compares "N BPM up to a pass at M" with the ladder. With `paceLadders: true`
the first rung is not what `ladder()` says: for a pass at 70 it is 40, at 80
it is 50, at 85 it is 50 or 60, at 90 it is 55 or 60. Generate, then write the
sentence.

### Translation, as a routine

`npm run paths -- strings todo <lng> --out f.json` after the English is
frozen; one sonnet agent per language; `strings merge <lng> f.json`. The brief
with every round's notes is `plans/paths/I18N_BRIEF.md` (rounds 14 and 15 are
this session's; the working copy was `/tmp/yp2/i18n/BRIEF.md`). What worked:

- One output file per path id, so one bad file does not cost the round.
- Tell the agents to build a script that maps identical English to the
  existing translation first: half of a consolidation round is copies.
- Each agent costs about 150 to 230 thousand tokens, most of it reading the
  reference packs, whatever the size of the todo. So batch: one round for
  several Paths, not one round per Path.
- `merge` stamps every merged key as current. Freeze the English, then write
  the todo. If the English changes after the todo, write a new todo.
- Each agent gets its own scratch directory.

## 4. Next tasks, in priority order

1. **React to the real-guitar test of First Chords** (#66, waiting on the
   owner). Acceptance: the owner has played `e-minor.em-four`,
   `down-up.eighths-em` and `patterns.pattern-em` with a real guitar; if a
   take played in time fails, the cause is named (extras, strums heard or
   evenness) and the bar or the detector setting that fixes it is changed,
   with the Rust take test still passing; the Path's `gradingLimits` says what
   was found.
2. **Rhythm Foundations and First Chords, joined up.** A beginner now has two
   first Paths. Rhythm Foundations could gain a consolidation Step that plays
   its rhythms on a chord (rests, off-beats and the sixteenth figures as
   strums), and First Chords could name Rhythm Foundations' Intermediate Level
   as what to do next. Acceptance: new ids only; the proof-reader passes it; a
   player finishing either Path is told where to go.
3. **Classic Rock, the rest of its list** (`NEW_PATHS.md`, "Classic Rock,
   extended"): licks in E at the twelfth fret, double stops over a second
   progression, chord tones over I, IV, V, a second solo. Acceptance: about 55
   to 60 Exercises, every new idea followed by a Step that moves it.
4. **Blues, the rest of its list** (`NEW_PATHS.md`, "Blues and Pentatonics,
   extended": box 5, the form in E in open position, a jump shuffle, slow blues
   in a second key, a three-chorus solo).
5. **Per-variant text in the format.** Design it in the doc before building;
   it touches `spec.ts`, `generate.ts`, `strings.ts`, the overlays and every
   translated pack. It would remove the `VARIANT_NOTE` sentence from about
   forty Exercises.
6. **The onset-counting difficulty metric** (2.3): one function, then every
   pack regenerates; read which Steps start failing `progress.difficulty` and
   decide exception or reorder Path by Path.
7. **Know the Neck** is 30 Exercises and was marked "should grow". Triads now
   carries the triad work it was going to get; what is left for it is note
   names on the G, B and top strings in more keys and the octave shapes used
   to find a chord's root, which is what First Chords' player needs before
   Triads. Check its "start here if" lines against First Chords' last Level.
8. **Not content, do not start without being asked:** the UI items in 2.2.

## 5. Pitfalls (each of these cost time, this session or the last)

- **Exercise and Step ids are progress keys** (`pathId/exerciseId`, and
  `exerciseId::pool` for variants). Never rename or remove one. Adding Steps,
  moving a Step to another Level and reordering Levels are safe.
- **Text must match notes, and you will get it wrong by hand.** See
  "Proof-reading, as a routine". Run it BEFORE translating.
- **A true statement about notes can be false about fingers.** "Only one note
  moves" passed the validator twice while every finger changed. When a
  sentence says something stays, look at the `finger` values on both sides. If
  the rule-made fingering spoils a real anchor, use `fingered(shape, [..])`
  from `triadShapes.ts` to print the fingers a teacher would give for that
  change (E minor to C with one finger sliding; G to E minor on the middle
  strings with two fingers held), and say in the text that the chord is held
  differently here.
- **Claims about the neck.** "Nearest the nut", "the lowest shape", "the last
  set of strings", "more songs than any other": each was wrong or
  unprovable once. Prefer what the Exercise does to what is true of the
  guitar.
- **A beginner Path must define its own words.** The first proof-read of
  First Chords found finger numbers, string names, fret, bar, beat, BPM and
  "toward the floor" all used before they were explained. The first Step's
  how-to now opens with them.
- **Output floods.** `check` prints hundreds of old "different numbers"
  warnings for ja and ko; pipe through `grep -v "warn  strings"`. A dump of a
  sixteen-bar Exercise is two hundred lines; ask for the bars you need.
- **Fingering.** Read the pin diff after `-u`. A wrong `position` gives
  fingers three frets apart; `reach.position` fails when the first note is not
  under the hand at `position`; open chords that mix frets 1 to 3 want
  `position: 1`, not the lowest fret of the first chord. Lines the engine
  fingers oddly across a shift (a note repeated over a bar line, a descent
  that changes position) are better given explicit `fN` throughout: then
  `shiftFrets` carries the fingers to every key.
- **`difficultyException`.** An exception a Step does not need is a warning,
  and warnings fail the bar. After every reorder, some appear and some become
  unnecessary: run `check` and follow it.
- **Warm-ups** need six variants, must move along the neck (`warmup.moves`:
  a hand shift or a five-fret span), must declare chords or a scale, and need
  a reference Exercise on the same note grid. Chord changes in open position
  cannot be a warm-up for that reason. `loop.seamRepeat` warns when the last
  note and the first are the same place: end the last bar on another note.
- **Chord spelling.** `chartIn(chart, by, key)` in `triadShapes.ts` respells a
  moved chart for sharp and flat keys ("G#m" in E, "Db" in A flat); the key is
  written as the band wants it ("A", "E minor"). The older `chartIn`s inside
  `chords-in-a-key.ts` and `arpeggios-over-changes.ts` are narrower and stay
  for the Exercises that use them.
- **Theory Path tests** (`specs/theoryPaths.test.ts`): the first how-to line
  of every Exercise names the subdivision; every graded line has a
  `timingEvenness` bar; a new theory Path is registered there with a floor.
- **Level placement lines** each want a number written as a digit.
- **What the grader can judge**: timing, evenness, notes heard, extra notes,
  rough accents, and right notes after the take for slow separate single
  notes. A strum, a double stop and a power chord are one attack: timed and
  counted, never pitch-checked. Not bends for pitch, not muting, not stroke
  direction, not choices. Anything the player chooses is `grade:
  "selfChecked"` with the "not checked yet" sentence.
- **Copy rules**: plain second person, no exclamation marks, no first person
  (the old coach lines of the first five Paths are the exception; new coach
  lines are not first person), sentence case, chord numbers as words, fret
  lists as digits.
- **Layout tests measure what is on screen.** A new Path in Foundations
  pushed the first "Builds on" line below the fold on a phone and a contrast
  check found nothing to measure; the spec now scrolls to it. Expect the same
  kind of failure when a list grows.

## 6. Cards

- #59 harmony route: done by commit 1.
- #66 first chords: Path written; waiting on the owner for the real-guitar
  test.
- #65 teacher and guitar review: noted with what to try first.
- New this session: #74 the UI needs of a chord Path (2.2); #75 the
  onset-counting difficulty metric (2.3); #76 the next content tasks (4.2 to
  4.7).

## 7. Open questions

- Two first Paths for a beginner (time, or chords): which does first run
  offer, and does it ask? The curriculum map says both start from nothing.
- Should Triads name First Chords as something it builds on? Its `assumes`
  says "plays some chords from shapes", which is First Chords' player exactly.
  Left unlinked: Triads also suits a lead player who has never strummed.
- The G fingering. 2-3-4 is taught because its changes are short; many
  teachers start with 1-2-3. If the owner's hand disagrees, the text of
  `g-major` and every "stays" sentence after it changes with it.
- Sevenths in Chords in a Key use four-string shapes with roots on the two
  low strings, while Arpeggios over Changes starts its sevenths from a root
  on the D string. Deliberate (chords low, lines high), and never said in
  either Path.
- The week estimates are still a model: about one week per five Exercises.
