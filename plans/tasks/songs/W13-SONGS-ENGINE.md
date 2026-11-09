# W13 — Songs meets the engine: the file's band, the real tempo, the exact cursor

Branch `songs-w13-songs-engine`, from `songs-v1` as it stands (it must
contain `merge(songs-w9-engine)`). Size M–L. TypeScript, plus one small
Rust change in item 5. W9's report is your spec for the engine side; its
IPC types are reproduced in `src-tauri/src/song.rs`'s and `commands.rs`'s
doc comments — read those, and the AGENTS.md note on the two schedulers.
**W12 is building the review at the same time** in
`src/containers/songs/review/**`, `src/songs/attempt.ts`,
`src/songs/verdict.ts` and a `useSongAttempt` hook: stay out of those, and
keep your edits to `useSongsSession.ts` and `SongsView.tsx` tight so the
two branches merge.

1. **The importer speaks the engine's language.** `src/songs/import.ts`
   gains `buildTransport(score, range, { loops, tempoPercent, countInBars
   })` → `SongTransport` and `buildBacking(file, chosenTrackIndex)` →
   `SongBacking`: every OTHER track, given a role — percussion tracks are
   `drums` (General MIDI numbers straight through), bass-clef or
   bass-tuned or GM-program-32–39 tracks are `bass`, keyboard and organ
   programs are `keys`, everything else is left out and named in the
   result so the UI can say so. The player's own track is never in the
   backing. Types in `src/songs/types.ts` exactly as W9 wrote them; vitest
   over alphaTex fixtures with a drum track, a bass track and a 7/8 bar.
2. **Play means the song.** `ipc.ts` gains `loadSong`, `clearSong`,
   `setSongRange`, `setSongMix`; `BeatEvent` gains `songBar`, `songTick`,
   `songPass`, `songCountIn`. `useSongsSession` loads the song when one is
   opened or its range/tempo changes and clears it on leaving the mode;
   `song-dropped` (device change, a jam started) reloads or says so
   plainly. `droppedNotes` is shown once, quietly ("12 notes in this file
   are for instruments the band does not have").
3. **The cursor is exact.** W4's cursor derives position from the beat
   count, which assumes one tempo and one meter. Drive it from
   `songBar`/`songTick`; during the count-in show the count, not a cursor.
   The scorer's beat axis is quarters from the range start:
   `(songTick − bars[range.startBar].startTick) / 960`. Never use
   `BeatEvent.beat` for position in Songs — in 7/8 it counts eighths.
4. **The band has faders.** Click / drums / bass / keys on the stage
   (`JAM_UX_DECISIONS.md` A13: what you change while playing lives on the
   stage), mute per lane, only the lanes the file has. Defaults are W9's
   (`click 0.45`). Persist per song. A count-in choice (0/1/2 bars) beside
   the range controls.
5. **Pitch across a tempo step** (W10's finding): `analyze_take_pitch`
   takes one `bpm`. Give it the transport's tempo map for the range
   instead, so `expected_at_ms` is right after a step (Rust:
   `commands.rs` only, reuse `score::BeatMap` or W9's map; keep the old
   field working for one release).
6. Layout tests for the faders and the count-in at the minimum window size,
   all 13 themes; strings in 15 locales.

## Gates

build, vitest, layout, `npm run test:rust` for item 5.

## Not yours

`engine.rs`, `song.rs`, `timing.rs`, the review, the blocks.
