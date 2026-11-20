# Coach build: the brief every leg shares

You are one leg of a relay that builds the Yames coach. An orchestrator briefs you, checks your result
against the design and merges your branch. Read, in this order: `CLAUDE.md` and `AGENTS.md` (repo root),
this file, `plans/coach/PLAN.md`, `plans/coach/PROGRESS.md` (the index; open the `plans/coach/progress/`
files of the legs yours builds on), then your own leg file in this folder.

## The spec

The design is finished and is the spec. It lives outside the repo, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` (832 lines; read the sections your leg file names, in
parts), `TOOLS.md`, `REVIEW.md`, `mocks/index.html` and `mocks/shots/*.png` (look at the PNGs your leg
names with the Read tool; the mocks fix the look).

The design was read against an older commit of `revamp`. Names and line numbers in it may have moved:
verify with grep before you rely on one, and write any real difference into your progress file.

## Owner decisions (binding; newer than the design where they differ)

- The coach never changes anything uninvited, and never starts, stores or spends without the player's
  press. Tools are sorted: at once (with a receipt and undo) / one press / never. Never, and not tools at
  all: the microphone and audio devices, grading consent, recording, deleting anything, downloads, grades,
  anything during a Take.
- Tools are built model-free first (chips, commands, receipts, proposals). No fine-tuning.
- Grading is opt-in; the coach never pushes the microphone; ungraded practice is first-class.
- Everything follows the active theme (theme tokens, never a hard-coded colour); tonal buttons; one
  picture at a time during a Take; nothing during a Take may cost the click.
- The coach states only measured facts; "couldn't tell" never blocks.
- Open questions of DESIGN section 12, as decided: (1) P1 and P2 yes; (2) the threshold is the "pass mark"
  in English, never "the bar"; (3) model prose is labelled general advice, English first; (4) phones are
  rule-made only, with a labelled Ask button in the header; (5) "Hear bar N: yours, then the demo" yes, as
  its own leg with the audio reviewer; (6) path cues are written by us; (7) the in-page coach note
  supersedes UI_DECISIONS U4.1; (8) no notifications by default, one opt-in practice reminder; (9) the
  coach must not say "check your tuning" until the app has a tuner.
- **The model selector** (2026-11-20) replaces every "start / end a coach session" step for loading the
  model. The player picks Off, a local model, or (later) Cloud; the choice persists; a selected local
  model is loaded once after startup in the background (never during a Take, never delaying first
  paint), stays loaded across the app, and is unloaded only when the player picks Off or another model.
  Off still gives the whole rule-made coach. This overrides DESIGN 9.4's "load when Ask first needs it"
  and its ten-minute idle unload.
  **Where it sits:** at the bottom of the right-hand coach panel (where the old coach card and its Start
  button sat; in the new design the foot of the Ask dock / drawer). Not the left rail. On a phone: the
  Ask sheet's head, and Settings → Coach. Entries are named by model and size ("Standard · Qwen3 4B").
  **A model that is not downloaded** shows its size and a Download button in the selector itself
  (progress, pause / resume, checksum check, cancel; a warning on mobile data or low storage), reusing
  the existing download path (`src/ipc.ts`, `commands.rs` `download_model`); when it finishes it can be
  selected and loads as usual. Deleting a downloaded model lives in Settings → Coach. The player starts
  every download with a press; the coach itself never downloads (downloading stays a never-tool).

## Rules (binding)

- **Relay.** Do exactly the leg in your file. If your context passes about 300k tokens, stop at the next
  safe point (a gated commit, or a commit whose message starts `WIP(coach-<leg>):`) and hand off. Read
  files in parts (offset/limit) and grep before opening a big file. Never print a whole log: send output
  to a file under `/tmp/coach-<leg>/` and read its tail or grep it.
- **Where you work.** Your own git worktree, named in your leg file, on your own branch. Never commit on
  `coach` or `main`; the orchestrator merges. `node_modules` in your worktree is a symlink to
  `/home/dgx-delgado/yames-coach-build/node_modules`: never run `npm install`, `npm ci` or `bun`, and never
  delete through the link.
- **Heavy commands** go through the wrapper, one plain command per call, absolute paths, output to a file:
  `bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh <command...> > /tmp/coach-<leg>/<name>.log 2>&1`
  with your worktree as the working directory (give `npm --prefix <worktree>` or use absolute paths; do
  not write `cd x && y`). The wrapper sets the Rust environment (`CARGO_TARGET_DIR=$HOME/.target-coach`,
  `CARGO_BUILD_JOBS=8`, the CFLAGS), waits for 16 GB of free RAM and applies the daytime `nice`. Exit code
  75 means `/tmp/yames-dgx-yield` exists: commit a labelled WIP, write the handoff and stop.
- **Gates.** `npx tsc --noEmit`, `npm run test` (vitest), `npm run build`; `npm run test:rust` for any
  Rust change; for every screen you touch, its layout specs
  (`npx playwright test --trace off tests/layout/<spec>`); `npm run paths -- check` if pack content
  changes; the click-jitter probe for anything that adds background compute. **A leg that changes any
  text or style a screen shows runs the full layout suite once before it reports** (`npx playwright test
  --trace off`): a longer sentence in one leg broke a short-window scene in one theme that none of its
  named specs covered. All fifteen locale files
  must carry every key (`i18n.locales.test.ts`), so new strings land translated in the same leg.
  Report a gate honestly: if one fails for a reason that is not yours, show that it also fails on
  `coach` untouched, and say so.
  **Known, in every worktree:** vitest cannot load `src/containers/songs/TabStage.render.test.tsx`
  (`Denied ID …/node_modules/@coderline/alphatab/dist/font/Bravura.woff2?url`): Vite refuses a file
  reached through the `node_modules` symlink. It passes in the main checkout, where the orchestrator
  re-runs the suite after each merge. Name it in your report and do not chase it; any other failing
  file is yours to explain.
- **Commit early and often.** A gated commit or a `WIP(coach-<leg>):` commit at each step: an agent can
  be stopped without warning, and uncommitted work is the only work that is lost. Do not end your turn
  while a helper agent you spawned is still running.
- **The briefs in the main checkout are the current ones** (`/home/dgx-delgado/yames-coach-build/plans/`):
  the orchestrator edits them there, and the copy in your worktree is as old as your branch.
- **Rust that touches the audio callback, the engine, the queue between them, or the settings / SQLite
  stores** is reviewed by an independent read-only reviewer before it merges. You do not arrange that:
  finish, and put a "Rust diff for review" paragraph in your report. The orchestrator runs the reviewer.
- **Never**: `npm run tauri dev` (port 1420 is the owner's); `npm install`; `git push`; anything on GitHub
  (no issues, cards, PRs, project boards, `gh` commands); `sudo`, `systemctl`, `ssh`, `nohup`; `rm` (it
  asks for approval nobody is there to give: overwrite files instead, and use `git rm` for tracked files);
  destructive git on uncommitted work (`reset --hard`, `checkout .`, `restore .`, `clean`). No file
  rewrites: edit surgically.
- **Shell.** Create and change files only with the Write and Edit tools (no heredocs, `tee`, `sed -i`,
  `echo >`). No inline scripts (`python -c`, `node -e`, `bash -c`): write a script file, then run it. No
  `sleep` loops: wait with `~/.local/bin/wait-until`. Kill a process by PID only, never `pkill -f` or
  `pgrep -f`. Web lookups, if you truly need one: `~/.local/bin/web-look search "..."`, with no personal or
  project data in the query.
- **Commits.** `git -c user.name=turutupa -c user.email=44581951+turutupa@users.noreply.github.com commit ...`
  with a conventional prefix (`feat(coach):`, `fix(coach):`, `test(coach):`, `docs(coach):`; never a
  message that starts with `release`) and ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Write the message to a file under
  `/tmp/coach-<leg>/` and use `git commit -F`.
- **Helpers.** For translations, spawn helper agents with `model: "sonnet"` (one per four or five locales),
  give them `plans/COACH_I18N_BRIEF.md` once it exists (until then: the English strings, what each one is
  for, the terms the locale file already uses for Take, Step, Path, Session, Exercise, pass mark, and "keep
  every placeholder"). For a broad search, an Explore helper. Paste the Rules section of this file into
  every helper's prompt. If you cannot spawn helpers, do the work yourself.
- **If a rule or a permission blocks you, do not look for another way round it.** Note it and report it.

## The end of a leg

1. Gates green in your worktree (or the WIP labelled), everything committed on your branch.
2. Write `plans/coach/progress/<leg>.md` (what landed, decisions and why, numbers, anything the design
   got wrong about the code, what the next leg must know). One file per leg, so parallel legs never
   conflict; the orchestrator keeps the index in `plans/coach/PROGRESS.md` and you do not edit that one.
   If you stopped mid-leg, also write `plans/coach/progress/<leg>-HANDOFF.md` (exactly where you are, what
   is half done, the next command). Commit them.
3. Stop every background job you started (by PID).
4. Final report, at most 40 lines: branch and commits; each gate with its result and log path; what the
   owner can see; the Rust diff summary for review, if any; open points; what is next.
