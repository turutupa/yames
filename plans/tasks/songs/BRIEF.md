# Songs, first wave — the coach's ears, and the song it listens to (shared by every worker)

Read this, then your own file, then `plans/SONGS.md` (the decision log),
`plans/ROADMAP.md` §1 principles and the section your file names, and
`AGENTS.md`. The older BRIEFs' rules hold and are repeated below because
they have each cost somebody a night.

## Why

The owner's direction (2026-09-20): Yames is heading for a teacher you
log in to. Metronome, Drill, Setlists, Jam and Songs are instruments that
teacher plays. A teacher needs to hear accurately, know what you were
meant to play, remember, say what to practise next, and talk. Today the
coach hears only notes that land on the click's own grid, knows no score,
and remembers in JSON. This wave fixes the first three and gives it its
first known material: **a song the player imports themselves** (Guitar
Pro / MusicXML), played in a new rail mode, **Songs**, beside Jam.

## The branch

**`songs-v1`**, from `main` (8cc7ea1f). The integration worktree is
`C:\Users\alber\Dev\yames-songs` — read briefs from there, never write
there. **Your worktree may be on a stale commit**: run
`git log --oneline -1`, then `git checkout -B <your-branch> songs-v1`
before anything else. Branch names are hyphenated (`songs-w1-scoring`).
The orchestrator merges into `songs-v1`. Nothing is ever committed on
`main`.

## Rules that are not negotiable

- **No push, no merge, no PR, never start the app** (`tauri dev` uses the
  owner's real settings store and port 1420). Vitest, Playwright layout
  tests and the Rust test bins are how you prove things.
- **The click is sacred.** Nothing new on the cpal callback thread may
  allocate, lock or block. Pitch and alignment never run on it.
- **Deterministic decides.** Scores, alignment, findings come from Rust or
  pure TypeScript with tests. No model in any of this wave.
- **Musicians, not developers**, in every string a user can read. All new
  strings go in `src/locales/en/*.json` and are added to the other 14
  locales (English text is an acceptable fallback; keys must exist).
- `git add` explicit paths only. **`git add -A` is banned.** Commit in the
  repo's voice (`feat(songs): …` with a body that says why), ending with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Match the surrounding code: comment density, naming, idiom. Read a
  neighbouring file before writing a new one.

## Environment (Windows 11, this machine)

- Rust: `rustup override set stable-x86_64-pc-windows-msvc` in your
  worktree first. Run Rust tests **only** through
  `node scripts/rust-test.mjs …` / `npm run test:rust` (the test-binary
  manifest trap; bare `cargo test --lib` dies at load).
- Set `CARGO_TARGET_DIR` to a short path of your own, `C:\yt-<worker>`
  (MAX_PATH, and so parallel workers do not fight over one lock). Export
  `LIBCLANG_PATH="C:\Program Files\LLVM\bin"`. Always
  `--no-default-features` unless your file says otherwise.
- `node_modules`: `robocopy C:\Users\alber\Dev\yames\node_modules
  .\node_modules /E /NFL /NDL /NJH /NJS` (exit code 1 is success). Never
  `npm install` unless your file tells you to add a dependency.
- The Bash tool mangles backslashes in heredocs: write scripts to a file,
  run them by path. Files in this repo are CRLF in places; scripted edits
  must respect that.

## Gates (run what your change can reach; report every result verbatim)

```
npm run build            # tsc + vite
npm run test             # vitest
npm run test:rust        # cargo lib tests, no default features
npm run test:dsp         # post-match fixtures
npm run test:highbpm     # raw-onset fixtures
npm run test:layout      # Playwright, only if you touched layout
```
A scoring change that moves any existing golden must say which, by how
much and why, in the commit body. ±2 points on the 23 `d3d_scenario_*`
tests is the tolerance; anything more is a finding, not a rebake.

## The contract (fixed — if it is wrong, stop and say so, do not fork it)

### The score — one format for a song, an exercise, a path step

TypeScript in `src/songs/types.ts` (W4 creates it), mirrored by serde
structs in `src-tauri/src/score.rs` (W1b creates it), `camelCase` on the
wire:

```ts
export type SongScore = {
  schema: 1;
  id: string;                      // stable, hash of source bytes + track
  title: string; artist: string;
  source: { fileName: string; format: "gp" | "musicxml" | "alphatex"; trackIndex: number; trackName: string };
  tuning: number[];                // MIDI note per string, string 1 (highest) first, as Guitar Pro numbers them
  capo: number;
  ticksPerQuarter: 960;
  tempoMap: { tick: number; bpm: number }[];              // step changes, first at tick 0
  meterMap: { bar: number; numerator: number; denominator: number }[];
  bars: { index: number; startTick: number; lengthTicks: number; printedBar: number; section?: string }[];
  // Repeats and endings are UNROLLED: `bars` is what is played, in order;
  // `printedBar` maps each played bar back to the bar on the page.
  notes: SongNote[];               // sorted by tick, then string
  sections: { name: string; startBar: number; endBar: number }[];
};
export type SongNote = {
  id: number;                      // index in `notes`, stable for a given score
  tick: number; durTicks: number;
  string: number; fret: number; midi: number;
  tieFromPrevious: boolean;        // a tied continuation makes no onset
  ghost: boolean; dead: boolean; accent: boolean;
  techniques: ("hammer" | "pull" | "slide" | "bend" | "vibrato" | "palmMute" | "harmonic" | "tap" | "letRing")[];
};
```

### What scoring is told — the expected onsets

Derived from the score in TypeScript (`src/songs/schedule.ts`, W4) and
sent to the analyzer (W1b): notes sharing a tick are ONE onset; a note
with `tieFromPrevious` makes none; hammer-ons and pull-offs make an onset
flagged `soft` (they may be too quiet to detect and must not be scored as
a miss when absent).

```ts
export type ExpectedOnset = { id: number; beat: number; noteIds: number[]; soft: boolean; accent: boolean };
// `beat` is quarter notes from the start of the played range, as f64.
export type ScoreSchedule = { onsets: ExpectedOnset[]; lengthBeats: number; loops: boolean };
```

### What scoring says back — per expected onset

```ts
export type OnsetResult = { id: number; state: "hit" | "miss" | "softAbsent"; deviationMs: number | null; pass: number };
export type ExtraOnset = { beat: number; pass: number };
```
`pass` counts times round a loop, from 0. The store (W2) keeps these per
attempt; the review (next wave) colours the tab from them.

### Tempo inside a song (decided)

Step changes on bar lines only in v1 (`tempoMap`). The importer flattens
gradual changes to a step per bar and records that it did.

## Who owns what (touch nothing else; say so if you must)

| Worker | Owns | File |
|---|---|---|
| W1 scoring | `src-tauri/src/timing.rs`, `onset.rs`, `score.rs` (new), `src-tauri/tests/**` | `W1-SCORING.md` |
| W2 store | `src-tauri/src/db.rs` (new), `session.rs`, the history commands | `W2-STORE.md` |
| W3 queue | the callback → event-loop path in `engine.rs`, the jitter probe bin | `W3-QUEUE.md` |
| W4 songs | `src/songs/**` (new), `src/containers/songs/**` (new), rail/shell registration, locales, `package.json` | `W4-SONGS.md` |
| W5 pitch | `src-tauri/src/pitch.rs` (new), `src-tauri/tests/pitch_fixtures*`, the dry stem in `take.rs` | `W5-PITCH.md` |

`lib.rs`, `commands.rs` and `Cargo.toml` are shared registration points:
add your lines, keep them together, expect the orchestrator to resolve
the trivial conflicts.

## Report (your final message, nothing else)

1. Branch and last commit. 2. What is done, what is not, and why.
3. Every gate you ran, with the result line. 4. Anything you found that
contradicts this brief, the roadmap or the code comments. 5. What the
next worker on these files needs to know. Be blunt; the orchestrator
verifies claims against the code.
