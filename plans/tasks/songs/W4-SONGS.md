# W4 — Songs: import a tab, see it, follow it

Branch `songs-w4-songs`. Size L. `plans/SONGS.md` A1–A7 (A5 and A7 are
decided: Songs is its own rail mode beside Jam; notes light on timing
while playing, the verdict comes after). Three stages, a commit each.

## Stage A — the spike, written down (half a day, then decide)

alphaTab (`@coderline/alphatab`, MPL-2.0 — confirm the licence file
carries no "Incompatible With Secondary Licenses" notice; Yames is GPL-3)
reads Guitar Pro 3–7, MusicXML and alphaTex and renders a tab. We want it
to **read and draw only**. Its player is WebAudio in the webview, on a
clock the scoring engine does not share, and must stay off.

Answer in `plans/tasks/songs/W4-FINDINGS.md`: does its model give us
everything `SongScore` needs (unrolled repeats and endings, tempo and
meter changes, ties, techniques, tuning, capo, per-note string/fret)?
Can the cursor be driven from outside at 60 fps by a tick position with
the player disabled? Bundle size, worker/font loading under Tauri's CSP
and asset protocol, render time for a 200-bar song, behaviour in all 13
themes (it must take our colours, not its own). If any answer is no, say
what the fallback is (own renderer over its parser, or another parser)
before writing stage B. Test files: write alphaTex fixtures yourself and
export nothing copyrighted into the repo; no real songs are committed,
ever (`SONGS.md` S0.4).

## Stage B — the importer (pure TypeScript, fully tested)

`src/songs/types.ts` (the contract, verbatim), `src/songs/import.ts`
(file bytes → `SongScore` for a chosen track), `src/songs/schedule.ts`
(`SongScore` + bar range → `ScoreSchedule`, per the contract's rules on
chords, ties and soft onsets). Vitest over alphaTex fixtures: a repeat
with first and second endings unrolls correctly and `printedBar` maps
back; a tempo change lands on its bar; a tie makes no onset; a chord is
one onset; a hammer-on is `soft`; a 7/8 bar has the right length; a
seven-string and a drop-D tuning survive; a file with no guitar track
fails with a sentence a musician can act on.

## Stage C — the mode

- **Songs** in the rail after Jam (`MainView`, `useActionDispatcher`
  `tab-5`, the rail, the docked transport — follow exactly how `jam` was
  added; search for it). Library on the left like the other modes: import
  (file dialog via the existing Tauri dialog plugin, and drop a file on
  the window), list, rename, delete. Until W2's store is merged, keep
  scores behind a small interface with a `tauri-plugin-store`
  implementation, so swapping to SQLite is one file.
- On import: pick the track (guitar and bass tracks first), show tuning
  and capo before anything plays.
- The stage: the tab, scrolling, the cursor driven by the ENGINE's beat
  events (the same ones the metronome view uses), never by a JS timer.
  For this wave the engine just clicks at the song's first tempo; tempo
  steps and backing come next wave. Pick a bar range or a section, loop
  it, set a tempo percentage (50–100 %). Space plays, as everywhere.
- Build the schedule for the chosen range and call `load_score_schedule`
  behind a guard that no-ops until W1's command exists.
- Empty state, keyboard and footswitch reach, all 13 themes, and the
  layout gates: add Songs to `tests/layout` the way Jam is there
  (container queries, no clipped controls at the minimum window size).
- Follow the UI rules the owner has already set (`plans/UI_DECISIONS.md`,
  `plans/JAM_UX_DECISIONS.md` A13: what you change while playing lives on
  the stage, setup lives in the drawer; menus are portalled; never hide
  the main content behind a toggle).

## Dependency

You are the one worker allowed to add a package. Use `npm install
@coderline/alphatab` in YOUR copied `node_modules`, commit
`package.json` and `package-lock.json`, and check whether `bun.lock` is
still used by anything (CI uses `npm install`); if it is, update it too,
if not, say so in the report and leave it.

## Gates

build, vitest, layout. No Rust.
