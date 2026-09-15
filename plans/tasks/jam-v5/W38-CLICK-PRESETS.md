# W38 — the metronome's presets, recorded where recording wins

Branch `jam-v5-w38-click-presets` from `jam-v5`. Read the metronome's
sound path first: `SoundKit`, `SoundId`, `SoundBank::new` and the
`drum_accent` build in `src-tauri/src/engine.rs`; the loudness test
`laptop_band_energy` and the accent-versus-beat floor; `BEAT_GAIN` and
`SUB_GAIN`; how `sound_type` reaches the engine (`commands.rs`,
`state.rs`); the sound chip and menu in `src/containers/main-window/
MainHeader.tsx`; `scripts/sounds/rebuild.py` (the generator of record for
the click files) and `render_kit.py` (the recorded path). Then the
owner's decision, 2026-09-14: keep Click, Beep and Drum as they are;
replace Wood and Snare with recordings under the same ids; add Sticks and
Cowbell; add Kit, a recorded alternative to Drum, so the owner can compare
by ear.

## The files
Rendered by a recipe for `render_kit.py` (or a small `render_click.py`
sharing its code) from the libraries on this machine, all CC0:
- **Wood** (`wood_high.wav`, `wood_low.wav`): Virtuosity `woodblock_high`
  for the accent, `woodblock_low` for the beat.
- **Snare** (`snare_high.wav`, `snare_low.wav`): the Studio kit's snare,
  hardest layer for the accent, softest for the beat (from
  `src-tauri/sounds/kits/studio/`, already rendered; a click file is a
  mono fold of it).
- **Sticks** (`sticks_high.wav`, `sticks_low.wav`): Virtuosity's snare
  stick-shot for the accent and cross-stick for the beat.
- **Cowbell** (`cowbell_high.wav`, `cowbell_low.wav`): Virtuosity cowbell,
  hard and soft layers.
- **Kit** (`kit_high.wav`, `kit_low.wav`): Studio kick plus hard snare
  summed for the accent (through the same tanh stage `drum_accent` uses,
  at bank build or at render — pick one and say why), closed hat for the
  beat.
Format as the click files are today: mono, 44 100 Hz, 16-bit, ends on
zero, no round robins, no drift — a metronome is a machine. Peaks: the
accent may reach 0.97 like `drum_accent`, the beat 0.90. Every pair must
pass the accent-versus-beat floor through the laptop band at `BEAT_GAIN`,
and the subdivision (the beat file at `SUB_GAIN`) must still read. The
old synthesised `wood_*` and `snare_*` are replaced in place;
`rebuild.py` stops claiming them (say so in its header) and the recipe
becomes their generator of record. Under one megabyte for all ten files.

## The engine and the screen
- `SoundKit` gains `Sticks`, `Cowbell`, `Kit` with ids `"sticks"`,
  `"cowbell"`, `"kit"`; `SoundId` and `SoundBank` gain the six buffers;
  the loudness test covers every kit; `from_str` still falls to Click.
- The sound menu lists them in this order: Click, Sticks, Wood, Beep,
  Drum, Kit, Snare, Cowbell. Locale keys for the three new names in all
  fifteen files (a cowbell is a *cencerro*, a *Kuhglocke*; sticks are
  *baquetas*, *Sticks*).
- The jam's count-in "sticks" sound (`JamCountInSound::Sticks`) plays the
  new sticks files rather than the kit's rim, so the count-off and the
  Sticks preset are the same sound.

## Gates
`npm run test:rust` (MSVC runner), dsp, highbpm, the probe `--no-llm`
plain (the click path is what changed), `npx tsc --noEmit`, `npx vitest
run`. The click's timing is sacred: no change to scheduling, only to
buffers. Report the per-preset loudness numbers through the laptop band,
sizes, and anything in the sources that did not fit.
