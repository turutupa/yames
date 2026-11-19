# Handoff: the MVP finisher pass (night of 2026-11-18)

Branch `mvp-finisher`, worktree `~/projects/yames-mvp-finisher`, on top of
`revamp` fcb4bec5 (merged in). Nothing is pushed; the orchestrator merges into
`revamp`. Cards: #61 (this pass), #53 (Android route change, Rust), #45 (e2e
capture, done), #57 (validate the capture change against the app).
Evidence: `~/projects/.preview/finisher/` (`before-*`, `after-*`, `pair-*`,
`focus-*`, `merged-*`, and `walk/` = 16 scenes x 3 sizes x 5 themes).

## Commits, oldest first

| Commit | What |
|---|---|
| 5d9dcfbf | Phone ready screens: the warm-up and the runway Take get a sticky footer (Start, Slower/Faster, Skip on the first screen at 360x640 and up); the Tab footer is one row after a Watch (`useFitRow`: full, tight, snug, wrap). |
| 43d48cf6 | **Rust, #53.** A moved route goes through `reopen_output(route = NewRoute)`: song and jam kit kept at the same rate. |
| 16bed940 | **Rust + TS, #53.** `play_take` returns the playback's generation; `takes/playbackGate.ts`; both takes hooks ignore another take's ending. |
| 68ee7ba5 | Coach chord box is `flex: none` beside a long shape name (fixes "keeps its drawings readable at the coach dock (380px)"). |
| 70afbef1 | `songs-seek.spec.ts`: the half-shown-bar test was wrong at zoom 0.8 (bar 60 is whole on the first screen there); it now finds a bar under the fold and asserts its premise. |
| 351c506d | **Product bug.** The Take's 30 fps cap ran at about 41 fps under load (spaced from stale animation-frame stamps). `FrameScheduler` spaces a cap from `deps.now()` at the draw. Layout test reads frame spacing, not a count over a second. |
| b3fb90e2 | Layout suite's Vite servers use `.layout-cache/{desktop,phone}` (`YAMES_VITE_CACHE_DIR`), not the shared `node_modules/.vite`. |
| 36290a17 | `neck.spec.ts`: atomic reads (`READ_OVERLAY`), one sample per new NOW, waits for mode 3d and for the ring to land. |
| 24547fa3 | **e2e, #45.** Capture asks for 512 frames instead of `--latency-msec=5`; `Env.graphTrouble`, `captureMaxGapMs` in results.json. |
| 3457de72 | Today-focus review: the focus is kept with its day (`{ focus, day }`) and is the mix again the next day. |
| e64833fa | Today-focus review: the Paths card of today's Path reads "Only this today" (pressed) and undoes it in place. New key `session.paths.focusedToday`, 15 locales. |
| 0258097b | Shots harness: only an empty-mix scene waits for Today's "nothing to play" line (every Session scene timed out on revamp 7a3ab9b2). |
| e187d004 | `tour.spec.ts`: a stop's geometry is asserted inside `toPass` (the tour re-measures on a 300 ms beat). |
| 9d52a43d | Progress on a phone: the Path's number in the rows' column; stat tiles never narrower than their longest word. |
| ad2b907c | Session bar: the minutes keep their unit on the phone's two-line clock (`keepNumberWithUnit`). |
| 8960d5c2 | `useFitRow` also follows the row's own width and its controls' text (MutationObserver). |
| b46633f0, bc0f9c44 | Today picker segments: no name cut mid-word; a squeezed segment takes a second row. |
| 78843977 | `phone-header.spec.ts`: asserts the name is whole instead of "wider than 80 px" (broke with Ember's condensed headings on fcb4bec5). |
| 337440b4 | `tests/layout/README.md`: the private cache, and the load-proof test patterns. |
| 9306ee00 | Layout tests for the Progress column/tiles and the picker's whole words (both shown to fail on the old stylesheet). |

Merges: a8cd152c (revamp 7a3ab9b2), 8caf982b (revamp fcb4bec5).

## Gates on HEAD

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 9362 passed; 1 file fails, `TabStage.render.test.tsx`, only in worktrees (linked `node_modules`) |
| `npm run build` | ok |
| `npx playwright test --workers=4` (after the fcb4bec5 merge) | 1092 passed, 2 failed in `phone-header.spec.ts`; fixed in 78843977 (16/16 alone). The two new tests in 9306ee00 pass (12/12). Not rerun as one full suite after those two commits. |
| `npm run test:rust` | 1062 passed, 0 failed, 3 ignored (run on 16bed940; no Rust source changed since) |
| `cargo check --lib --target aarch64-linux-android` | ok, 7 warnings, none in the changed files |
| `node --test tests/e2e/lib/player.test.mjs` | 3/3 |

Environment for the commands:

```sh
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$PATH"
export CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
export CARGO_TARGET_DIR=$HOME/projects/.target-<yours>      # delete it when done
# Android check: source ~/android-ndk-dl/env.sh, then set CARGO_TARGET_DIR again
```

## Unfinished, and exactly where

1. **Independent engine review of the Rust diff** (required by CLAUDE.md).
   `git diff 901933de mvp-finisher -- src-tauri/src` (5 files, +273 / -71).
   Summary in the next section.
2. **Jitter probe on a quiet box.** Only the `--song-loop --song-take` run got
   one. Rerun the baseline and `--jam-swap --jam-move --jam-take` when
   `/proc/loadavg` 1- and 5-minute are under 6. Numbers so far below.
3. **Full e2e to validate the capture change** (card #57). Not run: the box
   was never quiet. `npm run test:e2e`, then read `info.players.*` in
   results.json (`captureLostMs`, `captureMaxGapMs`, `graphTrouble`).
4. **A real headphones in/out on the phone** for #53: the song stays loaded
   and stops, the click or a jam carries on, a coach line in flight is cut.
5. **One full layout suite on the final HEAD.** Every change after the last
   full run had its own specs run; the whole suite as one run was not.
6. **`.target-finisher`** was deleted at the end of the night; the probe and
   the Rust tests need a fresh build (about 4 minutes for the tests, 1 for the
   release probe).

## The Rust diff, for the reviewer

Nothing in the cpal output callback changes. No new lock, allocation or queue.

`src-tauri/src/engine.rs`
- `reopen_output` takes `route: output_park::Reopen` (new 3rd argument).
  `SameRoute` behaves as before. `NewRoute`:
  - `shutdown_within(cut_speech = true, ...)`: the coach's line in flight is
    cut whatever the rate. Reason: the speaking thread's deadline is the
    line's length plus one second (`tts::play_wav_path`), so a line restarted
    from the top on the new stream would be taken away before its end.
  - `keep_playing = playing_survives_reopen(route, was_playing, song loaded)`.
    A song that was playing stops and stays loaded. Reason: a stream that
    opens with `playing` set is a press of Play to the new callback
    (`song_from_the_top!`, count-in) in the middle of a Take.
  - The stop is reported before any open (`stop_transport_for_the_screen`:
    shared state, tempo context, `state-changed`), so the screen never shows
    Stop over a silent stream. If the reopen then falls to the drop path,
    `drop_decoded_for_new_rate(keep_playing, ...)` gets the already-lowered
    flag and emits no second `state-changed`.
- `stop_transport_for_the_screen` is the block lifted out of
  `drop_decoded_for_new_rate` (same three steps, same order).
- Tests (4 new, the 9 existing calls pass `SAME_ROUTE`):
  `a_moved_route_at_the_same_rate_keeps_the_song_and_the_kit_and_cuts_the_line`,
  `a_moved_route_stops_a_playing_song_and_keeps_it_loaded`,
  `a_moved_route_leaves_the_click_and_a_jam_playing`,
  `a_moved_route_at_a_new_rate_drops_as_a_device_switch_does`.

`src-tauri/src/output_park.rs`
- `Reopen` docs rewritten (both variants now go through `reopen_output`).
- New pure rule `playing_survives_reopen(route, was_playing, song_loaded)`
  with its truth-table test.

`src-tauri/src/android_route.rs`
- The route thread calls `engine.reopen_output(state, app, route, probe)` for
  both plans; `set_device` is no longer called from here. The 300 ms wait and
  `forget_output_rate()` before taking the engine's lock are unchanged, so
  every probe after a moved route asks the new route.

`src-tauri/src/take.rs`, `src-tauri/src/commands.rs`
- `TakeHandoff::set_play` returns `Option<u64>`: the generation, read under
  the slot's lock after the bump; `None` only if the lock is poisoned.
- `play_take` returns `Result<u64, String>` (was `()`); a poisoned slot is now
  an `Err` where it used to be a silent `Ok`.
- Test: `set_play_names_the_playback_its_ending_will_carry`.

Questions worth the reviewer's eye:
- Is stopping a playing song on a moved route the right product call? The
  alternative, carrying `playing` across, restarts the song with a count-in.
- `reopen_keeps_loaded(None, Some(rate))` is `true` (unchanged, reviewed for
  #14). With a moved route the old rate is published by the dead stream, so
  this arm should not be reached; confirm.
- The `SameRoute` speech line: kept in its slot and replayed from the top
  under the same line-length-plus-1 s deadline. A reopen takes up to 2 s
  (`REOPEN_BUDGET`), so a long reopen can still cut that line. Not touched.

## Probe numbers

Release build, `--no-llm`, stream 44100 Hz, 1882 frames per callback
(42.68 ms). Hard gates (missed beats, callback allocations and frees, dropped
notifications) are 0 in every run. p99 under 1 ms is advisory on a busy box.

| Run | Load before (1 / 5 min) | Load after | p50 | p95 | p99 | max | Result |
|---|---|---|---|---|---|---|---|
| `--song-loop --song-take` | 2.33 / 5.17 | 2.00 / 4.52 | 0.116 | 0.642 | 0.914 | 2.17 | PASS |
| `--jam-swap --jam-move --jam-take` | 2.39 / 5.88 | 2.33 / 5.17 | 0.171 | 0.966 | 1.345 | 1.68 | p99 advisory fail (a layout suite of mine was running) |
| baseline, first | 5.78 / 5.86 | 11.04 / 7.03 | 0.158 | 1.707 | 3.612 | 8.15 | p99 advisory fail; invalid by the load rule |
| baseline, 00:00 rerun | 0.36 / 5.85 | 5.95 / 6.27 | 0.184 | 1.257 | 2.680 | 6.22 | p99 advisory fail; another suite started mid-run |

For scale, the headless probe on this box under load on 2026-11-16 read
p99 1.02 ms (`tests/e2e/results/2026-11-16-under-load.md`).

The 30 fps cap, measured with `~/projects/.preview/finisher/scripts/cap.mjs`:
before, frames 31 / 17 / 31 / 17 ms apart (about 41 a second); after, mean
33.5 ms (29.9 a second), tightest 31.8 ms.

## Found and not fixed, most visible first

1. **Ask-first footer is about 235 px tall on a 360x640 phone.** Scene
   `phone-session-ask-ready`, Runway view: the sticky block (Slower/Faster,
   two big buttons, "Remember my choice") covers Watch and Sound until the
   page is scrolled. `AskStart` in `src/containers/session/parts.tsx`,
   `.session-ask` in `src/styles/session.css`. The opt-in agent's area.
2. **Russian phone Session bar: Skip drops to a second row** at 360 and 390
   (`phone-session-ready?lng=ru`). Exit 85 + clock 76 + chip 44 + Skip 109 +
   gaps 24 = 338 px in a 302 or 332 px bar. German does it at 360 only.
   `src/styles/phone-learning.css` around `.session-bar-left` (its 76 px box
   is 14 px wider than its two lines of text; CSS cannot shrink-wrap wrapped
   text, so this needs a measured width or tighter controls).
3. **"WARM-UP · NOT GRADED" wraps with a trailing dot** on a 390 px phone in
   Ivory (`phone-today-returning`, theme ivory). The tag is one string
   (`session.step.warmUp`), drawn by `StepTag` in `TodayView.tsx`.
4. **The neck's edge fret numbers are cut by the slot's edges on a phone**
   ("3" and "10" in `phone-session-no-catch`, Ivory, 390). Stage framing,
   `src/stage3d/engine/guitar.ts`; the fingering agent's area.
5. **NOW's ring leads its dot during a camera flight.** After a window resize
   or a bar change the overlay is placed through the camera's target while
   the picture is still flying there (up to 1.5 s). Seen in `session-ready`
   at 1024x700 in Mono, 0.7 s after the resize. `placeOverlay` in
   `src/containers/session/practice/NeckInstruction.tsx`. By design so far.
6. **`phone-header.spec.ts` under `YAMES_LAYOUT_LOCALE=de`**: "says what is on
   the stage rather than which tab you are on" fails ("the bar still names
   the mode"). An English-word assertion, or a real German label; not looked
   into.
7. **e2e leftovers** (card #57): `--bleed` still loads
   `module-loopback latency_msec=5`, which forces a 128-frame quantum
   (`tests/e2e/run.mjs` near line 942); `Env.up()` raced once in about 45
   starts (`mkdir run/pulse failed: File exists`); `promoteAudioThreads()`
   blocks 33 to 62 ms right after the capture starts.

## Decisions a reviewer may want to undo

- **The focus lapses with the day** (3457de72). It was "kept until changed".
  Every string says "today", and a forgotten focus starved the other Paths.
  One commit, easy to revert if the owner wants it sticky.
- **A moved route stops a playing song and cuts the coach's line** (43d48cf6).
  Card #53 allowed "speech may restart"; it would be cut off mid-restart.

## Pitfalls met tonight

- **Do not edit `src/` while a layout run is in flight.** Its Vite servers
  serve this checkout: an edit reloads the pages under the tests ("execution
  context was destroyed").
- **`ps | grep` patterns that also appear in your own command line kill your
  shell.** Happened twice. Record PIDs when spawning, or find a server by its
  port: `ss -ltnp | grep ':5351 '`.
- **Never `kill -STOP` a background task the harness started**; it is reaped
  as failed.
- **A preview server of your own needs its own `cacheDir`** (see
  `~/projects/.preview/finisher/vite.d.mjs` and `vite.m.mjs`, ports 5351 and
  5352, phone build = `__YAMES_MOBILE__: "true"`).
- **A layout test that passes on the old code proves nothing.** The first
  mid-word test here did (its probe inherited `overflow-wrap: anywhere`).
  Run a new test once against the stylesheet it is meant to catch.
- **The probe needs the box quiet for its whole minute**, not only at the
  start: both baselines began under 6 and ended above it.
- **`node_modules` is a link.** Never `npm install`, never delete it.
