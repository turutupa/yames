# Leg t1a2: the coach's tools, second half: the `confirm` tools and their host

Worktree `/home/dgx-delgado/yames-coach-t1a2`, branch `coach-t1a2`. Logs under `/tmp/coach-t1a2/`.

The second half of what session 1 briefed as `t1a-tool-registry.md`. **Read that file in full first**
(the rule, the reading list, the gates), then `plans/coach/progress/t1a1.md`: the first half built the
registry's shape, `runCoachTool`, the resolution and snapping helpers, the `CoachToolHost` interface
with its recording fake, the never-list test and the `go` and `read` tools. You add tools to that
machinery; you do not reshape it. If its shape cannot carry a tool, say so in your progress file and
make the smallest change that does, with its tests.

## Yours (t1a2)

1. **The `confirm` tools of TOOLS 2.2**, each calling what exists (verify every name with grep; the
   design was read against an older commit): `start_today`, `play_exercise`, `set_tempo`, `find_edge`,
   `test_out`, `swap_part`, `set_minutes`, `set_focus`, `follow_path`, `load_jam`, `load_preset`,
   `click_subdivision`, `set_setting` (the short safe list of TOOLS section 1 only: theme, language,
   neck / runway / tab, band volume, count-in, coach voice on or off, coach suggestions; **the model
   selector is not on it**), `set_goal`. `loop_bars` and `make_exercise` are typed and return
   `notWiredYet` (the loop exists since leg c1c: if wiring `loop_bars` to it is a few lines through
   the host, do it and say so; otherwise leave the stub).
2. **Proposals that say exactly what will happen**: for `set_minutes` the plan as it would be; for
   `set_tempo` the rung it snaps to; for `play_exercise` the Exercise resolved, by title. Nothing
   happens until `confirm(proposal)` is called. Every confirmed change that can be undone returns its
   undo.
3. **The host, wired**: the members t1a1 left as stubs, built in `MainWindow.tsx` from what it already
   holds (`sessionRun.actions`, `setMinutes`, `setTodayFocus`, the jam and preset loaders, the safe
   setters). Still one small hunk, still off the per-beat path.
4. **A table test per tool**: an allowed context and a refused one, the snapping of each number, the
   resolution cases, that the tool does nothing until confirmed, the undo returning the app to where it
   was (against the recording fake host). The never-list test and "nothing runs during a Take" already
   walk the registry: they must pass with your tools in it, unchanged.
5. Receipt and proposal keys for these tools, proposed in a table in your progress file (they land in
   the locales with the UI in t1b).

## Not yours

Panel UI, receipts drawn, typed commands (t1b). Strings in the locales. Layout. A model. Anything on
the never-list: if a tool of TOOLS 2.2 seems to need a never-list capability, it does not get it: stop
and report.

## Settings store

`set_setting` and `set_goal` write settings through the setters the app already has. If a new stored
key is needed, add it to the `surface.test` manifest and say so in a "diff for review" paragraph: the
orchestrator sends store changes to an independent reviewer.

## Gates

tsc, vitest, build. No strings, no layout.

## Report

As the rules block's "The end of the leg", with the tool table (name, kind, arguments, what it calls,
what its proposal says, its undo) and the keys proposed.
