# W14 — Mounting: what the review built and could not plug in

Branch `songs-w14-mounting`, from `songs-v1` as it stands (it must contain
`merge(songs-w12-review)` and `merge(songs-w13-songs-engine)`). Size L. You
are the only worker running; every file is yours, but change scoring,
findings, pitch and engine internals only where an item says so. One
commit per item, in this order. W12's and W13's handover notes are in their
commit bodies (`git log songs-w12-review -4 --format=%B`, same for W13).

1. **The notes light while you play** (`SONGS.md` A7). W12 built and tested
   `useLiveNoteLights` and left it unmounted because the surface is
   alphaTab's engraving. Give `TabStage` a `lights:
   ReadonlyMap<number, TimingMark>` prop and paint the note elements from
   it (W4-FINDINGS says how alphaTab exposes note elements and why
   `useWorkers` must stay false). Cleared on stop; never fights the cursor;
   costs nothing when the map is empty. Quiet colours plus the same glyph
   language the review uses, all 13 themes.
2. **Record the pass.** A record control on the Songs stage beside play
   (follow Jam's take control exactly: opt-in, the same privacy copy, the
   same list/play/delete surface, takes listed under the song). W10 found
   `start_take` keys a take's folder by a jam id: use the song's id as that
   opaque key if `take.rs` allows it unchanged, otherwise give `take.rs` a
   public, song-aware lookup — smallest change that works, no change to the
   rings or the callback side. Then supply `{ takeId, jamId|songId,
   startOffsetMs }` to W12's `useSongTakePitch` so the review names wrong
   notes. `startOffsetMs` must be measured from the instant the analysed
   buffer starts (W5's warning: get it wrong and every note shifts).
3. **The store catches up** (Rust, `db.rs`, a THIRD migration; never edit
   one or two): `attempt_onsets.accent_heard` (nullable), and song due
   dates — `score_due(score_id, range_start_bar, range_end_bar, due_day,
   reason)` — with `saveDue`/`listDue`/`clearDue` commands. Move W12's
   `src/songs/due.ts` from `settings.json` onto it with a one-time,
   idempotent move. `analyze_attempt`'s earlier attempts then carry their
   accents.
4. **The progress line.** W12 left `progressFor` unsupplied because "percent"
   was undefined. Decision (orchestrator): it is the attempt's stored
   `score`, the same number the player sees elsewhere, per attempt at bars
   overlapping the passage, oldest first, one point per day (best of the
   day). Supply it from `queryAttempts({ scoreId, barRange })`.
5. **Three mismatches between the catalogue and the facts** (W12's
   findings 1–3; fix in `src/coach/blocks/spec.ts` + `types.ts`, then
   `npm run coach:blocks`): (a) `tabExcerpt.attempt`, `take.attempt` and
   `compare.attempts` become string ids, because the store's attempt ids
   are UUID strings, and `spec.ts`'s comment saying they are row numbers is
   corrected; (b) a block that names bars names PLAYED bars for the
   machine, and the renderer shows PRINTED bars to the player (`SongScore.
   bars[i].printedBar`), so a heading and a sentence can never disagree on
   a song with repeats; (c) `comeBack` carries `days: 1..=14` instead of
   three named occasions, so `Fix::ComeBack { days }` round-trips exactly.
6. **No more colours that do not exist.** A vitest that reads every
   stylesheet under `src/styles` and `src/containers/**` and fails on a
   `var(--token)` that is neither in `TOKEN_CONTRACT`, nor defined in the
   same file, nor written with a fallback (`var(--danger, #e5484d)` is an
   accepted idiom in three files and stays legal). It has caught this bug
   class three times in one night; make it impossible.
7. **The review leaves the main bundle.** It added ~61 kB gzipped to a
   bundle every player downloads for a screen only Songs players see. Move
   it behind the same lazy boundary as the rest of Songs and show the
   before/after sizes.

## Gates

build, vitest, layout, `npm run test:rust` (items 2, 3), and the shots
scenes W12 added must still build.

## Not yours

A model of any kind; the refractory question (`SONGS.md` A11); anything in
Jam beyond reading how its take control works.
