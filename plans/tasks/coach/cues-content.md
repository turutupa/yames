# Legs cues-N: the cues of one Path ("one thing to try"), written as a teacher would

The brief every cue leg shares. Your prompt names your worktree, your branch, your log folder and your
Path (sometimes a second one, see "Size"). Content only: no app code, no Rust, no layout.

Read, in this order: `plans/coach/CUES_GUIDE.md` (the rules, the triggers, ten good and ten bad: this is
the contract), `plans/coach/progress/c4c.md` (the sections "The proof-read", "Numbers" and "For the
content legs": what the first Path's leg learned), then the worked example
`src/paths/specs/alternate-picking-cues.ts` (read the first 150 lines and one later Level, not all 659).
Then your Path's own spec files, in parts.

## Why this matters

During a Take the player sees one order, 48 characters at most. Today 15 of the 16 Paths have none: their
`coachLine`s are too long, so the Take is silent and the result has no "Next time: …". The owner's first
sentence for this build is "the coach should be providing feedback as you go". These cues are that
feedback. They are read by a guitarist with the instrument in their hands, in the second before the
count-in: an order they can carry out, about the hands or the count, true of the tab in front of them.

## What to write

- `src/paths/specs/<path>-cues.ts`: a `CueBook` keyed by the pack id (`<step>.<exercise>`,
  `warmup-<level>.<exercise>`), attached in the Path's spec with `withCues(definePath({...}), BOOK)`.
  The Path's Exercises may live in several spec files (`<path>.ts`, `<path>-more.ts`, `-encore`,
  `-finale`, or other names: `src/paths/specs/index.ts` and the Path's main spec say which). Every
  Exercise the pack ships gets cues, the warm-ups included.
- For each Exercise: **one general cue** (`g`), and **one cue per trigger that Exercise can produce**
  (`possibleTriggers` in `src/paths/cues.ts` says which; the validator refuses a cue for a trigger no
  Take of the Exercise can produce). A second cue for a trigger only where a teacher really has a second
  thing to say at that spot. `more` points at the how-to line that says the same thing at length, where
  there is one.
- Read each Exercise's tab, purpose and how-to before writing its cues. The general cue is the
  Exercise's point (what this one teaches), not a generic "keep it even". The place cues (`afterHeld`,
  `openString`, `shift`, `stringChange`, `lastBars`) name what is at that place in this tab. Stock
  sentences are right for the same measured thing across Exercises (the `late` / `early` / `extras` /
  `heard` families: write them once as constants, so they are translated once), and wrong for the
  general cue.
- The Path's own technique matters. A legato line, a sweep, a tap, a bend, a strum pattern or a chord
  change each has its own order for "late", "notes missed" or "the last bars". Write what a teacher of
  that technique says. The honesty rule still holds: the app measures when a note sounded and which
  pitch; it does not hear pick direction, muting, hammer-on against picked, tension, posture or tone, so
  no cue says or implies that it did. As plain teaching ("Hammer hard enough to hear the note") such
  words are allowed, sparingly, and never as a reason for a slip.
- Never "the bar" for anything, never the pass mark, a grade, a percentage, tuning, the microphone,
  praise, "!", a question. At most 48 characters in every language.

## Order of work (commit after each numbered step)

1. Read; list the Path's Exercises with their pack ids and possible triggers (a small script under your
   log folder that imports what `scripts/paths.mjs` uses is fine; or read the pack JSON). Note the count.
2. Write the cues one Level at a time; after each Level run `npm run paths -- gen <path>`, `npm run
   paths -- strings <path>` and `npm run paths -- check <path>` and fix every refusal (`cue.*` rules;
   `cueTexts` says why a variant cannot say a cue: reword it to name less). Commit per Level
   (`feat(paths): <Path>'s cues, Level N`).
3. **Proof-read before translating**: one fresh helper (`model: "sonnet"`) that did not write them,
   given only: the cues, each Exercise's tab, purpose and how-to, the trigger table and the rules of
   `CUES_GUIDE.md`. It reads as a guitar teacher of this style and objects (wrong for the tab, not an
   order, two ideas, a cause claimed, contradicts another cue of the same Exercise, a duplicate that
   wastes a slot, vague). Fix or answer every objection; both lists go in your progress file. Commit.
4. **Translate** the cue keys only (`npm run paths -- strings todo <lng> --out <file>`, keep the `.cue.`
   keys; each distinct sentence once): sonnet helpers, one per three or four locales, each given
   `plans/paths/I18N_BRIEF.md`, `plans/COACH_I18N_BRIEF.md`, the terms the Path's overlay already uses,
   and the cap of 48 characters counted in characters. `strings merge <lng> <file>`, then `check`
   again: a translation over 48 characters is an error; send it back or shorten it yourself. Commit.
5. Gates: `npm run paths -- check` (every pack), `npx tsc --noEmit`, `npm run test` (the whole vitest
   suite once: `noteStrings.test.ts` lints every English cue, the i18n and paths suites read the
   overlays), `npm run build`. No layout run is yours: the orchestrator runs the full layout suite on
   `coach` after 8 PM. `npm run test:paths:rust` only if a Rust file changed (none should).
6. `plans/coach/progress/<leg>.md`: the numbers (cues by trigger, distinct sentences, Exercises
   covered, refusals and how each was reworded), the proof-reader's objections taken and answered, the
   longest cue per language, locales that want a native read, and **twelve cues for the orchestrator to
   read**: for four Exercises of different Levels, the Exercise's title and one-line purpose, its
   general cue and two of its trigger cues. Commit.

## Size

One Path is one leg. If your prompt names a second Path: start it only when the first is committed and
gated **and** your context is still under about 110k tokens; otherwise stop and say the second was not
started. Never leave a Path half translated at the end: a Path whose English cues are merged but whose
overlays are not fails `check`. If you must stop mid-Path, stop before step 4 or after it, and say which.

## What you own

`src/paths/specs/<path>-cues.ts` (new), the one `withCues` line in the Path's spec, the generated
`src/paths/packs/<path>.json`, and `src/paths/packs/i18n/<lng>/<path>.json` for the fifteen languages.
Nothing else. If the generator, the validator or `cues.ts` seems wrong, do not change it: write what you
found in the progress file and work round it in the wording. Other cue legs run beside you on other
Paths; code legs run on the app. None of them touches your Path's files.
