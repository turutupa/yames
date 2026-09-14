# W33 — recorded bass and keys

Branch `jam-v4-w33-sound-voices` from `jam-v4`. Read the shared BRIEF's
contract (the melodic bank format), `plans/JAM_KILLER.md` §2 A2,
`scripts/sounds/render_kit.py` and its recipes, `src-tauri/sounds/KITS.md`.
Area per the BRIEF's table.

## The sources (all CC0, Karoryfer Samples and jlearman), on this machine
under `C:\Users\alber\Dev\_samples\` once the owner's download approval
has landed — the orchestrator tells you the folders:
- **Black And Blue Basses**: a black hollowbody played with the fingers and
  a blue solidbody played with a pick → `bass_fingered`, `bass_picked`.
- **Meatbass**: a double bass, pizzicato → `bass_upright`.
- A Karoryfer bass with a slap articulation → `bass_slap`; if none of the
  free ones has one, say so and skip it (the synthesised slap stays).
- **jRhodes3** (`sfzinstruments/jlearman.jRhodes3c`): a 1977 Rhodes Mark
  I, five velocity layers, every fourth white key → `epiano`.

## The tool
Grow `render_kit.py` (or add `render_voice.py` beside it sharing its
code) for melodic SFZ instruments: read the regions (`sample`, `lokey`/
`hikey`/`pitch_keycenter`, `lovel`/`hivel`, `seq_position`), choose the
sampled notes to keep (every note the source has within the range the
band uses: bass MIDI 28–60, keys 48–84; where the source samples every
few keys, keep those and let the engine build between), three layers by
loudness steps of 5–6 dB (five for the Rhodes if the source has them and
the size allows), two round robins where the source has them, mix to
mono, 48 kHz, trim (start on zero, end at the cap or the tail's floor,
4 s cap, fade), peak 0.90, `trim_db` measured so each voice sits where the
synthesised one sat through the small-speaker band-pass (report both),
`release_ms` set from the source's own release. Write the folder and
`voice.json`. Sizes: aim 4–8 MB per bass voice, ≤ 12 MB for the Rhodes;
report every figure.

## Also
`measure_kits.py` learns `sounds/voices/*` (peak, DC, zero ends, caps,
manifest consistency); `ab.html` gains a bass line and a keys comp over
its two bars so the recorded voices can be heard beside the synthesised
ones; `KITS.md` gets a section per voice with credit lines.

## Gates
`measure_kits.py` green on kits and voices; `npx tsc --noEmit`; `npx
vitest run`. Report the per-voice tables, sizes, trims and anything in the
sources that did not fit.
