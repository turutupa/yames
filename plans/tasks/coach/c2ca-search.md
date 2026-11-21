# Leg c2ca: search of the player's Paths, as pure code with tests

Worktree `/home/dgx-delgado/yames-coach-c2ca`, branch `coach-c2ca`. Logs under `/tmp/coach-c2ca/`.

PLAN's leg c2c, first half (split by the size rule: c2cb does the help set, `explain_screen`, the
wiring, locales and scenes). This half is **pure TypeScript and tests**: no UI, no locale strings, no
layout scene. It can start as soon as t1b2b is merged (it touches nothing the card legs touch).

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); `plans/coach/progress/t1b2a.md` (the router:
what a command is, so search never shadows one) and `progress/t1b2b.md` (`answerTyped` and its slot;
you only export, you do not wire). Design, read-only: `/home/dgx-delgado/yames-coach-design-out/DESIGN.md`
5.3 (engine 3, and the "Technique in general" row: "the nearest Path passage first"), 5.4 (guardrails
2 and 3), 5.5 (the "A free question" row), 9.1 (the "Teaching text" row), 10 (C2c's gate: "search
fixtures in en, de, ja").

## What to build

1. **`src/coach/ask/search.ts`**: `searchPaths(query, index, opts)` → the nearest passages, best
   first, each `{ pathId, stepId?, exerciseId?, field, text, score }`, or none. **BM25** (k1 1.2, b 0.75
   unless a test shows a reason to change them; say so) over the fields `purpose`, `howTo`, `why`,
   `payoff` (Step and Exercise; `goal` if a test shows it helps; record the choice), **in the player's
   language** from the pack overlays (`src/paths/packs/i18n/<lng>/`), with the variant played where an
   Exercise has one (`exerciseWords`).
2. **Tokenising**: lower-case, accents folded where a locale's own search would fold them (de umlauts
   kept as they are typed both ways: "ue" and "ü"; say what you chose), a short stop-word list per
   language (data, not code; at most thirty words; the fifteen lists written by sonnet helpers from
   the locale's common function words), and **character bigrams for ja, zh-CN, zh-TW and ko** (no
   spaces; Hangul has spaces but bigrams still beat whole words for particles: say what the fixtures
   showed).
3. **The index**: `buildSearchIndex(paths, lng)`, built lazily the first time a search runs (never at
   startup, never in a render, never during a Take), cached per language, rebuilt when the player's
   Paths change. Measure it: build time and memory for all sixteen Paths in English and Japanese, on
   this machine, in the report. **"The player's Paths"** means the Paths they follow plus the ones they
   have passed Steps in; when that set is empty, all sixteen (judgement call: the design does not say
   what a new player searches; the orchestrator may overrule).
4. **A floor**: below a minimum score the answer is none (a question about a different topic must not
   return a random passage). Set the floor from the fixtures, not by hand-waving: a near-miss table per
   fixture language of questions that must return none.
5. **Fixtures in en, de and ja** (DESIGN's gate), at least fifteen questions each with the passage a
   teacher would point at, written against the real packs; plus five each for es, ru and zh-CN (the
   other scripts and morphologies). A test that runs them all.
6. **`answerSearchFor(text, ctx)`**: the exported function c2cb plugs into `answerTyped` after the
   cards: the best passage as a `CoachAnswer` of a quoted text block, **source "From the Path · Step N"**
   attached by the app, the passage quoted byte for byte (a test). Never two passages run together,
   never paraphrased.

## Not yours

The help set, `explain_screen`, the wiring into the text box, any visible string, scenes (c2cb). The
cards (c2b1 / c2b2). A model (c3b: the model may later choose a passage; you return candidates it can
choose from, so keep `searchPaths` returning the top five).

## Gates

tsc, vitest, build. No layout run (nothing visible changes).

## Report

As the rules block's "The end of the leg": the fixture results per language (hits at 1 and at 3), the
floor and how it was set, the index's build time and size, the stop-word lists that want a native
read, and what c2cb needs (the function's name and what it returns).
