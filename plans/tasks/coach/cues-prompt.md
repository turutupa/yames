# The prompt every cue leg gets (session 3)

Your prompt names four things: your **leg** (`cuesN`), your **Path** (its id), the spec files its
Exercises live in, and what is particular to its technique. Everywhere below, `<leg>` and `<path>`
are those. Your worktree is `/home/dgx-delgado/yames-coach-<leg>` (branch `coach-<leg>`, created
from `coach`; `node_modules` is already a symlink); your log folder is `/tmp/coach-<leg>/` (exists).

You are the content agent for one leg of the Yames coach build (a guitar-practice app): you write
the short coach cues ("one thing to try") for ONE learning Path. Content only: no app code, no
Rust, no layout.

## Read first, in this order (in parts; grep before opening a big file)

1. `/home/dgx-delgado/yames-coach-build/plans/tasks/coach/RULES-FOR-PROMPTS.md`: everything under
   its line is binding on you and on every helper you spawn (paste the block into each helper's
   prompt). Heavy commands go through the job queue.
2. `/home/dgx-delgado/yames-coach-build/plans/tasks/coach/cues-content.md`: the brief every cue leg
   shares. Follow its "Order of work" exactly (commit after each numbered step).
3. What it tells you to read: `plans/coach/CUES_GUIDE.md` (the contract), `plans/coach/progress/c4c.md`
   (three named sections), the worked example `src/paths/specs/alternate-picking-cues.ts` (first 150
   lines and one later Level), and the newest leg's notes `plans/coach/progress/cues5.md` (what the
   generator refuses on variants and how the wording got round it).
4. The helper scripts: copy `/home/dgx-delgado/yames-coach-build/plans/coach/tools/cues/*` into your
   log folder (one `cp` call) and change the old leg's worktree, log folder and Path name inside
   them with the Edit tool before running anything. `refusals-entry.ts` is no longer needed.

## Variants

Many Exercises are said again in other keys, positions or strings as variants. A cue that names a
note, a key, a string or a fret is rewritten or refused for those. After every Level run
`npm run paths -- check <path>`: read every `variant.rewritten` line that is one of YOUR cues (each
must be TRUE of that variant's tab) and reword until `cue.refused` lists nothing for your Path.
Prefer naming the degree, the shape, the finger or the distance over a letter name where the
Exercise moves.

## Commands

- The paths generator's quick steps for one Path (`gen <path>`, `strings <path>`, `check <path>`,
  `strings todo`, `strings merge`) take seconds to a minute: run them directly through the copied
  `paths.sh` / `gencheck.sh` (a two-line script: `cd <worktree> || exit 2`, then the command), output
  to a file under your log folder.
- **The gates go through the job queue**, one job per command:
  `~/.local/bin/job submit --name coach-<leg>-<what> --ram <N>G --est <M>m --cwd /home/dgx-delgado/yames-coach-<leg> -- bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh <command...>`
  (`npm run paths -- check` over every pack 4G / 5m; `npx tsc --noEmit` 6G / 5m; `npm run test`
  12G / 15m; `npm run build` 8G / 6m). Then `~/.local/bin/job wait coach-<leg>-<what> --timeout 9m`
  (its exit code is the job's; 124 = still running, call it again) and
  `~/.local/bin/job logs coach-<leg>-<what> -n 40` (or redirect to a file and grep it). A re-run
  needs a new name (`-2`). A job may wait in the queue (many legs run tonight, and the orchestrator
  runs a click-jitter probe alone): expected; `job ls` says why. run.sh's exit code 75 means
  `/tmp/yames-dgx-yield` exists: commit a labelled WIP, write `plans/coach/progress/<leg>-HANDOFF.md`,
  stop.

## The rules most often broken (all binding; the full list is in RULES-FOR-PROMPTS.md)

- One command per Bash call, absolute paths (`git -C <worktree> ...`); no `cd x && y`, no long
  chains, no inline scripts (`python -c`, `node -e`, `bash -c`), no heredocs / `tee` / `sed -i` /
  `echo >`: create and change files only with Write and Edit. No `sleep` loops.
- Never: `rm` (overwrite instead), `npm install` / `npm ci` / `bun`, `git push`, anything on GitHub,
  `ssh`, `sudo`, `systemctl`, `nohup`, `npm run tauri dev`, destructive git on uncommitted work.
- Commits: `git -C /home/dgx-delgado/yames-coach-<leg> -c user.name=turutupa -c user.email=44581951+turutupa@users.noreply.github.com commit -F /tmp/coach-<leg>/msg.txt`,
  prefix `feat(paths):` / `fix(paths):` / `docs(coach):`, the message ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit on `coach` or `main`.
- **Commit per Level and at every step**; keep `plans/coach/progress/<leg>.md` current as you go.
- **Size**: stay under 250k tokens. Past about 170k tokens with translations not yet merged, stop
  writing new Levels: take what you have through proof-read, translation and gates, and say which
  Levels are left (`check` accepts a partly cued Path). Never leave the Path half translated.
- Helpers are `model: "sonnet"` agents: fresh proof-readers that did not write the cues (one per
  Level works well); translators, one per three or four locales, started the moment the proof-read
  fixes are committed, each with its own input and output file. **Never end your turn while a helper
  is still running**; write the progress file while they work.
- If a rule or a permission blocks you, do not look for another way round it: note it and report it.

## What you own

`src/paths/specs/<path>-cues.ts` (new), the one `withCues` line in the Path's spec, the generated
`src/paths/packs/<path>.json`, and `src/paths/packs/i18n/<lng>/<path>.json` for the fifteen
languages. Nothing else. If the generator, the validator or `cues.ts` seems wrong, do not change it:
write what you found and work round it in the wording. Other cue legs run beside you on other Paths
and code legs on `src/coach/` and `src/containers/coach/`; none touches your Path's files.

## Gates (step 5 of the brief)

`npm run paths -- check` (every pack, 0 errors), `npx tsc --noEmit`, `npm run test` (the whole vitest
suite once; known in every worktree: it cannot load `src/containers/songs/TabStage.render.test.tsx`
through the symlink: name it, do not chase it), `npm run build`. No layout run is yours.

## Final report, at most 40 lines

Branch and commits; the numbers (Exercises covered, cues by trigger, distinct sentences, refusals
and how reworded, `variant.rewritten` lines of yours read); the proof-readers' objections taken /
answered; the longest cue per language; each gate with its result and log; locales wanting a native
read; **twelve cues for the orchestrator to read** (four Exercises of different Levels: title,
one-line purpose, the general cue and two trigger cues); Levels left, if any.
