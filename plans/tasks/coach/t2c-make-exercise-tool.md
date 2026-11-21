# Leg t2c: `make_exercise` with its preview, the variant chips, typed recipes, a part in Today (R)

Worktree `/home/dgx-delgado/yames-coach-t2c`, branch `coach-t2c`. Logs under `/tmp/coach-t2c/`.

PLAN's t2, last part. **Needs t2b merged** and no other leg working in Ask's files or the command tables
(`AskPanel.tsx`, `askStore.ts`, `ask.css`, `askTools.ts`, `src/coach/ask/`, `src/coach/ask/commands/`).
**Split by the size rule into two legs from this one file**: **t2c** does items 1 to 3 **in English**
(every new key in all fifteen files as English, listed under "to translate (t2d)"; the English recipe
word list only) with unit tests and no scene; **t2d** (worktree `/home/dgx-delgado/yames-coach-t2d`,
branch `coach-t2d`, after t2c merges) does item 3's fourteen word lists, item 4, item 5 and item 6.
**t2d is R** if item 5 changes `planner.ts` or `useSessionRun.ts` (it likely does).

Read first: `plans/coach/progress/t2a.md`, `t2b.md`, `t1a2.md` (the `make_exercise` stub: a `confirm`
tool; how a proposal, its receipt and its undo are issued), `t1b1.md` (how Ask draws a proposal and
chips), `t1b2a.md` / `t1b2b.md` (the command tables' shape). Design, read-only: `TOOLS.md` 2.2, 2.4, 2.5
(the first row: making an exercise works with no model on every device), `DESIGN.md` 13; mock `17`
(Read the PNG: the order on the page is the line, the preview with "Worked out by the app", the
proposal "Add it to My exercises · Starts at 60 BPM. Timing and notes heard can be graded; the rest is
yours. · Add it · Not now", then the chips "Hear it", "Sixteenths instead", "Next position").

## What to build

1. **`make_exercise`** wired: `propose` builds the recipe with `buildCustomExercise` and returns the
   proposal; the answer in Ask is the one-line summary (a locale template from `summary`), a `fretboard`
   preview of the notes (first note marked, "Starts on the low A"), the source "Worked out by the app",
   and the proposal. **What will and will not be graded is said before the press, not after.** "Add it"
   (`commit`) stores the recipe through t2b's writer; the receipt names it and offers "Open My
   exercises" and Undo (removes the one just added, through the runner's issued undo). A refused recipe
   answers with its `why` as a sentence and offers the nearest recipe that builds as a chip.
2. **The chips** (mock 17): "Hear it" (plays the preview once through the existing preview / click
   path; never during a Take; nothing recorded), "Sixteenths instead", "Next position" (t2a's
   `nextRecipe`: each re-runs the generator and replaces the preview, a new proposal; the old one
   retired through the runner).
3. **Typed recipes with no model** (mock 17's note 1): "a minor pentatonic eighths 5th fret" reaches
   `make_exercise` through the router: a recipe word list per language (roots with the locale's own note
   names, scale and shape names, subdivisions, "fret" / ordinals) in each `commands/<code>.json`, added
   to `commandTable.ts`'s shape and its validator. English written here; the fourteen by sonnet helpers
   from the terms each locale's Jam and Paths screens use. Near-miss tests: "what is a minor
   pentatonic?" is a question (a card or search, never a recipe); every never-list word still returns
   `yours`. A recipe that names a wrong-for-the-screen thing still only proposes.
4. **Strings** in fifteen locales: the summary templates per shape, the proposal's lines, the chips,
   the receipt, the `why` sentences.
5. **A part in Today** (TOOLS 2.4: "added to Today as a chosen part"): from My exercises, "Add to
   today" on a row, and `start_today` / the planner treat it as a part the player chose (it counts
   toward the minutes; it is never chosen by the planner on its own; it passes nothing). Read
   `planner.ts` and `setTodayFocus` first; if it needs more than a planner input and one runner hook,
   stop at items 1 to 4 and write what it needs for a follow-up leg.
6. **Layout scenes**: mock 17's page on a phone (Ember) and at 1440 with the dock (Manuscript), a
   refused recipe, the receipt; one in German or Japanese. Pictures only when `YAMES_SHOT_DIR` is set.

## Not yours

The generator (t2a) and the store and list (t2b): a defect in either is fixed with a test and named.
The model choosing a recipe from free wording (c3b, later).

## Gates

t2c: tsc, vitest, build; layout by name `ask.spec.ts`, `ask-tools.spec.ts` (no new scene). t2d: tsc,
vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, the Paths specs, `today-*` specs if
item 5 landed, `short-window.spec.ts`, `smooth.spec.ts`, the new scenes. The full layout suite is the
orchestrator's.

## Report

As the rules block's "The end of the leg". t2c: typed recipe lines in English with what each built,
the near-misses, the keys left in English, a "diff for review" paragraph (`AskPanel.tsx`,
`askTools.ts`, `commandTable.ts`). t2d: the same lines in two other languages (one without spaces),
whether item 5 landed, the screenshot paths, the diff for review (`planner.ts`, `useSessionRun.ts`).
