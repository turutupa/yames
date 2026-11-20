# Leg t1a: the coach's tools: the list, the runner, the host

Worktree `/home/dgx-delgado/yames-coach-t1a`, branch `coach-t1a`. Logs under `/tmp/coach-t1a/`.
Read `plans/tasks/coach/BRIEF.md` first (the owner's sorting of tools is binding), then
`plans/coach/progress/c0.md` (`CoachContext`) and `c2a1.md` (the Ask panel and `useCoachPanel`). Design:
DESIGN.md section 13 and `TOOLS.md` sections 1 and 2 (all of 2.1 to 2.3; 2.4 is a later leg). No model
anywhere in this leg, and no panel UI: the receipts and proposals are drawn by the next leg (t1b). This
leg is the machinery and its tests.

## The rule this leg makes true

The coach never changes anything uninvited, and never starts, stores or spends without the player's
press. Three kinds:

- **`go`: at once**, with a receipt and a way back: the player asked, it is reversible in one tap,
  nothing sounds, nothing is stored.
- **`confirm`: one press**: it starts sound, changes what is practised, or stores something. The runner
  returns a proposal; nothing happens until `confirm(proposal)` is called from a press.
- **never**: the microphone and input, audio devices, grading consent (`session.grading`), recording,
  deleting anything, unfollowing a Path, downloading a model or voices, any grade, clean tempo, "was
  this fair" or passed mark, anything that leaves the device, anything while a Take runs. **These are
  not tools: they are not in the registry.** A test enumerates the never-list and proves no tool's
  `run` can reach those functions (the host interface has no member for them), and that every tool's
  `when` is false while a Take runs.
- **`read`**: reading, not acting (show a scale, explain a screen). The fact cards of the next legs
  join the same list as `read` tools; define the kind and leave the cards to them.

## What to build

1. **`src/coach/tools/registry.ts`**: the list as plain data in the style of `src/coach/blocks/spec.ts`
   (so a JSON schema and a grammar can be generated from it later: write the generator's input shape
   now, not the generator). `CoachTool = { name; kind; args: ArgSpec; when(ctx); run(args, host) }`,
   `ToolResult` as in TOOLS 2.1 (`ok` with a receipt and an `undo` call, or `notFound | notNow |
   refused` with `choices`). Arguments are closed sets and numbers, and `query` (the player's words)
   where a thing is named: **a tool never takes an Exercise id from outside; the app resolves** the
   query against titles in the player's language (`findExercise`, the pack overlays), one clear match
   runs, several come back as "Which one?" choices. Numbers are snapped to what the app allows (a tempo
   to a rung with `gradedRungs`, minutes to one of four, a part number to one that exists).
2. **The tools of TOOLS 2.2**, each calling what exists (verify every name with grep; the design was
   read against an older commit): `go_to`, `open_path`, `open_step`, `open_settings` (`go`);
   `show_scale`, `show_chord`, `show_bars`, `explain_screen` (`read`; `explain_screen` returns
   "notWiredYet" until the help set exists); `start_today`, `play_exercise`, `set_tempo`, `find_edge`,
   `test_out`, `swap_part`, `set_minutes`, `set_focus`, `follow_path`, `load_jam`, `load_preset`,
   `click_subdivision`, `set_setting` (the short safe list of TOOLS section 1: theme, language, neck /
   runway / tab, band volume, count-in, coach voice on or off, coach suggestions; **the model selector
   is not on it**: choosing a model is the player's), `set_goal` (`confirm`). `loop_bars` and
   `make_exercise` are typed and return `notWiredYet` (legs c1c and t2). `go_to` never takes `session`:
   a Session is started, not navigated to.
3. **`src/coach/tools/run.ts`**: `runCoachTool(call, host, ctx)`, grown from the existing
   `runCoachAction` and `CoachActionHost` in `src/coach/blocks/actions.ts` (keep the block actions
   working through it; "the only file under `blocks/` that touches the app's IPC" stays true in
   spirit: one place). Three checks before anything runs: the call's shape against the registry,
   `when(ctx)`, resolution against real data. `go` runs and returns the receipt and its undo;
   `confirm` returns a proposal object that says exactly what will happen (for `set_minutes`, the plan
   as it would be) and runs only through `confirm()`. Every `go` returns the call that reverses it;
   every confirmed change that can be undone returns its undo.
4. **The host**: `CoachToolHost`, built in `MainWindow.tsx` from what it already holds (`setView`,
   `pathsPlace`, `sessionRun.actions`, `setMinutes`, `setTodayFocus`, the jam and preset loaders, the
   safe setters). One small hunk in `MainWindow.tsx`; the interface lives in `src/coach/tools/`.
5. **Receipts as data**: i18n keys and arguments from what the app actually did ("Opened {path} ·
   Step {n}: {title}", with the way back). No sentence is assembled in code; the keys land in the
   locales in t1b with the UI. Propose them in a table in your progress file.

## Gates

tsc, vitest, build. **A table test per tool**: an allowed context and a refused one, the snapping of
each number, the resolution cases (one match, several, none), the undo of every `go` and of each
undoable `confirm` returning the app to where it was (against a fake host that records calls), the
never-list test above, "nothing runs during a Take", and that a `confirm` tool does nothing until
confirmed. The existing `blocks` tests (`actions`, `resolve`, `spec`) unchanged or extended, never
weakened. The `surface.test` manifest if a settings key is touched. No strings, no layout.

## Report

As BRIEF "The end of a leg", with the tool table (name, kind, arguments, what it calls, its undo), the
receipt keys you propose, and every design name that had moved.
