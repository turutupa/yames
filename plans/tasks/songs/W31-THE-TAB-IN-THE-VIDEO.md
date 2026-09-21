# W31 — The video shows the tab you are playing

Branch `songs-w31-tab-in-the-video`, from `songs-v1` **after
`merge(songs-w30-jam-on-camera)` is in it** (W30 moves the camera and
clip code to a shared home and gives the compositor's "tape" an
interface; build on that, do not fork it). Size M.

**The owner, 2026-09-21:** "if the recording is from playing a SONG, it
would be really really cool to have the option of adding the tab the
user is playing … you see the vid of the user and an overlay, or
however you wanna do it, you see the notes its playing so its kinda in
sync."

W25's "Save as a video" draws a strip of hit/miss dots under the
picture. Dots are not the tab. What he wants is what every play-along
video on the internet looks like: **the tablature itself — six lines,
fret numbers — scrolling under a fixed playhead, in time with the
sound.**

## What to build

1. **A tablature painter for the canvas**, pure and testable, drawn
   from `SongScore` (each note's string, fret, start tick, length) and
   the take's `TakePosition` — NOT a screenshot of alphaTab's DOM (it is
   SVG in a scrolling page, laid out in systems; a video needs one
   endless horizontal line). Strings as lines with the tuning's letters
   at the left; fret numbers on their strings; bar lines and bar
   numbers; section names where the file has them; the rhythm shown by
   spacing proportional to time (so the scroll speed is constant at a
   constant tempo and visibly changes with a tempo change — that IS the
   sync), a fixed playhead a third of the way in, a few bars of look-
   ahead. Ties, slides, hammer-ons/pull-offs, bends, palm mutes, dead
   notes and let-ring get the conventional small marks (`/`, `h`, `p`,
   `b`, `P.M.`, `x`) only where they fit; never at the cost of the
   numbers being legible on a phone. Chords stack. Seven- and
   eight-string, four- and five-string bass: as many lines as the
   tuning has.
2. **Coloured by how it went**, by the same verdict the review uses
   (`buildTape` is built once in `SongReview` and handed down — take it
   from there; the marks on a shared clip must be the marks on the
   screen it was made from): hit, early, late, missed, soft-absent,
   extra. A number lights as the playhead crosses it. The verdict's
   colours are their own switch ("show how it went"), on by default —
   some people will want to share the playing, not the grades.
3. **Where it sits.** 16:9: a band under the picture, as the dots are
   today. 9:16: **over the lower third of the picture**, on a soft dark
   ground so it reads over any shirt or wall, with the bar / section /
   tempo line above it. No picture: the tab is the whole frame, large.
   The Yames mark stays top right and is never covered.
4. **The dots stay as a choice** ("Tab" / "Marks only" / "Nothing" under
   the picture), default Tab. Remembered.
5. **Then and now** (W25's compare) gets the same painter under each
   side if it is cheap; if it is not, say so and leave it.
6. It must hold 30 fps while the compositor records in real time: paint
   only the visible window, pre-measure text once, no per-frame
   allocation worth the name. Measure and report the frame time at
   1280×720 and 720×1280.

Everything W21/W25 say about `crossOrigin`, raw-byte IPC, mp4 vs WebM,
the share row and "nothing is uploaded" still holds. Strings in all 15
locales at the END of their namespace.

## Gates

`npm run build`, `npm run test` (unit tests for the painter's geometry:
a note at tick T sits at the playhead at time T at 100 % and at 50 %
tempo, across a tempo change, and across a looped portion),
`npm run test:layout` (`--workers=2`), and — as W25 did — export real
clips from the harness, pull frames with ffmpeg, and READ them: 16:9
with picture, 9:16 with picture, no picture, a dense sixteenth-note
passage, a seven-string file. Report the main bundle before and after;
the painter belongs in the review's lazy chunk. No Rust expected.

## Rules

As every brief on this branch: `git checkout -B
songs-w31-tab-in-the-video songs-v1` first; MSVC override;
`node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs`; never push, never merge, never start
the app; explicit `git add` paths; no line-ending-only changes staged;
commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
