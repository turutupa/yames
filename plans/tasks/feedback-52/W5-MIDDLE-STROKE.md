# W5 — the middle of the bar is a stroke, not a volume

Worktree `C:\Users\alber\Dev\yames\.claude\worktrees\feedback-52-w5`, branch
`feedback-52-w5-middle-stroke` from `jam-v6` at 698afe0. Read the shared
BRIEF, then this file whole, then `plans/CLICK_ACCENTS.md`, then
`scripts/sounds/render_click.py` whole (the generator of record for the
recorded click files: its RECIPE table, the mono fold, the tanh stage, the
TPDF dither and the zero-landing in `_write`, and the header's "a hard
stroke is quieter"), `scripts/sounds/rebuild.py` (the synthesised files),
`generate_sounds.py` (`gen_click`, `gen_beep`, `gen_drum` — the original
recipes for click, beep and drum), `scripts/sounds/render_kit.py` (the
shared library: `SfzSource`, `render_take`, `dc_block`, `trim_and_fade`),
and in `src-tauri/src/engine.rs`: the `include_bytes!` block, `SoundId`,
`SoundBank` and `SoundBank::new` (how `drum_accent` is assembled at bank
build), `SoundKit` with `high_id` / `low_id` / `ALL`, `AccentLevel` and
`MEDIUM_GAIN`, the tier pick in the callback (the "ONE SOUND, TWO VOLUMES"
comment — this brief overturns it), and every test under `mod tests` that
walks `SoundKit::ALL` or names a bank field (`every_accent_is_louder_…`,
`every_medium_accent_sits_between_…`, `every_kit_has_two_buffers_…`,
`no_sample_ends_mid_decay`, `the_snare_kit_is_not_quieter_…`,
`drum_accent_leaves_headroom`). Then `src-tauri/src/jam.rs` where the
count-in uses `SoundId::SticksLow` — its bytes must not change.

## Why
W3 gave the bar a middle by playing the accent click at 80 %. The owner
listened and heard nothing, and was right: the same click 2 dB quieter is
below what a musician notices on a transient. A real metronome marks the
three levels with three SOUNDS — high, mid, low — because pitch and timbre
are what the ear separates, not a few decibels. The owner's words: "this
is very important to get right because it shows our music knowledge …
highest standards of audio quality too." Every preset ships a third file:
a middle stroke of the same instrument, recognisably the same family as
the downbeat, audibly between it and the plain beat in weight AND
different from both in timbre or pitch.

## The three strokes, per preset (decided)
The downbeat (`<kit>_high`) and the plain beat (`<kit>_low`) keep their
bytes — the jam count-in plays `sticks_low`, and every kit the owner has
already heard stays what it was. Only cowbell's beat may change (below).
The new file is `<kit>_mid.wav`, 44 100 Hz, 16-bit mono, peak **0.93**
(between the accent's 0.97 and the beat's 0.90 — a peak in the file, not
a gain in the engine), TPDF-dithered, DC-blocked, first and last sample
zero, no round robins, cut with the same machinery as its siblings.

| preset | downbeat (as is) | **middle (new)** | beat (as is) | why this stroke |
|---|---|---|---|---|
| click (synth) | 1200 Hz | a sine click between the two, **~980 Hz** (the geometric mean; adjust by ear so the three read as a clear high–mid–low), same generator, ~22 ms | 800 Hz | a three-pitch click is the classic mechanical metronome |
| beep (synth) | 880 Hz | a beep between, **~760 Hz**, ~37 ms, same envelope | 660 Hz | as above |
| sticks | stick-shot vl6 | **the same stick-shot at a softer velocity (vl3 or vl4)** — same drum, softer stroke | cross-stick vl14 | a drummer's secondary accent is the same stroke played lighter; the cross-stick beat stays a different stroke |
| wood | high block vl6 | **the high block at vl3–vl4** — same block, softer | low block vl6 | pitch keeps it off the beat, weight keeps it under the downbeat |
| snare | studio layer 4, drive 1.5 | **studio layer 3** (or 2 — measure; loudness order is NOT layer order, see the render header), with its own drive so it lands between | layer 1 | same drum, a mezzo-forte stroke |
| kit | kick 0.70 + snare L4 | **snare layer 3 alone, no kick** | closed hat L1 | 6/8 on a kit is kick on one, snare on four, hats between — the middle is the backbeat |
| drum (synth) | kick + hat + crash + body (built at bank build) | **the kick alone: `drum_high` + `drum_body` through the same tanh stage, no crash, no metal** — built at bank build exactly as `drum_accent` is, as `SoundId::DrumMid` | noise snare | the cymbal is what says "one"; the bare kick says "four" |
| cowbell | v3 (hardest) | **v2** — today's beat file, re-cut at the 0.93 peak | **v1**, the fingertip tap, re-cut and gained to the 0.90 peak with drive if needed | three dynamics exist and three strokes are needed; the beat becomes the genuinely soft one. If v1 cannot be made to read as a beat (too dull to keep time to at practice volume — judge on the A/B page and by the band measure), fall back to: middle = v3 with a darker mic blend (no close mic) at 0.93, beat = v2 unchanged, and say so |

## The engine
- `SoundBank` gains eight buffers (seven files + `drum_mid` built at bank
  build); `SoundId` gains the variants; `SoundKit::mid_id()` beside
  `high_id()` / `low_id()`; one `include_bytes!` const per new file with
  the same kind of doc comment its siblings carry (source, layer, licence).
- The callback's accent branch splits: Strong → `high_id()` at 1.0 ×
  volume; Medium → `mid_id()` at `MEDIUM_GAIN` × volume, where
  `MEDIUM_GAIN` becomes **1.0** (the level now lives in the file's peak;
  keep the constant so a tuning stays one line, and rewrite its rationale
  comment). Both uncapped, as today. Beat and sub-tick untouched.
- Remove the "ONE SOUND, TWO VOLUMES … without shipping a third sample"
  comment and replace it with why there are three files.
- No allocation, no locks, nothing new in the callback beyond a second id
  lookup that already exists for the other tiers.

## Gates that are new (add them, in Rust tests walking `SoundKit::ALL`)
1. **Ordering through the laptop band**: strong > mid > beat, with the
   mid **at least 2.0 dB** from each — raise the W3 floors (1.0 / 1.5),
   because these are different files now and the ear gets timbre as well.
2. **Different sounds**: for every kit the mid's spectral centroid (or a
   simpler proxy: band energy ratio 200 Hz–1 kHz vs 1–4 kHz) differs from
   BOTH siblings by a margin you state and justify — the point is that a
   mid is never a scaled copy of a sibling. For snare and sticks, where the
   mid is the same drum played softer, the timbre difference is real but
   smaller; set the margin per kit if you must, and print the table.
3. **Transient alignment**: the onset (first sample above −30 dBFS relative
   to the file's own peak) of the three files of a kit lies within
   **0.5 ms** of one another and within 1 ms of sample 0. A middle stroke
   whose attack lands later than the downbeat's flams; a metronome cannot.
4. **Every kit has three buffers, none clips** (extend
   `every_kit_has_two_buffers_…`: ceiling 0.98 after resampling, floor
   0.5), **no sample ends mid-decay** (extend the hard-coded array), the
   fallback kit has a mid.
5. **Bytes unchanged**: a test that `sticks_low`, and every `_high` and
   `_low` other than cowbell's, hash to what they hash to today (record
   the hashes in the test with a comment saying why they are pinned).

## The listening page and the files for the owner
- `scripts/sounds/ab_click.html`, served the way `ab.html` is (say how):
  every preset in menu order, a row of three buttons (downbeat / middle /
  beat) and a **bar player** that loops 6/8 as 3+3, 4/4 and 7/8 as 3+2+2 at
  a chosen tempo with the engine's exact gains (1.0 / MEDIUM_GAIN / 0.65),
  so the owner can hear each preset as the app will play it. Web Audio,
  files fetched from `src-tauri/sounds/`.
- Also render, with a small script under `scripts/sounds/`, one WAV per
  preset of two bars of 6/8 at the engine's gains into
  `C:\Users\alber\AppData\Local\Temp\claude\C--Users-alber-Dev-yames\c91391ca-5187-4311-ba2c-30e326a5256c\scratchpad\listen-w5\`
  (eight files, `6-8_<kit>.wav`), so the orchestrator can send them to the
  owner without a browser.

## Generators and docs
- `render_click.py`: the RECIPE gains the seven `_mid` rows (and cowbell's
  `_low` change); the header and "all ten" strings say fifteen; the report
  loop prints the mid column; `--measure` covers it.
- `rebuild.py` / `generate_sounds.py`: `click_mid` and `beep_mid` are
  synthesised where their siblings are and transformed where their
  siblings are (DC block, tail fade), or the header explains why not.
- `src-tauri/sounds/KITS.md` gains a short "Click presets" section: the
  fifteen files, their sources, layers and licences (Virtuosity CC0,
  DRSKit CC BY 4.0) — today that lives only in a docstring.
- `plans/CLICK_ACCENTS.md`: Part 1 is revised — "the medium sound is the
  accent click, quieter" was tried, heard, and rejected by the owner; the
  decision is three strokes; record the table above and the per-kit
  numbers.

## Gates
`npm run test:rust` (MSVC runner; `LIBCLANG_PATH="C:/Program Files/LLVM/
bin"`, `CARGO_TARGET_DIR=C:/yt52`), `npm run test:dsp`, `npm run
test:highbpm`, the jitter probe `--no-llm` on a quiet machine, `npx tsc
--noEmit`, `npx vitest run` (restore the onboarding snapshot). Never start
the app. Report: per-kit table (strong / mid / beat band energy in dB,
centroid or ratio, onset ms, peak, size), the eight scratch WAVs' paths,
the cowbell decision, `MEDIUM_GAIN`, every file touched, gate counts,
and what only an ear can still judge.
