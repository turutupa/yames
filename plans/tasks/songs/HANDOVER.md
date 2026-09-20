# Songs, first night — what is on `songs-v1`, and what is yours

Written 2026-09-20 by the orchestrator, for the owner. Fourteen Opus 5
workers, fourteen branches, all merged into **`songs-v1`** (worktree
`C:\Users\alber\Dev\yames-songs`). Nothing is pushed. `main` is untouched.
Every gate is green on the combined branch (numbers at the end).

**Nobody has heard or seen any of this run.** Workers may not start the
app. Everything below is proven by tests, fixtures, the layout suite and
the offline renderer — not by a guitar. The first thing to do is run it.

## Try it (in this order)

```
cd C:\Users\alber\Dev\yames-songs
npm run tauri dev
```
1. **Songs** is in the rail after Jam (⌘/Ctrl+5). Import a Guitar Pro or
   MusicXML file (button or drop it on the window), pick your track.
2. Press play: the file's drums, bass and keys play through Jam's sounds,
   the cursor follows the engine, faders and a count-in are on the stage.
3. Pick a bar range, loop it, slow it down, play along, stop. **The
   review appears**: the tab coloured by how it went, one sentence from
   the coach, and a button that sets up the fix.
4. Turn takes on for the song and record a pass: the review then names
   wrong notes on single-note lines.

Without a guitar: `npm run dev`, then
`http://localhost:1420/shots.html?shot=songs-review-rushing&theme=ember&window=main`
(also `songs-review-missed`, `songs-review-clean`; any theme), and
`http://localhost:1420/blocks-gallery.html` for every coach component in
every theme.

## What was built

| | |
|---|---|
| W1, W11 scoring | The detector follows the player, not the click (16ths over a quarter click: 79 → 96). Scoring against a known score with sequence alignment: misses, extras, quiet hammer-ons forgiven, accents reported. The live path no longer throws away one sixteenth in four. |
| W2, W10 store | SQLite: sessions, every attempt at every song note by note, songs, due dates. The coach reads a preset's whole history instead of thirty sessions. |
| W3 queue | The click stops allocating and locking on the audio thread. Zero allocations, frees and dropped beats in every probe run. The callback audit is in AGENTS.md. |
| W4, W13 Songs | The mode, the importer (alphaTab reads and draws only), the file's band through the engine, the exact cursor, faders. |
| W5 pitch | Which note was played, from the dry stem a take now keeps. 100 % on synthetic and sampled fixtures. |
| W6 findings | The coach's judgement as rules: 13 kinds, ranked, one correction as the headline, each with a fix. Spaced review. |
| W7 blocks | Your generative-UI idea: a catalogue of components that carry references, never content; schema + grammar generated from it; one renderer. |
| W8 coach | Roadmap 1.5/1.6/1.7: plain words in the report, learning mode, the tempo wall, one meaning for a score, 15 unreachable template slots found. |
| W9 engine | Tempo and meter steps to the sample, looping ranges, count-in, the band from the file, Songs as an engine mode. |
| W12, W14 review | Attempt → coloured tab → verdict in blocks → action. Live note lights. Record in Songs. |

## Yours to decide (none blocks trying it)

1. **`SONGS.md` A11 — the refractory when a free player speeds up.** The
   one real open engine question. Needs your 180 BPM capture
   (`scripts/debug-bpm.sh 180`), which is still owed.
2. **Score bands moved**: one table now drives ring, word and paragraph
   (85 / 70 / 55). 85–89 draws as top band, 50–54 as a miss.
3. **`SONGS.md` A8** — the dry stem beside each take, under the take's own
   opt-in. Built as proposed; confirm.
4. **The event loop lost its real-time promotion** (W3), on numbers taken
   with the machine at 100 % and no model on disk. Re-measure on a quiet
   machine with a model before release.
5. **Two cards changed appearance** (W14): the instrument picker's cards
   and one onboarding tile were drawing transparent because their colour
   token never existed. They now have a surface. Look at them.
6. **An error colour.** The token contract has none; three stylesheets
   fall back to a literal red.
7. **`COACH_UX.md`** — the draft of how the coach behaves. Only A3, A4, A5,
   B2 and D3 were built on; everything else waits for your reaction.
8. **Jam's default mix** (the task chip from the website work): keys sit
   ~10 dB under the drums at default faders. Still open.

## Waiting for your ear: Jam's default mix (merged so you can hear it in the app — NOT approved)

You asked for one branch to test, so `songs-w17-jam-mix` is merged as
`f3b0ccbb`. Play a jam with the bass and keys rows ON and judge it. If
you do not like it: `git revert -m 1 f3b0ccbb` — nothing else depends on
it.

Six before/after pairs were sent to you on 2026-09-20; they live in
`.claude\worktreesgent-a1b78c03f9e9ddac0\jam-mix-demos\`. The keys come up
2.2 dB as a section (to about 6 dB under the kit), and the five basses are
levelled against each other where a listener hears them (above 120 Hz):
slap +4.6 dB, synth +3.1, picked +0.9, upright −1.5. The old levelling test
measured basses in 200 Hz–4 kHz, a band a bass barely occupies. One gate
moved: keys-under-the-snare 6 dB → 5 dB. Say yes, no, or "more keys"
(`KEYS_TRIM` in `jam.rs` is the one knob).

The same worker found three things that are yours to decide:
- **A vibe tile hires drums and nobody else** (`DRUMS_ONLY` in
  `src/jam/vibes.ts`): press play on a vibe and it is a drum machine until
  the player turns the bass and keys rows on. The v1.2.0 notes promise a
  drummer, a bass player and a keyboard player. This may be a real part of
  "mostly drum sound", and no trim can fix it.
- **The disco vibe already clips** at the shipped volume (rendered peak
  1.000 before this change). The test that guards the mixer's clamp uses a
  synthetic worst case, not the real vibes.
- `scripts/sounds/band_demo.ts` renders chorus 1, which the Build
  arrangement plays a rung quieter; every listening round done through it
  heard the band held back.

## Known gaps, said plainly

- 14 locales carry English for the Songs screens and the coach's new
  sentences. Rail label and shortcuts are translated.
- Guitar Pro 3–5 files are untested (no file to test with).
- Live note lights are one verdict per beat smeared over its notes; the
  review corrects them per note on stop. There is no live per-note event.
- The take's start offset for pitch is measured from the frontend and is
  tens of milliseconds optimistic. Exact needs the engine to report it.
- A song does not survive an audio device change; it is reloaded once.
- The camera spike (`SONGS.md` K3) was not run: it needs you and a camera.
- `bun.lock` is stale and nothing uses it; `package-lock.json` is ignored.

## Before this goes to main

Run it. Then the manual pass, the jitter probe on a quiet machine (both
`--jam-swap --jam-move --jam-take` and `--song-loop --song-take`), and a
first launch on a copy of a real settings folder to watch the history and
song migrations run once. The store has never been opened by a live app.

## The gates, run by the orchestrator on the final branch

```
npm run build         built, tsc clean (main bundle 684.5 kB gzip; alphaTab and the review are lazy)
npm run test          188 files, 4956 tests passed
npm run test:layout   107 passed
npm run test:rust     834 passed; 0 failed; 1 ignored
npm run test:dsp      1 passed
npm run test:highbpm  3 passed  (raw-onset, played-rhythm and known-score layers)
npm run test:pitch    8 passed
```
`songs-v1` is 80 commits and +53 829 / −673 lines across 285 files ahead of
`main`. That is a lot to review in one sitting: the merge commits are one
per worker and each says what it is and what was checked, so
`git log --merges main..songs-v1` is the table of contents.
