# Leg c5c2: `analyze_free_play` as the tool note's finding source (R, analyzer and IPC payload)

Worktree `/home/dgx-delgado/yames-coach-c5c2`, branch `coach-c5c2`. Logs under `/tmp/coach-c5c2/`.

PLAN's c5c, second third. DESIGN 7 (the "Code" table): "Rust `findings.rs` `analyze_free_play`: no
caller today. It becomes the tool note's finding source (C5)." Still true at `494a9053`: the function
(`findings.rs` 1622) is called only by its own tests (2876-2979). The tools' note today leads with the
mini-report's template sentence (`useSegmentCoach.ts` → `messages` → `ToolCoach.tsx`
`toolCoachView`). **R**: the segment-end payload in Rust and its type in `src/types.ts` change. May run
beside c5c1 (it edits neither `useSession.ts` nor `useSegmentCoach.ts`; if it must, it waits for c5c1).

Read: `plans/coach/progress/c2a2.md` (Listen, the tool line and the tool note; Tool runs reads stored
segments), `c1a.md` (`takeNote`: how a Path Take's finding is worded, the model for this one). Design,
read-only: DESIGN 7, 2 (voice), 5.4 (guardrails: measured facts, no cause). Code: `findings.rs` 1580-1850
(`FreePlayBeat`, the four `free_*` diagnostics: `BeatPositionBias`, `SubdivisionWeak`, `TempoCeiling`,
`Drift`, and `rank`), `commands.rs` ~1505-1550 (the `on_segment_end` closure that emits
`practice-segment-ended` and builds the stored `SessionSegment`), the analyzer in `timing.rs` where a
segment closes (grep `push_segment`, `SegmentEnd`), `src/songs/types.ts` 359 and 438 (`FindingKind`,
`Finding`: the TS shape Songs already uses), `ToolCoach.tsx`.

## What to build

1. **The pairing.** Where the analyzer closes a free-play segment, build the `FreePlayBeat` list (each
   `BeatFeedback` with the `BeatTick` it was judged against; the doc comment at 1584 says why the
   caller pairs them) and run `analyze_free_play` on the analyzer's thread, never the audio thread.
   Bound its cost (a segment of 2,000 beats: time it in a Rust test, say the number). A Path Take's
   segment (a score loaded) runs nothing new.
2. **The payload.** `findings: Vec<Finding>` on the segment-end event (empty when nothing ranked),
   serialized with the shape Songs' findings already use; `SessionReport.findings?` in `src/types.ts`.
   **Not stored**: the `SessionSegment` written to history is unchanged, so Tool runs and old rows are
   untouched (a test on the stored shape). Rust tests: one fixture per diagnostic, and none on a clean
   steady run.
3. **The wording** (`src/coach/toolFinding.ts`, new, pure): the top finding as one sentence, a
   measured fact with its number ("the off-beat eighths went missing in 9 of 24 bars", "you drifted
   about 6 BPM faster over the run"), no cause, no praise; `null` when there is none or the run was
   under the note's 10 s. A table test per kind and per locale-independent number format.
4. **The note.** `ToolCoach.tsx`'s note leads with that sentence when there is one; the mini-report's
   text follows as today; with none, the note is exactly today's. Nothing during play: the note exists
   only after a stop. The tools' line (live tips) is not touched.
5. **Fifteen locales** for the new keys under `toolCoach.finding.*` (sonnet helpers,
   `plans/COACH_I18N_BRIEF.md`); the English honesty lint covers them.
6. **A layout scene**: the tool note with a finding, 1440, Ember and Manuscript, one in German;
   `tool-coach.spec.ts` extended with the finding's presence and absence.

## Not yours

The split (c5c1), the catalog (c5c3). The live tips, the gatekeeper, the LLM rephrase. Songs' and
Paths' findings (`analyze_attempt`, `takeNote`). Anything stored.

## Gates

`npm run test:rust` (12G / 30m), `npm run test:dsp`; tsc, vitest (parity suites included: the event
payload is in the surface manifest if listed there), build. Layout by name: `tool-coach.spec.ts`,
`smooth.spec.ts`, your scene (`--lock coach-layout`). No probe: nothing runs on the audio thread;
say so with the line that shows where it runs.

## Report

As the rules block's end of the leg: the cost of the analysis on a long segment; the four sentences
for their fixtures; a **"Rust diff for review"** paragraph (every hunk in `timing.rs`, `commands.rs`,
`findings.rs` if touched, `src/types.ts`).
