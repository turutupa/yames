# W27 — the render tool, and the first two recorded kits

Branch `jam-v3-w27-render-kits` from `jam-v3`. Read the shared BRIEF's
contract first: the kit format there is what you write. Area:
`scripts/sounds/render_kit.py` (new), `src-tauri/sounds/kits/club/**` and
`src-tauri/sounds/kits/studio/**` (new), `src-tauri/sounds/KITS.md`,
`scripts/sounds/measure_kits.py`, `scripts/sounds/ab.html`. No `.rs`, no
`src/`, none of the five synthesised kits.

## The sources, already on this machine

- **Virtuosity Drums** (CC0-1.0): `C:\Users\alber\Dev\_samples\virtuosity_drums`
  (a git clone; if it is still filling when you start, wait for
  `Samples/room` to exist and `git -C <dir> status` to answer). SFZ: read
  `Programs/02-full-kit.sfz` and the per-mic maps under
  `Programs/mappings/<mic>/<piece>_<articulation>_map.sfz`; regions are
  `sample=`, `lovel`/`hivel` velocity bands (dozens per articulation),
  `seq_position` round robins on cymbals. Mics: `kickmic`, `snaremic`,
  `oh` (stereo), `mid`, `room`, `lofi`. FLAC. The README calls it a
  contemporary jazz house kit recorded like a live club date; this is the
  **Club** kit.
- **DRSKit 2.1** (CC BY 4.0): `C:\Users\alber\Dev\_samples\drskit\DRSKit2_1.zip`
  (downloading; unzip it there when it is complete, 2.8 GB). DrumGizmo
  format: an XML per instrument listing samples with a `power` value and
  per-channel audio files across 13 channels (ambience L/R, kick in/out,
  hat, overheads L/R, ride, snare top/bottom, three toms). This is the
  **Studio** kit, "from jazz to rock"; credit "DRSKit by the DrumGizmo
  project, CC BY 4.0" goes in the manifest.

## The tool: `scripts/sounds/render_kit.py`

`python scripts/sounds/render_kit.py <recipe.json> <out dir>`. A recipe
names the source format (`sfz` or `drumgizmo`), the source root, and for
each of the eleven contract voices which articulation to draw from, the
mix (mic weights and pan), how many layers and round robins to keep, and
the length cap. Ship the two recipes beside it (`club.json`,
`studio.json`) so a kit is regenerable from the source and a recipe, the
way the synth kits are from `generate_sounds.py`.

What it does per voice:

1. **Collect** every sample of the chosen articulation across the mic
   channels, grouped by velocity band (SFZ) or power (DrumGizmo) and by
   round robin where the source has them.
2. **Pick layers.** Divide the velocity range into the requested number
   of layers (4 for kick, snare, hat, ride; 3 for hat_open, crash, toms; 2
   for rim, hat_pedal, ride_bell) at equal loudness steps, not equal
   velocity steps: measure each source sample's RMS and choose bands so
   the layers are roughly 4–5 dB apart. Round robins: the source's own
   where it has them; otherwise the nearest neighbouring velocities in
   the band, never the same file twice.
3. **Mix to stereo at 48 kHz.** Close mic centred, overheads as a stereo
   pair, room a little under them; the recipe sets the weights, and the
   defaults are what a live recording sounds like: close 1.0, overheads
   0.7, room 0.35 for Club; for Studio, kick in+out, snare top+bottom
   (bottom polarity-checked), overheads 0.8, ambience 0.4. Pan hats
   slightly left, ride right, toms high-left to low-right, as a drummer
   sits. Time-align close and room mics by cross-correlation so the
   transient does not smear.
4. **Trim.** Start at the first sample above −60 dBFS minus 2 ms; end
   where the tail falls below −60 dBFS or at the cap (kick 0.8 s, snare
   1.0 s, hat 0.4 s, hat_open 1.5 s, ride 2.5 s, crash 3.0 s, toms 1.5 s,
   rim 0.5 s, pedal 0.4 s, bell 2.0 s), with a raised-cosine fade of 30 ms
   at the end and 1 ms at the start; first and last sample exactly zero.
5. **Level.** Peak-normalise each file to 0.90 like every sound in the
   app, then compute `trim_db` per voice so that, through the
   small-speaker band-pass `measure_kits.py` already implements, the
   voices sit in this balance relative to snare layer 3: kick −1 dB, hat
   −9, hat_open −6, ride −7, ride_bell −5, crash −4, toms −2, rim −8,
   pedal −14. Write it into the manifest; do not bake it into the files.
6. **Write** `<voice>.<layer>.<rr>.wav` (16-bit, dithered) and `kit.json`.

Print a table per kit: voice, layers, round robins, longest file,
kit size. Target 10–20 MB per kit; if a kit comes out over 25 MB, shorten
the caps on ride and crash before dropping round robins.

## Also

- `measure_kits.py` learns the new folder format (manifests, layers) and
  keeps every check it has: peak, DC, zero ends, the small-speaker
  margins between snare layers and between kick and hat.
- `ab.html` plays the same two bars on every kit under `sounds/kits/`,
  including the two new ones, using the layered files (accent = layer 3,
  hit = layer 2, ghost = layer 1, alternating round robins), so the owner
  can hear the recorded kits beside the synthesised ones in a browser.
- `KITS.md` gets a section per recorded kit: source, licence, credit line
  as it must appear in the app, the recipe, the table, and "what to
  change first if the owner says…" (more room, more crack, less hat).

## Report
The two tables, the sizes, the mix weights you settled on, the trim
values, and anything in the sources that did not fit the contract (an
articulation missing, a mic that was unusable) and what you did instead.
