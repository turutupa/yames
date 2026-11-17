# Revamp: status (2026-11-17, MVP)

## The MVP, as of 2026-11-17

`revamp` holds the MVP the owner asked for on 2026-11-16 (`plans/tasks/mvp/PLAN.md`):
the learning path comes first, and the tools are still all there under Tools.

- **The three core points.**
  - **A Session fits the minutes you pick** (5, 10, 15 or 20), planned across every Path you subscribe to (up to 4): a rotating focus, reviews at 1, 3, 7, 14 and 30 days, benchmark Takes on days 1, 7, 14 and 21, placement and Test out (`src/session/planner.ts`, `rotation.ts`).
  - **Technique is graded from the real guitar.** `score/pass.rs` judges timing evenness over windows of finished bars, and a pitch pass over the Take's audio counts right notes (`take_audio.rs`).
  - **Each Exercise has a clean tempo that rises over time.**
- **The 3D neck** (`src/stage3d`) has a switch for the 3D fretboard (Auto/Off), falls back to SVG on a software renderer, and lets the player choose Neck or Runway. Only one picture shows during a Take.
- **Five Paths can be played:** Shred (the first), Blues, Classic Rock, Alternate Picking and Sweep. Their content is in 15 languages.
- **The band plays behind a Take.** It starts muted on a microphone and at 0.8 on an interface.
- **Platforms.**
  - Windows and Linux installers come from `release.yml` (`workflow_dispatch` on `revamp`).
  - Android: a push to `mvp-android` builds an APK signed with the TEST key.
  - macOS is blocked until the owner accepts the Apple Developer agreement.
- **QA.** Two sweeps (`plans/tasks/mvp/QA-2026-11-17.md`; the second sweep's shots are in `~/projects/.preview/qa2`). All 26 items are fixed, except that the runway intentionally has no preview before the Take. The second round's issues (the phone recap, the Russian first run, Path names, subdivision labels) are fixed.
- **Input robustness (`mvp-bugs`).**
  - The input is no longer lost after Exit.
  - An unanswered Android microphone dialog times out after 60 s.
  - `EVALUATION_TURN` is an awaited tokio mutex.
  - A Take closes only an input it opened itself.
- **Gates** on 90b84756: tsc, vitest 8428, `test:rust` 1009, build, `paths check`, and the layout specs that were touched.

**Before real users get it:**
1. **Play it on a real guitar**, on a microphone and on an interface (Windows and Android). No threshold has been tuned on real playing yet.
2. **Owner decision on how strict the clean tempo is.** Today all 8 bars of an 8-bar Take must hold. The proposal is 10-bar Takes, where any 8 clean bars in a row count.
3. **Native speakers review the translations.**
4. **The release signing key for Play is the owner's choice.** The APK is test-signed (`ANDROID_KEY_IS_RELEASE` gates publishing).
5. **Known residuals.**
   - A band picked up by a microphone (bleed) can count as onsets; that is why the band starts muted on a mic.
   - Whether the input is an interface is decided from a list of device names.
   - The Shred finale has no sweep bar.
   - Classic Rock has few bends.
   - Linux audio threads run at normal priority.

The sections below are the 2026-11-16 record and are kept as history.

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
  sleeps 150 ms and fails only on a loaded machine. `jam.spec.ts` "the cheat
  sheet, maximized, never covers Stop" is flaky here on `main` as well.
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
- A new Take can't be started on the last one's song. After Go again, the Start
  button was enabled for a frame before the next Take was loaded, so a quick
  press (or the pedal) began it on the old song with the new one loading
  underneath. "Prepared" now belongs to one Take of one step.
- The `?shot=` scenes are reliable: the mock engine handed every listener the
  same state object (React saw no change and dropped a stop), and never
  unregistered a listener (it matched the wrong id). The Find my edge climb
  failed most runs before; 90 runs of the session scenes pass now.
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

- `noteIdentity` is measured since `mvp-paths` (M2): the onset detector's
  thread keeps a Session Take's input (`take_audio.rs`), the pitch pass runs on
  its own thread after the Take, and the pass rule counts right notes per window
  where the pitch pass can be believed (`score/pass.rs` `notes_status`).
  Ringing, swept, too fast or too few: "not assessed", and the result says so.
  Sweep Picking is runnable; Blues waits for the landing grader.
- No Tools list screen; the tools sit in the rail's Tools group.
- The planner does not read the chosen Level yet.
- No component tests drive `useSessionRun`, `SessionView` or `TodayView`
  end to end; the `?shot=` scenes and the layout suite cover the screens.
- TOOLS_PARITY section 5.3 (a Session writes the same history rows as the
  same practice through the tool) is not pinned.
- The Path drafts are `draft`: no teacher review, nothing played.
