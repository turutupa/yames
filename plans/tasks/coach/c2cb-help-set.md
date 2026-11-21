# Leg c2cb: the help set, `explain_screen`, search and help wired into Ask; locales; scenes

Worktree `/home/dgx-delgado/yames-coach-c2cb`, branch `coach-c2cb`. Logs under `/tmp/coach-c2cb/`.

PLAN's leg c2c, second half. **Needs c2ca merged**, and c2b2b merged or run in sequence after it (both
edit `AskPanel.tsx` and Ask's locale files; see "Parallel note"). Read first:
`plans/coach/progress/c2ca.md` (`answerSearchFor`), `t1b2b.md` (`answerTyped` and its slot),
`c2b1b.md` (where the cards were plugged in), `c2b2a.md` (the computed app terms: you do not repeat
them), `t1a1.md` (`explain_screen`: `read`, no arguments, today `notWiredYet`). Design, read-only:
`DESIGN.md` 5.3 (the "The app" row: "a translated help set, about 40 entries"), 5.4, 5.5 (the "A free
question" row and the footer), 3.1 (what each screen is), 13 ("explain this screen" goes at once).

**Size.** Forty entries in fifteen languages is the heaviest translation load in this wave. Do items 1
to 4 in English first (every key in all fifteen files as English, listed under "to translate"),
commit; if your context is then past 170k tokens, stop there: items 5 and 6 become leg c2cc
(worktree `/home/dgx-delgado/yames-coach-c2cc`, launched from this file).

## What to build

1. **The help set**, `src/coach/ask/help.ts` (ids, which screens each belongs to, the question shapes
   that reach it) and its text in a locale namespace of its own, `src/locales/<lng>/help.json`: about
   forty entries. Two kinds:
   - **one per screen** (Today, Paths, a Path, a Step, the Session's ready / Take / result, Progress,
     Tools, Metronome, Drill, Setlist, Jam, Songs, Settings, the model selector): what the screen is
     for and what each control does, in at most three sentences, never a number about the player;
   - **the app's words** that are written, not computed: Take, Step, Level, rung, pass mark, clean
     tempo, review, parked, benchmark, graded / ungraded, "marked not fair", Listen, Tool runs, My
     exercises (only once t2b has merged; otherwise leave it out), the Notebook (once c4a2 has merged).
   Written in English from the code (read what each screen really does; grep, do not guess), read by
   a second sonnet helper against the screens, then translated. **No sentence says "the bar" for the
   threshold, nothing about tuning, nothing a screen does not do.** Source "The app".
2. **`explain_screen`** answers with the entry for `ctx.screen` (a test per screen; a screen with no
   entry is a failing test, not a silent "not yet"). Its chip shows in Ask's empty state on every
   screen that has an entry, through `suggest.ts` (still at most three).
3. **The order in `answerTyped`** (DESIGN 5.3): router → cards → **help** (English matching of the help
   questions, as the cards match) → **search** (`answerSearchFor`, every language) → the model when one
   is selected → the plain statement. One function each, in t1b2b's slot chain; a table test over
   typed lines that checks which engine answered. A command still never reaches help or search.
4. **What the panel says** (DESIGN 5.5): the footer and the text box's placeholder as the design words
   them now that search exists ("Search your Paths, or tap a question", mock 17's placeholder); check
   what c2a1 wrote before changing it.
5. **Fourteen locales** for `help.json` and every new key, by sonnet helpers (five locales each) with
   `plans/COACH_I18N_BRIEF.md` and each locale's existing screen names.
6. **Layout scenes**: a search answer quoting a Path passage (en and ja), `explain_screen` on the
   Session's result and on Today, at 1440 and a phone, Ember and Manuscript. Pictures only when
   `YAMES_SHOT_DIR` is set.

## Not yours

Search's ranking (c2ca: a defect is fixed with a test and named). The cards (c2b1 / c2b2). A model
(c3b). The Notebook (c4a).

## Parallel note

Shared with c2b2b: `AskPanel.tsx`, `askStore.ts`, `ask.css`, `src/locales/*/ask.json`. In sequence
after c2b2b is the safe order; if run beside it, your strings live only in `help.json` and your
`AskPanel.tsx` hunks are the slot chain and the placeholder, nothing in the source line's handler.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `short-window.spec.ts`,
`phone-header.spec.ts`, your scenes. The full layout suite is the orchestrator's (text changed).

## Report

As the rules block's "The end of the leg": the forty entries (id, screens, the English text's first
sentence), the engine-order table, the placeholder and footer before and after, the locales that want
a native read, the screenshot paths, and a "diff for review" paragraph for `AskPanel.tsx`.
