# c5c2b: review fixes for c5c2 (free-play findings lead the tools' note)

Branch `coach-c5c2` (worktree `/home/dgx-delgado/yames-coach-c5c2`), review `/tmp/coach-orch/c5c2-review.md`.
Logs `/tmp/coach-c5c2b/`. `coach` merged in (clean).

## Rule

The coach states only measured facts. Every sentence now quotes what it counted and is said only on
enough evidence; anything it could not say truthfully for a run, it does not say.

## The four sentences (English) and when they are said

- (a) beatLate / beatEarly: "On beat {beat} of the bar your notes came {ms} ms later than on the other
  beats, on average: {agreeing} of the {notes} notes on that beat were later than that average."
  Said only with at least 8 notes on that beat, at least 8 on the others, and at least 3 in 4 of the
  beat's notes on the named side of the other beats' mean. The delta is measured against the *other*
  beats (excluding the beat itself), and the direction word is keyed on that delta. The beat is the
  engine's bar-local `measure_beat` (H2).
- (b) subdivision: "No note landed on the {position} on {missed} of the {total} beats you played
  through." Counted only on the click's own subdivision grid (the most common `subdivision_total`) and
  only over beats with at least one matched note. Invented (virtual) ticks are never bucketed (H1).
  Needs at least 8 beats per position and the 20-point gap it had before.
- (c) ceiling: "At {low} BPM, at least half of your {lowNotes} notes landed within {lowMs} ms of their
  usual place against the click; at {high} BPM, at least half of your {highNotes} notes were {highMs}
  ms or more from it." The tempos are ranges as played (slowest to fastest within each 10-BPM band).
  Both numbers are the band's MAD of raw offsets: low rounded up past the histogram bin, high rounded
  down, so both clauses stay true. Needs at least 8 notes per band, low MAD at most 15 ms, high over
  15 ms and at least 5 ms wider than low.
- (d) driftLate / driftEarly: "Over a stretch of {notes} notes, the last {third} landed {ms} ms later
  against the click than the first {third}, on average." Raw offsets; needs at least 8 notes per third
  and twice the bias threshold.

No sentence is said when: the finding has no `freePlay` counts (an older payload); the counts
contradict themselves; the segment is under 10 s; a number is under 3 ms.

## Findings, status, test

- H1 fixed: no virtual tick is ever measured, and a rest is not a miss.
  Tests: `swung_eighths_over_an_eighth_click_name_no_missing_position` and
  `sixteenths_over_an_eighth_click_do_not_blame_the_off_beat` (findings.rs);
  `a_rest_is_not_a_missing_position`; on the live analysis loop,
  `invented_sixteenths_never_blame_the_click_off_beat_on_the_live_path` and
  `a_dropped_click_off_beat_is_found_on_the_live_path` (timing.rs).
- H2 fixed: `BeatTick.bar_beat` is a copy of `notif.measure_beat`, which already travels on the beat
  queue (`engine.rs` 4012), so the queue is not widened.
  Test: `the_beat_of_the_bar_survives_a_meter_change`.
- M1 fixed: (a), (c) and (d) read the raw offset (onset minus click, before calibration), recorded at
  the push. A stale seed only moves `deviation_ms`; in raw offsets a constant latency cancels in every
  difference and MAD. Test: `a_steady_player_with_a_stale_seed_has_not_drifted`.
- M2 fixed: in `useRunFindings` a later segment of the run that closes with no findings clears the
  earlier finding, and the sentences are self-scoped ("a stretch of N notes", "beats you played
  through"). Tests are in ToolCoach.test.tsx (M2 x2).
- M3 fixed: the counts are in `Evidence.freePlay` (`FreePlayCounts`, serde-skipped when absent).
  Tests: `one_late_note_does_not_make_a_beat_late` and `a_tempo_finding_quotes_the_tempos_as_played`,
  plus toolFinding.test.ts.
- L1 fixed: `FreePlayBeat` is a 20-byte `Copy` record with no heap. The segment keeps a `VecDeque`
  capped at 16,384 records (the newest kept, 320 KB at most).
  Tests: `a_free_play_record_is_small_and_owns_nothing` and
  `a_segment_keeps_its_newest_free_play_records`.
- L2 fixed: the SettingsChange and demo closes clear the records before the build, and
  `build_segment_ended` skips analysis on empty records.
  Test: `a_close_that_emits_nothing_analyses_nothing` (live loop).
- L3 fixed: `at` is the payload's `endMs`, and a payload that ended before this run started is ignored.
  Test is in ToolCoach.test.tsx.
- L4 fixed: `PracticeSegment::from_segment_end` (`session_log.rs`) is now what `commands.rs` calls; the
  "not stored" test goes through it. The live-loop tests drive both push sites.

## Rust hunks and threads

- `engine.rs` (event loop, the `beat_log` push about line 9021): `bar_beat: notif.measure_beat`, a
  plain field copy. No allocation, no lock, no new queue field. The output callback is untouched.
- `timing.rs` analysis thread:
  - the `BeatTick.bar_beat` field (line ~64);
  - the SettingsChange close and the demo close (~1254, ~1329): `mut seg` and `free_play.clear()`;
  - the matched push (~2160) and the miss push (~2300): compact records;
  - `build_segment_ended` (~3460);
  - `SegmentState.free_play` with `push_free_play`;
  - tests.
  None of this is in c5b1's ranges (600-665, 2990-3146, 3191-3222), but **any `BeatTick { }` literal
  c5b1 adds needs `bar_beat`**.
- `commands.rs` (about line 1526, the `on_segment_end` closure): the literal is replaced by
  `PracticeSegment::from_segment_end`. c5b1 also edits `commands.rs`.
- `findings.rs`: the free-play section, `Evidence.free_play`, and `CEILING_MIN_SAMPLES` removed.
- `session_log.rs`: `from_segment_end`.
- `tests/highbpm_fixtures.rs`: `bar_beat` in its literal.

## Gates

See the final report.
