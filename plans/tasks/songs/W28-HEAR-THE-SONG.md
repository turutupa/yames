# W28 — Press play and hear the song

Branch `songs-w28-hear-the-song`, from `songs-v1` as it stands. Size L.
**The owner's first minute with Songs, 2026-09-20:** "when i hit play it
doesn't play the song, it plays a metronome? wth?" He is right, and it
is by design, which makes it worse: `buildBacking` (`src/songs/import.ts`)
gives the engine only what Jam's band can play — percussion, GM bass
programs 32–39, GM pianos and organs — and drops everything else into
`leftOut`. **Every guitar in the file is dropped, including the part
the player opened the file to learn.** A two-guitar song with no bass
track is a click. Everyone who has used a tab player expects play to
play the song; that expectation is the product now.

Read first: `plans/SONGS.md` (A1 — backing goes through the engine, one
clock; still true), `plans/tasks/songs/BRIEF.md`, `AGENTS.md` "What in
the output callback must not be touched", `src-tauri/src/song.rs`,
`src/songs/import.ts` (`buildBacking`), `src/songs/songEngine.ts`,
`useSongEngine.ts`, `SongBand.tsx`.

## 0. First, find out what he actually heard (an hour, not a day)

He may have opened a file WITH drums and bass and still heard only the
click, which would be a bug on top of the design. With the offline
renderer (W9's / the jitter probe's song path), render a multi-track
fixture at the DEFAULT mix and measure each lane's level against the
click (`DEFAULT_CLICK_MIX` 0.45, `SONG_TRANSIENT_CEILING` 0.60). If the
band is there but buried, or muted by default, or silent until a fader
is touched, fix that first and say so in its own commit. He tested on a
Mac; nothing here has ever run on one — look for anything
platform-shaped in how the song's samples are found and decoded.

## 1. Every track in the file sounds

One clock, one output: the sound is made in the Rust engine and mixed
by the same callback, as the band is today. What is new is an
instrument for everything that is not drums / bass / keys.

- **A General MIDI synth in Rust, playing a SoundFont.** `rustysynth`
  (pure Rust, MIT) is the obvious candidate; look it up and look at the
  alternatives before choosing, and check its licence and its
  allocation behaviour yourself.
- **It must not render on the audio callback.** The click is sacred and
  a synth's cost is not bounded the way the sample mixer's is. A
  renderer thread runs ahead of the playhead into a lock-free ring
  (the pattern `BeatQueue` uses; pre-allocated, no frees on the
  callback), and the callback only mixes what is already there. A song
  is deterministic, so running ahead is always possible: a seek, a
  loop boundary, a tempo change or a track being muted invalidates what
  is queued and the renderer catches up — decide how much lead that
  needs (enough that a fader move is heard within ~100–150 ms, not so
  little that a loaded machine underruns) and what is heard in the gap
  (the click and the sampled band must carry on untouched; the synth
  may drop out for a few milliseconds, it may never glitch them).
  Looping a portion must be seamless: render across the seam.
- **Which tracks go where.** Keep Jam's sampled kit for percussion and
  its basses and keys where they are today if they sound better than
  the SoundFont's — or move everything to the synth if mixing two
  worlds sounds wrong. You cannot hear; so make it a per-song setting
  with a sensible default, render A/B clips of the same eight bars both
  ways into a git-ignored folder, and say in the report which you chose
  and why. **The owner judges sound by ear; give him the clips.**
- **The player's own track plays too**, as the guide it is on every tab
  player, and it has the first fader in the band with its own mute
  ("my part"). Default: on, a few dB under the rest. It keeps its
  bends, slides, hammer-ons, palm mutes and let-ring as far as the
  file's MIDI generation gives them (alphaTab can generate the MIDI —
  `MidiFileGenerator` — so the importer does not have to reinvent
  articulation; check that it runs without the player it normally
  feeds, and that doing so keeps alphaTab "reads and draws only": no
  alphaSynth, no WebAudio, the webview makes no sound).
- **`leftOut` becomes empty in the normal case.** The band strip lists
  every track in the file with its name, a fader, a mute and a solo;
  when there are more than fit, the strip scrolls sideways inside
  itself or folds into a "Band" popover — it must not eat the tab's
  room (W29 is reclaiming that room at the same time; coordinate
  through the brief, not the code: you own `SongBand.tsx`, W29 owns
  `TabStage` and the layout around the band).
- **Scoring must not change.** The schedule the detector is scored
  against is built from the chosen track exactly as today. With the
  guide part coming out of a speaker into the microphone the detector
  will hear it: check what W1/W11's onset path does with the band
  bleeding in today (drums already do), and if the guide makes it
  worse, say so plainly and propose (not build) the answer — guide
  through headphones only, duck the guide while a take records, or
  subtract it.

## 2. The SoundFont

Look this up; do not decide from memory. Wanted: a General MIDI set
whose licence lets a GPL-3 app ship it, small enough not to undo the
owner's work on download size (v1.2.1 moved the band to FLAC for that;
the band is 30 MB), and whose guitars — nylon, steel, clean, overdrive,
distortion, muted — are not embarrassing, because a guitarist is the
listener. Candidates to check: the Sonivox set alphaTab itself ships
(tiny, Apache-2.0), GeneralUser GS (~30 MB, its own permissive
licence), TimGM6mb, a trimmed FluidR3/MuseScore General. Report size,
licence text and source for each. Ship ONE, put its licence beside the
others in About and `LICENSE` notes, and let a player point at an `.sf2`
of their own in Settings (desktop only — the phone build does not have
Songs). If the best-sounding set is large, propose downloading it on
first use of Songs rather than bundling; do not build that without the
owner's word.

## 3. Words

"Left out" language goes; the strip's labels, the new "my part" fader,
solo, and the settings row in all 15 locales, appended at the END of
their namespace, in words a musician says. Nothing names a tab site.

## Gates

`npm run build`, `npm run test`, `npm run test:rust` (via
`node scripts/rust-test.mjs` only, `CARGO_TARGET_DIR=C:\yt-w28`,
`--no-default-features`), `test:dsp`, `test:highbpm`, `test:pitch`,
`npm run test:layout` (`--workers=2`; the suite's port may be fixed
with reuse on — make sure nothing else serves it). The jitter probe
with a song playing through the synth, looping a portion, with a fader
moving and a seek every few seconds: p99 no worse than today's, zero
allocations and frees on the callback, zero dropouts of the CLICK. New
Rust tests: the ring never blocks the callback; an invalidation never
replays stale audio; a loop seam is sample-continuous; tempo at 50 %
and 100 % put note-ons on the same beats the schedule has.

## Rules

`git checkout -B songs-w28-hear-the-song songs-v1` first;
`rustup override set stable-x86_64-pc-windows-msvc`; `node_modules` by
robocopy **from PowerShell** from `C:\Users\alber\Dev\yames-songs`
(verify `@coderline/alphatab` is there); never push, never merge, never
start the app; explicit `git add` paths; do not stage line-ending-only
changes; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stay out of
`TabStage`, the tab's click handling and the stage's layout (W29), and
out of `src/songs/camera/**`.

## Report

What he heard and why (item 0); the design of the ring and its lead;
the SoundFont table and the choice; the A/B clips' absolute paths; what
the guide does to scoring; every gate's real number; binary/installer
size before and after; final commit; worktree path.
