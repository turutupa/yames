# W11 — the engine, third pass: moving through the form, and the review's leftovers

Branch: `jam-w11-engine-form`, from `jam`. Your area is `src-tauri/` only.
Read `plans/tasks/jam/BRIEF.md`, `INTEGRATION-NOTES.md`, `W1-ENGINE.md`
and `W7-ENGINE-BAND.md` for what exists, `plans/JAM_MODE.md` §4.2 and §6,
and the contract in `src/jam/types.ts`: `JamPositionCommand` and
`JamEngineConfig.fillEvery`. `src/ipc.ts` calls `set_jam_position` with
`{ command }`.

The engine's table handoff, retirement, deferral and bar-line rules are in
`engine.rs` around `JamHandoff`, `JamRetirement`, `jam_pending`,
`jam_bar_state` and the `bar_complete` branch. Read them before touching
the callback: no allocation, no lock wait, and every form change lands at
the bar line.

## What to build

### 1. Jump and loop (`set_jam_position`)

- A new command `set_jam_position(command: JamPositionCommand)` taking
  `{ jumpTo: Option<u32>, loop: Option<{ start, end }> }` (serde
  camelCase). Validate: `jumpTo < form_bars`, `start <= end < form_bars`
  against the table currently held, else reject with a message and change
  nothing.
- Hand it to the audio thread the way the table is handed: a small
  `JamPosition { jump: Option<u32>, loop: Option<(u32, u32)> }` behind its
  own generation counter on `JamHandoff` (one relaxed load per buffer, a
  `try_lock` only on change; it is `Copy`, so nothing to retire).
- At `bar_complete`, after the held table is swapped in and before
  `advance_form`: if a jump is pending, `jam_bar = jump` (chorus unchanged)
  and the jump is consumed; otherwise advance as today; then, if a loop is
  set and the new `jam_bar` is outside `start..=end` (or the advance
  wrapped the chorus), `jam_bar = start` — and a wrap that the loop catches
  does not count as a new chorus. `jam_bar_state` is re-decided from the
  final bar. A jump or loop with no table loaded is accepted and ignored.
- A new table arriving clears a pending jump (the form may have changed
  length) but keeps the loop when it still fits, else drops it. Stopping
  and restarting keeps the loop, consumes nothing.

### 2. Fills every N bars

`fillEvery` on the config: when non-zero, the fill table also plays on
every bar whose 1-based number in the chorus is a multiple of it, in
addition to the last bar. The crash on the one is unchanged. Validate 0, 4
or 8 (reject others with a message; the UI offers only those).

### 3. `compile()` memoisation

`compile()` renders four bars of audio to find the normalisation gain on
every `set_jam`, and the bar-ahead bass sends four to six of those per
chorus. Cache the gain by `drums_signature` in the command handler's state
(a `Mutex<Option<(u64, f32)>>` or similar, command thread only): a config
whose signature matches reuses the gain and skips the render. Document
that the bass is excluded from the signature and why that is safe (it
never carries an accent, its gain is fixed, and the ceiling has 10%
headroom by W7's measurement); assert in a test that with the cache the
worst tick of a bass-changed table stays under 1.0 across the kits.

### 4. The review's leftovers

- `the_band_state_on_the_beat_event_follows_the_form` cannot fail: it
  compares the table against the function that filled it. Make it a real
  test: literal expected states for a 12-bar form with drop-out every 8
  for 2 and trading 4/4, read off the table.
- The `MAX_VOICES` doc comment cites the wrong test; point it at
  `the_busiest_groove_never_makes_the_mixer_clamp`.
- The click and chime `voices.push` sites have no capacity guard; add the
  same `if voices.len() >= MAX_VOICES { break/skip }` the jam spawn has.
- The probe's `--jam` with `--subdivision` other than 4 silently measures
  the click; refuse the combination with a clear message.
- `JamHandoff::set` on a poisoned lock: already fixed to bump only after a
  write; confirm and leave a test if cheap.

### 5. Gates

All of BRIEF.md, plus the probe with `--jam-swap`, and a new probe run with
a jump every 2 s and a loop set (`--jam-swap` may grow a `--jam-move`
sibling, or fold both into `--jam-swap`; say which). Zero missed beats,
zero dropouts.

## Rules

No allocation on the audio thread. No edits under `src/`. Never start the
app. Branch names use hyphens. Commit on your branch, do not push or merge.
