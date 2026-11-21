# Leg c5c1: `useSession.ts` split into `usePracticeHistory` and `useToolCoach`, nothing else (R, doors parity)

Worktree `/home/dgx-delgado/yames-coach-c5c1`, branch `coach-c5c1`. Logs under `/tmp/coach-c5c1/`.

PLAN's c5c, first third: the mechanical split DESIGN 7 promised for C5 ("Split in C5 into
`usePracticeHistory` and `useToolCoach`, with `src/test/parity/doors.test.ts` updated under the
`reviewer`"). **No behaviour changes.** The reviewer's one question is: *is it, call for call and
effect for effect, the same behaviour?* Every choice below serves that question. **Run after pol2
merges** (pol2 item 5 edits a comment in this file) and not beside any leg that edits `useSession.ts`,
`useSegmentCoach.ts` or `useRealtimeTips.ts`.

Read: `plans/coach/progress/c2a2.md` ("The `useSession.ts` diff, for the reviewer"; the `isActive` /
`queuedRef` fix), `c1a.md` (the quiet session: no model, nothing generated), `c1b2b.md` "Open" (the
reveal FIFO on `tts-speech-started`). Design, read-only: DESIGN 7 (the "Code" table's `useSession.ts`
row). Code: `src/hooks/useSession.ts` (2,295 lines at `494a9053`; read it in parts),
`src/test/parity/doors.test.ts` (lines 27-28 name `useSession.ts` as the only door to `saveSession` and
`getFinalSessionReport`; line 57 the mounted-once guard), `src/platform.inert.ts` (`INERT_SESSION:
ReturnType<typeof useSession>`).

## The file as measured (verify; line numbers at `494a9053`)

| Lines | What | Goes to |
|---|---|---|
| 211-232, 245-266, 474-494, 1240-1730 | options, `active` / `startedAt`, residency mirror, `playedBpmRef`, `startSessionNow`, `endSessionNow` (input off, final report, `saveSession`, summary), the lifecycle turn (`inTurn`, `queuedRef`, `isActive`, `startSession`, `endSession`) | `usePracticeHistory` |
| 229, 267-460, 495-1239, 1735-1849 | `messages`, narrative, gatekeeper, shuffle, interventions, the Signal A refs, speech and its reveal FIFO, the beat-feedback tips (586-898), the adaptive drill line (907-987), Signal A (988-1180), grid discontinuity (1181-1239), `handleChipAction`, `clearMessages`, `playMode` | `useToolCoach` |
| 1884-2295 | module helpers (`aggregateReports`, `buildPriorSummary`, `formatSessionContext`, `buildRephrasePrompt`, ...) | with the hook that calls them; a helper both call goes to a small `src/hooks/sessionHelpers.ts` |

Imported by `MainWindow.tsx` (line 358), `platform.inert.ts` (type), seven tests
(`useSession.{quietSession,historyFallback,isActive,brainLoad,parity,coachMemory,meterBoundary}.test.tsx`).
`useToolListen.ts` and `useSessionRun.ts` receive the returned object; they import nothing.

## What to build

1. **`useSession` stays, as the composer**: same file, same signature, same returned object (`active`,
   `messages`, `startedAt`, `isActive`, `startSession`, `endSession`, `clearMessages`,
   `handleChipAction`, `playMode`), so `MainWindow`, `platform.inert.ts`, `useToolListen`,
   `useSessionRun` and **all seven tests are untouched** (not one test line edited is the gate).
2. **`src/hooks/usePracticeHistory.ts`** and **`src/hooks/useToolCoach.ts`**: the blocks of the table
   moved **verbatim** (cut and paste of whole blocks, comments with them; the reviewer reads the diff
   with `git diff --color-moved=zebra`). Where `endSessionNow` both saves and writes the tool
   coach's summary, the order of the calls stays exactly as it is: the history hook calls a callback
   the composer hands it from `useToolCoach` (a ref), never a reordering.
3. **Hook and effect order.** Splitting a hook changes the order React runs its effects in. Write a
   table in the progress file: every `useEffect` / `useCallback` / `useRef` of the old file, its old
   position and its new one. Keep the relative order of any two effects that read or write the same
   ref; where that forces it, the composer calls the two hooks in pieces or keeps an effect in the
   composer. Every reorder you keep is justified in a line.
4. **`doors.test.ts`**: the `saveSession` and `getFinalSessionReport` doors name
   `usePracticeHistory.ts`; the mounted-once guard covers the two new hooks; `COVERAGE.md` updated.
5. **One new test**, `useSession.split.test.tsx`: the call log (IPC mocks, `ttsSpeak`, `saveSession`,
   `setListening`) of a scripted run (start, play, a segment end, a Signal A change, stop, end) is
   identical to a snapshot recorded **before** the split on the same branch (commit the snapshot
   first, then split).

## Not yours

Any behaviour, string or comment change beyond moved import lines. `analyze_free_play` (c5c2) and
the catalog (c5c3). `useSegmentCoach.ts`, `useRealtimeTips.ts`, `askStore.ts` (imported, not edited).

## Gates

tsc, vitest (the seven `useSession.*` tests, `useToolListen.test.ts`, the `useSessionRun.*` tests,
`src/test/parity/*` named in the report), build. Layout by name: `tool-coach.spec.ts`,
`smooth.spec.ts`, `coach-session.spec.ts` (`--lock coach-layout`). No Rust, no probe, no strings.
Size: the read is the risk (2,295 lines is about 35k tokens): read each block once, move it, commit.

## Report

As the rules block's end of the leg: the line count of the three files; the effect-order table's
summary (moves kept, with their reasons); the snapshot test's commit before and after; a **"diff for
review"** paragraph: `git diff --color-moved` ranges for `useSession.ts`, the two new hooks,
`doors.test.ts`, and every hunk that is not a pure move (there should be only imports, the composer
and the callbacks of item 2).
