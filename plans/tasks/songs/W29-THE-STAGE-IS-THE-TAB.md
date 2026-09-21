# W29 — The stage is the tab: switch instrument, use the room, click like everyone expects

Branch `songs-w29-stage-is-the-tab`, from `songs-v1` as it stands.
Size L. Three findings from the owner's first session with Songs
(2026-09-20), in his words, in priority order. One commit per item;
stop cleanly at a boundary.

Read first: `plans/SONGS.md` (A5, A6, A9), `plans/COACH_UX.md` A4,
W18's and W22's merge commits (`git log --merges --format=%B -2
--grep "w18\|w22" songs-v1`), `src/containers/songs/TabStage.tsx` top
to bottom — its comments record why every current choice was made, and
two of those choices are being reversed here on the owner's word — then
`SongsView.tsx`, `src/songs/selection.ts`, `tests/layout/songs*.spec.ts`.
Memory of the Jam UI pass applies: container queries, portalled menus
(`useMenuPlacement`, 320 px cap), everything inside a section.

## 1. "When i click on the tab its selecting it for loop instead of just going to that place — mimic songsterr click events, they are the common industry"

Today a click on the tab starts a portion (W18's own hit test on
`.songs-tab-overlay`). What people know from the tab players they
already use is different, and the owner wants that. **Look up how those
players behave — their help pages and any current walkthrough — rather
than reasoning from memory**, and write what you found at the top of
the commit. The behaviour to land, unless what you find contradicts it
(then say so and follow what you found):

- **Click = go there.** A click on a beat moves the playhead to that
  beat. Stopped: the cursor jumps and play starts from there. Playing:
  playback continues from there without stopping (the engine already
  seeks for loops; a seek while playing must be click-safe — coordinate
  with what `song.rs` offers, and if it cannot seek mid-play without a
  stop/start, do stop→seek→start inside one bar's worth of silence and
  report it for W28, which owns the engine's song path this week).
- **Drag = choose a portion.** Press, drag across bars, release: those
  bars are the portion and they loop. A drag shorter than a few pixels
  is a click. The portion snaps to whole bars as today; its handles can
  be dragged afterwards to grow or shrink it.
- **Click outside the portion** moves the playhead and leaves the
  portion alone unless the click is a plain click on the portion's own
  "clear" affordance; **Esc** clears it. Decide from what you looked
  up whether a click elsewhere clears the loop in the players people
  know, and do that.
- Shift-click extends the portion from the playhead to the clicked bar
  (the convention everywhere text is selected).
- Keyboard: Space plays/stops (already), ← / → move a bar, Home goes to
  the top; W18's portion hotkeys keep working, and their descriptions in
  Settings stay true in all 15 locales.
- Touch and pen (a Windows touchscreen is a desktop): tap = go there,
  long-press-drag = portion. Do not break page scrolling by wheel,
  trackpad or touch.
- The coach's "Loop bars 5–8 at 77 BPM" button and a due promise
  opening at its bars (W22) still set a portion the same way.

Rewrite the comment block in `TabStage.tsx` that explains why seek-on-
click was off: say what changed and why (the owner's words), so the
next reader is not told a stale story.

## 2. "There's no dropdown for selecting the instrument if a file has multiple instruments"

`TrackPicker` is a sheet that appears once, at import; after that the
choice is invisible and final. Wanted: **the instrument's name in the
stage's header is a dropdown** (portalled menu) listing every track in
the file — name, instrument family glyph, tuning via `tuningLabel`,
string count, and a mark on tracks that are percussion or have no notes
(selectable for reading, not scoreable: say so in the row). Choosing
one re-renders the tab for that track, rebuilds the schedule, keeps the
playhead's bar and the portion's bars, keeps tempo percent, and
remembers the choice per song. Takes and history belong to the track
they were played on: the review, "then and now" and due promises must
not mix two tracks' attempts (check how attempts are keyed; if they are
keyed by song only, add the track and migrate honestly — existing rows
belong to the track the song was imported with).

W28 is giving every track a fader this week and owns `SongBand.tsx`;
you own the header's dropdown. They are different things: this one
chooses what you READ and are scored on.

## 3. "Figure out how to use as much space as possible on the stage area with tabs, right now a lot of space is under used"

Measure before changing: at 1440×900 the view starts ~115 px right of
the rail and the tab's frame gets under half the window's height; the
strip (bars, loop, sections, tempo chips, record), the band's faders
and the transport take three rows under it; and the page shows standard
notation AND tablature for every system, so a screen holds half the
bars it could.

- **Tablature-first.** Default to tab with rhythm (stems/beams under
  the tab, as the tab players do it) and no notation staff; a
  two-state control in the header switches "Tab" / "Tab + notes",
  remembered per player, not per song. Non-fretted tracks (keys, a
  vocal line) fall back to notation. The verdict's colouring, the
  cursor, the portion overlay and the camera overlay must all still
  land on the right beats in both modes — the layout suite asserts it.
- **The frame takes the room.** Gutters down to what the rest of the
  app uses; the header collapses to one line (title · artist · the
  instrument dropdown · tuning/meter/tempo facts); the strip becomes ONE
  row that sheds into a "More" popover by priority as the window
  narrows (tempo percent and loop stay longest); the band's faders do
  not get a permanent row of their own — they live in a popover or a
  collapsible drawer opened from the strip, closed by default (W28 will
  put up to a dozen faders in there). Target: at 1440×900 the tab's
  viewport is at least 70 % of the window's height and the full width
  of the content region; at the minimum window (480×780) at least 55 %.
  Put those numbers in the layout suite.
- **alphaTab's own spacing.** Scale, stretch, bars per row, system and
  staff padding: tune them so a row is as dense as it can be while a
  sixteenth-note run is still readable, and let the player zoom
  (Ctrl/Cmd + wheel, and − / + in the header), remembered.
- **Playing hides what you are not using.** While the transport is
  running, the header's facts and the strip may fade back (not vanish —
  one hover or tap brings them back), so the music has the screen. Do
  not move anything the player aims at mid-song.
- The review (W12/W18/W25) still arrives where the player was looking
  and still fits at 480×780; the camera preview still has its corner.

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`;
check that nothing else is serving the suite's port before trusting a
run; Ember, Ivory and Manuscript at 480, 1100 and 1440; new assertions
for the viewport share, click-vs-drag, and the instrument menu inside
the 320 px cap), `npm run test:rust` only if you touch Rust
(`CARGO_TARGET_DIR=C:\yt-w29`, via `node scripts/rust-test.mjs`,
`--no-default-features`). Take before/after captures of the stage at
1440×900 and 480×780, stopped and playing, in a git-excluded folder,
and LOOK at them.

## Rules

`git checkout -B songs-w29-stage-is-the-tab songs-v1` first;
`rustup override set stable-x86_64-pc-windows-msvc`; `node_modules` by
robocopy **from PowerShell** from `C:\Users\alber\Dev\yames-songs`
(verify `@coderline/alphatab`); never push, never merge, never start
the app; explicit `git add` paths; do not stage line-ending-only
changes; new strings in all 15 locales appended at the END of their
namespace; nothing the app says names a tab site; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stay out of
`SongBand.tsx`, `src/songs/import.ts`'s `buildBacking`,
`songEngine.ts` and `song.rs` (W28), and `src/songs/camera/**`.

## Report

What you looked up about click behaviour and what you did with it; the
viewport share before/after at both sizes; how attempts are keyed now;
capture paths; every gate's real number; final commit; worktree path.
