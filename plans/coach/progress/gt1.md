# Leg gt1: the Paths generator made fast again (progress)

Brief: `plans/tasks/coach/gt1-generator-time.md`. Branch `coach-gt1`. Logs and the two timing scripts
under `/tmp/coach-gt1/` (`time-gen.mjs`: gen, validate and the rewriter report per Path;
`time-finger.mjs`: one `fingerPlan` per Exercise and variant of every pack, what the app pays).

## Where the time went

A CPU profile of `legato` (gen + validate + the rewriter report, 20.5 s): 13.3 s of it in
`variantText.ts` `moveOf` -> `fingersOf` -> `fingering.ts` `fingerPlan`, and inside that 11.3 s in
`spreadRanks` and the walk's `fingerOf`. Two redundancies, multiplied by each other:

1. **Inside `fingerPlan`**: the dynamic programme's `moveCost` asks `fingerOf(note, base)` for every
   pair of bases (24 x 24 per group of notes), and each answer rebuilds a string key and re-sorts the
   string's frets in `spreadRanks`. The answer depends only on the note and the base: 24 distinct
   answers per note, asked up to 576 times each.
2. **In the rewriter**: every `cueTexts` call planned the Exercise's own fingers three times (`move`
   and `own`), `describeVariant` and the validator's cue check again, once per variant per caller.
   The cues made this bite: `variantCues` now runs `cueTexts` for every variant of every cued Exercise.

The validator re-deriving the tab per cue was not it (`checkReachAt`, the reach check, is now the
largest single item at about 0.3 s for legato, and was there before the cues).

## The fix (commit "fix(coach): the Paths generator works each finger out once")

- `fingering.ts` `walk`: `fingerOf` memoised per (note, base) in an `Int8Array`, local to one walk.
  Pure; nothing outside the walk sees it.
- `variantText.ts` `fingersOf`: a module-level cache keyed by the content `fingerPlan` reads (hand
  fret, shifts, and each note's string, fret, tick, tech, bend, finger), cleared at 4096 entries. Keyed
  by content, not the array, so a note changed in place cannot be answered stale.

## Proof that no output changed

- `npm run paths -- gen` (all sixteen) in the worktree: `git status --porcelain` empty afterwards.
- `npm run paths -- check` before (the `coach` checkout untouched, job coach-gt1-check-before) and
  after (job coach-gt1-check-after): 2159 lines each, identical except the two job time stamps
  (`/tmp/coach-gt1/check-{before,after}.log`). Wall time 49 s -> 11 s.

## Numbers (before / after submitted together as a pair of queue jobs)

Generator, gen + validate + rewriter report, all sixteen Paths (jobs coach-gt1-time-before/-after,
load 58 and 68 at the end): **44.9 s -> 11.8 s**. Per Path, gen alone: legato 5911 -> 738 ms,
sweep-picking 1965 -> 1193, alternate-picking 1516 -> 526, shred 1356 -> 645; legato's rewriter
report 8915 -> 399 ms, its validate 3774 -> 331 ms. The Paths with few or no cues barely move.

The slow tests alone (`generate.test.ts` + `session/packs.test.ts`, jobs coach-gt1-vt-before/-after,
load about 45 to 65):

| test | before | after |
|---|---|---|
| subdivisions: "mostly" names a grid ... | 13.1 s | 2.7 s |
| legato generates the same bytes twice | 13.2 s | 0.84 s |
| packs: an overlay for every Path in every locale | 2.7 s | 3.0 s |

Both files 85.5 s -> 21.4 s. The before run also printed vitest's "Timeout calling onTaskUpdate"
(all tests passed): a 13 s synchronous test starves the worker's RPC under load. All three are now
well under a third of the 20 s timeout, so nothing was split and no timeout was raised.

The overlay test is not the generator: it is Vite importing sixteen packs and 224 overlays. Alone it
takes 3 s; it timed out only inside full runs at load 100. Left alone.

## Does any of this run on the player's device?

No variant or cue text is built at runtime: `variantText`, `cueTexts`, `describeVariant` and
`rewriteReport` are imported only by the generator, the validator and their tests; the app reads the
cues and variant texts from the packs. What the app does run is `fingerPlan`, once per Exercise: the
neck's finger numbers (`practiceModel.fingering`, `useNeck`, `NeckInstruction`, memoised by notes)
and `paths/cues.ts` `placeTriggers` when the result screen picks a cue after a Take
(`SessionCoach.tsx` `ResultNote`, which calls `cueFor` on each render without a memo). Neither runs
during a Take. Over every Exercise and variant of every pack (2375 plans, jobs
coach-gt1-finger-before/-after, load 46): total 2.84 s -> 1.23 s; the worst single plan before was
105 ms (shred's advanced warm-up, 96 notes; legato's six-roll climb 64 ms); after, those are no
longer in the top five, whose worst is 44 ms (a chords-in-a-key Exercise of 64 notes, single
samples, so GC and JIT noise are in them). The fix takes tens of milliseconds off the result screen
and the neck's first draw for the longest Exercises; nothing costs the click.

## Gates

- `npm run paths -- check`: identical to `coach` (above), 0 errors.
- `npx tsc --noEmit`: clean (job coach-gt1-tsc).
- `npm run build`: ok (job coach-gt1-build).
- `npm run test`: 414 of 415 files, 39,903 of 39,903 tests passed in 82 s (`/tmp/coach-gt1/vitest.log`);
  the one file is the known worktree-only `TabStage.render.test.tsx`.

## For the next leg

The generator's largest item is now the reach check (`validate.ts` `checkReachAt` via
`maxPlayableBpm`), not the cues. More cues add `cueTexts` rewriting (cheap now) but no new finger
plans: one per distinct set of notes.
