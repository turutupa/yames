# Leg c5b2: "Hear bar N: yours, then the demo", the chip on the result note (R, Session runner)

Worktree `/home/dgx-delgado/yames-coach-c5b2`, branch `coach-c5b2`. Logs under `/tmp/coach-c5b2/`.

The second half of c5b: the player hears the bar the note named, first from their own Take, then
the demo of it at the same tempo. **Needs c5b1 merged** (read `plans/coach/progress/c5b1.md` first:
which retention option was built, and the exact names of `hearTake`, `stopHearTake`, `heardTake`,
`forgetHeardTake`; theirs win over any name here). **R**: `useSessionRun.ts` and `useListenDemo.ts`
change; the orchestrator's reviewer reads the diff.

Read: `plans/coach/progress/c1c.md` (the note's place, `spotOf`, the loop's bars), `c1b2b.md` (the
voice, `soundGate`, the cuts and why each was needed), `c1b1.md` (`noteFinding`, the chips). Design,
read-only: DESIGN 4.2 "Hear it back", 3.4, 3.6; mocks `06-result-below` and `14-phone-result` (Read
the PNGs under `mocks/shots/`): the chip is a `play` chip in the result note, "Hear bar 1: yours, then
the demo". Code: `SessionCoach.tsx` (`ResultNote`; the ready note's `coach-hear` chip at line ~424 is
the listen demo and stays as it is), `CoachNote.tsx` (`NoteChip`, kind `"play"` exists),
`useListenDemo.ts`, `session/listenDemo.ts` (`buildListenDemo`, `range: wholeSong(score)`),
`soundGate.ts`, `coach/voice.ts` (`setVoiceSounding`).

## What to build

1. **When the chip is there.** On a result whose note names a place (`spot.patternBars`), and only
   when `heardTake(notesSerial)` says this Take's audio is held: otherwise the chip is **absent**,
   never disabled with an apology (an ungraded Take, input off, MIDI, a gap, an older Take). Never
   during a Take, a count-in, a loop or a demo. A pure selector with a table test over those cases.
2. **Which bar.** The bar of the Take the note's place points to, as the strip numbers it; "yours" is
   that bar from the Take, the demo is the same pattern bar at the Take's tempo. A test over a
   four-bar pattern played three rounds.
3. **The sequence** (`containers/session/hooks/useHearBack.ts`, new): press → the input gated as the
   demo gates it (`setListenDemo(true, { lengthMs })`, so the speakers are never heard as the player)
   → `hearTake` → on `take-playback-ended` for that generation, the demo of the bar range through the
   Session's engine queue (`buildListenDemo` given a bar range; the whole-tune demo unchanged) → the
   gate lifted, the result's Take loaded again as today. A second press stops it. Start, leaving the
   result, a new step, leaving the Session: stopped (`soundGate` for Start; the Session's exit also
   calls `forgetHeardTake`). The voice's line is cut by the press, as any engine sound cuts it. Unit
   tests over the mocked IPC: the order of calls, a stop between the two halves, Start during each.
4. **The chip's states**: "Hear bar N: yours, then the demo"; while yours plays, "Yours: bar N ·
   Stop"; while the demo plays, "Demo: bar N · Stop" (wording settled with the English honesty lint;
   nothing praises or judges). State in a ref plus one `useState` for the label, changed only at the
   two boundaries: no render per frame.
5. **Fifteen locales** for the new `session.note.*` keys (sonnet helpers, four or five locales each,
   `plans/COACH_I18N_BRIEF.md`); the honesty lint (`noteStrings.test.ts`) reads them.
6. **Layout scenes and specs**: a harness stop with the chip on a result (1440 and a phone, Ember and
   Manuscript, one in German), the chip absent on an ungraded result; the harness mocks the three
   commands and logs their order like `window.__yamesSpeech`. A `smooth.spec.ts` case: during the
   hear-back nothing commits more than the two boundary renders; during a Take the chip is not in the
   DOM. Pictures only when `YAMES_SHOT_DIR` names a folder.

## Not yours

The Rust slot, `hear_take` and the probe (c5b1: a defect there is reported, not fixed here). The ready
note's listen demo. The loop (lb1 owns its bars door; do not run beside it: both edit
`useSessionRun.ts`). The recording session. Any Ask file.

## Gates

tsc, vitest, build; layout by name: `coach-session.spec.ts`, `coach-voice.spec.ts`,
`coach-loop.spec.ts`, `smooth.spec.ts`, `short-window.spec.ts`, `phone-learning.spec.ts`, your scenes
(`--lock coach-layout`). The full layout suite is the orchestrator's (text changed on the result:
say so). The e2e probe (`npm run test:e2e:probe -- --no-build`) if the queue allows it on a quiet
machine; otherwise name it as owed.

## Report

As the rules block's end of the leg: the selector's table; the call order of one hear-back as the
harness logged it; the screenshot paths; the locales that want a native read; a **"diff for
review"** paragraph naming every hunk in `useSessionRun.ts`, `useListenDemo.ts`, `listenDemo.ts`,
`soundGate.ts` / `voice.ts`, `ipc.ts` if touched.
