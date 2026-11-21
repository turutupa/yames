# c4a1c: the second review's fixes for the coach's stored keys

Branch `coach-c4a1` (worktree `/home/dgx-delgado/yames-coach-c4a1`), after c4a1 and c4a1b.
Work list: `/tmp/coach-orch/c4a1b-review.md` (MERGE AFTER FIXES, F1 to F7). The queue and the
replay were left as they were except where a finding says otherwise. `coach` merged in (clean).

## What landed, per finding

| Finding | Fix | Test (fails without it) |
|---|---|---|
| F1 read side fails open | `CoachKeyState = "loading" \| "read" \| "unreadable"`, `coachKeyStates()` (a stable snapshot). `cardMayShow(stored, kind, now, states)`: no unless `suggestions` and `cards` are `"read"`. `notebookFrom(rows, stored, states, now, paths?)`: `noticed` is `[]` unless `suppressed` is read; `goal` null and `askGoal` false unless `goal` is read; `askGoal` also needs `cardMayShow`. New fields `noticedState`, `goalState`. | store.test "no card while … is loading/unreadable", "the states as the store has them"; tendencies.test "a key loading/unreadable" (three rules × two states) |
| F2 undo, undo | `replacedGoals: Map<text, raw value>`, every goal replaced this run (memory only). `settings.ts` untouched. | store.test "undo, undo"; host test "undo, undo: each goal comes back with the date it was set" (through set_goal's real undos) |
| F3 leave-out + undo before the load | Before the load `saveUnsuppressed(id)` removes this run's queued Leave out of `id` and queues nothing; with none queued it returns `"unchanged"`. | store.test "a leave-out and its undo, both before the load…", "cancels only its own line's" |
| F4 "queued" outcome | `coachPressSettled(key): Promise<"saved" \| "notSaved">`: after the load and the key's last save. `notSaved`: unread key with a replayed press, or a failed save. | store.test "a caller told queued hears how it ended", "a save that fails is reported as not saved" |
| F5 odd Sessions | `older = sessions.slice(half, 2 * half)` | tendencies.test "with an odd number of Sessions…" (23 vs 4) |
| F6 malformed values | A whole value of a shape this build does not read (suggestions not on/asked, cards / suppressed not an object, goal with no readable text) is `"unreadable"`, like a failed read: nothing replaces it. Map entries the reader dropped are written back as they were; a kept card record's unknown fields survive (`{...raw, dismissed, lastDismissed}`). A goal with readable text but other fields / a bad date: one press replaces it, its Undo saves the stored raw value exactly. Comments at the header and `CARD_KINDS` corrected. | store.test "a whole value of a shape…", "a press keeps the map entries…", "a goal with fields this build does not know…" |
| F7 tests | the two above for undo-undo; "a press on one map key before the load writes that key and not the other"; host test L238 now moves `Date.now` between set and undo, so it fails without the fix. | |

## Decisions

- **F6, a goal with no readable text** (a plain string, a number): set_goal says "not yet" rather
  than replace it. An Undo there is impossible with set_goal's arguments (the undo is a set_goal
  call with a 1 to 200 character text, and there is no text to put back), and adding an argument
  changes the tool the model sees (registry is chip1's). So "one press with an Undo that restores
  the raw value" holds for every goal that has text; one with none is unreadable. The orchestrator
  may want a restore path later.
- A goal set again by hand with the exact text of one replaced earlier this run comes back with
  that goal's stored value and date (the Map cannot tell a typed A from an Undo to A). In memory
  only; cleared at restart.
- An old test changed meaning by F3: "an undo of a leave-out before the load acts on disk" is now
  "unchanged, the entry stays" (store.test).
- `tooFewTakes` is now `playedOf(rows).length < MIN_TAKES` alone (equivalent before, since every
  line needs MIN_TAKES of those Takes), so it stays honest while `noticed` is held back.

## What c4a2 (the Notebook) and c4b2 (the card budget) must know

- Read `coachStored()` and `coachKeyStates()` together (both stable snapshots; `subscribeCoachStored`).
- `cardMayShow` needs the states as its 4th argument: before the load, or with `coach.suggestions` /
  `coach.cards` unreadable, it is always false. c4b2 never shows a card then.
- `notebookFrom(rows, stored, states, now, paths)`. Two states to word, per section:
  - `noticedState`: `"loading"` (the coach's keys are still being read: nothing yet), `"unreadable"`
    ("Your hidden lines could not be read, so nothing is shown this time"-ish).
  - `goalState`: `"loading"` / `"unreadable"` ("Your goal could not be read"-ish; never offer to set
    one, `askGoal` is false).
  `tooFewTakes` is about the Takes only and may be shown beside either.
- A writer that returns `"queued"`: `coachPressSettled("cards" | "suppressed")` resolves
  `"notSaved"` when the press holds for this run only: say so.
- Before the load, Leave out's Undo returns `"queued"` (cancelled its own press) or `"unchanged"`.

## Gates

See the final report (logs under `/tmp/coach-c4a1c/`).
