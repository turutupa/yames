# Leg c4c: `cues`, the pack field behind "one thing to try"

Worktree `/home/dgx-delgado/yames-coach-c4c`, branch `coach-c4c`. Logs under `/tmp/coach-c4c/`.
Read `plans/tasks/coach/BRIEF.md` first, then `plans/coach/progress/c1a.md` (`TakeNote`: the finding,
the direction, `repeat`), `c1b1.md` (the note, the Take's order, where each is drawn) and
`c1b1-long-cues.txt` (why this leg moved up: 825 of 1,010 Exercises have no cue short enough to show
during a Take). `plans/PATHS_PIPELINE.md` and `plans/paths/I18N_BRIEF.md` are the pack pipeline's rules.
Design: DESIGN.md 4.2 ("One thing to try" and the repeat table), 3.4 (the order: at most 48 characters).

This leg builds the field, the pipeline and the selection, and writes cues for **one Path** as the
worked example and the test of the whole chain. The other fifteen Paths are content legs after it.

## What to build

1. **The field** (`src/paths/format.ts`, optional, so every existing pack stays valid):
   ```ts
   type Cue = { when: CueTrigger; say: string; more?: number };
   type CueTrigger = "even" | "heard" | "extras" | "notes" | "late" | "early" | "afterHeld"
     | "openString" | "stringChange" | "shift" | "lastBars";
   Exercise.cues?: Cue[];   // several per trigger are welcome: the second time gets the second
   ```
   `say` is an order, at most 48 characters **in every language**; `more` is an index into the played
   variant's `howTo`. Through the whole pipeline: `spec.ts`, `generate.ts`, `validate.ts` (length; the
   honesty list of `honesty.ts`; `more` in range; no "the bar" for the threshold; no word about tuning;
   an order, not a description: at least reject a `say` that ends in a question mark or names a grade),
   `strings.ts` and the pack i18n overlays (`exercise.<id>.cue.<n>`), and `variantText.ts` so a cue
   that names a fret, a string or a finger is rewritten per variant or refused where it cannot be.
   `npm run paths -- check` enforces all of it, in English and in the overlays (the 48-character cap is
   checked per locale).
2. **`cueFor(exercise, note, history)`** in `src/coach/cues.ts`, pure, with a table test: the trigger
   comes from what the last Take measured (`TakeNote`: which check decided, the direction, where: after
   a held note, an open string, a string change, a shift, the last bars), never from a guess about why;
   the first time the first cue for that trigger, the second time at the same spot the second if the
   author wrote one; with nothing measured (first Take, ungraded, `notCaught`) the Exercise's first cue
   of any trigger marked as its general one, else none. No cue: the surfaces fall back exactly as today
   (`coachLine` as the ready headline, "What should I try?" opening the How, no order during the Take
   when `coachLine` is too long).
3. **Where the cue shows** (three places, one sentence, the same translated string):
   - the ready note's headline, with its source line "From the Path · Step N";
   - the Take's fixed order;
   - **on the result, under the finding**: "Next time: {cue}" with the same source line. "Go again"
     starts the count-in straight away, so the result is where a player actually reads what to try
     (c1b1 found the ready screen between Takes is rarely seen). The finding still never says why; the
     cue is the author's suggestion and is labelled as from the Path. A pass that goes up a rung shows
     no cue from the old tempo's miss.
   "What should I try?" opens the How at `more` when the cue has one.
4. **One Path written**: Alternate Picking (the mocks' Path), every Exercise: one general cue, and one
   per trigger that Exercise can actually produce (an Exercise with no open string gets no `openString`
   cue). Written as a guitar teacher gives an order: what to do with the hands or the count, one idea,
   present tense, concrete ("Count the held E, then come in."); never a reason for a mistake the app did
   not measure, never pick direction as something heard, nothing about tone, tension or posture as a
   judgement. Translated through the pack i18n pipeline in the fourteen other languages (sonnet
   helpers, `plans/paths/I18N_BRIEF.md` and `plans/COACH_I18N_BRIEF.md`), each within 48 characters.
   Then a **separate reader** (a fresh sonnet helper that did not write them, given only the cues, the
   Exercises' tabs and the rules) proof-reads the English as a teacher and reports objections; you fix
   or answer each, and put both lists in your progress file.
5. **A writer's guide** for the content legs: `plans/coach/CUES_GUIDE.md`, at most 80 lines: the
   triggers and when each fires, the rules above, ten good cues and ten bad ones with the reason, how
   to check length in all languages, how to run the pipeline, how the proof-read works.

## Gates

tsc, vitest (`cueFor` table; `validate` cases for every rule; `variantText` on cues), build;
`npm run paths -- check`; `npm run test:paths:rust` (`path_exercises`); the pack i18n regeneration
clean (`git status` shows only intended changes); the full layout suite (the result note grows by a
line: short windows, phones, German and Russian); `smooth.spec.ts`; the English honesty test extended
to cues. Screenshots of the result with a cue and of a Take's order in Ember and Manuscript, desktop and
phone, under `/tmp/coach-c4c/shots/`.

## Report

As BRIEF "The end of a leg", with the count of cues written, the proof-reader's objections and what
changed, and the screenshot paths.
