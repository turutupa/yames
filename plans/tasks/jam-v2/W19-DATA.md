# W19 — the vibes, the variations, the grooves that drive, intensity as a pattern

Branch `jam-v2-w19-data` from `jam-v2`. Area: new `src/jam/vibes.ts`,
`src/jam/intensity.ts`, additions to `src/jam/grooves.ts` and
`src/jam/bassline.ts`, their tests, and a new `plans/JAM_REFERENCES.md`.
No screen files, no `compile.ts`, no `src-tauri/`. Read the decision log
entries A2, A9, B4, B5, B8, B9, B10.

## What to build

1. **`vibes.ts` (A2, A9, B8).** `VIBES`: Rock, Hard rock, Blues, Funk,
   Jazz, Latin, Pop, Metal, Country. Each: id, name key, a bundle
   (`grooveId`, `feel`, `intensity`, `kit`, `fills`/`fillEvery`, `band`,
   `bassVoice`, `keysVoice`, tempo, key and mode, form kind) and 3–6
   variations, each a named partial bundle: Rock → classic, hard, punk,
   alt, ballad, half-time; Blues → shuffle, slow, Texas, boogie; Jazz →
   swing, ballad, bossa-jazz, up-tempo; Funk → 16ths, half-time, New
   Orleans; Latin → bossa, samba, cha-cha; Pop → straight, four-on-the-floor,
   ballad; Metal → double kick, half-time stomp, thrash; Country → train,
   two-step, waltz; Hard rock → open hats, stomp, driving 16ths.
   `applyVibe(jam, vibeId, variationId?)` returns the jam with the bundle
   applied and `vibe`/`variation` set. Tests: every bundle references an
   existing groove, kit, voice and form; every variation compiles.
2. **Grooves that drive (B4).** In `grooves.ts`: Hard rock (straight 8ths,
   open hats on the off-beats via the hat lane at accent level, crash on
   the one, no ghosts), Stomp (half-time, kick heavy, snare on 3), Double
   kick (16th kicks under a straight backbeat), Train (brushes-style
   16ths on the snare, kick 1 and 3), Two-step. Each with a fill and a
   bass style mapping.
3. **`intensity.ts` (B5).** `applyIntensity(pattern, intensity)`: Loud
   removes ghosts (3 → 1), raises the hat lane's off-beats to accent (an
   open hat, by convention the engine and the editor both read hat accents
   as open), adds a crash at tick 0; Soft turns hits to ghosts on the
   snare, closes the hats (accent → hit), removes the crash lane; Normal is
   identity. Pure; tests on every stock groove that tick counts and lane
   shapes are preserved.
4. **Bass per voice (B9).** `bassline.ts`: the style rules stay, but a
   `voice` option shapes note lengths — picked and slap shorter, upright
   and fingered longer, synth held — expressed as the cap the engine reads
   (document the field; the engine's `JamBassLine` has `gain` only, so put
   the length hint in `pitches` phrasing: a repeated pitch on consecutive
   ticks means "hold"). Tests.
5. **`plans/JAM_REFERENCES.md` (B10).** One card per vibe: two or three
   well-known reference tracks (title, artist, year), the tempo, the feel,
   and one sentence on the sound of the drums, the bass and the keys that
   the voices are tuned against. Factual, no lyrics, no quotes.

## Report

Export list of every module, since W18 integrates from it.
