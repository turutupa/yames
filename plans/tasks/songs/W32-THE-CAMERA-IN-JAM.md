# W32 — The camera in Jam, watching a jam back, and a jam video worth posting

Branch `songs-w32-camera-in-jam`, from `songs-v1` as it stands (it must
contain `merge(songs-w30-jam-on-camera)`). Size L. This is what W30 did
not reach — read its brief (`W30-JAM-ON-CAMERA.md`, items 2 and 3), its
four commit bodies (`git log songs-w30-jam-on-camera -4 --format=%B`)
and its note that `src/takes/` exists as the neutral home and
`SaveAsVideo` is already source-agnostic. One commit per item; stop
cleanly at a boundary.

The owner's words, for the bar this is held to: "folks can record
themselves jamming … share that recording, with the Y logo for yames",
and for the camera work in general, "make it very very cool and very
well integrated".

## 1. Move the shared camera code to its neutral home — first, small, alone

Move what Jam needs out of `src/songs/camera/**` and
`src/containers/songs/camera/**` into `src/takes/**` (W30 started it),
with Songs importing from there. `git mv`, no behaviour change, no
drive-by edits: Songs' unit and layout tests are the gate, and this
commit must be the FIRST one on the branch and contain nothing else.
**W31 is working in parallel** on a tablature painter for the Songs
video: it adds new files under `src/takes/` and makes small edits to
`SaveAsVideo` and the clip options. Your move must stay a pure rename
so git's rename detection carries W31's edits across; do not
restructure those files' insides.

## 2. The camera in Jam

As W30's brief item 2 says, verbatim: the camera switch beside the take
switch; the corner preview on the stage that does not cover the chord,
the bar grid, Stop or Count-in at any supported size (layout tests at
480, 1100, 1440 in Ember, Ivory, Manuscript); the picture recorded with
the take exactly as W21 does it (raw bytes to Rust, thumbnail at the
first downbeat, deleted with the take); W21's macOS camera-permission
path; `R` / `C` and the footswitch actions view-aware in Jam, their
Settings descriptions true in all 15 locales. The first-use intro
dialog (what is recorded, where it stays, nothing uploaded) appears in
Jam too, once per machine, not once per mode.

Picture-to-sound offset: W30 established that the two sound sources are
wrong in OPPOSITE directions ("Yames and my input" is early by the input
buffer; "Everything this computer plays" is late by the output buffer).
Store the source with the take and apply the right correction for each
when playing back and when exporting; the review's nudge control and
K3's clap procedure stay, with W30's two-line instruction for the
second mode.

## 3. Watching a jam back

The takes shelf in Jam's setup drawer gets what Songs' got: thumbnail,
date, length, vibe · key · tempo, which sound source, a "with picture"
filter, all inside the 320 px menu cap. Opening a take shows the
picture with the jam's own timeline under it — the bar grid with the
playing bar lit, the NOW chord, what comes next — driven from the
take's recorded transport (`TakePosition`), with play / pause, scrub by
bar, the offset nudge, "Save as a video", "Show in folder", delete.
It loads lazily. It must fit at 480×780 with the sentence-level things
above the fold, as W25 made the Songs review do.

## 4. A jam video worth posting

W30's export works and is plain: a flat ground, the chord in a system
font, a thin grid. Make it look like Yames:

- The app's own display face for the chord and the caption (load it
  into the canvas properly — `document.fonts.load` before the first
  frame, or the first second of every video is in a fallback font), and
  the ACTIVE THEME's palette, so a video made in Ember looks like Ember.
- With a picture: the picture fills the frame; the NOW chord sits large
  in a lower corner with the next chord small beside it ("next Bb7"),
  the bar grid along the bottom on a soft ground, the beat visible — a
  pulse on the playhead or the chord on each beat, stronger on the
  bar line, so a viewer with the sound off can see the time.
- Without a picture: the chord, the next chord, the grid and the beat
  pulse composed to fill the frame (W30's first render left four
  fifths of it empty), the band's line-up named small ("drums · bass ·
  keys"), chorus count. It should be something a player is happy to
  post as "me jamming over Yames" with only sound.
- 9:16 gets its own composition, not a squeezed 16:9.
- The Yames mark stays top right, its own switch, on by default,
  never covered.
- Hold 30 fps in real time; pre-measure text; report frame time at
  1280×720 and 720×1280.

Export real clips from the harness, pull frames with ffmpeg, and READ
them, in two themes, both shapes, with and without a picture. Put them
in a git-excluded folder and give the paths.

## 5. Words

All 15 locales, END of namespace, plural forms, musician's words.

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`),
`npm run test:rust` (via `node scripts/rust-test.mjs` only,
`CARGO_TARGET_DIR=C:\yt-w32`, `--no-default-features`), `test:dsp`,
`test:highbpm`, `test:pitch`; the jitter probe `--jam-swap --jam-move
--jam-loopback-take` still PASS with zero allocations and frees on the
callback. Bundle before/after: playback and compositor stay lazy.

## Rules

`git checkout -B songs-w32-camera-in-jam songs-v1` first; MSVC
override; `node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs` (verify `@coderline/alphatab`); never
push, never merge, never start the app; the owner may be asleep next to
this machine and his speakers are muted — change no volume or mute
setting and make no sound; the webview captures only the camera
picture, never audio; nothing is uploaded; explicit `git add` paths; no
line-ending-only changes staged; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Report

What moved where; the offset handling per source; captures' absolute
paths; frame times; bundle sizes; every gate's real number; what only a
real camera and a real ear can prove; final commit; worktree path; and
five lines of "try it".
