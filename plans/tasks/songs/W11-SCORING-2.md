# W11 — Scoring, second pass: the note the live path still throws away

Branch `songs-w11-scoring`, from `songs-v1` as it stands (it must contain
`merge(songs-w1-scoring)`). Size M–L. You inherit `timing.rs`, `onset.rs`,
`score.rs`, `instrument.rs` and `src-tauri/tests/**` from W1; read W1's
three commit bodies first (`git log songs-w1-scoring -3 --format=%B`),
they are the handover. W9 has `engine.rs`/`song.rs`/`jam.rs` and W10 has
`commands.rs`/`lib.rs` registration tonight: add lines there, nothing more.

## 1. `max_onsets_per_beat` (W1's finding, must be fixed before Songs ships)

`timing.rs` (~1330) reclassifies a matched onset as spurious once
`profile.max_onsets_per_beat` have landed inside one quarter-note period.
Electric guitar's is **3**. Sixteenths are four to the quarter, so in the
LIVE analyzer one sixteenth in four is still thrown away — W1's fixtures
did not see it because they go through `match_and_score`, not the live
loop. It already bites sixteenths over a sixteenth click today.

Find out what the cap was protecting against (the comments and git blame
will say; string noise and double triggers are the likely answer) and
replace it with a rule that still protects against that while letting
written music through: the cap should follow the grid being scored — the
locked divisor, or the densest beat of a loaded `ScoreSchedule` — with
headroom, never a constant below it. A loaded schedule knows exactly how
many onsets a beat may hold. Sextuplets (6) and 32nd-note bursts must
survive. Bump `INSTRUMENT_PROFILE_VERSION` if a profile value changes and
say so in the commit body (the scoring gate in ROADMAP §4).

**Gate:** a LIVE-path test (drive the analyzer's real loop, not
`match_and_score`) for sixteenths and for sextuplets over a quarter click
on the electric-guitar profile: every played note reaches the scorer. A
double-trigger fixture (each note followed 12 ms later by a ghost) is
still cleaned up as it is today. All 23 `d3d_scenario_*` within ±2, every
dsp/highbpm golden unchanged or explained.

## 2. Per-beat divisor voting (roadmap 1.4)

W1 notes its premise changed: the candidate set is no longer filtered by
the click, so a player alternating eighths and triplets CAN re-lock; what
is left is the hysteresis latency of about four refits. Build 1.4 as the
roadmap specifies on top of that: inside a locked window, classify each
beat's onsets by phase clustering and score that beat on its own divisor.
**Gate:** fixture `120bpm_alternating_8ths_triplets` ≥ 85, and no more
than two `InferredGridChanged` events per eight bars.

## 3. The JSON layer for stage B's gates

W1 put the three schedule gates in `score::tests` rather than as raw-onset
fixtures. Keep those tests, and add the fixture layer too
(`tests/highbpm_fixtures/scheduled/`): the dotted-eighth phrase played
right, with a dropped note, with an added note; the looped two-bar
schedule with a different mistake each pass; the tempo step on a bar
line. A fixture file is what the next person re-runs when they change the
matcher; remember W1's finding that `serde_json` float round-trips are not
bit-exact and normalise both sides.

## 4. If there is road left

The accent half of LP C3: report (do not score) whether written accents
were played louder than their neighbours, from onset amplitude, as a
per-onset `accentHeard: bool | null` beside the existing result. Additive
on the wire, absent when amplitude is unusable.

## Gates

`npm run test:rust` (the wall-clock tests in `kit`, `voices`, `tts`,
`take` fail under load and pass alone: re-run alone and report both),
`test:dsp`, `test:highbpm`, build and vitest for the `ipc.ts` types.
