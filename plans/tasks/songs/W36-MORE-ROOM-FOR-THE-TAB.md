# W36 — More room for the tab: one bar at the top, a calmer strip, the theme's type, and a click that lands

Branch `songs-w36-more-room-for-the-tab`, from `songs-v1` as it stands.
Size L. The owner's third session with Songs, 2026-09-21 ("songs
feature is coming along amazingly!"), at a 2000×1124 window with the
rail collapsed and a real 141-bar Guitar Pro file open. His words are
the acceptance tests. One commit per item, in this order; stop cleanly
at a boundary.

**The app is RUNNING on this machine from
`C:\Users\alber\Dev\yames-songs` (`tauri dev`), in front of the owner.**
Never write to that checkout, never start another copy, never kill a
process you did not start, never bind 1420 or 5311.

Standing rule (memory of 2026-09-21): a content stage uses ALL the room
the window gives; every layout here is checked at 1100, 1440 AND
2000×1124, rail open and rail collapsed.

## 1. "When i click on a part of the tab that is not on the first row … it's scrolling to the wrong location, maybe because i change the zoom level"

A bug in the core interaction; do it first. A click in the middle or at
the end of a long song seeks, and then the page scrolls somewhere else.
Suspects: the follow-scroll reads a system's position from bounds taken
at another zoom (`boundsLookup` cached across a re-engrave; W22 already
met a stale `offsetTop` here once), W34's cursor interpolation asking
for the position two frames AHEAD of a seek, the scroll target computed
in engraving units and applied in CSS pixels (or the reverse) once
`display.scale` is not 1, or the playhead's "keep in view" fighting the
click's own scroll. Reproduce on `?song=long` at zoom 0.8, 1 and 1.4:
click bars 5, 60 and 118; the clicked bar must be on screen and the line
on the clicked beat, with the page not moving at all if the bar was
already fully visible. A layout test per zoom.

## 2. "The top rail, do we need it anymore? … can we merge the information from the songs stage area into that rail? like the song name, the tuning etc? i don't think we need the audio preset dropdown (where it says drum) right now"

Today Songs stacks THREE rows above the music: the app's header (click
sound "Drum", Vol, Voice, Input, ⋯), the song's head (title · artist ·
part menu · tuning / time / tempo · Tab · − +), and sometimes a warning
banner. On the Songs tab they become ONE bar:

- The app's header, on Songs, carries the song: title, artist, the part
  menu, then the facts (tuning, time, tempo), the Tab / Tab + notes
  switch and zoom, then what the header keeps: Vol, Input, ⋯. **The
  click-sound dropdown ("Drum") is not shown on Songs** (the click is
  off by default there since W34; its sound is a metronome setting and
  stays reachable from the metronome and Settings). "Voice" (the
  coach's voice level): keep it only if there is room at 1100; it goes
  into ⋯ before anything of the song's does.
- `MainHeader` is shared by every mode and by the phone build: do this
  as a slot the Songs view fills (a portal or a render prop), not as
  Songs knowledge inside the header; the other modes' headers must not
  change by a pixel (`npm run test:layout` untouched), and nothing here
  touches `.main-window.is-mobile` rules.
- It sheds by priority as the window narrows: facts first (they fold
  into the part menu's panel), then artist, then zoom into ⋯; the title
  ellipsises; the part menu, Tab switch, Vol and Input stay longest. At
  the minimum window it is still one row.
- The warning ("The tempo slides in 1 bar. Yames steps it at the bar
  line instead.") stops being a permanent banner that costs a row: a
  small mark beside the title that opens it, shown once as a quiet
  toast the first time the song is opened.
- Net: at 2000×1124 the tab's frame gains the height of the old head
  and the banner (about 100 px). Put the new share-of-window numbers in
  the layout suite (W29 measured 74.7 % as the ceiling WITH the old
  header; say what the ceiling is now).

## 3. "The row below the alphatab is great, but can we reduce its margin bottom and increase its margin top so it's not so close to the tabs?"

The strip (Bars · Loop · Whole song · Speed · Click · More) sits tight
under the frame and has dead air under it before the transport. Move
the air: more between the frame and the strip, less between the strip
and the transport, the frame's height unchanged or larger. Measure
before / after at 2000×1124 and say the numbers.

## 4. "The second screenshot shows it's not rendering right" — the More panel

His screenshot: the band's rows are wider than the panel — the mute
switches are cut in half at the right edge and a sideways scrollbar
appears; part names are cut to seven letters ("Lead Gu…", "Rhythm …",
"Addition…") with room to spare; the record dot on "Record the take"
draws as a broken glyph over the first letter; the chip reads "More 1"
with an unexplained count. Fix all four: a row fits the panel at any
name length (name flexes and ellipsises LAST, after the slider has
given what it can; the number, S and the switch never clip); no
sideways scroll inside a popover, ever; six or more parts scroll
vertically inside the panel with the panel inside the window; the
record mark is the same dot "Record the picture" has; the count on the
chip either says what it counts (its accessible name too) or goes.
W28 owns `SongBand.tsx`'s insides and is finished: they are yours now.
Layout tests with 2, 6 and 12 parts and a 40-character part name, at
the panel's real width.

## 5. "I love that you change the font of the numbers to match the theme… can we also do that with other fonts like 'TAB' or the number for the bpm … it says 161 but in that weird font. not critical"

alphaTab draws text from `settings.display.resources` (tablature
numbers, the "TAB" clef, tempo / marker / effect / words / bar-number
fonts are separate entries — read its current docs, do not guess the
names). Set every TEXT face to the theme's (display face for section
names and the tempo, body face for small text; the music glyphs stay
alphaTab's music font). Fonts must be loaded before the first engrave
or alphaTab measures with a fallback and the spacing is wrong
(`document.fonts.load`, as W32 did for the video). Check all 13 themes'
faces have the glyphs used (♩ is a music glyph, not text). Captures in
Ember, Ivory (serif) and Obsidian (monospace).

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`;
per-checkout port; re-run a failure alone before believing it). Rust is
not expected. Captures, git-excluded and READ by you: the Songs screen
at 1100, 1440 and 2000×1124, rail open and collapsed, stopped and
playing, with the long fixture; the More panel with 6 and 12 parts;
three themes for item 5.

## Rules

`git checkout -B songs-w36-more-room-for-the-tab songs-v1` first; MSVC
override; `node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs` (read-only copy; verify
`@coderline/alphatab`); never push, never merge, never start the app;
explicit `git add` paths; no line-ending-only changes staged; strings
in all 15 locales at the END of their namespace; nothing the app says
names a tab site; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Report

Root cause of item 1; the header slot's design and proof the other
modes did not move; the tab frame's share of the window before / after
at the three sizes; capture paths; every gate's real number; final
commit; worktree path.
