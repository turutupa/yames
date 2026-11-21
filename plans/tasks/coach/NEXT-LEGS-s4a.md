# Session 4, writer A: c5b, c5c, lb1: order, what runs beside what, shared files, R flags, gates

Written 2026-11-20 by brief-writer A (branch `coach-briefs-a`, from `coach` at `494a9053`). Same
columns as `NEXT-LEGS.md`, which this file does not edit. Every brief names its worktree
`/home/dgx-delgado/yames-coach-<leg>`, branch `coach-<leg>`, logs `/tmp/coach-<leg>/`. **R** = the
orchestrator's independent reviewer reads the diff before merge.

## The legs

| Leg | Brief | Needs merged first | May run beside | Shares files with | R | Gates beyond tsc / vitest / build |
|---|---|---|---|---|---|---|
| c5b1 | `c5b1-hear-back-engine.md` | – (c1b1, c1c merged); **the orchestrator settles its retention question first** | the Ask chain, t2b, nf1, c5c1, c5c3, lb1 | c5c2: `timing.rs`, `commands.rs` (different functions; second to merge rebases); any IPC leg: `ipc.ts`, `src/test/mocks.ts`, the parity manifest (second regenerates it) | **R (audio)** | `test:rust`, `test:dsp`, `test:highbpm`; probe `--no-llm`, `--hear-take`, `--hear-take --song-loop --song-take`, the two standing pairs |
| c5b2 | `c5b2-hear-back-chip.md` | c5b1 | the Ask chain, t2b, nf1, c5c* | lb1 and pol1: `useSessionRun.ts`; c1-era notes: `SessionCoach.tsx`, `session` locales, `coach.css` | **R** (`useSessionRun.ts`, `useListenDemo.ts`) | `coach-session`, `coach-voice`, `coach-loop`, `smooth`, `short-window`, `phone-learning`, scenes; e2e probe if quiet |
| c5c1 | `c5c1-use-session-split.md` | **pol2** (it edits a comment in `useSession.ts`) | c5b1, c5c2, lb1, t2b, nf1 | nobody else may edit `useSession.ts` while it runs; `doors.test.ts`, `COVERAGE.md` | **R (doors parity)** | the seven `useSession.*` tests unedited; `tool-coach`, `smooth`, `coach-session` |
| c5c2 | `c5c2-free-play-findings.md` | – | c5c1 (if it stays out of `useSession.ts` / `useSegmentCoach.ts`), lb1, t2b, nf1, the Ask chain | c5b1: `timing.rs`, `commands.rs`; `src/types.ts`; `toolCoach` locales | **R** (analyzer, payload) | `test:rust`, `test:dsp`; `tool-coach`, `smooth`, a scene |
| c5c3 (+ c5c4) | `c5c3-template-catalog-locales.md` | c5c1; **the orchestrator settles its size question first** | c5b*, lb1, t2b, nf1, the Ask chain | `useToolCoach.ts` (an import), `useRealtimeTips.ts`, `useSegmentCoach.ts`, `songs/verdict.ts`, a new `toolTips` namespace in all fifteen locales | – | `i18n.locales`, catalogue tests, `songs/verdict.test`; `tool-coach` in en and de |
| lb1 | `lb1-loop-bars-door.md` | – | c5b1, c5c*, nf1, t2b, the Ask chain (it touches none of their files) | c5b2 and pol1: `useSessionRun.ts`; t2c / t2d: `src/coach/tools/practice.ts`; `coachTools` locales | **R** (`useSessionRun.ts`, `runner.ts`) | `coach-loop`, `ask-tools`, `smooth`; probe `--song-loop --song-take` |

**Size risk**: c5b1 medium (Rust reading is the cost: `timing.rs` is long, read only the named ranges);
c5b2 medium (fifteen locales and scenes); c5c1 medium (2,295 lines read once, moved verbatim); c5c2
small to medium; c5c3 **high** in helper output (about 18,000 translated lines), low in the leg's own
context; lb1 small.

**Suggested order**: lb1 and c5b1 now (lb1 is small and unblocks a stub the Ask chain shows as "not
yet"); c5c2 beside them; c5c1 once pol2 merges; c5b2 after c5b1 and after lb1 merges; c5c3 after
c5c1.

## What the code says that the design does not

1. **The Take's audio is not held after the pitch pass.** DESIGN 4.2: "which the app already holds in
   memory for the pitch pass (`take_audio.rs`)". It is handed to the `yames-take-notes` thread once
   and dropped as soon as the grade is published (`src-tauri/src/timing.rs` 3075-3076). It is captured
   at all only when the tap is armed (`timing.rs` 610-628: written pitches plus a `noteIdentity` bar,
   the `detect-tract` verifier, a bend or vibrato, diagnostics or the recording session) and never
   for a MIDI input (3212) or with the input off. c5b1 opens with the question and three options.
2. **A closer playback path than speech exists**: `take::TakeHandoff::set_play` / `TakePlayback`, the
   jam's listen-back (`engine.rs` 7090-7150, `commands.rs` 5437-5463): in-memory mono at any rate,
   resampled in the callback, parked by `TakeParking`, its end reported by generation. It silences
   the click and the band while it plays and resets the transport's counters, so "the probe with a
   Take's audio playing" under the click cannot happen as written (judgement call 3).
3. The `hearTake` `CoachAction` of DESIGN 9.3 does not exist; the mocks (06, 14) show the control as
   a `play` chip in the result note, and `NoteChip` already has kind `"play"` (`CoachNote.tsx` 200;
   used by the ready note's listen demo, testid `coach-hear`).
4. `useSession.ts` is 2,295 lines and still holds `messages` (DESIGN 7 had them leave in C2a; c2a2
   kept them because the tool line and note read them). The two new hooks sit under `useSession`
   kept as a composer, so `MainWindow`, `platform.inert.ts` and seven tests do not change.
5. The catalogue is about 1,305 strings, and the locale folder's contract (every language carries the
   same namespace files) means the move lands in all fifteen at once.
6. `analyze_free_play` still has no caller (`findings.rs` 1622; tests only).

## Judgement calls (the design was silent or could be read two ways; overrule any)

1. c5b1: written for retention option A (one Take in RAM, replaced by the next, freed when the input
   stops or on `forget_heard_take`; never on disk). The input's stop is the Session's natural end
   (`useSession.endSessionNow` → `setListening(false)` → `stop_evaluation`).
2. c5b1: the slice carries a short margin before and after the bar; the leg picks it and tests it.
   The level is the raw input's (no normalising); if it is too quiet to hear, that is reported, not
   fixed by an invented gain.
3. c5b1: the probe mode alternates click and hear-back (they cannot overlap); missed beats are counted
   over the click's spans; the two standing pairs are re-run unchanged as the regression, plus
   `--hear-take --song-loop --song-take` as the Session's own neighbour.
4. c5b1: a Start cuts a hear-back in the `set_playing` / `toggle_playback` command, before the
   transport flag, and only a playback the hear-back started (the jam's listen-back stays as it is).
5. c5b2: "yours" is the Take's bar the note's place points to, as the strip numbers it; the demo is
   the same pattern bar at the Take's tempo. The input is gated during both halves as the demo gates
   it. The press cuts the voice's line. The chip is absent, never disabled, when the audio is not held.
6. c5b2: the two playing states relabel the chip ("Yours: bar N · Stop", "Demo: bar N · Stop");
   wording final after the honesty lint.
7. c5c: split three ways by size, not two: c5c1 (the split), c5c2 (`analyze_free_play`), c5c3 (the
   catalogue), with a conditional c5c4 for locales.
8. c5c1: `useSession` stays as the composer with the same returned object, so no caller and no test
   changes; a call-log snapshot recorded before the split is the behaviour gate.
9. c5c2: findings ride on the segment-end event and are **not stored** (no change to the stored
   `SessionSegment`); the note leads with one measured sentence, and with none it is today's note.
10. c5c3: all variants translated (none trimmed), one new namespace `toolTips`; the LLM rephrase runs
    on English text only (owner decision 3); placeholders stay the catalogue's `{name}`.
11. lb1: "as printed" bars are mapped to pattern bars; a range the player asks for is honoured inside
    the pattern even past `LOOP_MAX_BARS` (that limit is the coach's own offer, not the player's
    request); a loop asked before any Take is allowed (the runner already allows it), two rungs under.

## Not found in the design

How long the Take's audio may be kept, and what frees it; how a bar of the player's audio is cut
(margins, level); what the chip says while it plays; whether free-play findings are stored; how the
catalogue's size is to be translated; how a player's "bar N" maps onto rounds of the pattern.
