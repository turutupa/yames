# Leg c2a2: the old Start button goes; the tools keep their coach

Worktree `/home/dgx-delgado/yames-coach-c2a2`, branch `coach-c2a2`. Logs under `/tmp/coach-c2a2/`.
Read `plans/tasks/coach/BRIEF.md` first, then `plans/coach/progress/c2a1.md` (the Ask panel and what the
old panel still does), `ms1.md` (the model is the selector's; no session loads it) and `c1b1.md` (the
`CoachLine` and `CoachNote` components). Design: DESIGN.md section 7, all four tables, and the Tools and
Progress rows of sections 3.1 and 8; REVIEW.md row 4 of "The ten that mattered most" (why Listen lands in
the same leg as the deletion). `plans/revamp/TOOLS_PARITY.md` or wherever the COA rows live (grep
`COA-07`): the tools must lose nothing.

The owner named this top priority with the selector: no Start button, no "coach session" to begin or
end. The model is the selector's business; listening in the tools is the player's explicit choice.

## What to build

1. **Listen, on the tool's transport.** The sentence "Coach listens when you press play"
   (`Transport.tsx`) becomes a toggle in the same slot, in Metronome, Drill and Setlist. The state table
   of DESIGN 7 is the contract, row for row:
   - Listen on: `startSession()` as today, without opening a panel or a feed; the input turns on because
     the player asked.
   - Play, Stop, Play… while Listen is on: one coach session spans them; a run of 10 s or more ends in a
     note.
   - Listen off, the player leaves the tools, or ten idle minutes: `endSession()`, saved once.
   - A Path Session begins while Listen is on: the Session does not own that coach session (the existing
     `theirs` branch).
   - Play with Listen off: the click and nothing else. **The coach never turns the input on by itself**,
     and Listen is never on by default.
2. **The tool's coach line**, under the stage, while Listen is on: the old live tips, the same
   gatekeeper, cooldowns and settings, one line at a time. A tip that carries a button (drop or raise
   10 BPM, rest, posture reset, retry calibration; COA-25/26) shows it at the end of the line, with the
   same cap of two per five minutes.
3. **The tool note**: the mini-report as a coach note under the stage when a run of 10 s or more stops.
   Its question chips open Ask (`onAsk` from c2a1).
4. **History to Progress → Tool runs**: list, detail, delete, clear all, the note-spacing trend (COA-46
   to 48), `SegmentTimeline` and the report summary, on theme tokens. Old `SavedSession` rows stay
   readable (a test with a stored fixture). Delete and clear all stay the player's own buttons.
5. **Delete** `CoachCard.tsx`, the pill, `coach-card.css`, the feed renderer in `CoachFeedMessage.tsx`,
   the panel's Start and End buttons and its Feed and History tabs. `greeting.ts` goes with the old
   greeting. The keys that go are listed in `DELIBERATELY_REMOVED` (the parity `localeKeys` suite). The
   `toggle-coach` action, the tour's `coach` stop and the `coach-ask` hint are kept and re-anchored. The
   Ask panel keeps the model selector at its foot.
6. What the old Start did that has no home in the table: find it (the table "What Start did" is the
   design's list; the code is the truth) and give each a home or say plainly that it goes, in your
   progress file.

## Constraints

- `useSession.ts`'s call order is guarded by `src/test/parity/doors.test.ts`; an independent reviewer
  reads this diff. `useSession.ts` is not split here (leg c5c).
- The phone shows nothing coach-related in the tools, as today.
- No Rust change is expected. If the input start / stop path needs one, stop and report: that is the
  audio reviewer's ground.
- Looks: the Listen toggle is a toggle (state in words and shape, not colour alone), 44 px on touch;
  the line and note follow DESIGN 3.6.

## Gates

tsc, vitest, build; the parity suites (`doors`, `surface`, `localeKeys`, `savedFormats`, `parity_store`
if it applies); the TOOLS_PARITY COA rows re-checked one by one in your progress file (kept, moved to X,
or gone because Y); `npm run test:layout` in full (the transport changes on every tool at every width;
`phone-transport.spec.ts`, `tour.spec.ts`, `rail.spec.ts`, `short-window.spec.ts`), with new scenes for
Listen off and on, the tool line with a button, the tool note, Progress → Tool runs; `smooth.spec.ts`
(the tool line must not add a per-beat render); `npm run check:mobile-bundle`; strings in fifteen
locales. Screenshots of the new scenes in Ember, Neon and Manuscript under `/tmp/coach-c2a2/shots/`.

## Report

As BRIEF "The end of a leg", with the COA table, the screenshot paths and the `useSession.ts` diff range
for the reviewer.
