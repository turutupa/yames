# The rules block pasted into every coach-build agent's prompt (session 2)

The orchestrator pastes everything under the line into each leg's prompt. A leg pastes it into the
prompt of every helper it spawns. `BRIEF.md` has the same rules with their reasons; where the two
differ, this file is newer.

---

RULES (binding on you and on every helper you spawn; paste this whole block into a helper's prompt)

- **Size.** Do exactly this leg and nothing beside it. Aim to finish under 250k tokens of context.
  Read files in parts (offset / limit); grep before opening a big file; never print a whole log (send
  output to a file under `/tmp/coach-<leg>/` and read its tail or grep it). If your context passes
  about 250k tokens, stop at the next safe point: commit (gated, or `WIP(coach-<leg>): ...`), write
  `plans/coach/progress/<leg>-HANDOFF.md` (exactly where you are, what is half done, the next
  command), commit it, and report. A fresh agent takes over; that is the plan, not a failure.
- **Commit at every milestone**: a gated commit or a `WIP(coach-<leg>): ...` commit after each step
  that works, and before every long gate run. An agent can be stopped without warning and
  uncommitted work is the only work that is lost. Update `plans/coach/progress/<leg>.md` as you go,
  not only at the end.
- **Where you work.** Your own git worktree on your own branch, both named in your prompt. Never
  commit on `coach` or `main`; the orchestrator merges. `node_modules` in your worktree is a symlink
  to `/home/dgx-delgado/yames-coach-build/node_modules`: never `npm install`, `npm ci` or `bun`, and
  never delete through the link.
- **Heavy commands** (tsc, vitest, the build, Playwright, cargo, the paths generator) go through the
  wrapper, one plain command per call, output to a file:
  `bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh <command...> > /tmp/coach-<leg>/<name>.log 2>&1`.
  A command that must run inside your worktree gets a two-line script written with the Write tool
  under `/tmp/coach-<leg>/` (`cd <worktree> || exit 2`, then `exec npx playwright test --trace off "$@"`
  and the like), run as `bash .../run.sh bash /tmp/coach-<leg>/<script>.sh <args>`. Never
  `cd x && y` in the command itself.
  The wrapper sets the Rust environment (`CARGO_TARGET_DIR=$HOME/.target-coach`, the CFLAGS), waits
  for 16 GB of free RAM, and on weekdays 7 AM to 8 PM Pacific applies the owner's limits by itself:
  `nice`, 4 cargo jobs, 2 Playwright workers, 4 vitest workers, and **one heavy command at a time
  across all agents** (a lock: your command waits until another agent's ends). So start a heavy
  command with `run_in_background: true` and wait for its completion notice, or wait with
  `~/.local/bin/wait-until --timeout 30m file <log> --grep '<regex of its last line>'`. Never start
  two heavy commands at once yourself.
  Exit code 75 means `/tmp/yames-dgx-yield` exists: commit a labelled WIP, write the handoff, stop.
- **The full layout suite (`npx playwright test` with no spec named) never runs before 8 PM Pacific
  on a weekday.** Before then run the specs of the screens you touched, by name, and say in your
  report that the full suite is owed; the orchestrator runs it after 8 PM. After 8 PM and at weekends
  run it yourself if your leg changes any text or style a screen shows.
- **Gates.** `npx tsc --noEmit`, `npm run test` (vitest), `npm run build`; `npm run test:rust` for
  any Rust change; the layout specs of every screen you touch; `npm run paths -- check` if pack
  content changes; the click-jitter probe for anything that adds background compute. All fifteen
  locale files carry every key (`i18n.locales.test.ts`), so new strings land translated in the same
  leg. Report a gate honestly: if one fails for a reason that is not yours, show that it also fails
  on `coach` untouched, and say so. Under a high load average vitest sometimes prints "Timeout
  calling onTaskUpdate" with every test passing (re-run to confirm) and timing-based layout tests
  flake (re-run that test alone).
  Known in every worktree: vitest cannot load `src/containers/songs/TabStage.render.test.tsx`
  (Vite refuses a file reached through the `node_modules` symlink). Name it and do not chase it.
- **Rust that touches the audio callback, the engine, the queue between them, or the settings /
  SQLite stores**, and any change to `src/hooks/useSession.ts`, is read by an independent reviewer
  before it merges. You do not arrange that: put a "diff for review" paragraph in your report.
- **Never**: `npm run tauri dev` (port 1420 is the owner's); `npm install`; `git push`; anything on
  GitHub (no issues, cards, PRs, project boards, `gh` commands); `sudo`, `systemctl`, `ssh`, `nohup`;
  `rm` (it asks for an approval nobody is there to give: overwrite files instead, `git rm` for
  tracked files); destructive git on uncommitted work (`reset --hard`, `checkout .`, `restore .`,
  `clean`, `stash drop`). No file rewrites: edit surgically.
- **Shell.** Create and change files only with the Write and Edit tools (no heredocs, `tee`,
  `sed -i`, `echo >`; a plain `> file` redirect of a command's output is fine). No inline scripts
  (`python -c`, `node -e`, `bash -c`): write a script file, then run it. One command per call, with
  absolute paths (`git -C <worktree> ...`, `npm --prefix <worktree> ...`); no long `&&` / `;` chains.
  No `sleep` loops: wait with `~/.local/bin/wait-until`. Kill a process by PID only, never
  `pkill -f` or `pgrep -f`. Web lookups, if you truly need one: `~/.local/bin/web-look search "..."`,
  with no personal or project data in the query. No personal data in any external request.
- **Commits.** `git -C <worktree> -c user.name=turutupa -c user.email=44581951+turutupa@users.noreply.github.com commit -F /tmp/coach-<leg>/msg.txt`,
  a conventional prefix (`feat(coach):`, `fix(coach):`, `test(coach):`, `docs(coach):`; never a
  message that starts with `release`), the message ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Helpers.** Translations: helper agents with `model: "sonnet"` (one per four or five locales),
  given `plans/COACH_I18N_BRIEF.md`. A broad search: an Explore helper. Do not end your turn while a
  helper you spawned is still running. If you cannot spawn helpers, do the work yourself.
- **The briefs in the main checkout are the current ones**
  (`/home/dgx-delgado/yames-coach-build/plans/`); the copy in your worktree is as old as your branch.
- **If a rule or a permission blocks you, do not look for another way round it.** Note it and
  report it.
- **The end of a leg.** Everything committed on your branch; `plans/coach/progress/<leg>.md` written
  (what landed, decisions and why, numbers, what the next leg must know) and committed; every
  background job you started stopped (by PID). Final report, at most 40 lines: branch and commits;
  each gate with its result and log path; what the owner can see; the diff for review, if any; open
  points; what is owed.
