# MVP: a build we can send to testers (started 2026-11-16)

Read `CLAUDE.md`, `plans/tasks/revamp/BRIEF.md` (its rules hold), `plans/tasks/revamp/STATUS.md`,
`plans/tasks/revamp-3d/BRIEF.md`, then this.

## What "done" means

A tester installs a build on Windows, macOS or Linux, and without help:

1. **Sets up:** the first run gets their guitar heard (mic or direct input), with a level they
   can see, and lands on **Today**.
2. **Practises:** picks 5/10/15/20 minutes; the Session runs Exercises from a runnable Path on the
   3D neck; Takes are graded from real audio; results say what moved; Find my edge works.
3. **Comes back:** progress and clean tempos are there after a restart; Today plans from them.
4. **Still has the tools:** Metronome, Setlist, Drill, Jam and Songs work as before.
5. **Can tell us** what happened: an in-app "Send feedback" that opens a prefilled GitHub issue
   (or mail) with the version, OS and their words; nothing is sent without them pressing it.
6. **The click is safe** with the neck drawing: measured in the real app, not only headless.

## Product positioning (the owner's, 2026-11-16)

Three things together, which no guitar app does: a Session that fits the minutes you have;
grading of technique (evenness, notes heard, extras) from your guitar; a clean tempo per Exercise
that moves as you improve. Songs are secondary. Melodics is the reference for how practice and
progress should feel.

## Work

| # | Worker | Branch | Owns |
|---|---|---|---|
| M1 | first run and feedback | `mvp-firstrun` | `src/containers/onboarding/**`, the feedback entry (Settings/Help), version label, `TESTING.md` |
| M2 | runnable Paths and right notes | `mvp-paths` | `src/session/packs.ts` (runnable list), `src/paths/**` fixes a Path needs, `src-tauri/src/score/**` + `pitch.rs` + commands for `noteIdentity` |
| M3 | the real app, end to end | `mvp-e2e` | an in-app click probe flag in `src-tauri` (reviewer), `tests/e2e/**`, scripts to run the real app headless on Linux with a virtual input |
| M4 | builds | orchestrator | `release.yml` dispatch on `revamp`, CI fixes, artifacts for testers |
| M5 | polish | later | the mocks' amp meter, tubes and chart on results, recap and Progress |

Each branches from `revamp`, merges back when green; the orchestrator integrates, pushes, and
re-runs the build.

## Gates

As in the wave briefs: `tsc --noEmit`, vitest, `npm run build`, the layout suite for screens,
the Rust gates for `src-tauri` (`test:rust`, `test:dsp`, `test:highbpm`, `test:pitch`,
`test:grading`, `path_exercises`), the `reviewer` agent for audio callback, engine or store
changes. Commit as you go; never `release`; no push, no merge.
