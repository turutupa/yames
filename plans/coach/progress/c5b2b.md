# c5b2b: the hear-back chip's fixes (review L1, L2, L3) and `coach` merged in (progress)

Branch `coach-c5b2`, on top of c5b2. Frontend only.

## What landed

- `coach` merged in first (`merge(coach): into coach-c5b2`): no conflict; the parity manifest and
  the fifteen `session.json` auto-merged.
- **L1, each label names the bar it plays.** `hearBackLabel(stage, HearBar)` (`src/coach/hearBack.ts`);
  `useHearBack`'s `bar` is the whole `HearBar`. Played bar = tune's bar: the strings stand ("Hear bar 3:
  yours, then the demo" / "Yours: bar 3 · Stop" / "Demo: bar 3 · Stop", the demo now given the tune's
  bar). Different: `session.note.chip.hearBackTune` "Hear your bar {{played}}, then the demo of bar
  {{tune}}", `hearYours` unchanged, `hearDemoTune` "Demo: bar {{tune}} of the tune · Stop". Fifteen
  locales (two sonnet helpers; the zh lines' demo half reworded to name the tune's bar).
  Test: `hearBack.test.ts`, four-bar pattern, three rounds, pattern bar 3 slipped in round 2 and in round 1.
- **L2, the press asks first.** In the queue: `heardTake(serial)`; not held: the chip goes
  (`held` set to `{ held: false }` for this take/serial), nothing is gated or cut, off. Held: THEN
  `setVoiceHearing(true)`, the gate, `hearTake`. A refusal of `hearTake` itself also takes the chip
  away. Chosen over "cut once `hearTake` has answered": the voice is still cut before the bar is
  asked for, so no line can sound over it; the price is one IPC round trip and the coach's line
  running on for that moment after the press. Tests: two in `useHearBack.test.tsx` (not held: only
  `heardTake` sent, voice untouched; held: the cut falls after `heardTake`, before `hearTake`).
- **L3.** The mocked `setPlaying(true)` calls the real `soundStarting()`; with the `selfStart`
  guard removed "its own Start does not stop it" fails (`expected 'off' to be 'demo'`, job 767).
- Layout specs (`coach-hear-back`, `smooth`) read either form of the chip at rest.
- L4 fixed on `coach` by c5b1c; L5 and L6 left (theoretical / unreachable, per the review).
