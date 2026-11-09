# Revamp wave: Yames opens on today's Session

Read `CLAUDE.md` first, then this. The owner's decision (2026-11-08): revamp the
whole app to be learning-path-first, without any tool losing functionality. The
owner plays nothing until the first playable build, and wants to test the new UI
with a real guitar at that point. Reference material, all in `plans/revamp/`:

- `CONVERSION_AUDIT.md`: what exists, what's missing, item numbers used below.
- `TOOLS_PARITY.md`: 1,103 rows; the checklist of what must not be lost.
- `mocks/index.html`, `mocks/README.md`: the target screens and concept.
- `plans/PATHS_PIPELINE.md`, `src/paths/`: the Path format, pipeline, draft Paths.

## Terms, exactly
Path, Step, Exercise (task with a pass bar), Take (one graded attempt), Session
(today's plan, built by the coach and timed to fit), Setlist (a routine the player
builds), Tools (Metronome, Ramp up, Setlist, Jam, plus Songs), Coach.

## Rules
1. **Tools lose nothing.** Every row in `TOOLS_PARITY.md` still works. Existing
   screens live under Tools unchanged unless a brief says otherwise. Saved
   formats, settings keys and hotkey meanings don't change. Tab hotkeys are
   positional today (`tab-1` to `tab-5`): adding Today must not renumber them.
2. **The click is sacred.** Nothing adds jitter. Changes to the audio callback,
   engine, the queue between them, or the settings and SQLite stores get the
   `reviewer` agent, which the orchestrator runs before merging.
3. **Plain code decides, the model narrates.** No score, verdict or exercise comes
   from a model. The coach only states what was measured; it says "I didn't catch
   enough" rather than guess, and never claims to hear pick direction or see hands.
4. **Local and free.** No cloud, accounts or telemetry in this wave.
5. **Sessions go through `useSession`'s existing call order**, or history is lost.
   Don't bypass `setView`, `app_ready` or first-run detection (parity risks).
6. Nothing is committed on `main`; no commit message starts with `release`.
   Workers don't start `tauri dev`, don't push, and work only in their worktree.

## Decisions taken so far (the owner can overrule; flag if a brief hits one)
- **Clean tempo**: the highest tempo at which a Take on that Exercise passes its
  bar over at least 8 bars. One number per Exercise, not per player.
- **Front door**: Today for everyone; a setting "open on my last tool" for players
  who only want tools. Rail: Today, Paths, Progress, Tools; existing modes sit
  under Tools.
- **First Mechanics grading needs a mic or direct input**; tap input is cut.
- **No three.js, voice or OpenRouter in the first playable build.** The screens are
  structured so a 3D neck can replace the 2D one later; the jitter question comes
  first.

## First playable build (the target of this wave)
Today, with time choice and reasons; a real Session; Alternate Picking graded on a
real guitar; Find my edge; results with the number that moved; every existing tool
reachable under Tools.

## Workers and ownership
| Worker | Branch | Owns | Must not touch |
|---|---|---|---|
| W1 grading | `revamp-w1-grading` | `src-tauri/src/` score, onset, timing, audio input; `src-tauri/tests/` | UI, `db.rs` |
| W2 parity | `revamp-w2-parity` | New test files only | Production code |
| W3 tracer | `revamp-w3-tracer` | `src/` shell and new session and path runtime; `db.rs` migration | `score.rs`, onset, timing |

Each branches from `revamp` and merges back when green. If a worker needs a change
in another's files, it stops and says so in its report.

## Gates
As `AGENTS.md` names for the files touched: `tsc --noEmit`, vitest, `npm run
test:rust`, `test:dsp`, `test:highbpm`, `test:pitch`, and `test:layout` for a
stylesheet or a screen's shape. On this Linux machine aubio-sys may need
`CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'`. There's no lockfile: copy
`node_modules` from the main checkout, then `npm install --no-save
--no-package-lock` inside the worktree if something is missing.
