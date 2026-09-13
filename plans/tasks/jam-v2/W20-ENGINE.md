# W20 — the engine: bass and keys voices, a kit from your own folder

Branch `jam-v2-w20-engine` from `jam-v2`. Area: `src-tauri/` only. Read
the decision log entries B3, B8, B9, the engine briefs under
`plans/tasks/jam/` (W1, W7, W11, W14, W16) for what exists, and the
contract: `JamEngineConfig.bassVoice`, `keysVoice`, `customKit`, and the
`pick_kit_folder` / `inspect_kit_folder` commands in `src/ipc.ts`.

The audio-thread rules are absolute: no allocation, no lock wait, no free
on the callback; everything handed to it goes through a handoff and comes
back through retirement.

## What to build

1. **Five bass voices, four keys voices (B9).** Banks built at bank time,
   one per voice, each its own recipe: fingered (the current pluck, a
   little more attack), picked (a sharp click layer, faster decay, a
   touch of second harmonic), upright (soft attack, thump, short sustain,
   low-passed), slap (a bright transient, a snap, then a fast decay),
   synth (a saw through a low-pass with a slow-ish envelope, held). Keys:
   epiano (the current one), organ (steady sustain, drawbar-ish harmonics,
   no decay, a click on attack), clav (very short, bright, percussive),
   pad (slow attack, long release, filtered). `bassVoice`/`keysVoice` on
   the config pick the bank when the table is compiled; the audio thread
   never sees a name. Level-match every voice to the existing ones through
   the small-speaker band-pass and keep the normalisation ceiling.
2. **A kit from a folder (B3).** `customKit.dir`: at `set_jam`, on the
   command thread, decode any of `kick`, `snare`, `snare_soft`, `hat`,
   `hat_open`, `ride`, `rim`, `crash` `.wav` (16/24-bit PCM and float, mono
   or stereo folded to mono, any rate, resampled to the output rate,
   peak-normalised to 0.9, capped at 2 s each) into an `Arc<CustomBank>`
   handed to the callback like a table and retired like one; voices the
   folder lacks resolve to the built-in `kit`. Cache by folder path and
   mtime so a bar-ahead send does not re-decode. Reject a folder over 64 MB
   of decoded audio with a message.
3. **The commands.** `pick_kit_folder`: a native folder dialog (add
   `tauri-plugin-dialog`, MIT/Apache-2.0, register it) returning the path or
   null. `inspect_kit_folder(dir)`: which of the eight voices were found
   and which are missing, without decoding. Both registered in `lib.rs` so
   `src/ipc.commands.test.ts` is green.
4. **Tests and gates.** Bank tests (fundamentals within a cent, levels
   within 3 dB of each other through the band-pass), the folder decoder
   (a synthetic 44.1 kHz stereo 24-bit file decodes to the expected mono
   at 48 kHz), the fallback, the cache, the size cap; all gates in
   `plans/tasks/jam/BRIEF.md`; the probe with `--jam-swap --jam-move
   --jam-take` and a custom kit loaded (add `--jam-kit <dir>`).

## Rules

No edits under `src/`. Never start the app. Report the per-voice levels.
