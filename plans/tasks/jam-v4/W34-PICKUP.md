# W34 — the pickup: the drummer plays you in

Branch `jam-v4-w34-pickup` from `jam-v4`. Read `plans/tasks/jam-v4/BRIEF.md`
(A1) and `plans/JAM_KILLER.md` §2 A1, then `src/jam/arrangement.ts` (W30's
note that the count-in's pickup fill was unreachable), `compile.ts`, and
the engine's count-in path: `arm_count_in` in `commands.rs`, the
`counting_in` / `count_in_slot` handling around `jam_play` in `engine.rs`,
and `JamTable::count_in_slot` in `jam.rs`.

## The gap
`arrangement.intro: "fill"` promises a pickup fill into bar one. The
count-in is played by the engine from its own counter with the count-in
sound, and `jam_play` hands every counting-in tick back to the click, so
nothing the compiler writes can sound during it. W30 settled for the
crash on bar one. Finish the gesture.

## What to build
- `JamEngineConfig.pickup?: boolean` (camelCase on the wire, `pickup` on
  the Rust side). `compileJam` sets it when the jam's arrangement is
  `build` or `song` with `intro: "fill"` and the jam has a count-in of at
  least one bar.
- In the engine: when `pickup` is set and the count-in is in its **last
  bar**, the last beat of that bar plays the table's fill row for that
  beat (the fill's last beat, the same cells the `big` fill uses) through
  the band instead of the count-in sound — kick, snare and toms as the
  fill has them, no hats. The count-in sound stops for that beat. When
  the count-in is shorter than a bar, the pickup is its last beat. All of
  it decided when the count-in is armed (which bar and beat is last is
  known then), nothing new on the audio thread beyond one more branch in
  `jam_play`.
- A take that starts "after the count-in" still starts at bar one: the
  pickup is not in the take.
- Tests: the pickup ticks are band ticks and the earlier count-in ticks
  are clicks (through `jam_play` with a fixture), the take boundary, the
  compile flag, and the probe run unchanged with `--jam`.

## Gates
`npm run test:rust` (MSVC runner), dsp, highbpm, the probe with `--jam
--jam-swap --jam-move --jam-take --jam-kit src-tauri/sounds/kits/club`,
`npx tsc --noEmit`, `npx vitest run`. Report what you changed on each
side of the wire, your branch and final commit.
