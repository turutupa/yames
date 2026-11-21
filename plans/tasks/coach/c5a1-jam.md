# Leg c5a1: the coach on Jam: a line on stop, the note that makes a change audible, pin a shape, "Make this my finisher"

Worktree `/home/dgx-delgado/yames-coach-c5a1`, branch `coach-c5a1`. Logs under `/tmp/coach-c5a1/`.

PLAN's c5a, first half (c5a2 is Songs and Today). **Needs merged: c2b2a** (the theory cards), **t1b2b**
(the command tables), **c2a2** (the tools' line under the stage). It may run beside c5a2 (no shared
file but the locales: c5a1 `jam` / `coachTools`, c5a2 `songs` / `session`) and beside c3b2b, c6b, rem2.
Not beside a leg in `src/coach/tools/registry.ts` or the command tables (t2c), nor in `planner.ts`
(c4b2, t2d). **Conditional split**: if your context passes 170k before item 5, stop after item 4
(committed, gated) and hand item 5 on as **c5a1b**; that is the plan, not a failure.

Read: `plans/coach/progress/c0.md` (the bus), `c2a2.md` (`ToolCoach.tsx`, the tools' line and note,
"nothing on Songs, Zen, a phone"), `c2b2a.md` (theory cards and their resolver), `t1a1.md` /
`t1a2.md` (tools, `confirm` kind, receipts, undo), `t1b2a.md` (the router). Code: `src/jam/heard.ts`
(`heardChart`, `heardLine`, `heardRecap`, `RECAP_MIN_HEARD_S`), `src/jam/useHeard.ts` (where
`harmonyStop()` returns), `src/coach/bus.ts` (`jamStopped` is typed and **published by nobody**),
`src/containers/jam/JamView.tsx` and `PinnedShape.tsx` (`pinnedShape` is a field of the jam, set with
`onEdit`), `src/session/planner.ts` (the `finisher` block, `finisherPick` in `src/session/rotation.ts`).
Design, read-only: `DESIGN.md` 3.1 (Jam's row), 3.6 (an action is an accent-tonal button with a verb),
8 (Jam's row), 9.3 (`pinShape` as a `CoachAction` kind), mock 09; `TOOLS.md` 2.2 ("make a jam your
finisher": waits for one press). `NEXT-LEGS-s4b.md` judgement calls 14 to 17.

## The owner's rules where they bite here

- **Silent while the band plays.** Nothing of this leg computes or renders per beat or during a Take;
  the line is built once, when the jam stops.
- **Only when the player turned on "Hear what I play"** (`jamHear`). With it off nothing was heard,
  so nothing is said, and nothing asks the player to turn it on (the microphone is a never-tool).
- **Stated as heard, not as a mistake** (DESIGN 8): the line says what the notes outlined beside what
  the chart had; no "wrong", no "missed", no grade.
- Pinning a shape and making a finisher change what is stored: **one press each, with Undo**; the
  coach never does either by itself, and neither is reachable during a Take.

## What to build

1. **Publish `jamStopped`** (with the `HeardSummary`) where `harmonyStop()` returns
   (`useHeard.ts`; the bus's comment names `useJamSession.ts`: fix the comment). A test that a stop
   publishes once and that a stop with hearing off publishes no `heard`.
2. **The line on stop**, pure: `jamHeardLine(summary, chart)` → a `Line` or null: null under
   `RECAP_MIN_HEARD_S` or without a settled reading (as `heardRecap`); otherwise the chords the notes
   outlined set against the chart's ("Your notes outlined Am, F and G. The chart has Am, F, C and G."
   proposed English; chord names from `chordNameOf`, never from a model). Shown once in the tools' line
   slot under Jam's stage (`ToolCoach.tsx`) until the next play; never on a phone (c2a2: the tools'
   coach is desktop only). Table tests over fixture summaries: none, too short, unsettled, all
   matched, some outside the chart, a transposed jam.
3. **The note that makes a change audible** (DESIGN 8): on the Jam screen with a chart loaded, a
   theory answer about a chord of that chart (c2b2a's cards) adds one line naming the note that moves
   between the chord before it and this one (the guide tone, from `src/jam/harmony.ts`), source
   "Worked out by the app". Tests on three charts, including one where no single note moves.
4. **`pinShape`**, a `CoachAction` kind (`blocks/types.ts`, `spec.ts`, `actions.ts`, as DESIGN 9.3):
   a `chordShape` block shown on the Jam screen carries a "Pin this shape" button; the press sets the
   jam's `pinnedShape` through the same `onEdit` the sheet uses, with a receipt and Undo (Undo
   restores the shape pinned before, or none). Refused during a Take. Tests: press, undo, refusal.
5. **"Make this my finisher"**: a `confirm` tool `make_finisher` (`{ jam: query }`, the current jam when
   left out) in the registry, reached by an accent-tonal button on Jam (stopped only), a chip and the
   command tables, and its proposal. The press stores the choice (judgement call 16: the settings
   store, `coach.finisher` = `{ jamId, title, day }`, **R**, valid for that day's plan only) and the
   planner reads it as an input: on a plan with a finisher slot (twenty minutes or more), the finisher
   is that jam, ungraded, for the slot's minutes, instead of `finisherPick`'s Exercise over a band.
   Undo clears it. Tests: the planner with and without it (`planner.test.ts`), a plan too short for a
   finisher says so in the receipt, the tool's table test (allowed and refused contexts).
6. **Fifteen locales** for every new key, by sonnet helpers with `plans/COACH_I18N_BRIEF.md`; the
   command words for `make_finisher` in each locale's table.
7. **Layout scenes** (pictures only when `YAMES_SHOT_DIR` is set): the line under Jam's stage after a
   stop (1440, 1024), the pin button and its receipt in Ask, the finisher button and Today's plan with
   the jam as its finisher; one Ember, one German.

## Not yours

Songs, Today's line (c5a2). The jam's audio, `useJamSession.ts`' engine calls, the harmony engine.
Anything on a phone's Jam screen. Hearing back a Take (c5b).

## Gates

tsc, vitest, build; layout by name: `jam.spec.ts`, `jam-watch.spec.ts`, `tool-coach.spec.ts`,
`ask.spec.ts`, `ask-tools.spec.ts`, `planner.spec.ts` and `swap.spec.ts` if item 5 landed,
`smooth.spec.ts`, your scenes.
No probe (nothing runs while the band plays).

## Report

As the rules block's "The end of the leg", plus a **diff for review** paragraph for `planner.ts`, the
settings store code and the manifest (item 5), `src/coach/tools/run.ts` / `registry.ts` if touched, and
`useHeard.ts`.
