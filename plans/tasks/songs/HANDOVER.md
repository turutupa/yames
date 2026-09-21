# Songs, first night — what is on `songs-v1`, and what is yours

Written 2026-09-20 by the orchestrator, for the owner. Fourteen Opus 5
workers, fourteen branches, all merged into **`songs-v1`** (worktree
`C:\Users\alber\Dev\yames-songs`). `main` is untouched.
Every gate is green on the combined branch (numbers at the end).

**Updated the evening of 2026-09-20:** twelve more branches are in (W15 to
W27, listed under "Since the first night"), and `songs-v1` **is pushed**
(draft PR #57, where CI builds and tests it on Windows, macOS and Linux). On another machine:
`git fetch && git checkout songs-v1 && npm install && npm run tauri dev`.
`npm install` is not optional: Songs added the tab library.

**Nobody has heard or seen any of this run.** Workers may not start the
app. Everything below is proven by tests, fixtures, the layout suite and
the offline renderer — not by a guitar. The first thing to do is run it.

## After your first session (night of 2026-09-20/21)

You found four things in five minutes; all four are fixed on `songs-v1`
(`git pull`, then `npm install` — the synth is a new dependency).

1. **Play plays the song** (W28). The importer used to hand the engine only
   what Jam's band could play; a two-guitar file produced zero tracks, so you
   heard the click. Every part now sounds through a small General MIDI synth
   in the engine (rendered ahead on its own thread, never on the audio
   callback: 0 allocations, 0 dropouts in the probe). Your own part is the
   first fader, a little under the rest, with its own mute; every part has a
   fader, mute and solo (under **More**). The sounds are a 1.3 MB Apache set;
   two A/B clips are in `song-ab-clips/` — if the guitars are too cheap, the
   next step is a better set downloaded on first use (your call), and
   Settings lets you point at your own `.sf2` today.
2. **The instrument is a dropdown in the header** (W29). Switching keeps your
   bar, your loop and your speed; takes and history were already per part.
   Drum and vocal parts are listed but cannot be chosen yet.
3. **The tab gets the stage** (W29): tab-first with a "Tab / Tab + notes"
   switch, zoom, one-line header, one row of controls. 56 % -> 68 % of the
   window's height at 1440x900 (74.7 % is the ceiling), 23 % -> 63 % at the
   smallest window.
4. **Click goes there, drag loops** (W29 + W28's engine seek). Click moves
   the playhead, also while playing; drag chooses a looping portion in whole
   bars, with handles; Shift-click extends it; Esc clears it. Bars you skip
   by seeking are not scored as misses.

Yours to decide from that night: **the guide bleeds into a microphone**
through speakers (not through an interface or headphones). W28 recommends
muting the guide while a take records; it is ON for now. And band fader
levels saved before W28 return to default (the click's is kept).

## Recording, built while you slept (W30, W31, W32, W33 — all merged, all gated)

**Record a jam, with the sound you actually heard.** Jam -> Set up -> Takes ->
*Record the take*, and under it a new choice: *Yames and my input* (as before)
or **Everything this computer plays** — your guitar through its plugins, the
band and the click, as one recording. It listens only between Record and Stop
(plus 200 ms for *Check the sound*), the mark beside Play names the source for
the whole take, nothing is uploaded. Windows is verified; Linux is compiled and
never run; a Mac shows one sentence and no switch (it needs a newer audio
library than the engine sits on).
- **Your default speakers were muted at 0 % last night.** On this machine the
  mute sits before the capture point: a muted output records pure silence.
  Unmute, then *Check the sound*.
- **If your plugin host plays through ASIO, Windows cannot hear it** and neither
  can this. Then either choose your interface's own loopback input as Yames'
  input and use the ordinary source, or run the host in shared mode while
  recording. Tell me which you have.

**The picture.** *Record the picture* beside it (`C`; `R` arms the take);
*See yourself* pops a mirror out so you can check the framing; it rolls from
the count-in. **Watch it back** on a take's row: your picture with the chorus's
bar grid under it, the bar you hear lit, the chord and the next one, step by
bar, press a bar to go there, nudge the picture against the sound.

**Save as a video**, from Jam or from Songs' review: 16:9 or 9:16, the Yames
logo + "yames.app" top right (its own switch, on by default), then *Show in
folder* and links to the upload pages of Instagram, TikTok, YouTube and X. A
jam video shows the chord large, "next Bb7", a beat ring that pulses, the bar
grid, in the app's own typeface and the theme you were in — with or without a
camera. **A Songs video shows the tab you played**: real strings and fret
numbers scrolling under a fixed playhead, coloured by how each note went
(switchable: The tab / Marks only / Nothing; "show how it went" is separate).
Frames to look at without running anything: `w32-frames/`, and the clips I sent.

Still open from this work: tab under each side of "then and now" (not cheap,
left); the clap for picture-to-sound sync, once per sound source (they are off
in opposite directions); program-only capture on Windows was researched and is
not worth it. And two Jam layout bugs that predate all this: at 480x780 the
stage is 258 px taller than its room (the bar grid's fourth row is cut), and at
1100x720 Play overlaps the stage's corner. The first needs a decision about
what gives at that size.

## Try it (in this order)

```
cd C:\Users\alber\Dev\yames-songs
npm run tauri dev
```
1. **Songs** is in the rail after Jam (⌘/Ctrl+5). Import a Guitar Pro or
   MusicXML file (button or drop it on the window), pick your track.
2. Press play: the file's drums, bass and keys play through Jam's sounds,
   the cursor follows the engine, faders and a count-in are on the stage.
3. Pick a bar range, loop it, slow it down, play along, stop. **The
   review appears**: the tab coloured by how it went, one sentence from
   the coach, and a button that sets up the fix.
4. Turn takes on for the song and record a pass: the review then names
   wrong notes on single-note lines.

Without a guitar: `npm run dev`, then
`http://localhost:1420/shots.html?shot=songs-review-rushing&theme=ember&window=main`
(also `songs-review-missed`, `songs-review-clean`; any theme), and
`http://localhost:1420/blocks-gallery.html` for every coach component in
every theme.

## What was built

| | |
|---|---|
| W1, W11 scoring | The detector follows the player, not the click (16ths over a quarter click: 79 → 96). Scoring against a known score with sequence alignment: misses, extras, quiet hammer-ons forgiven, accents reported. The live path no longer throws away one sixteenth in four. |
| W2, W10 store | SQLite: sessions, every attempt at every song note by note, songs, due dates. The coach reads a preset's whole history instead of thirty sessions. |
| W3 queue | The click stops allocating and locking on the audio thread. Zero allocations, frees and dropped beats in every probe run. The callback audit is in AGENTS.md. |
| W4, W13 Songs | The mode, the importer (alphaTab reads and draws only), the file's band through the engine, the exact cursor, faders. |
| W5 pitch | Which note was played, from the dry stem a take now keeps. 100 % on synthetic and sampled fixtures. |
| W6 findings | The coach's judgement as rules: 13 kinds, ranked, one correction as the headline, each with a fix. Spaced review. |
| W7 blocks | Your generative-UI idea: a catalogue of components that carry references, never content; schema + grammar generated from it; one renderer. |
| W8 coach | Roadmap 1.5/1.6/1.7: plain words in the report, learning mode, the tempo wall, one meaning for a score, 15 unreachable template slots found. |
| W9 engine | Tempo and meter steps to the sample, looping ranges, count-in, the band from the file, Songs as an engine mode. |
| W12, W14 review | Attempt → coloured tab → verdict in blocks → action. Live note lights. Record in Songs. |

## Since the first night (W15 to W27)

| | |
|---|---|
| W15 live | The note you just played lights, per note, and a take knows which bar it opened on (the two "known gaps" about both are closed). |
| W16, W20, W24 words | Songs, the coach's sentences, the stage and the Songs hotkeys in all fourteen other languages, with the four plural forms Polish and Russian need. |
| W18 stage | **Choose a portion on the tab and it plays round and round** (drag, or hotkeys for start / end / nudge / clear). The review arrives where you were looking instead of under the fold. |
| W19 friction | A Guitar Pro file landing in Downloads is offered at once; recently played; every opened file is copied into Yames' own library; a starter shelf so the library is never empty; "open with Yames". |
| W22 polish | The tab's cursor can be seen (the tab library ships no styles; it was invisible in every theme) and follows; a promised passage opens at its bars, looping, at its speed. |
| W21, W25 camera | You watch yourself play with the verdict painted on the tape. **Save as a video** (16:9 or 9:16, mp4 where the machine can) with the scrolling marks, bar / section / tempo and **the Yames logo + "yames.app" top right** (own switch, on by default). After saving: show in folder, and links that open the upload page of Instagram, TikTok, YouTube and X. Nothing is uploaded by the app. **Then and now**: two takes of the same bars side by side, locked bar to bar. Thumbnails on takes. `R` records, `C` is the camera, both bindable to a footswitch. The review's sound follows the chosen output. |
| W24 BAR | The transport's bar readout was counting beats. |
| W26, W27 setlists | **On `main` since v1.1.0:** "after 8 bars" moved on after 8 beats, rests were counted the same way, a step that changed the meter got a one-beat stub bar, a count-in cost the next step a bar, and the drill's lit dot drifted after a grouping change. All fixed. The click's callback change is a compare and a copy into reserved space. |

**For the release notes** (W26 wrote the wording, it is in its merge): anyone
who typed 32 to get eight bars of 4/4 now gets 32 bars. Say "check your
numbers" where a skimming reader sees it.

## Yours to decide (none blocks trying it)

1. **`SONGS.md` A11 — the refractory when a free player speeds up.** The
   one real open engine question. Needs your 180 BPM capture
   (`scripts/debug-bpm.sh 180`), which is still owed.
2. **Score bands moved**: one table now drives ring, word and paragraph
   (85 / 70 / 55). 85–89 draws as top band, 50–54 as a miss.
3. **`SONGS.md` A8** — the dry stem beside each take, under the take's own
   opt-in. Built as proposed; confirm.
4. **The event loop lost its real-time promotion** (W3), on numbers taken
   with the machine at 100 % and no model on disk. Re-measure on a quiet
   machine with a model before release.
5. **Two cards changed appearance** (W14): the instrument picker's cards
   and one onboarding tile were drawing transparent because their colour
   token never existed. They now have a surface. Look at them.
6. **An error colour.** The token contract has none; three stylesheets
   fall back to a literal red.
7. **`COACH_UX.md`** — the draft of how the coach behaves. Only A3, A4, A5,
   B2 and D3 were built on; everything else waits for your reaction.
8. **Jam's default mix** (the task chip from the website work): keys sit
   ~10 dB under the drums at default faders. Still open.
9. **Opening a second copy of Yames** now hands the file to the one already
   running (W19, needed for "open with Yames"). That is a behaviour change
   for anyone who ran two windows on purpose.
10. **Linux packaging** (W19): the Guitar Pro file type, the snap's `home`
    plug, the flatpak's filesystem permission and stale manifest versions
    are listed in W19's merge and not done.
11. **"Copy file" is not in the share row** (W25): a webview cannot put a
    file on the clipboard, and doing it natively is three platform
    dependencies for one button. "Show in folder" is there instead.

## Waiting for your ear: Jam's default mix (merged so you can hear it in the app — NOT approved)

You asked for one branch to test, so `songs-w17-jam-mix` is merged as
`f3b0ccbb`. Play a jam with the bass and keys rows ON and judge it. If
you do not like it: `git revert -m 1 f3b0ccbb` — nothing else depends on
it.

Six before/after pairs were sent to you on 2026-09-20; they live in
`.claude\worktreesgent-a1b78c03f9e9ddac0\jam-mix-demos\`. The keys come up
2.2 dB as a section (to about 6 dB under the kit), and the five basses are
levelled against each other where a listener hears them (above 120 Hz):
slap +4.6 dB, synth +3.1, picked +0.9, upright −1.5. The old levelling test
measured basses in 200 Hz–4 kHz, a band a bass barely occupies. One gate
moved: keys-under-the-snare 6 dB → 5 dB. Say yes, no, or "more keys"
(`KEYS_TRIM` in `jam.rs` is the one knob).

The same worker found three things that are yours to decide:
- **A vibe tile hires drums and nobody else** (`DRUMS_ONLY` in
  `src/jam/vibes.ts`): press play on a vibe and it is a drum machine until
  the player turns the bass and keys rows on. The v1.2.0 notes promise a
  drummer, a bass player and a keyboard player. This may be a real part of
  "mostly drum sound", and no trim can fix it.
- **The disco vibe already clips** at the shipped volume (rendered peak
  1.000 before this change). The test that guards the mixer's clamp uses a
  synthetic worst case, not the real vibes.
- `scripts/sounds/band_demo.ts` renders chorus 1, which the Build
  arrangement plays a rung quieter; every listening round done through it
  heard the band held back.

## Known gaps, said plainly

- Guitar Pro 3–5 files are untested (no file to test with).
- **No camera code has met a camera.** Every camera test runs on a fake
  device. macOS will ask for camera permission the first time; that path
  has never run. Picture-to-sound sync needs the clap session (K3).
- A saved video is made in real time (a 20-second clip takes 20 seconds).
- A count-in of two or more bars between setlist steps would still cost
  a bar; the editor only ever writes one, so it cannot be reached.
- If a setlist's meter change reaches the engine more than a beat late,
  the old meter plays one more full bar first. Only plausible at extreme
  tempos on a stalled machine.
- A song does not survive an audio device change; it is reloaded once.
- The camera spike (`SONGS.md` K3) was not run: it needs you and a camera.
- `bun.lock` is stale and nothing uses it; `package-lock.json` is ignored.
  Use `npm install`. If you use `bun install`, do not commit the lockfile
  it rewrites.

## Before this goes to main

Run it. Then the manual pass, the jitter probe on a quiet machine (both
`--jam-swap --jam-move --jam-take` and `--song-loop --song-take`), and a
first launch on a copy of a real settings folder to watch the history and
song migrations run once. The store has never been opened by a live app.

## The gates, run by the orchestrator on the final branch (morning of 2026-09-21, after W33)

```
npm run build         built, tsc clean (alphaTab, the review, both video exports and jam playback are lazy)
npm run test          213 files, 5313 tests passed
npm run test:layout   250 passed
npm run test:rust     929 passed; 0 failed; 2 ignored
npm run test:dsp      1 passed
npm run test:highbpm  3 passed  (raw-onset, played-rhythm and known-score layers)
npm run test:pitch    8 passed
jitter probe          jam + a take of everything the computer plays: p99 0.43 ms, 0 allocations, 0 frees, 0 missed
```
`songs-v1` is 80 commits and +53 829 / −673 lines across 285 files ahead of
`main`. That is a lot to review in one sitting: the merge commits are one
per worker and each says what it is and what was checked, so
`git log --merges main..songs-v1` is the table of contents.
