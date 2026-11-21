# Leg gt1: the cues made the Paths generator slow: find where, fix it, keep the tests honest

Worktree `/home/dgx-delgado/yames-coach-gt1`, branch `coach-gt1`. Logs under `/tmp/coach-gt1/`.

Found by leg cues7 (`plans/coach/progress/cues7.md`, its last section): in
`src/paths/generate.test.ts` the test "subdivisions: 'mostly' names a grid …" took 15.3 s on `coach`
before Legato's cues and runs past its 20 s timeout with them; "legato generates the same bytes
twice" took 15.8 s alone; `packs.test.ts` "an overlay for every locale" timed out in several legs'
full runs. Every cue leg makes it worse: each variant of each Exercise now has every cue checked or
said in other words while the pack is built (`src/paths/variantText.ts`, `cues.ts`, `rewrites.ts`,
leg vr1). Eleven Paths of sixteen have cues tonight; four more are being written.

## What to find out first (measure; write the numbers in `plans/coach/progress/gt1.md`)

1. Where the time goes when one Path is generated (`npm run paths -- gen legato`, and the slow
   tests run alone as queue jobs): the rewriter per variant per cue? The same sentence rewritten
   again for every variant that shares it? The validator re-deriving the tab per cue?
2. **Does any of this run on the player's device?** Does the app build variant texts or cue texts at
   runtime (when a Path opens, when a Session starts, per Take), or does it only read the generated
   packs? Grep the callers of `variantText`, `cueTexts`, `cueFor` outside the generator. If a
   Session's start or a Take pays for it, say exactly what and how long (a unit benchmark is fine):
   that is a product defect, more important than a slow test, and nothing may cost the click.

## What to fix

- Redundant work in the generator or the rewriter (the same input computed again and again): cache
  or hoist it, as pure code with no change in output. **Prove no output changed**: `npm run paths --
  gen` for all sixteen Paths leaves `git status` clean under `src/paths/packs/`, and `npm run paths
  -- check` prints the same lines as before (save both runs and diff them).
- A test that walks every Path in one `it`: if after the fix it still needs more than about a third
  of its timeout on a quiet machine, split it per Path (`it.each`) rather than raising a timeout
  blindly; a timeout raised is the last resort and is given a comment saying what was measured.
- Anything at runtime found under (2): fix it if it is a cache or a precomputation; if it needs a
  design change, stop and report.

## Not yours

The cues themselves and any Path's spec, pack or overlay (four cue legs are writing: arpeggios,
tapping, sweep-picking, shred). Leg t2a is adding `buildCustomExercise` beside the generator: it
does not change what `gen` writes; read its branch (`coach-t2a`) only if you must touch the same
function, and keep your hunks small.

## Gates

`npm run paths -- check` (identical output), tsc, vitest (the whole suite, and the three slow tests
alone with their times before and after), build. No layout run.

## Report

As the rules block's "The end of the leg", with the before / after times (generator per Path, the
three tests), what was redundant, and the answer to (2) in one plain paragraph.
