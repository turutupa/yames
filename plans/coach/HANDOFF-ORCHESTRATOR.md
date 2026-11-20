# Handoff for the next coach-build orchestrator

Kept current by the orchestrator as it works, so a session that ends without warning loses nothing.
Read this, then `PLAN.md` (the order), `PROGRESS.md` (the index and the decisions made while building),
`STATUS.md` (what was delivered), `plans/tasks/coach/BRIEF.md` (the rules every leg gets) and
`~/yames-coach-design-out/OWNER-UPDATES.md` (binding, newest last: re-read it before each leg).

## How this build runs

- You orchestrate; you do not write app code. Coding legs: `Agent` with `model: "opus"`,
  `effort: "medium"`, `run_in_background: true`, one worktree and branch per leg
  (`git worktree add ~/yames-coach-<leg> -b coach-<leg> coach`, then
  `ln -s ~/yames-coach-build/node_modules ~/yames-coach-<leg>/node_modules`). Reviewers: fresh opus
  agents, read-only, given a diff file under `/tmp/coach-orch/`. Translators: sonnet helpers the leg
  spawns itself.
- **Never end your turn while an agent is running.** Print mode stops background agents when the turn
  ends. Wait with `~/.local/bin/wait-until --timeout 580 --any file /tmp/yames-dgx-yield file
  <worktree>/plans/coach/progress/<leg>.md` in a loop; reports arrive as messages.
- **Size the legs smaller than this session did.** c1b1, c2a1, c2a2 and c4c each ran to 440k to 540k
  tokens, far past the 300k cap in their own brief, and c2a2 stopped without reporting. Split a leg that
  builds a screen, its strings, its layout scenes and its translations into two (build; then scenes,
  translations and gates), and tell each agent to hand off at 300k rather than push on.
- An agent past about 300k tokens is not resumed: a fresh "b" agent takes its fixes on the same
  worktree and branch (ms1 was resumed once at 280k and it was the limit; c2a1 and c3a got fresh
  agents: c2a1b, c3ab).
- The prompt for a leg: copy the shape of the prompts already used (the leg file path, the reading
  order, the binding rules pasted in full, which other legs are running and which files they own, the
  design judgement you will check, what the final report must contain). The rules must be in the
  prompt itself, not only in BRIEF.md.
- After a leg reports: look at its screenshots against the mocks yourself (Read the PNGs); send any
  Rust diff, and any `useSession.ts` / store diff, to a reviewer; merge with
  `git merge --no-ff coach-<leg>` (identity and trailer as in BRIEF); run
  `bash plans/coach/tools/gates.sh [layout specs]` on the main checkout; unlink `node_modules`, then
  `git worktree remove`; update `PROGRESS.md`; at a delivery add a `STATUS.md` line, commit, then
  `git bundle create /tmp/yames-coach-out.bundle coach` and `chmod 644` it.
- Machine: at most 3 coding agents (2 on weekday daytime unless `/tmp/yames-dgx-full` exists; it did on
  2026-11-20). `/tmp/yames-dgx-yield` means everyone commits WIP and stops. The load average was 50 to
  80 all day on 2026-11-20: vitest then sometimes reports "Timeout calling onTaskUpdate" with every
  test passing (re-run to confirm), timing-based layout tests flake (re-run alone), and no jitter-probe
  p99 is believable.
- `/home/dgx-delgado/yames-coach-base` is a scratch worktree (detached) for "did this fail before?"
  comparisons: `git -C ~/yames-coach-base checkout -q --detach <sha>`, then
  `bash plans/coach/tools/run.sh bash /tmp/coach-orch/base-layout.sh <spec> -g "<title>"` (recreate
  that two-line script if `/tmp` was cleared: `cd` there, `exec npx playwright test --trace off "$@"`).
- Never: GitHub (no push, issues, PRs, boards), `npm install`, `npm run tauri dev`, `rm`, `sudo`.

## Session 2 (started 2026-11-20 13:45 PT): what changed in how the build runs

- **The rules pasted into every prompt** are `plans/tasks/coach/RULES-FOR-PROMPTS.md` (250k tokens a
  leg, a commit at every milestone, the daytime limits). Paste the block, with the leg's name filled in.
- **`run.sh` applies the owner's daytime limits by itself** (weekdays 7 AM to 8 PM Pacific): `nice`,
  4 cargo jobs, 2 Playwright workers, 4 vitest workers, and a lock (`/tmp/coach-heavy.lock`) so only one
  heavy command runs at a time across all agents. Agents start heavy commands in the background and
  wait. The full layout suite runs only after 8 PM: legs run named specs and the orchestrator runs the
  full suite on `coach` in the evening.
- **Legs are split**: t1a → `t1a1-tool-runner.md`, `t1a2-confirm-tools.md`; c1b2 →
  `c1b2a-today-line.md`, `c1b2b-voice-and-keys.md`. The cue legs share `cues-content.md`: one Path a
  leg (a second only if the agent is under 110k tokens), in worktrees `~/yames-coach-cues<N>`. The
  queue of Paths, in order: rhythm-foundations, first-chords, blues-pentatonics, chords-in-a-key,
  know-the-neck, scales-and-modes, classic-rock, legato, triads, funk-lines, metal-rhythm,
  arpeggios-over-changes, sweep-picking, tapping, shred. Cue legs never conflict with each other (a
  Path's own cue file, spec line, pack and overlays).
- **The Windows run is blocked from here.** The bundle and the script were copied
  (`C:\Users\delgado\src\yames-coach.bundle`, `yames-coach-test.ps1`; the local copies are in
  `~/scratch/yt-coach/`), but the session's permission mode refused the `ssh rtx ... powershell.exe`
  call that runs it. Not retried another way (the owner's rule). The owner can run it with one line
  (in `STATUS.md`); it fetches `coach` into `refs/remotes/dgx/coach`, tests in a separate worktree
  `C:\yt-coach\wt`, and leaves the owner's working tree alone.

## State (update this section at every merge)

Merged on `coach`, in order: c0 (bus, context, source line), c1a (takeNote, rounds, lean, heardIt), pm
(pass mark, `plans/COACH_I18N_BRIEF.md`), ms1 (model selector, resident model, silent quiet session;
reviewed), c1b1 (the Session's coach line and note), fix1 (two layout regressions, "Needs 85%"), c2a1
with c2a1b (Ask's shell: dock, drawer, sheet; reviewed, six fixes), c1c (the loop step, P1, P2, "for
your eyes"), c3a with c3ab (the Rust worker's Ask kind: grammar, cancel, deadline, cached prefix, two
probe modes; reviewed twice; nothing calls it yet), ms2 with ms2b (both models on disk, Pause / Resume /
Cancel, checksum, low storage; reviewed twice), c4c (the `cues` field, Alternate Picking's cues,
`CUES_GUIDE.md`). Deliveries: 1a, 1b, 1c (see `STATUS.md`); 1d is c2a2. A polish leg is owed at the end of milestone 1: the items
marked "for a polish leg" in `PROGRESS.md` (the drawer covering the note at 1024 px; "Up to N" beside
"Faster"; the strip's label against its cells).

In flight on 2026-11-20 (check `git worktree list` and `git branch --no-merged coach`):

| Leg | Worktree / branch | State | Next |
|---|---|---|---|
| **c2a2** (**the one open leg; start here**) | `~/yames-coach-c2a2`, `coach-c2a2` (worktree kept, `node_modules` linked) | **Stopped without a final report** at about 13:01 on 2026-11-20, past 500k tokens: do not resume that agent. Committed on the branch (5 commits on top of `5600c7c9`): Listen on the tools' transport, the tool's coach line and note, History → Progress → Tool runs, the old card, its feed and Start deleted, strings in fifteen locales, the mobile cut recorded, `plans/coach/progress/c2a2.md` (13 KB: read it first). **Uncommitted in the worktree** (its layout helper's work, unverified): `src/shots/mockIpc.ts`, `src/styles/shell.css`, `src/styles/tool-runs.css`, `tests/layout/ask.spec.ts`, `tests/layout/smooth.spec.ts`, new `src/shots/toolCoachFixtures.ts` and `tests/layout/tool-coach.spec.ts`. Its last logs: `/tmp/coach-c2a2/` (`pw-toolcoach.log`, `pw-others.log`, `pw-tsc.log`). The branch is behind `coach` by c1c, c3a, ms2 and c4c. | Launch a fresh **c2a2b** agent on the same worktree (the shape of the c2a1b prompt: inspect and commit the uncommitted files as `WIP(coach-c2a2): the stopped run's layout scenes, unverified`; `git merge coach` and resolve; finish whatever `c2a2.md` and `c2a2-listen-and-no-start.md` show undone, the COA table included; all gates and the full layout suite; screenshots in three themes; the report). Then: look at the screenshots against DESIGN 7; a **reviewer on the `useSession.ts` diff** (`git diff 5600c7c9..coach-c2a2 -- src/hooks/useSession.ts src/containers/practice-coach/ src/test/parity/`); merge; gates; **delivery 1d** (no Start button anywhere; the tools keep their coach through Listen). |

Briefed and not started (files in `plans/tasks/coach/`): `c1b2-today-speech-keys.md` and
`t1a-tool-registry.md` (both can start now). Not yet briefed: the `cues` content legs for the other
fifteen Paths (write the brief from `plans/coach/CUES_GUIDE.md` and c4c's prompt: one leg per four
Paths, a separate sonnet proof-reader before translating, the full layout suite at the end), a polish
leg (the items marked "for a polish leg" in `PROGRESS.md`), t1b, c2b, c2c, c4a, c4b, t2a to t2c, rem,
c3b, c3c, c5a, c5b, c5c, c6. `PLAN.md` has each one's scope, design sections and flags.

Suggested order from here: c2a2 (review, merge, delivery 1d: no Start button) → c1b2 ‖ t1a ‖ cues
content (two legs at a time at most beside a code leg) → the polish leg → t1b ‖ c2b → c2c (delivery 2)
→ the rest of `PLAN.md`.

## Owed, and easy to forget

- **Quiet-machine probe runs** (load average under 6): c3a's five (`bash /tmp/coach-c3a/probe-set.sh`;
  the commands are also in `progress/c3a.md` on its branch), c1c's `--song-loop --song-take`. And the
  LLM runs with Qwen3 4B on Vulkan on the owner's machine: say so in STATUS when delivering c3a.
- The main orchestrator (the other account) re-runs gates on each bundle: tell it in STATUS what is
  owed rather than letting it find out.
- Translations wanting a native read are listed in each leg's progress file (pt-BR "meta"; "caught
  you" in fr / it / es / nl / ja / zh; ru short state words; "Ask" as a feature name in de / ru).
- `neck.spec` at 620×780 has a thin margin now (−0.35 against a −0.5 tolerance; the base was −0.17):
  any leg that adds height to the Session's ready screen must run it.
- DESIGN 3.6 "tapping a source line opens what it cites" is not built and no leg owns it yet: give it
  to c2b (the fact cards).
- The window's old bottom download strip calls a pause "Cancel": ms2 was asked to make the words true.
- c3b must: send a grammar with a bounded `ws`; treat a truncated answer as no answer; measure a tip's
  time with and without the cached Ask prefix; cancel an Ask generation when a Take starts (c2a1b only
  holds the answer back until the Take ends).

## Decisions made while building (the full list with reasons is in `PROGRESS.md`)

- The selector: at the foot of the right-hand panel (the owner corrected an earlier reading), named by
  model and size, Download in the row; Off never deletes; memory is a warning and never a lock; no
  download ever replaces a brain on disk; no load starts during a Path Session or while the click
  plays; a load in flight runs on.
- Session events reach the coach through one wrapped dispatch (the reducer is pure). Subscribers read
  the event's payload: events are published before React commits.
- `takeNote` returns data; sentences live in the locales under `session.note.*`.
- The cue legs moved up: 825 of 1,010 Exercises have no cue short enough for the Take's order. The cue
  is also shown under the finding on the result, because "Go again" skips the ready screen.
- A leg that changes any text on a screen runs the full layout suite.
- `run.sh` sets `TMPDIR=/tmp/coach-tmp` (the other account's `/tmp/yames-take-video-*` folders made
  fifteen Rust tests fail with PermissionDenied).
