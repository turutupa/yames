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

## READ THIS FIRST: where session 3 stopped (2026-11-20, about 21:00 PT, at its context limit)

This section is newer than the "In flight" table under "State" below; where they differ, this wins.

**Delivered:** 1j, 1k and 1l (`STATUS.md`). `coach` is gated green with cues13b merged: **all sixteen
Paths have cues** (item 5 below is done). **Nothing is running.** Worktrees left on purpose:
`~/yames-coach-t1b2b`, `-c2b1a`, `-c4a1`, `-t2a` (unmerged work), `-cues13b` (merged: `done-leg.sh
cues13b`), `-night`, `-base`.

**t1b2c finished** (item 1 below): all six findings fixed with tests on `coach-t1b2b`, `coach` merged
in without conflict, gates green (`plans/coach/progress/t1b2c.md`). What is left of item 1 is the
second reader on the fix (`git diff 6ae65f54^..coach-t1b2b` is too wide: give it the fix commit
`304b7213` and the files `router.ts`, `askTyped.ts`, `askTools.ts` (`runTypedCall`), `resolve.ts`
(`titleMatch`'s joined match), `AskPanel.tsx`), then the merge. For c2b1b: the next answerer must be
synchronous (a Promise counts as "not answered").

**On branches, not merged. Do these first, in this order:**

1. **`coach-t1b2b`** (`~/yames-coach-t1b2b`): typed commands in fifteen languages, wired. Review
   `/tmp/coach-orch/t1b2b-review.md`: MERGE AFTER FIXES (HIGH: ja "コースを開けて" leaves one kana that
   resolves to a real Path and navigates at once). **Fix leg t1b2c was launched at 20:40 on the same
   worktree** (the review as its work list; it also merges `coach` in and runs the gates). If its
   report is in `plans/coach/progress/t1b2b.md` and the branch is clean: have a fresh reviewer re-read
   the fix (diff of `router.ts`, `askTyped.ts`, `AskPanel.tsx`, the four no-spaces tables), then merge,
   `gates.sh` with `ask ask-tools ask-typed smooth short-window`. If the agent died: relaunch it with
   session 3's prompt (the "Leg t1b2c review fixes" Agent call: `code-leg-prompt.md` plus the review).
2. **`coach-c2b1a`** (`~/yames-coach-c2b1a`): fact cards' machinery and three cards. Review
   `/tmp/coach-orch/c2b1a-review.md`: MERGE AFTER FIXES, eleven findings; **F1 and F2 make a card say
   something not measured** (self-checked Exercise answered "grading is off"; the premise lines claim a
   whole-Take lean the app does not measure); F5 puts raw findings into a model's prompt; F6 the
   matcher's wrong matches. Launch a fix agent on that worktree (the review as its work list, every
   finding with a test; then `git merge coach` after t1b2b is in, resolving `AskPanel.tsx`); re-read;
   merge; gates with `ask ask-tools coach-session smooth`. Then launch **c2b1b**.
3. **`coach-c4a1`** (`~/yames-coach-c4a1`): the four stored keys (`src/coach/store.ts`), tendencies,
   `notebookFrom`. Reported, **not reviewed**: flag R (settings store). Make the diff
   (`git diff coach...coach-c4a1 -- src ':(exclude)src/locales'`), send it to a fresh reviewer (the
   questions: no write without a press, defaults change nothing, a null reads as no choice, the load
   race with a press, the tendencies say only what was measured and with their count and window),
   fix, merge; **regenerate the parity manifest** (`UPDATE_PARITY_MANIFEST=1`: c4b1 merged first and
   also changed it). Its full vitest run after its last fix is owed.
4. **`coach-t2a`** (`~/yames-coach-t2a`): `buildCustomExercise(recipe)`, pure, gated on its branch,
   no review flag (it touches only new files and one Rust test harness). Merge, then
   `gates-rust.sh` as a queue job **and** `node scripts/rust-test.mjs --test path_exercises` (the
   harness `npm run test:rust` does not run). Its decisions to confirm are in its report
   (`progress/t2a.md`): position is the first note's fret, never moved; only "up and back" loops;
   sweeps left out.
5. **`coach-cues13b`** (`~/yames-coach-cues13b`): Sweep Picking's other 35 Exercises, launched 20:20.
   When it reports: read its twelve cues, merge, `gates-cues.sh` as a queue job: then all sixteen
   Paths have cues (say so in STATUS).

**Then**, from `plans/tasks/coach/NEXT-LEGS.md`: c2b1b ‖ c2ca ‖ t2b (R) ‖ c4a2 (not beside c2b1b) →
c2b2a → c3b1 ‖ c4b2 (its brief now starts with c4b1's review notes) → c2b2b → c2cb → **delivery 2** →
pol2 → t2c → t2d. Prompts: three lines pointing at `code-leg-prompt.md` (code legs) or
`cues-prompt.md` (content), as in session 3.

**Owed gates:** `smooth.spec.ts` alone on a quiet machine; the full layout suite again (pol1 changed
text; run it after t1b2b and c2b1a merge, in `~/yames-coach-night` after `merge --ff-only coach`); the
last two CPU-model probe runs are not worth making (see `PROGRESS.md`); the Vulkan probe is blocked.

**Small things with no leg:** First Chords' fourteen `cue.refused` (pol1's item 10); Today's header
"WELCOME BACK. IT HAS BEEN 12 DAYS"; `rem` Part 2 (option A) after c4a2; lb1; a stray helper file
`~/scratch/reuse14.py` (harmless; `rm` asks, so it was left); the unhandled "window is not defined"
errors vitest prints from `useDownbeatPulse.ts` and `askTools.test.tsx` timers after teardown.

**Questions with the owner** are listed in `STATUS.md`, delivery 1k (four; none blocks a leg).

## Session 3: what changed in how the build runs (read before anything in "How this build runs")

- **OWNER-UPDATES 18:08 to 18:35, 2026-11-20:** full throttle, no cap on agents; **every heavy
  command goes through the job queue** (`~/.local/bin/job submit … -- bash plans/coach/tools/run.sh
  <cmd>`, `--lock coach-layout` on any Playwright run; `job wait NAME --timeout 9m`; `job logs NAME -n
  40`); training approved after c3b (PLAN: leg c3d). `RULES-FOR-PROMPTS.md` has the rule; `run.sh`
  reads `/tmp/coach-orch/limits` ("full" now; write "day" when the owner restores weekday limits).
  The queue runs six jobs at a time: a wave of twelve legs waits on it, which is fine.
  `job cancel` needs `XDG_RUNTIME_DIR=/run/user/1000` in front of it from this shell.
- **Set-up and clean-up are one call each:** `bash plans/coach/tools/new-leg.sh <leg> …` (worktree,
  branch, node_modules link, log folder) and `bash plans/coach/tools/done-leg.sh <leg> …` (only a
  merged and clean worktree; unlinks first; keeps the branch).
- **Cue legs get a three-line prompt** that points at `plans/tasks/coach/cues-prompt.md` plus the
  Path's four particulars (session 3's Agent calls are the shape).
- **Orchestrator gates as queue jobs:** `job submit --name coach-gates-<x> --ram 12G --est 25m --cwd
  ~/yames-coach-build -- bash plans/coach/tools/gates-cues.sh` (or `gates.sh <specs>` with `--lock
  coach-layout`). Merge several finished cue legs, then gate once. The full layout suite runs in the
  pinned worktree `~/yames-coach-night` (re-point it with `git -C ~/yames-coach-night merge --ff-only
  coach` before a new run), so merges into the main checkout do not move files under Playwright.
- **The probe** takes the build's lock alone and so stops every leg's gates while it waits for a
  quiet machine: run it when few legs are at their gates, and give it a short wait
  (`PROBE_WAIT_MIN=5`). Tonight's numbers are in `PROGRESS.md`. **The Vulkan run is blocked** (no
  Vulkan headers or `glslc` on this DGX; the leg that would build them in the home folder was
  refused by the permission mode; `plans/tasks/coach/pv1-probe-vulkan.md`): it needs the owner.
  c3b2 (measuring Qwen3 4B / 8B) needs the same thing, or the RTX.
- **No longer owed:** the Windows run (green, per the relay). **Still with the owner:** the chip
  question (two presses stay).
- `today-line.spec.ts` still has a fixed `/tmp` default on `coach`; pol1's first item fixes it (the
  owner fixed it on `revamp`, which this checkout cannot fetch: expect a trivial conflict there).

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
| – | – | **Session 3 (from 17:46 PT, 2026-11-20).** Merged: t1b2a, cues5 → delivery 1j (with the probe's p99s). Read "Session 3" below first: the rules changed tonight (the job queue, no agent cap). | – |
| **Merged since 1j, not yet delivered** | – | cues6 to cues12 and cues13a (twelve Paths cued, Sweep Picking half), pol1, rem Part 1 (a report), the briefs (`plans/tasks/coach/NEXT-LEGS.md` is the index of what to launch next and in what order). `PROGRESS.md` has each row. | **Delivery 1k is blocked on gt1**: on `coach` the vitest gate fails for one test's 20 s timeout (`generate.test.ts` "subdivisions … mostly": the cues slowed the generator). When gt1 merges: `gates-cues.sh` as a queue job, then the STATUS line and the bundle. |
| gt1 | `~/yames-coach-gt1` | launched 19:40: where the cues' variant work costs time, whether any runs on the player's device, the fix | merge (read its answer about runtime first), gate, deliver 1k |
| t1b2b | `~/yames-coach-t1b2b` | built and reported; **review running** → `/tmp/coach-orch/t1b2b-review.md` | a fresh small agent on the same worktree with the review as its work list; merge **first** of the two Ask legs; gates `gates.sh ask ask-tools ask-typed smooth short-window` |
| c2b1a | `~/yames-coach-c2b1a` | built and reported; **review running** → `/tmp/coach-orch/c2b1a-review.md` | a fix agent: the review's findings, then `git merge coach` (after t1b2b is in) and resolve `AskPanel.tsx`; merge; then launch **c2b1b** (brief exists) |
| c4b1 | `~/yames-coach-c4b1` | built and reported; **review running** → `/tmp/coach-orch/c4b1-review.md` | fix agent if needed; merge with `gates-rust.sh` as a queue job; the parity manifest: whichever of c4b1 / c4a1 merges second regenerates it |
| c4a1 | `~/yames-coach-c4a1` | launched 19:25 (R: settings store) | review its "diff for review", merge; then c4a2 (not beside c2b1b) |
| t2a | `~/yames-coach-t2a` | launched 19:25 (`buildCustomExercise`, pure) | merge (check no diff under `src/paths/packs/`); then t2b (R) |
| cues14 | `~/yames-coach-cues14` | launched 19:15: Shred | read the twelve cues, merge |
| cues13b | `~/yames-coach-cues13b` | launched 20:20: Sweep Picking's other 35 Exercises | merge: then **all sixteen Paths have cues** |
| night | `~/yames-coach-night` | the pinned worktree for the full layout suite | the suite ran once (1,423 passed, 1 load failure in `smooth`); **owed: `smooth.spec.ts` alone on a quiet machine, and the full suite again after pol1 / t1b2b / c2b1a merge** (`git -C ~/yames-coach-night merge --ff-only coach` first) |

Next after these, from `NEXT-LEGS.md`: c2b1b ‖ c2ca ‖ t2b; c4a2; c2b2a; c3b1; c4b2; c2b2b → c2cb →
**delivery 2** → pol2 → t2c → t2d. Small things with no leg yet: First Chords' fourteen cues a variant
cannot say (pol1's item 10, content); Today's header kick "WELCOME BACK. IT HAS BEEN 12 DAYS" (the
owner's rule is no "welcome back"); `rem` Part 2 = option A, after c4a2; lb1 (`loop_bars`' bars door, R).
**The session allows about twenty agents at once, helpers included**: twelve legs with translators
hit it (helpers were refused for a few minutes and one leg translated three languages itself). Eight
legs at a time is the practical ceiling. **A half leg can still be too big** (c2b1a: 359k): a leg
that adds a turn kind to Ask, three cards and their tests should have been two.

**vr1** (the variant rewriter, a defect found by cues4) is merged: no false sentence had shipped; `npm
run paths -- check` now lists rewritten and refused variant sentences, so cue legs no longer need
`refusals-entry.ts` (drop that line from the cue prompt; `cues-content.md` still mentions the script:
`CUES_GUIDE.md` is the newer word).

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

Suggested order from here: the night gates below if it is after 8 PM → t1b2a ‖ c2b1a ‖ a
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
