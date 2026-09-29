# W1 — Scoring: hear what is played, not what the click plays

Branch `songs-w1-scoring`. Size L. Roadmap §6 items 1.3 and 1.4, §7 item
2.4, `plans/LEARNING_PATHS_DECISIONS.md` C1 and C4. Two stages; commit
each separately; stage B only when stage A's gates are green.

## Stage A — the refractory follows the player (roadmap 1.3)

Today `TempoContext.subdivision` is the AUDIBLE subdivision, so a
quarter-note click at 100 BPM gives a ~450 ms refractory and every played
16th is swallowed before the analyzer sees it. This alone makes Songs
impossible: a song's rhythm is never the click's.

- Feed the detector the divisor `RhythmInference` has locked (fall back to
  the audible one until lock); keep the instrument floor. When a
  `ScoreSchedule` is loaded (stage B) the smallest inter-onset interval in
  the schedule sets it instead — the score knows better than inference.
- Add virtual expected ticks for the inferred divisor inside
  `TimingAnalyzer`, so 16ths over a quarter click are scored, not marked
  spurious.
- The known ghost band (103–150 ms) is a `cluster_window_ms` matter per the
  comments in `onset.rs`; keep it separate, do not "fix" it here.
- **Gate:** new raw-onset fixture `100bpm_click_quarters_play_16ths`
  scores ≥ 85 with 5 ms jitter; every existing dsp/highbpm fixture and all
  `d3d_scenario_*` within ±2. A real 180 BPM capture does not exist yet
  (the owner will record one); build `seed-highbpm-fixtures`-style
  synthetic cover at 160/180/200 BPM 16ths so a regression is caught now.
- If time allows, 1.4 (per-beat divisor voting) with its roadmap gate. If
  not, say so; do not half-do it.

## Stage B — score against a known schedule (roadmap 2.4, LP C1/C4)

- `src-tauri/src/score.rs`: the serde structs for `ScoreSchedule`,
  `ExpectedOnset`, `OnsetResult`, `ExtraOnset` exactly as the contract in
  `BRIEF.md` has them.
- `TimingAnalyzer` accepts an optional schedule. With one loaded, matching
  runs against the schedule, not the inferred grid: a missing onset is a
  **miss** (not a rest), an unmatched onset is an **extra**, `soft` onsets
  that are absent are `softAbsent` and cost nothing, accents are checked
  when amplitude allows (report, do not score, in this wave).
- Alignment: the player drops and adds notes, so nearest-neighbour is not
  enough. Sequence alignment per bar or per loop pass (Needleman–Wunsch
  class, banded by the timing window so it stays O(n)), count-in ignored,
  a loop restarts the schedule but never the score. Must run off the audio
  thread and keep up live: the analyzer's existing thread is the place.
- The schedule's `beat` is in quarter notes; the engine's beat log is the
  only source of where beats actually fell (see the 2026-09-04 lesson in
  the code: a dropped `BeatNotification` degrades the score). Tempo steps
  mid-schedule must be handled by reading beat times from the log, never
  by computing them from a BPM.
- IPC: `load_score_schedule(schedule)`, `clear_score_schedule()`, and the
  results delivered with the existing session/segment results (extend the
  event, do not add a second channel). Route through `src/ipc.ts` types but
  leave UI wiring to the next wave.
- **Gate:** raw-onset fixtures `120bpm_dotted8th_16th_phrase` (≥ 85 when
  played right; the dropped note flagged as that note's id when one is
  omitted; an added note reported as an extra and nobody else's score
  moved), a looped two-bar schedule played three times with a different
  mistake each pass, and a schedule with a tempo step at a bar line.
  Free play with no schedule loaded is bit-for-bit what it was.

## Not yours

The tab, the importer, the store, pitch. `engine.rs` belongs to W3 this
wave: if you need something from the engine, write it down in your report
instead of taking it.
