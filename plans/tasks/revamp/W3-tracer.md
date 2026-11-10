# W3 tracer: continuation (2026-11-10)

Read `CLAUDE.md`, then `plans/tasks/revamp/BRIEF.md`, then this. The target
screens are `plans/revamp/mocks/index.html` (+ README).

Worktree `/home/turutupa/Dev/yames-w3-tracer`, branch `revamp-w3-tracer`.
Your earlier session stopped mid-task; its work was saved as `dc7a6c38
wip(session): ...`, and `revamp` (which now has the Levels/variations/warm-ups
Path format from `paths-v1`) was merged in as `e42a1746`. You have
`src/containers/session/` (Today, Paths, Progress, Session, ExerciseStage),
`src/session/` (planner, runner, grade, take, ladder, variants, ...),
`session.css`, session strings in 17 locales and a migration five in `db.rs`.

## State today (not green)
- `tsc --noEmit`: 9 errors. `PathStateRow`, `PathTakeRow`,
  `ExerciseCeilingRow` used in `src/shots/mockIpc.ts` but not declared
  (they belong in `types.ts`/`ipc.ts`, matching the migration-five rows);
  `AppTab` passed where the tour expects its narrower union
  (`MainWindow.tsx:2170`, `:2472`); a bad type predicate in
  `src/session/variants.ts:19` (likely from the new Path format).
- vitest: 7 failures. `App.test.tsx` (2, shell renders), `Rail.test.tsx`
  ("Paths is not shipped yet": update it to the new rail, keep the
  positional `tab-1..tab-5` guarantee), `freeModePreset.test.tsx`, and three
  i18n tests (a `t()` call without a string; namespace set per language;
  plural forms per language for the new strings).

## Goal
1. Get it green. Fix code where the code is wrong; update a test only when
   it encodes the old shell on purpose (say which, and why, in the report).
2. Continue toward the first playable build in BRIEF.md: Today with time
   choice and reasons; a real Session through `useSession`'s existing call
   order; Find my edge; results showing the number that moved; every
   existing tool reachable under Tools unchanged. Wire grading through the
   IPC W1 exposes (read `src-tauri/src/commands.rs` on `revamp-w1-grading`
   to see it; if it isn't there yet, code against a typed stub in `ipc.ts`
   and list it as a dependency).
3. Add `?shot=` scenes in `src/shots/` for Today, Paths, Progress, Session
   and results, with mock IPC data, so the owner can review the screens in
   a browser. Each scene must reach `__SHOT_READY__`.
4. Stop when the build's screens exist end to end and are green, or when you
   need a change in W1's files. Report.

## Constraints
- Ownership as in BRIEF.md: no `score.rs`, onset, timing.
- `db.rs` migration five is a SQLite store change: the `reviewer` runs on it
  before merge. Migrations are additive; no existing table or saved format
  changes.
- Tab hotkeys stay positional; settings keys and hotkey meanings unchanged;
  don't bypass `setView`, `app_ready` or first-run detection.
- AGENTS.md conventions: surgical edits, no file rewrites; `MainWindow.tsx`
  is already huge, so put new logic in hooks under
  `containers/main-window/hooks/` or `containers/session/hooks/`. All IPC
  through `ipc.ts`.
- Commit as you go; no push, no `tauri dev`, no merge.

## Gates
```sh
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
npx tsc --noEmit && npx vitest run && npm run build
npm run test:layout        # you changed stylesheets and screen shapes
```
For `db.rs`: `CFLAGS='-std=gnu11 -Wno-implicit-function-declaration' npm run test:rust`.
If Playwright's chromium is missing: `npx playwright install chromium`.

## Report
Summary of what works end to end and what doesn't, the list of new
`?shot=` scenes, `git diff --stat revamp...HEAD`, gate pass counts, and
cross-worker dependencies.
