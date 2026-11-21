# Leg chip1: a chip's own press counts for a reversible one-step change

Branch `coach-chip1` (from `coach` at `462c6775`). Logs in `/tmp/coach-chip1/`. No Rust.

The owner's decision (OWNER-UPDATES, "owner decisions on the 1k questions", item 1): one press of a
suggestion chip IS the press for a reversible one-step change, always with Undo; anything multi-step or
not undoable still goes through a proposal.

## What landed

| File | What |
|---|---|
| `src/coach/tools/types.ts` | `ToolSpec.chipPress?: true` (documented: set only from the registry's table). |
| `src/coach/tools/registry.ts` | `CHIP_PRESS`: tool → why it qualifies; `COACH_TOOLS` copies `chipPress: true` onto exactly those entries. The table lives here because `practice.ts` (set_tempo) is lb1's tonight. |
| `src/coach/tools/run.ts` | `chipPressable(tool)`; `pressCoachChip(call, host, ctx)`: shape check → `run` (Take, `when`, `propose`) → if flagged, no plan, no noUndo, and (in a Session) the phase is `ready` → `confirmCoachTool` on that very proposal (context again, `commit` re-checks screen and value). Otherwise the proposal, as `runCoachTool`. `undoStillGood(undo, host, ctx)` (live, same place, no Take, the undo's own `propose` still says yes; changes nothing). `retireUndo(undo)`. |
| `src/coach/tools/play.ts`, `settings.ts` | `click_subdivision` and `set_setting` gain an optional `at` guard (as `set_tempo` had): their undo is `{..., at: <the value it left>}`, refused once the value moved. |
| `src/containers/coach/askTools.ts` | `pressChip(call, said)` (the chip row's press); `UndoState.chip` / `step`; a chip's Undo has no clock; `noteAskUndos()` (retire chip Undos `undoStillGood` says no to; run only from `useAskHost`'s effect, not after a press: see chip1b.md), `noteAskTake()`, `noteAskToolView` retires a chip's Undo on another view or step; a second chip press retires the earlier live Undo of the same tool (and key). |
| `src/containers/coach/useAskHost.ts` | Calls `noteAskTake()` when a Take starts and `noteAskUndos()` when the panel opens or the view / phase / Exercise / outcomes move (never per beat). |
| `src/containers/coach/AskPanel.tsx` | Two lines: the import, and the chip row's `onClick` calls `pressChip` instead of `runAskCall`. |
| Tests | `src/coach/tools/chipPress.test.ts` (new, the registry walk), `askTools.test.tsx` (+8), `AskPanel.test.tsx` (one test now presses Undo instead of a proposal), `play.test.ts` (undo args carry `at`), `tests/layout/ask-tools.spec.ts` (the Slower scenes; a Session scene). |

## The flagged tools, and why

| Tool | Why it qualifies |
|---|---|
| `set_tempo` | One tempo, one step (Slower / Faster; in a Session the one-rung nudge, on the ready screen only). Undo puts the tempo back, only from the tempo it left (`at`). Changing tempo starts and stops nothing, does not navigate. |
| `click_subdivision` | One value, outside a Session. Undo puts it back, only from the value it left (`at`, new). The click plays on or stays stopped. |
| `set_setting` | One key of the short safe list (theme, language, practice view, band volume, count-in, coach voice, coach suggestions) through that control's own setter; the proposal is one line "key: from → to". Undo puts the stored choice back (band volume's `auto` too), only from the value it left (`at`, new). No chip offers it today; the flag matters the day one does. |

Not flagged: `start_today`, `play_exercise`, `find_edge`, `test_out` (sound starts, the screen changes:
`leaves`), `swap_part`, `set_minutes`, `set_focus` (a plan preview), `follow_path` (no undo), `load_jam`,
`load_preset` (the unsaved-work question; the click may stop), `set_goal` (no undo from no goal),
`restore_part` (the app's own), `loop_bars`, `make_exercise` (not yet).

## The Undo's lifetime, as built

Offered (no ten-second clock) until the first of:

- the value is changed again by anyone: checked by the runner (`undoStillGood`, the undo's `at` guard)
  when the panel opens or the screen / phase / Exercise / outcomes move (`useAskHost`'s effect only). A
  change made by hand while the panel stays open on the same screen is NOT seen until one of those
  moments; pressed in between, the runner's guard refuses it, nothing changes, the card says "The way
  back is no longer there" and the button goes. That is the longest honest lifetime without a
  subscription to every value (tempo, subdivision, seven settings) from the host.
- the player leaves the screen, or in a Session the step (or the Exercise: the runner's place check);
- a Take starts;
- a second chip press for the same thing (that receipt has its own Undo).

Then the receipt stays as a plain line.

## Decisions

- **In a Session, at once only on the ready screen.** The Session's Slower on a result screen also moves
  the run from `result` to `ready` (`runner.ts` reducer), which no Undo puts back; there the chip still
  shows the proposal. Generic rule in `pressCoachChip`, not a per-tool exception.
- **"Which one?" choices keep the proposal** (they come from typed text or a model's call; only the
  suggestion chips the app chose itself are at once). Test: `askTools.test.tsx` "a choice that is a
  flagged tool still shows its proposal".
- **Typed commands keep their proposal** (a reading of the owner's words, which name chips: typed text
  can be misread, a chip cannot). Owner may overrule.
- **The table is in `registry.ts`**, not on each entry's literal, because `practice.ts` is lb1's tonight;
  the field still ends up on the entry, and the test checks table and entries agree.
- Strings: none new (the receipt and Undo strings exist).

## Gates (job logs under `~/scratch/jobq/<id>-coach-chip1-<what>.log`)

- tsc: pass (`tsc3`, after the last code change).
- vitest full (`vitest`, job 307): 48252 passed; only `TabStage.render.test.tsx` (known, symlink). After
  the last fix: `src/coach/tools` + `src/containers/coach` pass (`vt4`).
- `npm run build`: pass (`build2`, after the last change).
- Layout: `ask`, `ask-typed`, `short-window`, `coach-session`, `smooth` pass (`pw1`, `/tmp/coach-chip1/pw1.log`)
  except `smooth.spec.ts:173` "Ask commits nothing during a running Take" (a 212 ms long task under load;
  passes re-run alone, `smooth`). `ask-tools` failed in `pw1` on a real bug (a stale read right after the
  press retired the new Undo; fixed in `2485f8be`), then 18/18 pass (`pw2`). Full suite owed.
- Pictures (`/tmp/coach-chip1/shots/`): `ember-tools-chip-receipt-1024.png` (Metronome, "Tempo 120 → 115
  BPM · Undo"), `ember-tools-chip-receipt-session-1024.png` (Session, "Tempo 80 → 70 BPM · Undo"), and the
  1440 / neon / manuscript variants; the proposal scenes (`*-tools-proposal-*`) now show a typed "slower".

## For the next leg

- c3b2a (the model): a model's call must go through `runCoachTool` (proposal), never `pressCoachChip`;
  `chipPress.test.ts` fails if anything but `askTools.ts` and the runner names `pressCoachChip(`.
- A host subscription would let the Undo go the moment the tempo dial moves with the panel open (today it
  goes at the next panel open / screen / phase move, or is refused at the press).
- c2b1c: `AskPanel.tsx` hunks here are the import line and the chip row's `onClick` only.
