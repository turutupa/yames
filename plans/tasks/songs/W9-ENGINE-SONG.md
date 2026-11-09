# W9 — The engine plays a song: a tempo map, a range, and the band from the file

Branch `songs-w9-engine`, from `songs-v1` as it stands now (W3's beat queue
is merged: read the AGENTS.md section **"What in the output callback must
not be touched"** before anything else, it is the law for this task).
Size L. `plans/SONGS.md` A1, A4, A6. Rust only: `engine.rs`, `jam.rs` if it
helps, a new `src-tauri/src/song.rs`, `lib.rs`/`commands.rs` registration.

## Why

A song's tempo and meter change, the player wants bars 17–24 at 70 %, and
they want to play over the song's own rhythm section. The owner's call on
backing (2026-09-20): through the engine if that is better, not critical.
It is better: the engine's clock is the one scoring trusts, and Jam's
sampled kit and bass are already in it.

## Contract addendum (fixed; W4's importer will be extended to produce it)

```ts
export type SongTransport = {
  ticksPerQuarter: 960;
  tempoMap: { tick: number; bpm: number }[];      // steps, on bar lines
  bars: { startTick: number; lengthTicks: number; numerator: number; denominator: number }[]; // unrolled
  range: { startBar: number; endBar: number };    // inclusive, played bars
  loops: boolean;
  tempoPercent: number;                           // 25..=100
  countInBars: number;                            // 0..=2, at the range's first tempo and meter
};
export type SongBacking = {
  tracks: { role: "drums" | "bass" | "keys"; name: string;
            notes: { tick: number; durTicks: number; midi: number; velocity: number }[] }[];
};
```
Drums arrive as General MIDI percussion numbers (what Guitar Pro writes);
map them onto the kit's voices (kick 35/36, snare 38/40, rim 37, closed hat
42, pedal 44, open 46, toms 41–50 to the kit's two or three, ride 51/59,
bell 53, crash 49/57, plus the percussion set where it has the voice;
anything else is dropped and counted). Bass and keys go through the
melodic banks in `voices.rs`, clamped to each bank's range by octave.

## Deliverable

- `load_song(transport, backing | null)`, `clear_song()`,
  `set_song_range(range, loops, tempoPercent)`, `set_song_mix({click,
  drums, bass, keys})`. Compiled on the command thread into a preallocated,
  sample-indexed table and handed to the callback through the same
  generation-counter hand-off and retirement path the jam table uses.
  Nothing allocates, locks or frees in the callback.
- The click follows the map: accents from each bar's meter (reuse the beat
  group machinery where a meter maps to it), tempo steps exactly on the bar
  line, `tempoPercent` applied to everything.
- The beat notification carries where the song is — played bar index and
  tick — using fields the `BeatQueue` can pack (extend it with care and
  extend `the_small_fields_survive_the_round_trip` with it). The tab's
  cursor and the scorer's schedule both hang off this.
- A loop jumps on the bar line with no dropped beat and no voice cut short
  (let ringing notes ring across the seam); a count-in plays before the
  first pass only.
- Songs is its own engine mode beside the metronome, the drill and the jam:
  starting one stops the others cleanly, and a take can be recorded over a
  song exactly as over a jam (`take.rs` must not need to know).

## Gates

An offline render test in the manner of `render_band_demos`: a twelve-bar
song with a 7/8 bar, a tempo step at bar 5 and a loop of bars 3–6 twice;
assert the sample position of every click and every backing onset against
the map, across the step and across the seam, to within one sample; at
50 % and at 100 %. The probe with a song playing, looping and a take
recording: zero allocations, zero frees, zero dropped notifications
(numbers for jitter will be noisy tonight, other workers are compiling;
report them and say what was running). `npm run test:rust`, `test:dsp`,
`test:highbpm`. Wall-clock tests in `kit.rs` and `take.rs` are known to
fail under tonight's load: re-run them alone and report both results.

## Not yours

`timing.rs`, `onset.rs`, `db.rs`, anything in `src/`. IPC types for the
frontend go in your report, not in `src/ipc.ts`: the review wave wires it.
