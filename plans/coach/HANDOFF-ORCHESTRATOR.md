# Handoff for the next coach-build orchestrator

Kept current by the orchestrator as it works, so a session that ends without warning loses nothing.
Read this, then `PLAN.md` (the order), `PROGRESS.md` (the index: every leg's row, what was reviewed, what
is left for a polish leg), `STATUS.md` (what was delivered), `plans/tasks/coach/BRIEF.md` (the owner's
decisions), `plans/tasks/coach/RULES-FOR-PROMPTS.md` (the rules every agent gets) and
`~/yames-coach-design-out/OWNER-UPDATES.md` (binding, newest last: re-read it before each leg).

## How this build runs

- You orchestrate; you do not write app code. Coding legs: `Agent` with `model: "opus"`,
  `effort: "medium"`, `run_in_background: true`, one worktree and branch per leg
  (`git worktree add -q ~/yames-coach-<leg> -b coach-<leg> coach`, then
  `ln -s ~/yames-coach-build/node_modules ~/yames-coach-<leg>/node_modules`, `mkdir -p /tmp/coach-<leg>`).
  Reviewers: fresh opus agents, read-only, given a diff file under `/tmp/coach-orch/` and told to write
  their report to `/tmp/coach-orch/<leg>-review.md`. Translators and proof-readers: sonnet helpers the
  leg spawns itself.
- **Never end your turn while an agent is running.** Wait with
  `~/.local/bin/wait-until --timeout 585 file /tmp/yames-dgx-yield` in a loop (or on a review file with
  `--any`); reports arrive as messages at your next tool call.
- **A leg is 250k tokens at most.** Session 2's sizes: a rescue or a fix leg 100k to 240k; t1a2
  (fourteen tools) 320k, c1b2b 311k, cues2 (97 Exercises) 312k: all three were too big. Split a leg
  that builds UI, strings in fifteen locales and layout scenes; split a tool leg past eight tools; one
  Path per cue leg, and a Path over about 70 Exercises in two legs (by Level).
- **The prompt for a leg**: the shape of session 2's prompts (the leg file, the reading order, what
  the orchestrator will check, the other agents running and the files they own, the report). The rules:
  tell the agent to read `plans/tasks/coach/RULES-FOR-PROMPTS.md` first and repeat the eight most
  broken ones inline (the wrapper and its lock, one command per call, no `rm` / install / push /
  GitHub / ssh / tauri dev, the commit line, commit at every milestone, never end while a helper runs,
  the full layout suite only after 8 PM, do not go round a block).
- **After a leg reports**: read two or three of its screenshots against the mocks (Read the PNGs);
  **send to an independent reviewer** any diff in `src/hooks/useSession.ts`, `useSessionRun.ts`'s
  runner, the settings or SQLite stores (TypeScript or Rust), `src/ipc.ts`'s playback calls, and any
  Rust near the engine. Every review in session 2 found real defects (c2a2: 5; t1a2: 9, then 1; c1b2b:
  6): do not skip it. Give the fixes to a fresh small agent on the same worktree with the review file
  as its work list, then have the fix re-read when it touched the same ground. Then
  `git merge -q --no-ff coach-<leg>` (identity and trailer as in BRIEF); gates on the main checkout
  (`bash plans/coach/tools/gates.sh [layout specs]`, in the background, output to
  `/tmp/coach-orch/gates-<leg>.log`; for a cue merge `bash plans/coach/tools/gates-cues.sh`, which adds `npm run paths -- check`);
  `unlink <worktree>/node_modules`, `git worktree remove <worktree>`; the leg's row in `PROGRESS.md`;
  at a delivery a `STATUS.md` line, commit, `git bundle create /tmp/yames-coach-out.bundle coach`,
  `chmod 644` it.
- **Machine.** The owner works on this DGX on weekdays 7 AM to 8 PM Pacific. In those hours: at most
  2 coding agents (read-only reviewers do not count), and `run.sh` applies the rest by itself (`nice`,
  4 cargo jobs, 2 Playwright workers, 4 vitest workers, one heavy command at a time through
  `/tmp/coach-heavy.lock`); the full layout suite only after 8 PM. After 8 PM and at weekends: up to
  3 coding agents; `run.sh` holds the lock shared, so the orchestrator can take it alone for a probe
  run. `/tmp/yames-dgx-yield` means everyone commits WIP and stops. Under load vitest exits 1 with
  "Timeout calling onTaskUpdate" and every test passing (`gates.sh` prints a NOTE saying which it was).
- `/home/dgx-delgado/yames-coach-base` is a scratch worktree (detached) for "did this fail before?".
- Never: GitHub (no push, issues, PRs, boards), `npm install`, `npm run tauri dev`, `rm`, `sudo`.
  `ssh rtx … powershell.exe` was refused by this session's permission mode (see "Owed").

## State (update this section at every merge)

Merged on `coach`, session 1: c0, c1a, pm, ms1, c1b1, fix1, c2a1 (+b), c1c, c3a (+b), ms2 (+b), c4c.
Session 2 (2026-11-20, from 13:45 PT), in order: **c2a2** (+ c2a2b; no Start button, Listen, the tool's
line and note, Tool runs; reviewed twice) → delivery 1d; **t1a1** (the tool runner, go and read tools);
**cues1** (+ cues1b; Rhythm Foundations, First Chords) → delivery 1e; **c1b2a** (Today's line);
**cues2** (Blues Pentatonics); **t1a2** (+ t1a2b, t1a2c; the fourteen confirm tools; reviewed twice)
→ delivery 1f; **c1b2b** (+ c1b2c, c1b2d, c1b2e; the voice at boundaries, three coach keys; reviewed three
times; Rust in `tts.rs` / `commands.rs`), **cues3** (Chords in a Key) → delivery 1g; **t1b1** (+ t1b1b;
the tools in the Ask panel; reviewed), **cues4** (Know the Neck) → delivery 1h. Deliveries so far: 1a
to 1h (`STATUS.md`). Six Paths of sixteen have cues.

In flight when this was last written (check `git worktree list`, `git branch --no-merged coach`, and
`PROGRESS.md`'s rows marked "running"):

| Leg | Worktree / branch | State | Next |
|---|---|---|---|
| **vr1** the variant rewriter says false note names (a defect in shipped code, found by cues4) | `~/yames-coach-vr1`, `coach-vr1` | Running when this was written (brief: `plans/tasks/coach/vr1-variant-rewriter.md`) | Read its report: the count of how-to lines and cues that were false before the fix, by Path; merge; `bash plans/coach/tools/gates-cues.sh` plus `gates.sh tests/layout/coach-session.spec.ts tests/layout/short-window.spec.ts`; say the result in `STATUS.md` (delivery 1h names the defect as known and being fixed). If it stopped before the audit's rewording was done, a second agent finishes it from its progress file. **No cue leg starts before vr1 is merged** (it changes what `check` reports and may reword cues in several packs). |

For a merge that changed Rust: `bash plans/coach/tools/gates-rust.sh [layout specs]` (the gates, then
`npm run test:rust`).

Briefed and not started (`plans/tasks/coach/`), all three can start now: `t1b2-typed-commands.md`,
`c2b1-fact-cards-playing.md`, then `c2b2-fact-cards-path-plan-theory.md` (after c2b1). **Split t1b2 and
c2b1 before launching them** (every leg with UI, fifteen locales and layout scenes ran past 300k this
session): t1b2 into the router with its English table and tests, then the fourteen verb tables and
the wiring with its scene; c2b1 into the machinery with the first three cards in English, then the
rest of the cards, the locales and the scenes. Tell t1b2: a chip's words are stored as the player's
turn and must not reach a model's conversation without the tool's answer (`progress/t1b1.md`).
The cue legs share `cues-content.md`; **the queue of Paths left, in order** (after vr1 is merged):
scales-and-modes (69), classic-rock (69), legato (46), triads (68), funk-lines (46), metal-rhythm (49),
arpeggios-over-changes (54), sweep-picking (72: two legs), tapping (49), shred (53). One Path a leg:
every cue leg of 54 to 73 Exercises used 240k to 275k tokens, so the "second Path if under 110k" rule
never fires; drop it from the prompt. Each cue leg copies the scripts in `plans/coach/tools/cues/`
into its log folder (session 2's prompts for cues3 and cues4 are the shape to copy).

Not yet briefed: c2c (search, the help set, `explain_screen`), a **polish leg** (every item marked "for
a polish leg" in `PROGRESS.md`: about twenty now; brief it as two legs, one for the Session and Today,
one for the tools and Ask), c4a, c4b, t2a to t2c, rem, c3b, c3c, c5a, c5b, c5c, c6. `PLAN.md` has each
one's scope, design sections and flags; split each as above before briefing it.

Suggested order from here: vr1 (merge) → the night gates below if it is after 8 PM → t1b2a ‖ c2b1a ‖ a
cue leg → t1b2b ‖ c2b1b ‖ a cue leg → c2b2 ‖ c2c ‖ a cue leg (**delivery 2**: Ask answers and acts on
every device with the selector on Off) → the two polish
legs → milestone 3 (c4a, c4b, t2, rem) with the remaining cue legs beside it → milestone 4 (c3b, c3c)
→ milestone 5.

## Owed, and easy to forget

- **An open question for the owner** (in `STATUS.md`, delivery 1h): a chip for a one-press tool
  ("Slower") shows its proposal first, so the change takes two presses; the chip's own press could
  count. Built the careful way; change it only on the owner's word.
- **The full layout suite on `coach`, after 8 PM Pacific** (not run since c4c; ten merges since changed
  text or styles): `bash plans/coach/tools/run.sh npx playwright test --trace off > /tmp/coach-orch/layout-full.log 2>&1`
  from the main checkout, in the background. Songs tests time out under load: re-run a failure alone.
  A real failure gets a small fix leg. Put the result in `STATUS.md`.
- **The click-jitter probe runs on a quiet machine**, after 8 PM, with no agent's heavy command
  running: `flock -x /tmp/coach-heavy.lock bash plans/coach/tools/probe-night.sh > /tmp/coach-orch/probe-night.log 2>&1`
  (it builds the probe from `coach`, waits for a load average under 6 before each of seven runs, and
  skips a run rather than make it on a busy machine). Do it after c1b2b merges (its Rust change is in
  the speech path). Put the p99s in `STATUS.md`. Still owed after that: the LLM runs with Qwen3 4B on
  Vulkan on the owner's machine.
- **The Windows run of the download code (ms2) is blocked from here and needs the owner.** The bundle
  and the script were copied to the PC (`C:\Users\delgado\src\yames-coach.bundle`,
  `yames-coach-test.ps1`; local copies in `~/scratch/yt-coach/`), but the permission mode refused the
  `ssh rtx … powershell.exe` call, and it was not retried another way (the owner's rule). The one line
  that runs it is in `STATUS.md` (delivery 1d).
- The main orchestrator (the other account) re-runs gates on each bundle: say in `STATUS.md` what is
  owed rather than letting it find out.
- Translations wanting a native read are listed in each leg's progress file and row.
- `neck.spec` at 620×780 has a thin margin (−0.35 against −0.5): any leg that adds height to the
  Session's ready screen runs it.
- c3b must: send a grammar with a bounded `ws`; treat a truncated answer as no answer; measure a tip's
  time with and without the cached Ask prefix; cancel an Ask generation when a Take starts; decide how
  the typed-command router and the model meet (the router runs first today).
- For the Path's owner: Blues Pentatonics' quick-chorus bar 2 may have a wrong note (`progress/cues2.md`).

## Decisions made while building (the full list with reasons is in `PROGRESS.md`)

- The selector: at the foot of the right-hand panel, named by model and size, Download in the row; Off
  never deletes; memory is a warning and never a lock; no load starts during a Path Session or while
  the click plays.
- Session events reach the coach through one wrapped dispatch; subscribers read the event's payload.
- `takeNote` returns data; sentences live in the locales.
- The cue is also shown under the finding on the result, because "Go again" skips the ready screen.
- Listen is on the Jam's transport too; a run too thin to save gets no end note; `isActive()` answers
  from the last start or end requested.
- Tools: a navigating `go` tool becomes a one-press proposal while the click, a band or a song is
  sounding (Settings is an overlay and stops nothing); `set_tempo` in a Session proposes only the
  one-rung nudges that exist; `follow_path` says it has no undo; proposals and undos are issued by the
  runner, single-use, and good only on the screen (and Exercise) they were made on; band volume has an
  "auto" value so an undo can put back "no choice" (a graded microphone Take then starts with the band
  off, as before).
- The voice: `set_playing` is posted before speech is cut; a boundary line never dims the click.
- A leg that changes any text on a screen needs the full layout suite: on weekdays it is the
  orchestrator's, after 8 PM.
