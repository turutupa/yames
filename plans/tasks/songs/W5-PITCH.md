# W5 — Pitch: which note was that

Branch `songs-w5-pitch`. Size L. Roadmap §7 item 2.7 step A only
(monophonic), `LEARNING_PATHS_DECISIONS.md` C2, `SONGS.md` A8 and spike
K2. Timing tells the coach WHEN; this tells it WHAT, which is the
difference between "you were late" and "you played the wrong note".

## Deliverable

- `src-tauri/src/pitch.rs`: a monophonic tracker over a finished buffer
  (never the audio thread, never live in this wave). pYIN-class:
  YIN difference function with cumulative mean normalisation, parabolic
  interpolation, a voicing decision, and a small HMM or median smoothing
  across frames so octave errors do not flicker. Guitar and bass range
  (B0 ~31 Hz for a five-string bass up to ~1.3 kHz). Output note events:
  `{ start_ms, end_ms, midi (float, so cents survive), confidence }`.
  Pure Rust, no new heavyweight dependency (an FFT crate already in the
  tree is fine; check `Cargo.lock` before adding one).
- Note segmentation that uses the onset detector's onsets when given
  them, so a repeated note at the same pitch is two notes, not one.
- `match_notes(events, score_notes_in_range) -> per-note { expected_midi,
  heard_midi, cents_off, state: right | wrong | octave | unheard }`,
  aligned by the onset results W1 produces (take them as input; do not
  redo alignment). Chords in the score are skipped and reported as
  `notAssessed` — the first release is honest that it checks single-note
  lines only (`SONGS.md` S0.5).
- **The dry stem (A8).** A take today is the player and the band already
  mixed. In `take.rs`, the writer thread also writes the dry input as a
  second file beside the mix (same opt-in, listed and deleted together
  with its take, never uploaded, never analysed unless the player asks).
  Do not touch the rings or the callback side; the two streams already
  arrive separately at the writer.
- A bin `pitch-inspect <wav>` printing the note list, for eyeballing.

## Fixtures and gates

No real guitar recording exists in the repo and you must not read the
owner's data directory. Build fixtures you can defend: Karplus–Strong
plucked strings with inharmonicity and a decaying noise burst at the
attack, plus the sampled bass voices under `src-tauri/sounds/voices`
(real recorded notes with known MIDI numbers in their file names — the
best ground truth in the tree). In `src-tauri/tests/pitch_fixtures`:
a two-octave scale run, the same run with one wrong note and one omitted,
a run detuned 30 cents, a low-E bass line, 16ths at 160 BPM, and the run
with the click bleeding in at −20 dB. Gates: ≥ 97 % of notes within 50
cents on clean fixtures, ≥ 90 % with bleed, zero octave errors on the
sampled bass, the wrong note identified as that note, ≤ 3 s for a 30 s
buffer in release. Report the numbers, not just pass/fail.

## Not yours

`timing.rs`, `onset.rs`, `engine.rs`, the UI. Polyphonic pitch is a later
phase; do not start it.
