# Leg pol2: polish, the tools, Listen, Ask and the typed commands

Worktree `/home/dgx-delgado/yames-coach-pol2`, branch `coach-pol2`. Logs under `/tmp/coach-pol2/`.

The small things earlier legs left "for a polish leg" in `plans/coach/PROGRESS.md` (rows c2a1, c2a2,
t1a1, t1a2, t1b1, t1b2a) that concern the tools, Listen, Ask or the typed commands. The Session and
Today items are pol1's: do not repeat them. **Needs t1b2b and c2b1a merged**, and no other leg
working in `AskPanel.tsx`, `askStore.ts`, `ask.css`, `askTools.ts` or `src/coach/ask/` while you run
(c2b1b, c2b2a/b, c2ca/b all do: run pol2 between two of them, not beside one). Each item is small; do
them in this order, one commit each; first **check the item is still true on your branch** (a later
leg may have fixed it: then say "gone" and move on). Stop when your context passes 220k tokens and
say which are left.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); for each item only the part of the progress
file named; `plans/COACH_I18N_BRIEF.md` before changing a sentence. Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 3.3, 3.6, 5.2, 7; mock `16` (Read the PNG).

## The items

1. **Ask over the Session at 1024 px** (`progress/c2a1.md`): with Ask open, the drawer covers part of
   the head (the Neck / Runway / Tab switch) and the note. DESIGN 3.3 wants the result's text column
   whole. Fix in the drawer's or the Session's CSS; a layout assertion at 1024×700 and 1024×768.
2. **A chip tapped twice answers twice** (`progress/c2a2.md`): check whether t1b1b's `onePress` now
   covers the question chips; if not, the same guard, with a test.
3. **The "Now looking at" divider lands after a canned chip answer** (`c2a2.md`): it belongs before the
   first turn on the new screen. A unit test on the thread's order.
4. **A chip answer's speech skips the reveal queue** (`c2a2.md`): route it through the same queue the
   other answers use (Voice on only); a test that two answers never speak over each other.
5. **A late mini-report can become the next short run's note** (`c2a2.md`): key the report to the run
   it was asked for and drop it when another run has started; a test with the two runs interleaved.
   If the fix is in `useSession.ts`, the item is **R**: say so in the report.
6. **At 1024×700 the tool's line cuts the beat row mid-circle** (`c2a2.md`): a layout fix and a scene.
7. **The header at 620 px with the rail open cuts "Save preset" to "Sa"** (`c2a2.md`): first find out
   whether it is older than c2a2 (`/home/dgx-delgado/yames-coach-base` is a scratch worktree); fix it
   either way, and say which.
8. **`borrowedRef = isActive()` alone in `useToolListen.ts`** (`c2a2.md`): the simplification the
   reviewer suggested, with the existing state-table tests green.
9. **A `useSessionRun` test for the race's order** (`c2a2.md`: Listen's queued end against Today's
   Start). A test only; no change to `useSessionRun.ts`'s code.
10. **Dead `.coach-card` rules in `session.css`; one stale comment in `useSession.ts` naming
    `CoachFeedMessage.tsx`** (`c2a2.md`). The comment is the only `useSession.ts` change this leg may
    make besides item 5: name it in the diff for review.
11. **`open_path` from Today can overwrite the remembered Paths scroll** (`progress/t1a1.md`):
    `usePathsPlace.move` saves the scroll of whatever screen is showing. Save only when Paths is the
    screen; a test.
12. **Mock 16's "the page marks the row the proposal points at"** is not built (`progress/t1b1.md`):
    build it for a proposal that names a Step or an Exercise on the page showing (theme tokens only, no
    animation during a Take, gone when the proposal is retired); a layout scene.
13. **The chips are not re-chosen when Paths opens a Step page with Ask open** (`t1b1.md`): key the
    chips' memo on the place too; a test that it does not recompute per beat (the existing one).
14. **From t1a2's notes, check each against t1b1b's fixes and say which remain**: a preset deleted
    while its proposal is shown still says "Loaded"; `stops` on `load_preset` can name a song that does
    not stop; "auto" as a band-volume value needs words in the receipt.
15. **"show me my progress" falls through; "play some music" reaches `play_exercise` and answers "not
    found"** (`progress/t1b2a.md`): the first becomes `go_to progress` in the English table (and in the
    fourteen if the word is the screen's own noun there); the second becomes a near-miss that returns
    `none` (a wrong action is the failure that matters). Table tests in English plus one locale.

## Not yours

The Session and Today (pol1). `loop_bars`' missing bars door (`progress/t1a2.md`: it needs
`useSessionRun.ts`; recorded as its own follow-up in `NEXT-LEGS.md`). The chip's one-press question
(with the owner: change nothing). New features.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `coach-session.spec.ts`,
`short-window.spec.ts`, `phone-header.spec.ts`, `smooth.spec.ts`, `tools.spec.ts` (or whichever spec
covers the tools' transport: grep), `neck.spec.ts`. The full layout suite is the orchestrator's.

## Report

As the rules block's "The end of the leg": per item done / gone / left, with the before and after where
a sentence or a picture changed; the diff for review (every hunk in `useSession.ts`, `AskPanel.tsx`,
`askStore.ts`).
