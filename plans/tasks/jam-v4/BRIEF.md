# Jam, fourth pass — Wave A of the killer plan (shared by every worker)

Read this, then your own file, then `plans/JAM_KILLER.md` (the plan and
the bar), then `plans/tasks/jam-v3/BRIEF.md` (the kit format, levels,
lanes and bus you build on top of) and the older BRIEFs for the rules that
still hold: worktree branch names with hyphens, the gates, the store
hazard, no push, no merge, never start the app, the report format.

## The branch

**`jam-v4`**, from `jam-v3`. Your worktree may start on a stale branch:
`git log --oneline -1`; if HEAD is not the tip of `jam-v4`, `git checkout
-B <your-branch> jam-v4`. The orchestrator merges into `jam-v4`.

## The contract (fixed; every worker builds against it)

### The arrangement (A1)
```ts
export type JamArrangementMode = "loop" | "build" | "song";
export type JamArrangement = {
  mode: JamArrangementMode;          // default "build" for new jams; stored jams without one read as "loop"
  choruses?: number;                 // song only: 2..32, default 4
  intro?: "none" | "fill";           // default "fill": a pickup fill into bar one
  breakdownEvery?: number;           // build/song: a breakdown chorus every N, default 4, 0 = never
};
```
On `Jam`: `arrangement?: JamArrangement`. `compileJam(jam, { formBar,
chorus, lineup, ... })` gains `chorus` (1-based, from `BeatEvent.chorus`)
and returns, on `JamEngineConfig`, two new optional fields:

- `applyAt?: "now" | "barLine"` — `"barLine"` means the whole table,
  drums included, waits for the next downbeat. The bar-ahead sender sets
  it on every arrangement-driven bar; a user edit while playing keeps
  `"now"` for the drums as today.
- `endsForm?: boolean` — the engine stops after this bar completes and
  emits `jam-ended` (no payload). `song` sets it on the last bar of the
  last chorus.

The dynamics decision is one pure function in `src/jam/arrangement.ts`:
```ts
export type BandMoment = {
  intensity: JamIntensity;             // soft | normal | loud
  drums: "full" | "hatsAndKick" | "stopTime" | "off";
  bass: "full" | "sparse" | "off";
  keys: "full" | "sparse" | "off";
  fill: "none" | "small" | "big";
  crash: boolean;                       // a crash at the top of this bar
  ending?: "stop" | "hold";             // song, last bar only
};
export function bandMoment(jam: Jam, chorus: number, formBar: number): BandMoment;
```
`compileJam` applies the moment to the groove, the bass line and the keys
line before anything else, and `intensity.ts` does the rest as today.
Rust side: `apply_at` and `ends_form` on `JamConfig` under the existing
`rename_all = "camelCase"`.

### Melodic banks (A2)
```
src-tauri/sounds/voices/<voice>/voice.json
src-tauri/sounds/voices/<voice>/<midi>.<layer>.<rr>.wav
```
`voice` ∈ `bass_fingered, bass_picked, bass_upright, bass_slap, epiano`.
`<midi>` is the MIDI note number of the sampled pitch (every note or every
few); the engine builds the pitches between from the nearest sampled note
by resampling, never further than ±3 semitones. `voice.json`:
```json
{ "id": "bass_fingered", "name": "Fingered bass",
  "credit": "Black And Blue Basses — Karoryfer Samples", "licence": "CC0-1.0",
  "rate": 48000, "channels": 1, "layers": 3, "rr": 2, "trim_db": 0.0,
  "release_ms": 60, "notes": [28, 31, 33, 36, 40, 43, 45, 48, 52, 55, 57, 60] }
```
Mono, 48 kHz, 16-bit, peak 0.90, ≤ 4.0 s, tails intact, first and last
sample on zero. The existing `JamBassVoice` and `JamKeysVoice` ids do not
change: `fingered/picked/upright/slap` and `epiano` play the recorded bank
when its folder ships and the synthesised recipe when it does not;
`organ/clav/pad/synth` stay synthesised. Layer by the line's level (the
bass line's `gain` maps soft < 0.6 → 1, < 0.9 → 2, else 3). Embedded by
the same `build.rs` walk as the kits.

### Content (A3)
- `Groove` gains `family: "rock" | "blues" | "funk" | "jazz" | "latin" | "pop" | "metal" | "country" | "world"` and `tags?: string[]`.
- `src/jam/chart.ts`: `parseChordChart(text: string): { bars: (Chord | null)[]; beatsPerBar: number; key?: Key; warnings: string[] }` and `jamFromChart(name, text, base?: Jam): Jam`.
- Starter jams carry `vibe` and `variation`; fifty of them; the library filters by vibe.

### Delight (A4)
- `useJamSession` gains `previewVibe(vibeId, variationId?)` / `stopPreview()` on the same engine path as `previewKit` (two bars, then back to whatever was playing or silence).
- `jamNow(instrument)` picks the vibe for the instrument (guitar → rock, bass → funk, keys → jazz, drums → rock, voice → pop, else rock), creates the jam, loads it, starts the band. Exposed on the empty Jam screen and on the rail's Jam entry when no jam is open.

## Who owns what

| Worker | Area | Does not touch |
|---|---|---|
| W29 engine | `src-tauri/**`: `apply_at`, `ends_form` + `jam-ended`, melodic banks loader and pitch building, voice ids resolving to recorded banks, probe | `src/`, `sounds/voices/*` content (W33's) except a temporary synthetic one you delete |
| W30 arrangement | `src/jam/arrangement.ts`, `compile.ts`, `types.ts` (arrangement fields), `useJamSession.ts` bar-ahead sender (chorus, applyAt, endsForm, `jam-ended`), the setup sheet's arrangement control, timeline dynamics marks, locales | `grooves.ts` content, `jams.ts` content, `chart.ts`, previews |
| W31 content | `grooves.ts`, `jams.ts`, `chart.ts` (new), the paste-a-chart UI in the setup sheet's form group, library filters, `JAM_REFERENCES.md`, locales | `compile.ts`, `arrangement.ts`, engine |
| W32 delight | vibe tile previews, Jam now, the first-run hints for Jam, `useJamSession` preview functions, locales | `compile.ts`, `arrangement.ts`, content files, engine |
| W33 sound | `scripts/sounds/render_kit.py` grown for melodic instruments, `sounds/voices/**`, `KITS.md`, `measure_kits.py`, `ab.html` | `.rs`, `src/` |

Shared files (`types.ts`, `useJamSession.ts`, locales) are touched by more
than one worker: add, never rewrite; keep additions in clearly separated
blocks; the orchestrator merges.

## Gates
As jam-v3's: `npx tsc --noEmit`, `npx vitest run` (whole suite, then
restore the onboarding snapshot), `npm run test:rust` (W29), dsp,
highbpm, the probe (W29), `measure_kits.py` (W33). Commits small, in the
repository's voice, each ending `Co-Authored-By: Claude Fable 5.1
<noreply@anthropic.com>`.
