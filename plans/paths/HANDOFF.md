# Paths content: handoff (2026-11-19, early morning PST)

For the agent that continues the curriculum work on `mvp-paths-content`. Read
this, then `plans/paths/NEW_PATHS.md` (the design doc: "The curriculum map" is
the part that matters most), then `plans/PATHS_PIPELINE.md` if the pipeline is
new to you.

Worktree: `/home/dgx-personal/projects/yames-mvp-paths-content`, branch
`mvp-paths-content`. Never push; the orchestrator merges into `revamp`. Board
card: Personal board #55 (`~/.local/bin/card`), with #59, #62, #63, #65, #66.

## 1. What exists

Fifteen Paths, all status `draft`, all in 15 locales, `paths check` clean.

| Path | category | Steps | Exercises | Steps B/I/A | Builds on |
|---|---|---|---|---|---|
| rhythm-foundations | foundations | 9 | 34 | 3/3/3 | none |
| alternate-picking | technique | 11 | 45 | 3/3/5 | rhythm-foundations (B) |
| legato | technique | 10 | 34 | 3/3/4 | rhythm-foundations (B) |
| tapping | technique | 9 | 27 | 3/3/3 | legato (B) |
| sweep-picking | technique | 18 | 65 | 5/9/4 | alternate-picking (I), legato (B) |
| shred | technique | 15 | 54 | 3/7/5 | alternate-picking (I), legato (B) |
| metal-rhythm | technique | 10 | 30 | 3/3/4 | rhythm-foundations (B) |
| funk-lines | technique | 9 | 27 | 3/3/3 | rhythm-foundations (I) |
| blues-pentatonics | style | 18 | 74 | 6/6/6 | rhythm-foundations (B) |
| classic-rock | style | 11 | 39 | 3/4/4 | rhythm-foundations (B) |
| know-the-neck | harmony | 9 | 30 | 3/3/3 | none |
| scales-and-modes | harmony | 9 | 30 | 3/3/3 | know-the-neck (B) |
| triads | harmony | 13 | 41 | 4/4/5 | know-the-neck (B), scales-and-modes (B) |
| chords-in-a-key | harmony | 10 | 30 | 3/4/3 | triads (I) |
| arpeggios-over-changes | harmony | 9 | 27 | 3/3/3 | triads (A), chords-in-a-key (B) |

Commits, newest first (everything up to `ad58fd0b` is merged into `revamp` as
`a8da2b0c`; the two after it are not merged yet):

- (this commit) Arpeggios over Changes; four consolidation Steps for Triads and
  Chords in a Key (`harmony-more.ts`); shape helpers moved to `triadShapes.ts`;
  this handoff.
- `857dd94e` a `category` for every Path; `moveChord` spells diminished chords
  on a leading tone as sharps; Sweep Picking `band-big-chain` text fixed.
- `ad58fd0b` docs: plan for Arpeggios over Changes.
- `17b4dd23` Chords in a Key. `64faeb60` Triads.
- `2eefdc5a` Paths build on other Paths (`prerequisites.paths`, `curriculum.ts`,
  `session/prerequisites.ts`).
- `378292b2` Blues extended 11 to 18 Steps (`blues-more.ts`).
- `db14c875` Funk Lines. Earlier: Tapping, Scales and Modes, Know the Neck,
  Rhythm Foundations, Metal Rhythm, Legato, the level audit of the five
  original Paths and its fixes, warm-ups, proof-reading fixes.

Owner decisions already taken (by the coordinator, delegated): the harmony
route is accepted (Know the Neck, Scales and Modes, Triads, Chords in a Key,
Arpeggios over Changes, then Sweep Picking); first run will recommend a start
from the curriculum map and Shred is no longer preselected for everyone. A UI
worker builds the prerequisites UI (#63), the category label and the first-run
recommendation from the specs in `NEW_PATHS.md`. **Do not touch UI**, and do
not touch Today focus or the daily mix.

## 2. Unfinished, and exactly where

Nothing is half-written: the tree is clean at this commit and every gate
passed. What is knowingly incomplete:

1. **Triads, Chords in a Key and Arpeggios over Changes are shorter than
   intended.** Intended lengths are in `NEW_PATHS.md` ("The curriculum map"
   table): about 12, 12 and 8 weeks; they are at about 8, 6 and 5 (one week per
   five Exercises is the model). The lists of what to add are in `NEW_PATHS.md`
   under each Path's "Still to add".
2. **The four Steps in `src/paths/specs/harmony-more.ts` were not given to a
   proof-reading agent** (the others all were). Their notes are held to their
   chords by the validator and their text was written from the shape table,
   but nobody has read text against notes. Do that first (see 4, task 1).
3. **`StartStep.tsx` does not list `arpeggios-over-changes`** in
   `START_PATH_ORDER` (UI, left for the UI worker). It still appears, last,
   through the "unknown runnable Paths last" rule; `StartStep.test.tsx` says so.
4. **No teacher or guitarist has reviewed anything, and nothing has been played
   on a real guitar** (#65). The grooves `rock8` in "A blues", `slowBlues` in
   "A minor" and `rockTwelveEight` in "C"/"D" pass the validator and the Rust
   take test; nobody has listened to them.
5. **Variant text is written for the first variant only.** A sentence
   (`VARIANT_NOTE`) says so on each such Exercise. The real fix is text per
   variant in the format: a pipeline change, not started.

## 3. How to work here

Environment (hard rules):

- `node_modules` is a symlink: never `npm install`, never delete it. No
  `tauri dev`. `sleep` is blocked. Never `pkill -f` a pattern that matches your
  own shell (find PIDs with `ss -ltnp` or `pgrep`, kill by PID).
- Node: `export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$PATH"`.
- Rust: `export PATH=$HOME/.cargo/bin:$PATH CFLAGS='-std=gnu11 -Wno-implicit-function-declaration' CARGO_TARGET_DIR=/home/dgx-personal/projects/.target-paths`
  (about 7.5 GB; delete it when the work is merged).
- Commits: `git -c user.name=turutupa -c user.email=44581951+turutupa@users.noreply.github.com commit`,
  conventional prefixes, small and self-contained, the attribution line your
  session gives you at the end. Never push. No destructive git on uncommitted work.

Gates for every commit that touches content:

```sh
npm run paths -- gen            # packs + src-tauri/tests/path_fixtures/schedules.jsonl
npm run paths -- strings        # rewrites i18n/en/*.json from the packs
npm run paths -- check          # every Path "ok ... 0 errors, 0 warnings", "ok curriculum", strings complete
npx tsc --noEmit
npx vitest run                  # TabStage.render.test.tsx fails only in worktrees: ignore that one file
npm run build
(cd src-tauri && cargo test --test path_exercises)   # about 3 minutes; 11 tests
npx vitest run src/paths/fingering.test.ts -u        # re-pin src/paths/__fingering__/*.txt, then READ the diff
# when a list of Paths or a screen's shape changed:
npx playwright test tests/layout/firstrun.spec.ts tests/layout/phone-learning.spec.ts tests/layout/planner.spec.ts tests/layout/session.spec.ts
# screenshots (opt-in spec) and review pages:
PATHS_SHOTS_OUT=$HOME/projects/.preview/paths-content npx playwright test tests/layout/paths-content-shots.spec.ts --workers=2
npm run paths -- review --out $HOME/projects/.preview/paths-content/review
```

Last full run, at this commit: check 15 Paths 0/0 and curriculum 0 errors;
tsc clean; vitest 352 files passed, 1 failed (TabStage), 10472 tests; build OK;
`path_exercises` 11 passed; layout 284 passed; 22 screenshots.

Do not run `npm run test:layout -- paths ...`: the directory name matches
every spec. Name the spec files. Do not regenerate packs while a layout run is
going: it causes spurious failures.

Adding a Path: copy the shape of `src/paths/specs/funk-lines.ts` (mechanics) or
`triads.ts` (theory); register it in `specs/index.ts`; then `grep -rn '"triads"' src src-tauri tests`
and add the new id beside every hit that is a list of Paths
(`session/packs.ts` + its comment, `planner.test.ts`, `toScore.test.ts`,
`path_exercises.rs`, `theoryPaths.test.ts` for a theory Path,
`shots/scenarios.ts` scene + the `path?:` union, `paths-content-shots.spec.ts`,
`StartStep.test.tsx`). Give it a `category` and `prerequisites.paths`.

Adding Steps to an existing Path: put them in a `*-more.ts` file as exported
`StepSpec`s, splice them into the Path's `steps` array by name and into the
Level's `steps` list. Shared helpers must live in a third file
(`triadShapes.ts`): a Path importing its extra Steps while those Steps import
the Path is a circular import, and it fails at load with "top is not a function".

## 4. Next tasks, in priority order

1. **Proof-read `harmony-more.ts`** (Steps `f-and-g`, `more-minors`,
   `diminished` in Triads; `key-of-g` in Chords in a Key).
   Acceptance: a read-only agent has compared every sentence with the notes in
   the packs; defects fixed; the changed strings retranslated in 14 locales;
   gates green.
2. **Grow Triads toward 12 weeks** (#59). From its "Still to add": the A, D and
   G string set (three shapes of C and A minor, the four chords there); minor
   triads on the middle strings in other keys; F and G on the middle strings;
   a second song form. Acceptance: about 55 to 60 Exercises, new Step ids only,
   every new idea followed by a Step that moves it to another chord, key or
   string set; warm-ups never use a shape before its Step; gates green.
3. **Grow Chords in a Key toward 12 weeks** (#59). The key of A in full like
   `key-of-g`; seventh chords on every degree (Imaj7, ii7, iii7, IVmaj7, V7,
   vi7); the minor key in a second key (E minor); borrowed chords songs use
   (the major II, the flat VII); a sixteen-bar AABA form. Acceptance as task 2.
4. **Grow Arpeggios over Changes toward 8 weeks.** Two-octave arpeggios in two
   more keys and for F and G; seventh arpeggios across two octaves; a
   minor-key two, five, one; a second swept shape (shape one and shape three)
   before the song. Keep speed out of it: that is Sweep Picking's.
5. **Classic Rock** is a style at 39 Exercises and a candidate to grow the way
   Blues did (consolidation Steps in new keys, feels and positions). Read its
   spec and the level audit in `NEW_PATHS.md` first.
6. **Per-variant text in the format** (see 2.5): design it in the doc before
   building; it touches `spec.ts`, `generate.ts`, `strings.ts`, the overlays
   and every translated pack.
7. **Not content, do not start without being asked:** first chords and
   strumming (#66) needs a real-guitar test of whether a strum can be timed.

## 5. Pitfalls (each of these cost time)

- **Exercise and Step ids are progress keys** (`pathId/exerciseId`, and
  `exerciseId::pool` for variants). Never rename or remove one. Adding Steps
  and reordering Levels is safe ("How progress is keyed" in `NEW_PATHS.md`).
  Removing a variant value from a pooled dimension is safe; changing a
  `notPooled` one is not.
- **Text must match notes, and you will get it wrong by hand.** Every Path was
  proof-read by a separate read-only agent that converts the pack's notes to
  note names and checks each sentence. It found about 90 defects in the first
  six Paths and 15 to 30 in each later one. Run it BEFORE translating, or you
  pay for 14 retranslations. Brief: read-only, scratch under `/tmp`, parse the
  pack JSON, list definite errors and suggestions separately.
- **Translation pipeline.** `npm run paths -- strings todo <lng> --out f.json`
  writes what one locale is missing; one sonnet agent per language translates
  it following the brief (a copy is kept at `plans/paths/I18N_BRIEF.md`, with the notes of every round; the working copy was `/tmp/yames-i18n/BRIEF.md`). In short:
  plain second person, no exclamation marks, digits kept, level names fixed per
  language, Russian in polite lowercase "вы", copy existing translations of
  identical sentences, vocabulary from the named reference pack, scratch files
  only in the agent's own directory, one output file per language.
  `npm run paths -- strings merge <lng> f.json` merges. **`merge` stamps every
  merged key as current**, so if the English changed after the todo was
  written, the stale translation is recorded as up to date and `check` will not
  tell you. Freeze the English, then write the todo. Agents once shared a
  scratch directory and French came out Italian: give each its own.
- **Fingering.** The algorithm in `src/paths/fingering.ts` assigns fingers from
  `position` and the notes. Read the pin diff after `-u`: a wrong `position`
  gives fingers 2 and 4 three frets apart; two-note stops and small chord
  shapes need explicit `fN` (`3:6f2+1:5f1`); an open string takes no finger
  (shifting a fingered tab down to fret 0 throws). `reach.position` fails when
  the first note is not under the hand at `position`: set `position` to the
  lowest fret of the first bar and `shifts: true` when the hand moves. In the
  harmony Paths use `top(g, b, e)` / `mid(d, g, b)` from `triadShapes.ts`,
  which finger a shape by rule.
- **`difficultyException`.** `progress.difficulty` wants each Step's median no
  lower than the Step before. Consolidation Steps, no-band Steps and Steps
  ending on a self-checked Exercise dip; declare the exception with a true
  reason. An exception the Step does not need is a warning, and warnings fail
  the "0 warnings" bar: remove it.
- **Warm-ups** need at least six variants, must move between positions
  (`warmup.moves`), must declare chords or a scale, and need a `reference`
  Exercise on the same note grid. A loop whose last and first notes are the
  same string and fret is a warning (`loop.seamRepeat`): end the last bar on
  another note. Keep warm-ups behind the lessons of their Level.
- **Chord spelling.** `moveChart` has one spelling per root (C#, Eb, F#, Ab,
  Bb). In a sharp key that gives "Abm" for G sharp minor; in D flat it gives
  "C#". `chartIn` in `chords-in-a-key.ts` and `arpeggios-over-changes.ts`
  respells per key: use it for any transposed chart.
- **Theory Path tests** (`specs/theoryPaths.test.ts`): the first how-to line of
  every Exercise must name the subdivision ("Straight eighths", "Quarter
  notes", "Triplets"...); every graded line needs a `timingEvenness` bar;
  register a new theory Path there with a floor for graded Exercises.
- **Level placement lines** (`startHereIf`) each need a number written as a
  digit (`level.placement`), which is why they say "3 notes" where the rest of
  the copy spells numbers out.
- **What the grader can judge**: timing, evenness, notes heard, extra notes,
  and right notes after the take for slow separate single notes. Not strummed
  chords, not double stops or ringing sweeps for pitch (time them:
  `attacksOnly`, `sweepTiming`), not bends for pitch, not choices. Anything the
  player chooses is `grade: "selfChecked"` with the "not checked yet" sentence.
- **Copy rules**: plain second person, no exclamation marks, no first person
  outside the old coach lines, sentence case, numbers of chords as words
  ("one, four, five"), fret lists as digits.

## 6. Open questions

- Should the harmony Paths' Exercises that repeat a line from an earlier Path
  (Chords in a Key `six-four-one-five` is Triads' `four-chords.low` reordered)
  stay as deliberate review, or be replaced with new lines? Left as review.
- Arpeggios over Changes builds on Triads through its Advanced Level (for the
  four-string shapes) while Chords in a Key builds on Triads through
  Intermediate. Is that the right asymmetry, or should the four-string shapes
  move into Triads' Intermediate Level?
- The week estimates are a model, not a measurement. Once real players have
  been through a Path, correct the table in `NEW_PATHS.md`.
- `kind` still has two values and decides grading; `category` is for people.
  If a fifth kind of Path appears (ear, repertoire), does it get a category
  only, or a kind as well?
- Is a strum gradable (#66)? Until someone tests it on a real guitar, there is
  no Path for first chords and strumming, which is the obvious beginner hole.
