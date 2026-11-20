# Leg pm: "pass mark", and the translation brief for coach strings

Worktree `/home/dgx-delgado/yames-coach-pm`, branch `coach-pm`. Logs under `/tmp/coach-pm/`.
Read `plans/tasks/coach/BRIEF.md` first. Design: DESIGN.md section 2 (the voice table; its last row is
this leg) and section 10's first paragraph (translations).

## Why

"Bar" means two things in the app's English: a bar of music, and the threshold a Take has to reach
("That clears the bar: eight bars in a row…"). The owner decided: one word, one meaning. The threshold is
the **pass mark**. "Bar" is music only.

## Part 1: the rename

1. Find every English string where "bar" means the threshold: `src/locales/en/*.json` (about 35 lines
   mention "the bar"; **many of them are bars of music and stay**), English literals in `src/` (aria
   labels, test fixtures, comments that describe UI text), the pack text under `src/paths/` (specs, packs,
   generated English), the Rust phrase banks if any (`src-tauri/src/`), and the docs a player reads (not
   `plans/`). Make a table: key, old text, new text, or "music: stays". Put the table in your progress
   file. When a sentence is ambiguous, read the code that shows it.
2. Rewrite each threshold sentence so it reads naturally with "pass mark" ("Under the pass mark", "That
   reaches the pass mark", "The pass mark is 85%"): no mechanical search and replace, no sentence left
   with both meanings. Keep every placeholder and the key names (**keys do not change**: `session.bar.*`
   keeps its name, so nothing else moves).
3. The fourteen other locales: where a locale used one word for both meanings, change the threshold
   sentences to that language's natural word for a pass mark (the minimum to pass), consistently, and
   leave bars of music alone. Where a locale already tells them apart, leave it. Use `model: "sonnet"`
   helpers, one per four or five locales, each given Part 2's brief, the table from step 1 and the
   locale's current strings; then read their output yourself for placeholders, length and consistency.
4. If pack text changes: `npm run paths -- check`, and regenerate what the pipeline regenerates
   (`plans/PATHS_PIPELINE.md` says how); the pack i18n overlays follow the same rule as step 3.
5. Snapshot or text assertions in tests that quote the old sentences are updated to the new ones, not
   deleted.

## Part 2: `plans/COACH_I18N_BRIEF.md`

The brief every later leg hands to its translation helpers (a UI-locale brief does not exist yet;
`plans/paths/I18N_BRIEF.md` is for packs: read it for the house style and do not contradict it). At most
120 lines:

- The fifteen locales and where their files are; how keys, plurals and placeholders work here; the test
  that fails when a key is missing (`i18n.locales.test.ts`).
- **A glossary per locale**, taken from what the locale files already say, for: Take, Step, Path,
  Session, Exercise, Today, pass mark, clean tempo, rung, bar (music), round (of the tune), the coach,
  Ask, graded / not graded, Listen, early / late. One table, fifteen columns or fifteen short lists.
- The coach's voice (DESIGN section 2's table), as rules a translator can apply: one or two sentences, an
  instruction is an order, numbers only with their base, says where and which way and never why, first
  person about its limits once, no praise that oversells, informal or formal address as the locale file
  already uses.
- What a translator must never add: a reason for a mistake, a claim about pick direction, muting,
  posture, tension, fingering, tone or feel, a suggestion to turn on the microphone, "check your tuning".
- Layout facts: German and Russian run long (chips wrap to two lines; nothing is `nowrap` except a number
  with its unit); the order shown during a Take is at most 48 characters in every language.
- How a helper should return its work (the JSON fragment per locale, keys in the English order) and how
  the leg checks it.

## Gates

tsc, vitest (`i18n.locales.test.ts`, the parity `localeKeys` suite, every test that quotes a renamed
sentence), build; `npm run paths -- check` and `npm run test:paths:rust` if pack text changed; layout
specs for the screens whose text changed (at least `session.spec.ts`, `result-number.spec.ts`,
`grading.spec.ts`; German and Russian scenes where they exist), because a longer sentence can break a row.

## Report

As BRIEF "The end of a leg", with the count of strings changed per locale and anything you left alone on
purpose.
