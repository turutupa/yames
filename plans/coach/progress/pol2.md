# pol2 progress: polish for the tools and Ask

Branch `coach-pol2` (from `coach` at 51464eaf). Brief: `plans/tasks/coach/pol2-tools-and-ask.md`.
Extras copied from `/tmp/coach-orch/s6/pol2-extras.md` (below, verbatim index).

## Status per item

### The brief (items 1 to 15)

| # | State | Commit / note |
|---|---|---|
| 1 | done | `6c0a00a3`: the head's view switch moves in beside the drawer (ask.css); ask.spec at 1024x700 / x768 (switch left of the drawer, picture's frame unchanged), the result's column also at 1024x768. The note under the head stays covered (DESIGN 3.3: covers the picture, never the controls; c2a1's decision kept). |
| 2 | gone | chip1b's `onePress` covers the question chips (AskPanel.tsx:240, AskToolTurn.tsx:245, AskCardTurn.tsx:70). |
| 3 | done | `2a758277`: askStore puts the divider before turns written since the open (askStore.test.ts). |
| 4 | done | `9ece5bfe`: the chip's canned answer speaks through `speakAndReveal` (useToolCoach.ts; useToolCoach.chipSpeech.test.tsx). R-adjacent: useToolCoach.ts is the old useSession body. |
| 5 | done | `b4ddda25`: mini-report carries `stoppedAt` (useSegmentCoach.ts), ToolCoach skips one from before this run with its chips. Not in useSession.ts. |
| 6 | left | 1024x700 tool line cuts the beat row mid-circle: needs pictures. |
| 7 | left | 620 px header "Save preset" → "Sa": needs pictures and the base-worktree check. |
| 8 | done | `c459404e`: `borrowedRef = isActive()`, `endingRef` gone; the test's fake coach answers isActive like useSession. |
| 9 | done | `c459404e`: useSessionRun.race.test.tsx (test only). |
| 10 | done | `c459404e`: dead `.coach-card` rules out of session.css; the useSession comment was already gone (c5c1). |
| 11 | done | `f7a22a51`: usePathsPlace.move writes the scroll only while Paths shows (usePathsPlace.test.ts, new). |
| 12 | left | mock 16's row mark on the page: a feature with a layout scene. |
| 13 | done | `5d4e8cc4`: AskPanel `place` prop (MainWindow passes `placeKey` on Paths) keys the chips' memo; AskPanel.test.tsx. |
| 14 | gone | all three fixed by t1b1 ("…is gone, so nothing was loaded"; `presetStops`; `coachTools.value.auto`). |
| 15 | half | `8560246d`: "show" + a screen's own name → go_to (router.ts, every locale via its table; tests en/es/de). Left: "play some music" near-miss needs a table word list; the tables are c5a1b's next. |

### Extras

| # | State | Note |
|---|---|---|
| A1 | done | `6a6c9f23`: cut at a sentence end (cards.ts `pieces`), one source line under consecutive same-source text blocks (CoachBlocks.tsx). |
| A2 | done; native read wanted: vi label long ("nhấn" as a noun), ja/ko "平均幅 / 평균 정도" stiff, tr `metric.accents` compact, ru "на 12% громче" order; zh also changed 比其他音响 → 比其他音更响 in the already-correct siblings (accentsMark etc.), "音响" read as "speakers" | English `0847d98f`; fact checked against `src-tauri/src/score/pass.rs:481-493` (`accent_agreement`: mean accented amplitude / mean plain amplitude − 1, clamped 0..1). Fourteen locales by three sonnet translators + three proof-readers. |
| A3 | t2g's | fixed on `coach-t2g` (db87ad57), not yet on `coach` when checked. |
| A4 | left | "Rest it till Monday 4:49 AM": the time is deliberate (review L11 of c4b4: the rest ends at last Take + 48 h; a weekday alone is wrong for part of that day). Day-only needs either rounding in the planner (`parkedUntil`, t2e's file) or a rule for which day to name: a product call. The 34 px Paths card at 1160 not reached. |
| A5 | done | `d40f525e`: helpMatch TUNING. |
| A6-A11 | left | not reached. |
| B12 | report only | see the final report. |
| C13 | left | not reached. |

## The extras list (copy of /tmp/coach-orch/s6/pol2-extras.md)

Each names the review file (under `/tmp/coach-orch/`) or the progress file (in the repo,
`plans/coach/progress/`) that describes it. Do **A** first (a player can see them); **B** robustness;
**C** test headroom. An item that turns out wrong or not worth it is named here with the reason.

A: what a player can see
1. `c2b2b.md`: a quoted Path passage longer than one block is cut BETWEEN WORDS into two blocks, each
   with its own source line (German phone shot: "…an die du denken musst," / "das Timing."). Cut at a
   sentence end, or keep one block with one source line.
2. `c2b2b.md`: the "accents landed N%" strings (session.json and ask.json: `session.metric.accents`,
   `ask.card.changed` / `distance`) are vague about what the accents check measures (an average
   loudness ratio, `pass.rs` `accent_agreement`): say what is measured, fifteen locales.
3. `t2d.md` open point 5 (unless leg t2g already fixed it: check `coach`): after "Open Paths" the old
   receipt still shows its "Open Paths" chip while Paths is on screen.
4. `c4b4.md`: the plateau button "Rest it till Monday 4:49 AM" shows a time as well as the day; on
   Paths the suggestion card stops 34 px short of the grid's right edge at 1160.
5. `c2cc.md` / the tuning refusal (`helpMatch.ts` `TUNING`): "half step down" / "whole step down"
   count as tuning, so "move it a half step down" on Jam gets "the app has no tuner": remove those two
   unless the word "tune / tuned / tuning" is in the line.
6. `t2dc-review.md` L1, L2: de "1 takt" no longer makes a one-bar exercise; a bar count equal to an
   ordinal fret ("4 takte im 4. bund") is refused. L5: the missing cases it lists.
7. `c2b2ab-review.md` L1 leftovers and `c2b2ac.md`: "Abdim7 is the vii chord of Bbb minor" now adds
   "(Bbb sounds the same as A)": check it reads well; nothing else.
8. `c6a-review.md` L3 is done; L4 (Settings' Undo writes the original day back without checking what
   happened since): leave unless reachable.
9. `c5a1c-review.md` L1: a stop followed by Play within the same tick can lose the stop's "heard"
   (the line is missing, never wrong): give each run its own holder object in `useHeard.ts` (a small
   hunk; diff for review). L3: the "not during a Take" note stays under a live Undo after the Take.
10. `rem2c-review.md` L3 (the focus re-read is not debounced: ignore a tick under about 1 s after the
    last), L5 (the Rust test checks the cascade, not the join; a TS test that can flake across
    midnight).
11. HANDOFF-S5's list: `int1b-review.md`'s six LOW, `c4a2b-review.md`'s three LOW, chip1's fast-tap
    LOW (`chip1b-review.md`), `lb1b-review.md`'s three LOW, `c3b2ab-review.md` LOW 1 and 3,
    `c5b2-review.md` L5.

B: robustness
12. `c4b3b.md`: `suggest_path`'s short note in the choice prompt is "a Path" because the cards' share
    (300 tokens) is full. Do NOT change any card's `short`, `note`, or the budget: only say in the
    report what raising the share to 320 would allow.

C: tests that fail in a full run under load and pass alone (headroom, or wait on state not time)
13. `src/containers/coach/ToolCoach.test.tsx` "after Listen goes off, the summary and the way to Tool
    runs"; `src/hooks/useSessionRun.startPath.test.tsx` "loads the Paths off the learning side";
    `src/containers/main-window/shellRows.parity.test.tsx` "ONB-04: the chip opens the wizard";
    `src/paths/generate.test.ts` "mostly"; layout `smooth.spec.ts:172` "Ask commits nothing during a
    running Take" (wait on the state, not on time); `coach-session.spec.ts:169` (a 30 s timeout).
    Rust: `harmony::worker::tests::*` "waited 20s for a window" and
    `timing::tests::metronome_pause_gap_detection_does_not_drop_post_restart_beats` (wall-clock under
    a load of 60: only if a clean way exists; no change to what they test).

## Order of work

Brief items still open, then extras A in order, then C, then the rest of the brief. Stop at ~200k
tokens; the rest goes to `pol2-HANDOFF.md` for pol3.
