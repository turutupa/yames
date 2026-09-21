# W35 — The sidebar lists songs. Parts are chosen on the stage.

Branch `songs-w35-library-lists-songs`, from `songs-v1` as it stands.
Size M. From the owner's second session, 2026-09-21, in his words:

> "on the sidebar on my mac the names also have an INCLUDED badge,
> making the content on the sidebar super cramped... not sure why we
> even need to add lead or rhythm or whatever on the sidebar, also, i
> added 1 tab on my mac and it shows 2 tabs on the left side, i think
> one per instrument, but this is not the kind of instrument selection
> i wanted, on the left side it's for songs, and then when in a song,
> in the stage area i should be able to select the instrument"

**The app is RUNNING on this machine from
`C:\Users\alber\Dev\yames-songs` (`tauri dev`), in front of the owner.**
Never touch that checkout, never start another copy, never kill a
process you did not start.

Read first: `src/songs/library.ts`, `libraryStore`, `songId()` (it
hashes the file's bytes AND the track index, so each part is its own
record — that stays, it is what keeps attempts, takes and due promises
per part), `useSongsSession.ts` (W29's `chooseTrack` opens or creates
a SIBLING record named `<song> · <part>` — that is what put two rows in
his sidebar), the sidebar's songs list component, W19's brief (recently
played, the starter shelf, the library copy of every opened file).

## What to build

1. **One row per song.** The sidebar groups records by FILE (the hash
   of the file's bytes, or the stored source — find what identifies a
   file independent of the part) and shows one row: the song's title,
   and under it, small and only if the file has one, the artist.
   **Nothing about the instrument, no part name, no bar count on the
   row.** Opening the row opens the part the player last had open for
   that song (else the part chosen at import). Every per-part record
   stays in the store exactly as it is; this is a grouping in the list,
   plus one remembered "last part" per file.
   - Migration, honest and idempotent: records that W29 named
     `<song> · <part>` go back to the song's own title for display; the
     part is a fact of the record, not of its name. Two records of one
     file become one row. Nothing is deleted. His Mac's library (one
     imported file, two rows) is the test case; write it as a fixture.
   - Rename, delete, "recently played", search, and the due mark act on
     the SONG: delete removes every part's record and the library copy
     of the file (say so in the confirm, with how many takes go with
     it); the due mark shows if any part has something due and opens
     that part; search matches title and artist.
2. **"Included" is not a badge on every row.** The starter pieces sit
   under their own small heading ("Included", the existing string) at
   the BOTTOM of the list, below the player's own songs, collapsible,
   remembered; a player's own songs are what the list is for. No
   per-row badge. With nothing imported yet the heading is open.
3. **Rows that fit.** At the sidebar's real width a title gets the whole
   row and ellipsises at the end; the full title is the row's tooltip
   and accessible name. In his screenshot the meta column ("Guitar · 8
   bars") wraps to two lines and squeezes the title to fifteen
   characters — that column is gone (item 1), and the layout suite
   asserts a title's box is at least 80 % of the row's at the sidebar's
   default width and its narrowest.
4. **The starter pieces' section names** are alphaTex identifiers
   without spaces ("TwoStrings", "ThreeStrings" — visible on the tab and
   on the strip's chips). Give them names a musician would write ("Two
   strings", "Three strings"), in `src/songs/starter/pieces.ts`; check
   every piece.
5. The instrument menu in the stage's header (W29) is the ONE place a
   part is chosen. Make sure that after this change switching part
   there does not add, rename or reorder anything in the sidebar, and
   that the row stays selected.

## Gates

`npm run build`, `npm run test` (the grouping, the migration fixture,
delete-by-song, last-part memory), `npm run test:layout`
(`--workers=2`; the sidebar at its default and narrowest widths, Ember
/ Ivory / Manuscript, English and German). Captures of the sidebar with
(a) only starters, (b) three imported songs + starters collapsed, (c) a
long title, in a git-excluded folder — read them. Rust only if the
store lives there: then `npm run test:rust` via
`node scripts/rust-test.mjs`, `CARGO_TARGET_DIR=C:\yt-w35`,
`--no-default-features`.

## Rules

`git checkout -B songs-w35-library-lists-songs songs-v1` first; MSVC
override; `node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs` (verify `@coderline/alphatab`); never
push, never merge, never start the app; explicit `git add` paths; no
line-ending-only changes staged; strings in all 15 locales at the END
of their namespace, plural forms where a string counts; commits end
with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. **W34 is
working in parallel** on the stage: it owns `TabStage`, `SongsView`,
`selection.ts`, the cursor, hotkeys, `songs.css`'s stage rules and the
click default. You own the library, the store, the sidebar's songs list
and the "which part / which record" bookkeeping in `useSongsSession` —
keep your edits there local to that.

## Report

How a file is identified; what the migration does to an existing
library (before/after of the fixture); capture paths; every gate's real
number; final commit; worktree path.
