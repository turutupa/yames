# W33 — Watch a jam back, and the last untidy corners of the camera work

Branch `songs-w33-watch-a-jam-back`, from `songs-v1` **once it contains
both `merge(songs-w32-camera-in-jam)` and
`merge(songs-w31-tab-in-the-video)`** (the orchestrator launches this
after both are in). Size M. W32 stopped cleanly after the camera and the
better-looking video; this is its item 3 plus what its report and the
orchestrator's look at the frames left open. One commit per item.

Read first: `W32-THE-CAMERA-IN-JAM.md` item 3, W32's three commit
bodies (`git log --format=%B -3 songs-w32-camera-in-jam`), W25's
brief for how Songs' takes shelf and review were made to fit 480×780.

1. **Watching a jam back** — W32's item 3, verbatim: the takes shelf in
   Jam's setup drawer gets thumbnail, date, length, vibe · key · tempo,
   which sound source, a "with picture" filter, inside the 320 px menu
   cap; opening a take shows the picture with the jam's own timeline
   under it (bar grid with the playing bar lit, NOW chord, what comes
   next) driven from the recorded transport (`TakePosition` /
   `takes/jamClock.ts`), with play / pause, scrub by bar, the offset
   nudge (keyed per camera AND per sound source, as W32 made it), "Save
   as a video", "Show in folder", delete. Lazy. Fits 480×780 with the
   sentence-level things above the fold. A take with no picture plays
   back too: the timeline is the whole view.
2. **Two overlaps in the jam video**, seen in W32's own frames:
   in 16:9 with no picture "next Bb7" sits on the bottom edge of the
   beat ring; in 9:16 with a picture "next Bb7" is cut by the top of
   the bar-grid panel. Nothing in a frame may touch or clip anything
   else, in either shape, with a long chord name ("F#m7b5", "Bbmaj7#11")
   and in the serif theme. Add those names to the frame spec and READ
   the frames.
3. **The camera's mirror at small sizes.** W32 found the floating
   transport overlapping the stage at 1100×720 and the stage 162 px
   taller than its room at 480×780, and chose not to draw the mirror
   below 900 px. A player at a small window then records a picture
   they cannot see. Give them a way to check the framing before they
   play: a tap on the live camera chip opens the mirror as a small
   portalled popover (it may cover the grid while open; it closes on
   play). Also fix or report the two layout findings themselves — a
   transport over the stage and a stage taller than its room are Jam
   bugs with or without a camera.
4. **`src/takes/clip.ts` reaches back into `src/songs/`** for a score
   (W32 left it so W31's rename detection would survive). Split the
   frame's geometry from the song's span/caption arithmetic so `takes/`
   depends on nothing under `songs/`.
5. Captures of Jam's stage with the mirror at 480, 1100 and 1440 in two
   themes, saved as PNGs and read (W32 measured rectangles but ran out
   of room to look).

## Gates

All of them, because W32 skipped the Rust ones: `npm run build`,
`npm run test`, `npm run test:layout` (`--workers=2`),
`npm run test:rust` (via `node scripts/rust-test.mjs` only,
`CARGO_TARGET_DIR=C:\yt-w33`, `--no-default-features`), `test:dsp`,
`test:highbpm`, `test:pitch`, and the jitter probe
`--no-llm --jam-swap --jam-move --jam-loopback-take --seconds 30`
(release, `--no-default-features`): PASS, zero allocations and frees.
The owner's speakers are muted; the probe makes no sound. Change no
volume or mute setting.

## Rules

As every brief on this branch: `git checkout -B
songs-w33-watch-a-jam-back songs-v1` first; MSVC override;
`node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs`; never push, never merge, never start
the app; the webview captures only the camera picture; nothing is
uploaded; explicit `git add` paths; no line-ending-only changes staged;
strings in all 15 locales at the END of their namespace; commits end
with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
