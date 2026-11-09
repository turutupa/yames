# W37 — One place in the song, a count-in that obeys its switch, and drums worth hearing

Branch `songs-w37-one-place-in-the-song`, from `songs-v1` as it stands.
Size L. The owner's fourth session, 2026-09-21, on a real 141-bar metal
song at 161 BPM. His words are the acceptance tests. **Commit each item
the moment it is done and gated — the orchestrator merges item by item
and the owner sees each one live; do not hold finished work.** Order as
written.

**The app is RUNNING on this machine from
`C:\Users\alber\Dev\yames-songs` (`tauri dev`), in front of the owner.**
Never write to that checkout, never start another copy, never kill a
process you did not start, never bind 1420.

## 1. "Let's say i hit play, and i hit pause when it's on bar 3, if i click on bar 6 and hit play again, it will resume from bar 3 but then immediately go on from bar 6, as if there are 2 states for the current location, one when playing and another one when paused. It's causing many flickers or causing the vertical line to move around a lot"

He has diagnosed it: there are several notions of "where we are" — the
engine's cursor (which a stop leaves, or rewinds), `session.playFrom`
(W29: where the NEXT pass begins), W36's local post-click snap, the
interpolator's anchor (W34), and the `tick` prop fed from engine
reports. Play starts the engine where IT thinks it is, then the webview
corrects it with a seek, and the line shows both.

Make it ONE: a single playhead position owned by the session, in ticks
of the song. Everything reads it; three things write it — the engine's
reports while playing, a click / key / portion action at any time, and
"back to the start". Then:
- **Stop is a pause.** The line stays where it stopped. Space again
  continues from that exact place. (A separate, visible "back to the
  start" — a button beside Play and the Home key — rewinds. Decide what
  a portion does: pause inside a loop continues inside it; "back to the
  start" goes to the portion's first bar while one is chosen.)
- **Play starts AT the playhead**, by telling the engine where before
  the transport starts (not start-then-seek): no bar 3 then bar 6, not
  for one buffer, not for one frame. The band and the synth begin at
  that place too (W28's `seek_song` / range start; extend it if the
  engine can only begin at a range's top — a start offset inside the
  compiled table is the honest fix, nothing new on the callback beyond
  an index it already has).
- The count-in, when there is one, counts in to the playhead's bar.
- An attempt's scoring starts at the playhead (skipped bars are not
  misses; W28/W36 already treat a seek that way — a paused-then-resumed
  pass is ONE attempt, a rewind starts a new one; say what you chose).
- Prove it the way W36 did: sample the line's x and the viewport's
  scrollTop every frame across pause → click elsewhere → play, and
  across pause → play (no click); the line takes exactly the positions
  it should and never the old one. Unit tests on the position store.
  Rust tests for a start inside the table at 100 % and 50 %, inside a
  looping portion, and on a bar line.

## 2. "Count in is happening for songs whether it's enabled or not"

The transport's Count-in switch is off in his screenshot and the song
counts in anyway. Find the two (or three) things that can count a song
in — the transport's switch (`warmupBeats` / `armCountIn`), the song's
own `countInBars` in its mix setting (W13/W18), W34's new `count_in`
gain — and make the ONE switch the player can see decide it: off means
the song starts on the press, on means it counts in (one bar of the
song's meter at the song's tempo at the playhead). If the song's own
per-song count-in setting still exists somewhere in More, it and the
transport's switch must be the same setting, not two.

## 3. "The 'drums' layer in a song i'm playing sounds AWFUL, the click sounds very good tho"

W28 routes a file's percussion track to Jam's RECORDED kit (its default
"A"), everything else to the small General MIDI synth. At 161 BPM metal
— double kick sixteenths, blast-adjacent snare, china, splashes, a full
tom run — that is probably wrong in several ways at once. Find out
which, with his actual song:
- His file is in the app's own library (`%APPDATA%\com.yames.metronome`,
  `songs.json` and what it points at). **Read-only**: copy the file
  into a git-excluded folder in your worktree; never write anything
  there, never commit the file (it is somebody's transcription).
- Dump what the percussion track actually contains (which GM /
  articulation numbers, how many of each, velocities, the fastest
  inter-onset interval per voice) and what W28's mapping does with each:
  what collapses onto one kit voice, what is dropped, what lands on the
  wrong drum.
- Likely faults to confirm or rule out: many distinct cymbals and toms
  collapsing onto one or two samples; one sample re-triggered 10+ times
  a second with no round-robin and no velocity layers (machine gun);
  every hit at one velocity; choke groups missing (open hat ringing
  through closed, crash never decaying); the kit (Studio / Club) being
  wrong for the style; `hold_the_band_down` trimming a dense arrangement
  by 11 dB and wrecking the balance against the guitars.
- Fix what is a BUG (wrong mapping, dropped notes, missing chokes,
  velocity ignored). For what is TASTE, the owner's ear decides: render
  the same sixteen bars of HIS song three ways — today's, the repaired
  recorded kit, and the file's drums through the synth — as MP3s in a
  git-excluded folder, and add a per-song choice in More, beside the
  drums' fader: "Drums: Yames' kit / the file's own", so he can flip it
  while the song plays. Default to whichever measures better on his
  song (say how you measured) and say it is a guess.
- The click is sacred, and he likes it: do not touch it.

## Gates

Per item before you commit it: `npm run build`, `npm run test`, the
relevant layout specs; at the end the full `npm run test:layout`
(`--workers=2`), `npm run test:rust` (via `node scripts/rust-test.mjs`,
`CARGO_TARGET_DIR=C:\yt-w37`, `--no-default-features`), `test:dsp`,
`test:highbpm`, `test:pitch`. The jitter probe is NOT a gate on this
machine today: the owner's app holds the sound device and the result is
noise (W34 measured the baseline failing the same way); do not run it,
say so, and list exactly what changed on or near the callback so the
orchestrator can run it when the machine is quiet. Offline renders make
no sound. Change no volume or mute setting.

## Rules

`git checkout -B songs-w37-one-place-in-the-song songs-v1` first; MSVC
override; `node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs` (read-only copy; verify
`@coderline/alphatab`); never push, never merge, never start the app;
explicit `git add` paths; no line-ending-only changes staged; strings
in all 15 locales at the END of their namespace; nothing the app says
names a tab site; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Keep
`enableLazyLoading` off, keep the render effect keyed on `score.id`,
keep W36's "a click is believed at once" — item 1 must make that the
rule everywhere, not undo it.

## Report

For item 1: every place a position lived and what is left. For item 2:
what was counting the song in. For item 3: the table of what his drum
track contains and what happened to each voice, what was a bug, the
three clips' absolute paths, the default and how you measured. Every
gate's real number; what touched the callback; final commit; worktree
path.
