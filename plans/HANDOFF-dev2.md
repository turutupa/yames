# Handoff: the dev2 pass (2026-11-19)

Branch `mvp-dev2`, worktree `~/projects/yames-mvp-dev2`. Nothing is pushed; the
orchestrator merges into `revamp`. Cards: #68 (this pass), #57 (e2e capture,
validated), #67 (the finisher's polish list), #70, #72, #73 (left open).
Evidence: `~/projects/.preview/dev2/` (`before-*`, `after-*`, `sheet-*.png`,
`hunt/`, `e2e-1` to `e2e-3`, `logs/`). Read `plans/HANDOFF-finisher.md` first;
this continues it.

## Commits, oldest first

| Commit | What |
|---|---|
| f5c6baaa | Merge of `mvp-finisher` into `revamp` 3b7fea3f. `PathsView.tsx`: revamp's grouped `PathCard` (tracks, "Builds on") with the finisher's `FocusToday` ("Only this today", pressed, undone in place). |
| ea931a5a | **Engine review, item 3.** One engine take slot, two takes lists mounted at once on a desktop (`useJamTakes` in `MainWindow`, `useSongTakes` in Songs). A take started from one list left the other's row lit for good. `takes/playbackGate.ts` knows which gate holds the slot; `onReplaced` puts the other row out. |
| 0e8f5e21 | **Rust. Engine review, items 1 and 2.** `output_park::reopen_keeps_loaded_on(route, old, new)`: a moved route with no old rate known takes the drop path. Tests record the transport each scripted spawn comes up under (`SpawnTransport`) and count emitted events (`engine::test_emits`, test-only, thread-local). |
| 4ebe92bb | The wizard's Path grid follows the Paths screen's order (`pathTracks`). `FIRST_PATH_ID` is `rhythm-foundations`; a test keeps it equal to `START_HERE_PATH_ID`. e2e `FIRST_PATH` follows. |
| 81e88c1e | Card #67, items 1 to 3: the phone's ask-first footer (two answers on one row, `fitPair`), the Russian Session bar (`data-tight`), Today's row facts as a dot line. New scene `session-ask-ready-runway`. |
| (merge) | `revamp` 4c4d765f (theme polish). |
| 28c918d8 | A Path not started says "Where you start", "Start here" and "Start · Step N" instead of "Where you are", "You're here · 0 of 4 passed" and "Continue · Step 1". Keys `session.paths.startStep`, `session.paths.whereYouStart`, 15 locales, parity snapshot. |
| 66b567f3 | The welcome's "Set me up (about two minutes)" on one line in a wide face (`useFitOneLine`, floor 0.8); the tagline balanced. |
| 8f7e1d64 | **Product bug.** A window resize that arrived while the 3D neck's engine was loading was dropped: the renderer kept the size it was made at (neck small in a corner of its slot, ring and "start here" elsewhere) until the next resize. `StageController` remembers it and tells the engine on arrival. |
| a2ee99ee | `phone-header.spec.ts` passes under `YAMES_LAYOUT_LOCALE=de` (card #67, item 6). |
| fbf696d1 | The dot line is inline blocks, not flex items: `innerText` reads the row on one line again (the e2e's reading of the plan). |
| 97b0ce13 | `tests/e2e/README.md`: the first Path is Rhythm Foundations. |

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean on HEAD |
| `npx vitest run` | 10527 passed; 1 file fails, `TabStage.render.test.tsx`, only in worktrees |
| `npm run build` | ok |
| parity (`src/test/parity`) | passes; snapshot grew by the two new keys |
| `npm run test:rust` | 1065 passed, 0 failed, 3 ignored (on 0e8f5e21; no Rust change since) |
| `cargo check --lib --target aarch64-linux-android` | ok, 7 warnings, none in the changed files |
| layout, full suite, merge commit f5c6baaa | 1138 passed, 22 skipped, 0 failed (29.5 min, `--workers=2`) |
| layout, full suite, HEAD | see "The last full layout run" below |
| e2e and probe | below |

The click-jitter probe was not rerun as a headless pair: the Rust diff of this
pass (0e8f5e21) is outside the cpal callback and adds no background compute.
The in-app probe ran with the e2e (below).

## The Rust diff, for the reviewer

`git diff f5c6baaa 0e8f5e21 -- src-tauri/src` (2 files). Nothing in the cpal
output callback changes; no new lock, allocation or queue.

- `output_park.rs`: `reopen_keeps_loaded_on(route, old_rate, new_rate)` returns
  false for `NewRoute` with `old_rate == None`, else `reopen_keeps_loaded`. Test
  `a_moved_route_with_no_old_rate_keeps_nothing`.
- `engine.rs`: `reopen_output` calls it, and logs the moved-route case.
  `EventSink::emit` notes the event's name under `#[cfg(test)]`
  (`test_emits`). `spawn_for_reopen`'s scripted hook also pushes a
  `SpawnTransport { playing, screen_playing }`. New tests:
  `a_moved_route_opens_its_stream_stopped_under_a_song_that_was_playing`,
  `a_moved_route_with_no_old_rate_known_drops_what_is_loaded`; the existing
  new-rate test now asserts exactly one `state-changed` and one `song-dropped`.

## e2e and probe (card #57)

All through `~/projects/.preview/dev2/scripts/e2e.sh` (build, wait for load
1 and 5 min under 6, run), from a detached snapshot worktree, with a temporary
HOME.

| Run | Commit | Result | Load at start, end (1 min) | Takes | `captureLostMs` | `captureMaxGapMs` | `graphTrouble` |
|---|---|---|---|---|---|---|---|
| `test:e2e` | 0e8f5e21 (first Path Shred) | 75 passed, 0 failed | 1.44, 5.61 | 12 | 0 in every Take | 21 max | {} |
| `test:e2e` | a2ee99ee (first Path Rhythm Foundations) | 74 passed, 1 failed | 4.30, 0.99 | 12 | 0 | 16 max | {} |
| `--scenarios placement,session,relaunch,two-paths` | fbf696d1 | 42 passed, 0 failed | 4.20, 7.53 | | | | |

The one failure was this pass's own (the dot line's `innerText`), fixed in
fbf696d1 and covered by the third run.

`test:e2e:probe` on 0e8f5e21:

| Run | p99 jitter ms | Missed beats | Callback allocs / frees | Dropped notifications | Load at start |
|---|---|---|---|---|---|
| headless `click-jitter-probe` | 2.202 (advisory) | 0 | 0 / 0 | 0 | 5.32 |
| app, 3D neck, Xvfb | 0.374 | 0 | 0 / 0 | 0 | 5.32 |
| app, 3D neck, GPU | 0.676 | 0 | 0 / 0 | 0 | 7.31 |

Xvfb part 12 checks passed, GPU part 8. The headless number is the one the
finisher's handoff explains (this box does not meet 1 ms headless on `revamp`
either); it ran straight after the e2e.

## Decisions a reviewer may want to undo

- **The wizard's grid is flat, in category order, with no group headings.**
  Headings cost about 190 px in a dialog that already scrolls at 1024x700.
- **`FIRST_PATH_ID` moved, nothing migrated.** A player with any Path state is
  untouched (`playerPaths`). A tester who never played a Take and never ran
  the wizard now sees Rhythm Foundations where Shred was.
- **A subscribed Path with no Take yet still says "Continue · Step 1".**
  "Started" is `progress.states` holding the Path, as on the Paths cards.
- **The ask-first pair stacks when a label needs a third line** (Russian,
  Obsidian's monospace, Japanese at 18 px): the footer is then as before,
  about 20 px lower.

## Found and not fixed

1. **Theme lane (card #72).** Russian falls back to a heavy wide sans in
   Ember's Session headings and big button (no Cyrillic in the display face).
   The runway's note chips are white and teal in Ember while Watch plays.
   Obsidian's welcome button still wraps on a 360 px phone. Hover states and
   the tools were looked at in Ivory and Lavender at 1400x900 only.
2. **The runway's ready screen on a phone** draws the whole neck in a band
   about 60 px tall (card #73).
3. **The neck's edge fret numbers are cut on a phone** (card #67, item 4;
   `src/stage3d/engine/guitar.ts`).
4. **The shots harness says ready before the 3D neck is up** (`data-mode`
   is still `loading` at `__SHOT_READY__` in `session-neck-*`). A picture
   taken at once shows the slot empty; specs that need the neck wait for
   mode `3d` themselves. Worth a wait in `src/shots/main.tsx`.
5. **e2e harness leftovers** (card #57): `--bleed`'s `latency_msec=5`,
   the `Env.up()` mkdir race, `promoteAudioThreads()` blocking after the
   capture starts.
6. **A coach line kept on the same route can still be cut** when a reopen
   nears its 2 s budget (card #70; only if a real device shows it).
7. **Headphones in and out on a real phone** for #53 is still not done.

## How this pass worked, for the next one

- **Long suites run from a detached snapshot worktree**, so `src/` can be
  edited meanwhile (a layout run serves its own checkout):
  `git worktree add --detach ~/projects/.yames-dev2-snap HEAD`, link
  `node_modules`, `npx playwright test --workers=2` there. The port is derived
  from the path, so it never clashes. Both snapshots and `.target-dev2` were
  removed at the end of this pass.
- **Screenshots**: `~/projects/.preview/dev2/scripts/shot.mjs prefix
  scene[,scene] WxH[,WxH] theme[,theme] d|m [lng]` against preview servers of
  your own (ports 5361 desktop, 5362 phone, `YAMES_VITE_CACHE_DIR` of their
  own; start them again, they were stopped). `WAIT=2500` for a scene with the
  neck. `scripts/sheet.py out.png scale cols files...` tiles them.
- **A text change that looks free may not be.** The e2e reads the page with
  `innerText`: flex items and absolutely placed spans become line breaks
  there. Inline blocks and `white-space: pre` do not.
- **The box is shared.** Load sat at 15 to 30 for the first hour; the e2e's
  until-loop found its window after about 25 minutes.
