# Leg fc1: First Chords' fourteen cues a variant cannot say

Branch `coach-fc1` (from `coach` 0c00c6ba). Brief: `plans/tasks/coach/fc1-first-chords-refused-cues.md`
(item 10 of pol1's brief).

## What it was

The fourteen `cue.refused` were two cues of one Exercise, `warmup-advanced.small-barre`, refused on each of
its seven variants (other string pairs, coming down): "a layout of frets, and the frets moved differently".
Both were shared constants (`ARRIVE`, `ARRIVE_EARLY`) naming "each new fret"; `variantText.ts` reads an
unnumbered "fret" as a layout of frets and refuses it where the frets move differently.

## What changed

Only small-barre's two cues (the constants stay as they are for the other Exercises that use them):

| trigger | before | after |
|---|---|---|
| late | Arrive at each new fret by its click. | Land the flat finger right on each click. |
| early | Wait for the click before each new fret. | Wait for the click before each move. |

The second already exists in Alternate Picking and Scales and Modes; its fourteen translations were copied
from Alternate Picking's overlay. The first was translated by three sonnet helpers (each language's
words for finger / flat / click taken from the Exercise's other cues). A separate sonnet reader read both
against the tab and the guide: no objection.

Every variant now says all seven cues the Exercise says, so the variants' own cue keys
(`small-barre.variant.*.cue.N`, 35 per language) are no longer written: `strings merge` dropped them from
each overlay (1064 to 1029 strings per language).

## Numbers

`check first-chords`: 0 errors, 0 `cue.refused` (was 14), 5 `variant.rewritten` (the unchanged how-to
lines of `warmup-intermediate.major-walk`). Longest new cue: nl 47 characters.

## The one test that changed

`src/paths/rewrites.test.ts` "lists the cues a variant cannot say" needed First Chords to have a refusal
(`refused.length > 0`), so it failed once there were none. It now checks the shipped pack lists none, puts
the old "Arrive at each new fret by its click." back on small-barre by hand, and expects that exact
refusal with its reason (as the file's other tests inject a line).

## Gates

`npm run paths -- check` all sixteen ok, 0 errors, 0 `cue.refused` in every Path (`/tmp/coach-fc1/check.log`);
tsc ok; build ok; vitest 47770 passed, 1 failed (the rewrites test above, then fixed: `rewrites.test.ts` 5
passed alone) plus the known `TabStage.render.test.tsx` load failure (`/tmp/coach-fc1/vitest.log`).

## For the next leg

`ARRIVE` / `ARRIVE_EARLY` are still used on Exercises without variants; any Exercise given variants later
that keeps them will be refused the same way.
