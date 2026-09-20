# W17 — Jam's default mix: the keys and the bass come up to meet the kit

Branch `songs-w17-jam-mix`, from `songs-v1`. Size M. The owner heard it
first (2026-09-19, making a clip for the website): "what I can hear is
mostly drum sound, the keys and bass is very low in comparison". Measured
by rendering each player alone through the engine's offline renderer
(`render_band_demos`, fed the way `scripts/sounds/band_demo.ts` feeds it,
`mix` soloing one lane) and `ffmpeg -af ebur128`:

| | drums | bass | keys |
|---|---|---|---|
| funk, slap bass, clav | −17.0 LUFS | −22.1 | −26.9 |
| blues, fingered boogie, organ | −19.0 | −15.4 | −29.6 |
| rock, picked eighths, organ | −19.2 | −16.5 | −28.4 |
| disco, picked octaves, e-piano | −13.7 | −16.1 | −33.4 |

Keys sit 9–20 dB under the kit everywhere; `JamMix` tops out at 1.5
(+3.5 dB), so a player cannot fix it. The slap bass is nearly all
fundamental: high-passed at 120 Hz it drops a further 9 dB, which on laptop
speakers means it is not there.

**The owner's standing rules for this:** Jam is done enough — take the
cheap fix, not the ambitious one. And sound is judged by the owner's ear,
never by numbers alone ("gain-only accent was rejected by ear, never
again"). So this task ends in MP3s for the owner, not in a merged default.

## Deliverable

1. Measure every bass voice (fingered, picked, upright, slap, synth) and
   keys voice (epiano, organ, clav, pad) the same way, across four vibes,
   at all three intensities. A table in the report.
2. The cheap fix: a per-voice trim where the bank's level is set (the
   manifests under `src-tauri/sounds/voices/*` or the `gain` the lines
   carry — find which, read `voices.rs` and how `trim_db` works for kits)
   so that at default faders bass and keys sit in a sensible relation to
   the kit across voices. Propose targets (start from keys ≈ kit −6 dB,
   bass ≈ kit −3 dB measured above 120 Hz, and argue with them). No new
   processing on the audio thread. W9 calibrated a song's headroom against
   the current levels (`SONG_TRANSIENT_CEILING`, `DEFAULT_CLICK_MIX` in
   `song.rs`): re-run its render test and re-measure its peak numbers, and
   say what moved.
3. Six before/after pairs as MP3 (same bars, same seed), rendered by the
   engine, mastered with a static gain and a limiter only — never a
   loudness normaliser, it hides exactly what is being judged. Put them in
   `<your worktree>\jam-mix-demos\` (git-ignored; do not commit audio) and
   give their absolute paths in the report. ffmpeg is installed.
4. Commit the trim behind the evidence, on your branch only. The
   orchestrator will not merge it until the owner has listened.

## Gates

`npm run test:rust` (the render tests and W9's song headroom test), build,
vitest. The jitter probe is not needed: nothing on the callback changes.
