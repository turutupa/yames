# W35 — the percussion set

Branch `jam-v5-w35-perc-sound` from `jam-v5`. Read the shared BRIEF's
contract, then `scripts/sounds/render_kit.py` and its `club.json` recipe
(the drums came from the same library the same way), `measure_kits.py`,
`ab.html`, `KITS.md`. Source: `C:\Users\alber\Dev\_samples\virtuosity_drums`,
`Programs/mappings/perc/oh/*_map.sfz` and `perc/close/*`, samples under
`Samples/perc/`. CC0; credit line "Virtuosity Drums — Versilian Studios
and Karoryfer Samples (auxiliary percussion from VSCO 2 Pro)".

## Build
A `perc-club.json` recipe for the tool (grow the tool if a percussion
set needs anything the drum path lacks — shaker up/down as round robins
of one voice, conga muted as layer 1 of conga_hi, a source articulation
mapped to a layer rather than a velocity band). Ten voices exactly as the
contract names and maps them; three layers where the source has three
dynamics, two otherwise; two or three round robins; overheads as the
stereo pair with the close mic where one exists; trims and pans as the
contract lists; caps 2.0 s (a tambourine and a cowbell ring under 1 s;
congas about 1 s; a guiro stroke 0.6 s). Target 6–10 MB for the set.

## Also
`measure_kits.py` walks `sounds/perc/*` as it walks the kits, with the
same checks and the margins between voices printed. `ab.html` gains a
percussion line (shaker sixteenths, congas tumbao, tambourine on 2 and
4) that can be switched on over any kit. `KITS.md` gets a section.

## Gates
`measure_kits.py` green on kits, voices and the percussion set; `npx tsc
--noEmit`; `npx vitest run`. Report the per-voice table (layers, round
robins, longest file, size, trim, pan) and anything in the source that did
not fit.
