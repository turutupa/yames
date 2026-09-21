# W36 — the percussionist in the engine

Branch `jam-v5-w36-perc-engine` from `jam-v5`. Read the shared BRIEF's
contract, then `src-tauri/src/kit.rs` (`KitVoice`, `KitBank`, the
`build.rs` walk), `jam.rs` (lanes → voices, `band_state`, the mix), the
jam sections of `engine.rs` (`jam_play`, `HatsOnly`, trading, the bus),
and `voices.rs` for how a second embedded folder family was added last
pass. Area: `src-tauri/**`.

## Build
1. **Ten voices.** `KitVoice` grows by the contract's ten, after the
   eleven; `KIT_VOICES` and every array sized by it follow. A `PercBank`
   decoded from `sounds/perc/<set>/kit.json` through the kit loader (same
   format, same rules, same resampler), embedded by `build.rs` walking
   `sounds/perc/*`. The set is resolved once per process at the reference
   rate and once per device rate in the kit cache, like a kit; the table
   carries an `Arc` to it beside the kit bank. A checkout without the
   folder builds and runs with the percussion lanes silent.
2. **Lanes.** `JamPattern` gains the ten rows (snake_case fields, camelCase
   on the wire); each maps to its voice; levels and layers as the drums;
   round robins by the same formula (a shaker's two files alternate by
   it); drift as the drums; through the drum bus.
3. **The band flag and the mix.** `JamConfig.perc: Option<bool>` (the
   band flag; absent = rows play if present) and `mix.perc: f32`; the
   gain memo and `drums_signature` include them the way `drums` is
   included.
4. **Band state.** Percussion follows the contract: plays with the drums;
   in `HatsOnly` (breakdown, trading) it keeps going; off in stop-time
   and when the drums are off. One table, no new state on the audio
   thread beyond the lane → voice branch.
5. **Tests**: the ten rows deserialise from the UI's names; a set that is
   absent leaves the lanes silent and the rest of the kit untouched; the
   band flag silences the rows and nothing else; the mix scales them;
   `HatsOnly` keeps them; stop-time drops them; the bus test still holds
   the ceiling with percussion on every tick; the four-bar worst-tick
   render counts them.
6. **Probe** with `--jam-kit src-tauri/sounds/kits/club` and a groove
   carrying all ten rows (add it to the probe's fixture). Until W35's set
   exists, build a temporary one from the club kit's own files renamed
   into the ten voices, in the scratchpad, and delete it before the final
   commit.

## Gates
`npm run test:rust` (MSVC runner), dsp, highbpm, `npx tsc --noEmit`,
`npx vitest run src/ipc.commands.test.ts`, the probe. Report the wire
additions, the probe numbers, every gate's count.
