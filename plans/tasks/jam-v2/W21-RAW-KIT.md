# W21 — the Raw kit: a rock drummer in a dry room

Branch `jam-v2-w21-raw-kit` from `jam-v2`. Area: a new section of
`generate_sounds.py` (the `--kits` path; never the legacy section), eight
new files `src-tauri/sounds/kit_raw_<voice>.wav`, and `src-tauri/sounds/
KITS.md`. No `.rs`, no `src/`. Read the decision log entry B2 and B10,
`plans/tasks/jam/W3-SOUNDS.md` for how the first four were made, and
`scripts/sounds/measure_kits.py`, which is the gate.

## What "raw" means here

The owner's words about the current kits: "the soundtrack of a porno" —
smooth, soft, no transient. Raw is the opposite: a rock drummer close-miked
in a dry room.

- **Kick**: a short click layer (2–4 ms of filtered noise and a high
  sine burst) over a body that starts around 80 Hz and drops fast to 50,
  then a compressed envelope: fast attack, a held peak for ~20 ms, then
  decay. Soft-clip the sum (tanh) so it saturates rather than rounds off.
- **Snare hard / soft**: a wire layer (band-passed noise, 1.5–6 kHz) that
  is louder than the drum body, a body at ~180 Hz with a pitch drop, a
  rimshot-like click on the hard hit, a compressed envelope, soft-clipped.
  The soft hit is the same drum with less wire and no click, not a
  quieter file.
- **Hats**: short, bright, metallic (a few inharmonic partials plus
  noise), closed 40–55 ms, open 200–300 ms with a fast start.
- **Ride**: ping-forward, less wash than Brushes' ride.
- **Rim**: a woody click with mid-band body.
- **Crash**: bright, 500–800 ms, a fast bloom.
- No room tail on anything.

## Rules that matter

- Deterministic (seeded), peak 0.9, no clipping after the soft-clip stage,
  every file ending at zero, sizes in line with the other kits.
- Every accent voice clears the small-speaker margin the measurement
  script enforces, and by more than the other kits: this kit is judged on
  punch.
- Also generate an A/B page: `scripts/sounds/ab.html` (or extend an
  existing tool) that plays the same two-bar groove on each kit, so the
  owner can compare by ear in a browser without the app. Plain HTML, the
  WAVs referenced by relative path, no library.
- `KITS.md` gains the Raw row with the numbers, and a paragraph on what
  each layer does so the owner can ask for changes by name ("more wire",
  "less click").

## Report

The measurements, the A/B page path, and what you would change first if
the owner says "still too soft".
