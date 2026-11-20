# Leg t1a1: the coach's tools, first half: the list's shape, the runner, the `go` and `read` tools

Worktree `/home/dgx-delgado/yames-coach-t1a1`, branch `coach-t1a1`. Logs under `/tmp/coach-t1a1/`.

Session 1 briefed this work as one leg, `t1a-tool-registry.md`. It is split in two so each half stays
under 250k tokens. **Read `t1a-tool-registry.md` in full first**: its "The rule this leg makes true",
its reading list (BRIEF, `progress/c0.md`, `progress/c2a1.md`, DESIGN section 13, TOOLS.md sections 1
and 2.1 to 2.3) and its gates are yours too. This file says which part of it is yours.

## Yours (t1a1)

1. **`src/coach/tools/registry.ts`**: the types and the list as plain data (item 1 of t1a): `CoachTool`,
   `ArgSpec`, `ToolResult`, the three kinds plus `read`, the generator's input shape. Written so t1a2
   adds tools by adding entries, never by changing the shape.
2. **`src/coach/tools/run.ts`** (item 3 of t1a): `runCoachTool(call, host, ctx)` with its three checks
   (shape, `when(ctx)`, resolution), `go` running at once and returning a receipt and its undo call,
   `confirm` returning a proposal that runs only through `confirm()`. Grown from `runCoachAction` /
   `CoachActionHost` in `src/coach/blocks/actions.ts`; the block actions keep working through it and
   their tests are unchanged or extended, never weakened. The `confirm` path is built and tested here
   with one fixture tool defined in the test, so t1a2 only adds real tools to it.
3. **Resolution and snapping helpers**, shared by both halves: a query against titles in the player's
   language (`findExercise`, the pack overlays; one clear match runs, several come back as "Which one?"
   choices, none is `notFound`); a tempo to a rung (`gradedRungs`), minutes to one of four, a part number
   to one that exists. Each with its table test.
4. **The host interface** `CoachToolHost` in `src/coach/tools/host.ts`, complete for both halves (read
   t1a's tool list and declare every member the `confirm` tools will need, so t1a2 changes no
   interface), a recording fake host for tests, and the real host built in `MainWindow.tsx` for the
   members your tools use: one small hunk. Members t1a2 will wire are left as typed stubs that return
   `notWiredYet`, listed in your progress file.
5. **The never-list test** (the host interface has no member for the microphone, input devices, grading
   consent, recording, deleting, unfollowing a Path, downloading, any grade, anything that leaves the
   device), and "every tool's `when` is false while a Take runs" as a test that walks the registry, so
   it covers t1a2's tools the day they are added.
6. **The tools**: `go_to`, `open_path`, `open_step`, `open_settings` (`go`); `show_scale`,
   `show_chord`, `show_bars`, `explain_screen` (`read`; `explain_screen` returns `notWiredYet`). A table
   test per tool: an allowed context and a refused one, resolution cases, the undo of every `go`
   returning the app to where it was. `go_to` never takes `session`.
7. Receipts as data for these tools (keys and arguments, no sentence assembled in code); the keys are
   proposed in a table in your progress file and land in the locales with the UI in t1b.

## Not yours

The `confirm` tools (t1a2). Any panel UI, receipts drawn, typed commands (t1b). Strings in the locales.
Layout. A model.

## Shared files

`MainWindow.tsx`: one hunk (building the host). Leg c2a2 has just changed the same file (the tools'
coach, Listen): your worktree starts from `coach` with that merged. Keep the host's construction out of
the per-beat path: `MainWindow` re-renders on every beat, so the host is built once (a ref or a memo
with stable inputs, `useStableHandlers` as the rail does), and a test or a note in your progress file
says how you checked it.

## Gates

tsc, vitest, build. No strings, no layout (no screen changes). The existing `blocks` tests green.

## Report

As the rules block's "The end of the leg", with the tool table (name, kind, arguments, what it calls,
its undo), the host's members and which are stubs for t1a2, the receipt keys proposed, and every design
name that had moved.
