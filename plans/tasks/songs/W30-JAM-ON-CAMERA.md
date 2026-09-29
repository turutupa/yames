# W30 — Record yourself jamming: the picture, and everything the computer plays

Branch `songs-w30-jam-on-camera`, from `songs-v1` as it stands (it must
contain `merge(songs-w29-stage-is-the-tab)`). Size L. In priority
order, one commit per item, stop cleanly at a boundary.

**The owner, 2026-09-21, going to bed:** "you think you could include
video recording (and audio of course) for jam sessions too? I think
this would be a killer feature … for making a recording of the app, and
sharing on social media, but also cause folks can record themselves
jamming … (in fact, i already wanted to record myself tonight to share
with a friend). The video recorder, specially for jam, should record
everything as it comes out from the pc ideally, cause im using guitar
effects and distortion and stuff with plugins to play on top of the
drums and keys and bass and it sounds really cool."

This reverses `plans/SONGS.md` A9 ("camera in, Songs only") on the
owner's word: record that in SONGS.md as a decision, with his sentence.

Read first: `plans/SONGS.md` A8–A10 and K3, W21's and W25's briefs and
merge commits (`plans/tasks/songs/W21-CAMERA.md`, `W25-CAMERA-2.md`;
everything they say about raw-byte IPC, testing without a camera, the
microphone, uploads and `crossOrigin="anonymous"` still holds),
`src-tauri/src/take.rs`, `take_video.rs`, `camera_permission.rs`,
`src/songs/camera/**`, `src/containers/songs/camera/**`,
`src/containers/jam/**` (takes: `useJamTakes`, the takes section of the
setup sheet), `plans/JAM_MODE.md`, `AGENTS.md` on the callback.

## 1. The sound of a take can be "everything the computer plays"

This is the heart of it and the part that is new. His guitar goes
through an amp-simulator plugin in ANOTHER program; what he hears is
that program's output plus Yames' band, mixed by the operating system.
Yames' own take records its input and its own mix — it has never heard
his distorted guitar. He wants the recording to sound like the room
sounded.

- **A take gets a sound source**, chosen where takes are switched on
  (Jam's setup sheet, and Songs' take control — the machinery is
  shared, so is this): **"Yames and my input"** (today's behaviour, the
  default) or **"Everything this computer plays"**.
- **Windows first** (it is where he jams): WASAPI loopback. cpal 0.15
  opens a render endpoint as an input stream for exactly this — confirm
  in its source, do not assume; if it cannot, the `wasapi` crate can.
  Capture the DEFAULT output device's loopback, or the output Yames is
  set to play through if that is what he hears — think about which one
  is right when they differ (his plugin host plays to the system
  default; Yames may be pointed elsewhere) and say what you chose. The
  loopback already CONTAINS Yames' band and click, so in this mode the
  take does not also add Yames' internal mix (no doubling, no comb
  filter). The dry stem (A8) has nothing to be in this mode: omit it
  and make the review say pitch checking needs the other source.
- **Linux:** the PulseAudio / PipeWire monitor of the default sink, if
  cpal's ALSA host can open it; otherwise say so honestly in the UI.
- **macOS:** look up what is current — ScreenCaptureKit audio capture
  (13+) and Core Audio process taps (14.2+), each with its own
  permission prompt. Nobody here has a Mac to test on and the owner is
  losing his: if you can implement one so that it COMPILES in CI and
  fails safe, do; if not, the option is absent on a Mac with one honest
  sentence, and the research goes in the report. Do not ship a path
  that has never run as if it worked.
- **Off the audio callback.** The loopback is its own input stream on
  its own callback, pushing into a pre-allocated `TakeRing` like the
  input does; the writer thread drains it. Nothing new on the OUTPUT
  callback. Sample rate and channel count of the loopback are whatever
  the device mix format is: resample/remix on the writer thread, never
  in a callback.
- **It records whatever is playing** — a video call, a notification, a
  song in a browser. So: off by default, chosen per machine not per
  jam, a plain sentence where it is switched on ("records everything
  this computer plays, not only Yames"), and the recording indicator
  says which source is live for the whole length of the take. Nothing
  is uploaded, ever; that does not change.
- Level: loopback arrives at whatever the system volume makes it.
  Record it untouched (do not normalise a take behind his back), show a
  meter while armed so silence or clipping is visible before he plays.

## 2. The camera comes to Jam

Reuse, do not fork: move what Songs' camera needs to share out of
`src/songs/camera` / `src/containers/songs/camera` into a neutral home
(`src/takes/camera` or similar) with Songs importing from there;
behaviour in Songs must not change (its layout and unit tests are the
gate). Then in Jam: the camera switch beside the take switch, the
corner preview on the stage that does not cover the chord, the bar
grid, Stop or Count-in at any supported window size (layout tests at
480, 1100, 1440 in Ember, Ivory, Manuscript), picture recorded with the
take exactly as W21 does it (raw bytes to Rust, thumbnail at the first
downbeat, deleted with the take), the macOS camera permission path W21
wrote, `R` / `C` and the footswitch actions view-aware in Jam too, with
their Settings descriptions true in all 15 locales.

## 3. Watching a jam back, and saving it as a video

- **Jam's takes list** gets what Songs' got in W25: thumbnail, date,
  length, vibe · key · tempo, "with picture" filter, inside the 320 px
  menu cap.
- **Playback**: the picture with the jam's own timeline under it — the
  bar grid with the playing bar lit, the NOW chord large, what is
  coming next — driven from the take's recorded transport
  (`TakePosition`), not from a guess. Picture-to-sound offset: W21's
  `offset.ts` handles the input path; the loopback has a DIFFERENT
  latency (it is post-mix, so it is late by the output buffer, where
  the input is early by the input buffer). Measure what the APIs report
  and store the offset with the take; K3's clap procedure is how the
  owner will check it — write the two-line instruction for doing the
  clap in loopback mode.
- **Save as a video**: W25's compositor with a Jam "tape": the picture
  (or, with no camera, a plain ground — someone without a camera still
  gets a video of the chords going by, which is "a recording of the
  app"), the scrolling bar grid with the chord names, the NOW chord,
  vibe · key · tempo, the Yames mark top right (same switch, same
  default), 16:9 or 9:16, whole take or chosen bars / choruses, real
  time with progress and cancel, mp4 where the webview can and WebM
  otherwise with the same honest sentence, then W25's share row (show
  in folder; the four upload pages; nothing uploaded by the app). The
  sound in the file is the take's sound — in loopback mode that is
  everything he heard, which is the point.
- The compositor and the jam playback view load lazily; report the main
  bundle before and after.

## 4. Words

All 15 locales, appended at the END of their namespace, plural forms
where a string counts, musician's words ("everything this computer
plays", never "loopback", "WASAPI", "system audio capture").

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`),
`npm run test:rust` (via `node scripts/rust-test.mjs` only,
`CARGO_TARGET_DIR=C:\yt-w30`, `--no-default-features`), `test:dsp`,
`test:highbpm`, `test:pitch`. The jitter probe with a jam playing AND a
loopback take recording: click p99 no worse than without, zero
allocations and frees on the output callback, zero dropped beats, and
the loopback ring's `dropped()` at zero. A Rust test that feeds a
synthetic loopback stream at 44.1 kHz stereo and at 48 kHz 5.1 into the
writer and gets a correct-length, correctly-pitched stereo file. You
cannot hear: the offline proof that the loopback path records what was
played is a test that plays a known tone through the output and finds
it in the captured file on THIS Windows machine — if the CI/Windows
sandbox gives you no audio device, say so and say what you proved
instead.

## Rules

`git checkout -B songs-w30-jam-on-camera songs-v1` first;
`rustup override set stable-x86_64-pc-windows-msvc`; `node_modules` by
robocopy **from PowerShell** from `C:\Users\alber\Dev\yames-songs`
(verify `@coderline/alphatab`); never push, never merge, **never start
the app** (no `tauri dev`: it shares the owner's real settings store,
and he is asleep next to this machine — make no sound through the
speakers at more than a whisper and for no longer than a test needs;
prefer a null/virtual device where one exists); the webview never opens
the microphone and never captures system audio itself — capture is
Rust's; explicit `git add` paths; do not stage line-ending-only
changes; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Another worker
(W28) is in `song.rs`, `songEngine.ts`, `useSongEngine.ts`,
`SongBand.tsx` and `buildBacking`, and is adding a synth thread and a
seek to the engine: stay out of those files; you own `take.rs`,
`take_video.rs`, the camera modules and Jam's views. If you must touch
`engine.rs`, keep it to a few lines and list them.

## Report

Which device the loopback captures and why; what each OS can do today
and what you verified versus only compiled; the latency/offset story
and the clap instruction; bundle sizes; every gate's real number; final
commit; worktree path; and a five-line "try it" for the owner's
morning: where the switch is, what to press, where the video lands.
