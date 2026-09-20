# W6 — Findings: what the coach would say, computed

Branch `songs-w6-findings`. Size L. `plans/SONGS.md` S0.6, `plans/COACH_UX.md`
A4–A5 and D3, `plans/LEARNING_PATHS_DECISIONS.md` E3, roadmap §7 item 2.5.
New files only. This is the coach's judgement, and it is rules, not a model.

## Stage A — `src-tauri/src/findings.rs`

Input: a `SongScore`'s bars and notes (the contract in `BRIEF.md`), the
`OnsetResult`s and `ExtraOnset`s of one attempt (all passes), the tempo it
was played at, and optionally earlier attempts at the same bars. W1 is
creating `src-tauri/src/score.rs` with the contract's serde structs on its
own branch right now; create the same file with exactly the contract's
names and fields, nothing more, and the orchestrator will reconcile the two.

Output: a ranked `Vec<Finding>`, each
`{ kind, bars: (start, end), note_ids, severity 0..1, evidence, fix }`
where `evidence` is numbers a sentence can be built from (mean deviation
in ms and as a fraction of the beat, passes affected, hit rate) and `fix`
is an action the app can set up: `LoopBars { start, end, tempo_percent }`,
`Ramp { start, end, from_percent, to_percent }`, `ClickSubdivision { … }`,
`ComeBack { days }`. Kinds, at least:

- `consistentMiss` — the same notes missed on most passes.
- `rushing` / `dragging` — a signed bias on a passage, and specifically on
  a note value (the sixteenths rush, the quarters do not).
- `afterShift` — late or missed onsets following a position shift (a fret
  jump ≥ 4 or a string skip ≥ 2 between consecutive notes).
- `fallsApart` — accuracy decaying across a long passage (stamina) or
  collapsing above a tempo (the ceiling).
- `extras` — notes played that are not written, clustered somewhere.
- `uneven` — high spread with no bias: not early or late, just unsteady.
- `improved` and `clean` — specific praise: what got better against
  earlier attempts and by how much, or a hard passage played right on
  every pass. Never generic.

The ranking is `COACH_UX.md` A4: consistent misses first, then tendencies,
then the ceiling, then praise; **exactly one correction is the headline**,
the rest are there to be opened. `softAbsent` onsets never count against
the player. Chord notes are timing-only. Deterministic: same input, same
output, no clocks, no randomness. Pure functions, no I/O.

Also the free-play half of E3, from the matched data `timing.rs` already
produces for a segment (read its result types; do not edit the file):
per-beat-position bias, per-subdivision hit rate, the tempo band where
consistency collapses, drift within a segment. Same `Finding` shape, bars
absent.

**Gate:** table-driven unit tests, one synthetic attempt per kind built
by a small helper (a score, a perfect performance, then the mistake
injected), asserting the headline finding, its bars, and its fix; a
"nothing wrong" attempt yields praise and no correction; two findings of
equal weight rank stably; 10 000 onsets in < 5 ms.

## Stage B — `src-tauri/src/srs.rs` (roadmap 2.5)

The spaced-repetition scheduler as pure functions: SM-2 variant, quality
from score bands, intervals capped at 14 days for motor skills, reset on
fail, plus the ceiling rule (comfortable = highest tempo with MAD ≤ 15 ms
over ≥ 8 bars; peak = highest attempted with score ≥ 70). No database in
this file: it takes a record and returns the next record; W2 owns storage.
**Gate:** schedule monotonicity, the cap, reset on fail, property tests.

## Not yours

`timing.rs`, `onset.rs`, `engine.rs`, `db.rs`, the UI. Register your
modules in `lib.rs` and nothing else. No IPC yet: the review wave wires it.
