# W10 — Wiring: the pieces that landed tonight start talking to each other

Branch `songs-w10-wiring`, from `songs-v1` as it stands (it must contain
the merges of W2 store, W3 queue, W4 songs, W5 pitch, W6 findings, W8
coach). Size M–L. Each item is small and each was handed over by the
worker who built the piece; read their notes where cited. One commit per
item. Still running elsewhere tonight, so stay out of their files: W1
(`timing.rs`, `onset.rs`), W7 (`src/coach/blocks/**`), W9 (`engine.rs`,
`song.rs`, `jam.rs`).

1. **The coach reads its whole memory.** `useSession.ts` and
   `useRealtimeTips.ts` still feed `presetAwareness` from
   `getSessionHistory()`, thirty sessions across ALL presets, so its gates
   (≥ 3 sessions per preset, ≥ 3 per BPM band) rarely fire. Point them at
   W2's `queryHistory({ presetId })`. Keep `presetAwareness` pure. Vitest
   for the gates firing with a history the old call would have truncated.
2. **Songs move into the store.** `src/songs/library.ts` is the one file
   behind W4's library interface; re-implement it on W2's `saveScore` /
   `listScores` / `getScore` / `deleteScore`, with a one-time, idempotent
   move of anything already in `songs.json` (leave that file in place,
   emptied of scores only after the move is confirmed). Replace
   `StoredSongScore = Record<string, unknown>` in `ipc.ts` with the real
   `SongScore`. The source bytes of the imported file ride along with the
   score (W4's A2 decision); check W2's `scores.json` column takes them, or
   add a column through a second migration — never edit migration one.
3. **A take knows its dry stem.** `JamTake` in `src/jam/types.ts` gains
   `dryPath?: string` (W5's Rust struct already has it). Nothing in the UI
   shows it; the review will use it.
4. **The coach's judgement and ears get a door** (Rust, `commands.rs` and
   `lib.rs` registration only, plus `src/ipc.ts`): `analyze_attempt`
   (score id or schedule, the attempt's onset results and extras, optional
   earlier attempts from the store → `Finding[]`, W6's `findings.rs`), and
   `analyze_take_pitch` (take id + score notes in range + onset results →
   per-note right / wrong / octave / unheard / notAssessed, W5's `pitch.rs`,
   reading the DRY stem, with `PitchConfig::for_tuning(&score.tuning)` —
   W5's report explains why the default range cannot resolve fast notes,
   and why `expected_at_ms` must be measured from the instant the analysed
   buffer starts). Both `#[tauri::command(async)]`, off the UI thread, as
   W2's commands are. `ipc.commands.test.ts` must stay green. TypeScript
   mirrors of `Finding`, `Fix`, `Evidence` and the pitch result in
   `src/songs/types.ts`, checked against W6's wire-format tests.
5. **Housekeeping the night turned up.** (a) The wall-clock tests that
   fail under load and pass alone — `kit::the_decode_is_quick_enough…`
   (its margin went when the band became FLAC), `take::` and `tts::` timing
   tests, `voices::a_melodic_bank_is_quick_enough…`, and
   `src/jam/keysFigures.test.ts` (14 s against a 20 s budget): make each
   measure something a busy machine cannot spoil (work done, not seconds,
   or a generous budget that still catches an order-of-magnitude
   regression), the way W2 did for its own gate. Do not touch the code
   under test. (b) `jam.css` uses seven custom properties that exist
   nowhere (`--warning`, `--radius-md`, `--bg-elevated`, `--success`,
   `--danger`, `--bg-base`, `--font-mono`; W4's report): map each to the
   token the contract does have, check the Jam layout tests still pass, and
   look at each affected rule in the layout screenshots rather than
   guessing. (c) The layout suite reuses whatever is on port 5390,
   including another worktree's vite: make `playwright.config.ts` refuse a
   server it did not start, or pick a free port.

   (d) `parseChordName("C6/9")` in `src/jam/harmony.ts` returns a plain
   C6: `chordSuffix("69")` writes `"6/9"` and the parser reads the slash as
   a bass note (W7's report). Fix the parser so every quality round-trips
   through its own suffix, extend `harmony.test.ts` to cover every quality
   that exists today, and then let W7's catalogue test that pins the
   workaround tell you what to update in `src/coach/blocks/`.
   (e) Add `"coach:blocks": "node scripts/coach-blocks.mjs"` to
   `package.json` beside the other scripts (W7 left it out to stay off a
   shared file).

## Gates

build, vitest, `npm run test:rust` for item 4 and 5a, layout for 5b. Kill
no process you did not start; other workers' vite and cargo are theirs.

## Not yours

The review screen itself (next worker, after W1 and W7 land), scoring,
the engine, the blocks.
