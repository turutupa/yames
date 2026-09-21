# Jam, fifth pass — the percussionist (shared by every worker)

Read this, then your own file, then `plans/JAM_KILLER.md` (§2 A5, added
for this pass), `plans/tasks/jam-v4/BRIEF.md` (arrangement, melodic
banks) and `plans/tasks/jam-v3/BRIEF.md` (the kit format, levels, lanes,
the bus). The older BRIEFs' rules hold: hyphenated worktree branch names,
the gates, the store hazard, no push, no merge, never start the app.

## Why
The owner's first session with Wave A: "way better… so usable right
now". Asked what layer to add, the answer was one: a percussionist. The
samples already exist, public domain, in Virtuosity Drums' auxiliary
percussion set; it is the cheapest layer we can add and the one that turns
latin, funk, pop and world grooves from a kit into a room.

## The branch
**`jam-v5`**, from `jam-v4`. Stale worktree: `git checkout -B
<your-branch> jam-v5`. The orchestrator merges into `jam-v5`.

## The contract (fixed)

### Ten percussion voices
`shaker, tambourine, cowbell, cabasa, claves, guiro, conga_hi, conga_lo,
bongo_hi, bongo_lo` — in that order, after the eleven kit voices. On the
TypeScript side the lanes are camelCase rows on `JamPattern`, optional
like `hatOpen`: `shaker, tambourine, cowbell, cabasa, claves, guiro,
congaHi, congaLo, bongoHi, bongoLo`. Rust fields snake_case under the
existing `rename_all = "camelCase"`. Levels as everywhere (0–4).

Sources in Virtuosity (`Programs/mappings/perc/oh/*_map.sfz`, overhead
mics; `close/` for a few): `shaker_up` and `shaker_down` become the two
round robins of `shaker` (a shaker alternates by nature); `tambourine`;
`cowbell`; `cabasa`; `claves`; `guiro_slow` is `guiro` (the fast one is a
different stroke, skip it); `conga_open` → `conga_hi`, `tumba` →
`conga_lo` (`conga_muted` is layer 1 of `conga_hi`, the ghost stroke);
`bongo_high`, `bongo_low`.

### The set is a kit-format folder
```
src-tauri/sounds/perc/club/kit.json
src-tauri/sounds/perc/club/<voice>.<layer>.<rr>.wav
```
Same rules as `sounds/kits/*`: 48 kHz 16-bit stereo, peak 0.90, zero at
both ends, ≤ 2.0 s, `trim_db` per voice measured against the kits'
snare layer 3 (targets: shaker −12, cabasa −12, tambourine −8, claves −6,
cowbell −6, guiro −9, congas −4, bongos −6), `pan` (shaker +0.35, cabasa
+0.3, tambourine −0.3, claves −0.2, cowbell +0.2, guiro −0.35, congas
−0.15, bongos +0.25). Embedded by the same `build.rs` walk. One set for
now; the engine plays it under every drum kit (a percussionist is not a
drum kit) and a later set is a folder.

### The band
- `Jam.band` gains `perc?: boolean`; `JamMix` gains `perc: number`
  (default 1.0); `JamEngineConfig` carries both as it carries drums.
- The band row on the playing screen gains **Percussion** (mute, level),
  after Keys, shown only when the groove has any percussion row or the
  jam turned it on.
- Default: on for the latin, funk, pop and world vibes and their
  variations; off elsewhere. `applyVibe` sets it from the bundle.
- Band state: the percussion plays when the drums play; in a breakdown
  the shaker and the congas keep time (percussion `full`) while the kit
  drops to kick and hats; in stop-time and when drums are `off` it is
  off. `BandMoment` gains `perc: "full" | "off"`.
- The engine's `HatsOnly`/trading states treat percussion like the
  hats: it keeps going when the hats do.

### Grooves
Percussion rows are authored per groove where a percussionist belongs:
every latin and world groove (clave with `claves` where the style is
clave-based, congas tumbao, shaker or cabasa, guiro on cha-cha and son,
cowbell on mambo and songo, bongo martillo on son and bolero), every
funk and soul groove (shaker or tambourine, congas on the New Orleans and
boogaloo ones, cowbell on go-go), pop and dance (tambourine on 2 and 4,
shaker sixteenths), gospel shout and the blues rhumba (tambourine), the
country train and bluegrass (nothing — say so in the comment), rock:
none except Motorik and indie disco (tambourine), jazz: none except
soul jazz and the bossa (shaker). Rows follow the W28 dynamics rules:
strong/weak alternation, never a row of one level.

## Who owns what
| Worker | Area | Does not touch |
|---|---|---|
| W35 sound | `scripts/sounds/render_kit.py` recipe for a percussion set, `sounds/perc/club/**`, `measure_kits.py`, `ab.html`, `KITS.md` | `.rs`, `src/` |
| W36 engine | `src-tauri/**`: the ten voices, `sounds/perc/*` embedding, lanes, `perc` mix and band flag, band state, probe | `src/`, `sounds/perc/club` content |
| W37 data + screen | `src/jam/types.ts`, `compile.ts`, `arrangement.ts` (`perc`), `grooves.ts` (perc rows), `vibes.ts` (defaults), the Percussion band row, the editor's percussion rows, locales, tests | `src-tauri/`, sheets' layout, chord sheet |

## Gates
As before: tsc, vitest (whole; restore the onboarding snapshot), `npm run
test:rust` (W36, MSVC runner), dsp, highbpm, the probe with `--jam-kit
src-tauri/sounds/kits/club` (W36), `measure_kits.py` (W35). Commits in the
repository's voice, each ending `Co-Authored-By: Claude Fable 5.1
<noreply@anthropic.com>`.
