# Revamp: status (2026-11-16)

The wave in `BRIEF.md` is merged into `revamp`. This file says what the branch
does today, what was fixed after the workers stopped, and what is left before
the first playable build is in the owner's hands. The worker briefs (`W1`, `W2`,
`W3`) describe their state on 2026-11-10 and are kept as the record.

## Where it is

- **Branch:** `revamp`. `revamp-w1-grading`, `revamp-w2-parity`,
  `revamp-w3-tracer` and `paths-v1` are merged into it. Nothing is on `main`.
- **History:** the previous machine crashed several times; six commits were
  saved as "wip, not gated" (044ea279, 4f66849f, 41f3fec3, 51a0ba92, 1f02fda9,
  dc7a6c38). They were gated and audited on 2026-11-16, and what the audit
  found is fixed below. Anything left uncommitted in the old worktrees under
  `/home/turutupa/Dev/yames-w*` after 2026-11-10 10:09 was never in git.
- **Gates on `revamp`:** `tsc --noEmit`, vitest (all files), `npm run build`,
  `test:rust`, `test:dsp`, `test:highbpm`, `test:pitch`, `test:grading`,
  `path_exercises`, `parity_store`, `parity_midi`, and `test:layout`. On a
  Linux box two layout tests also fail on `main` (`coach-blocks` at the
  380 px dock, `songs-seek` at zoom 0.8): font metrics, not the revamp.
  `timing::tests::restart_within_session_does_not_drop_post_resume_beats`
  sleeps 150 ms and fails only on a loaded machine.
- **Review:** the `reviewer` pass on `audio_input.rs` (input side) and on
  `db.rs` migration five found both OK to merge; its two cheap fixes are in
  (`list_path_takes` clamps its limit, `save_path_take` refuses an
  out-of-range clean tempo).

## The first playable build, item by item

| Item | State |
|---|---|
| Today, with time choice and reasons | Done |
| A real Session through `useSession`'s call order | Done. A coach session the player already had is left running |
| Alternate Picking graded on a real guitar | Built end to end, **not yet played on a guitar** |
| Find my edge | Done |
| Results with the number that moved | Done |
| Every existing tool under Tools | Done; parity suite green |

## Fixed after the workers stopped (2026-11-16)

Grading:
- **The scorer's pass rule now decides.** The Session never sent `passBars`, so
  `score/pass.rs` never ran in the app and `src/session/grade.ts` judged with a
  weaker copy. Now the bars go with the schedule and the scorer's verdict,
  checks and clean tempo are used; `grade.ts` is a fallback.
- **One sloppy bar can't hide in a window** (Rust and the fallback).
- **A Take played to its end finishes every bar.** No downbeat follows a
  non-looping song, so an 8-bar Take counted 7 and could never earn a clean
  tempo. `score.rs` `finished_bars_of`; `path_exercises.rs` pins it with the
  beats a real Take logs.
- **Songs keeps its scoring.** The lag correction applies only to Takes with
  pass bars (`ScheduleRun::with_lag_correction`), so Songs scores exactly as on
  `main`; `path_exercises.rs` pins it against the plain matcher.

The Session:
- A Take is long enough for its longest `overBars` (the Stamina minutes need 16).
- The bar a Take was stopped in is not counted as played.
- Level warm-ups are found and planned from their own tempo plan and grid.
- The variant the planner picks is the one played, drawn and recorded.
- A Take's row records when it started.
- Readable accent text on the learning screens (it was nearly invisible in the
  dark themes).

Shell and parity:
- A returning player opens on Today with their saved tool kept; "open on my
  last tool" brings every tool back as before. Both pinned.
- The tour's Drill stop shows the Drill's key (`tab-3`); it said `tab-2`.
- All 14 other languages have the learning side translated.

## Before the first playable build

1. **Play it on a guitar** (the owner's machine, mic or direct input):
   Alternate Picking through Today, a Session, a result, Find my edge. Keep the
   takes. Every threshold is a design value until then
   (`plans/paths/REVIEW_NOTES.md`).
2. **The detector changed for every mode** (`onset.rs`: 256-sample hops, a ring
   cursor, a noise floor that learns from quiet hops). `test:dsp`, `test:highbpm`
   and `test:pitch` feed timestamps, not audio, so they cannot see it. Play
   Pocket Check, Drill and the coach as well, and record a real-audio corpus
   (`src-tauri/tests/audio_fixtures/recordings/`, empty today) before `main`.
3. **Re-run the click-jitter probe** on a quiet machine
   (`bun run yames:jitter-probe -- --no-llm`, and the song and jam runs in
   `AGENTS.md`). Nothing records that it was run after the detector change.
4. **Owner decisions** in `plans/LEARNING_PATHS_DECISIONS.md`, "Where the
   revamp landed": the assumed entries, and whether a new player lands on Today
   after the wizard.

## Known, not built in this wave

- `noteIdentity` is not measured: pass bars naming it are "not assessed", and
  the result says so.
- No Tools list screen; the tools sit in the rail's Tools group.
- The planner does not read the chosen Level yet.
- No component tests drive `useSessionRun`, `SessionView` or `TodayView`
  end to end; the `?shot=` scenes and the layout suite cover the screens.
- TOOLS_PARITY section 5.3 (a Session writes the same history rows as the
  same practice through the tool) is not pinned.
- The Path drafts are `draft`: no teacher review, nothing played.
