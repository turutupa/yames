# c1b2b: the voice at boundaries, and three bindable coach keys

Branch `coach-c1b2b`. Frontend only: no Rust change (speech uses `tts_speak` / `tts_stop` as they are).

## What landed

| Where | What |
|---|---|
| `src/coach/voice.ts` (new) | The voice. Subscribes to the bus (Session events, never the beat) and to `soundGate`. Speaks a note's headline once per boundary (`sayAtBoundary("ready" \| "result", text)`), a key's line (`sayNow`). Quiet from `takeStarted` to the result, while the engine plays (`setVoiceSounding`), on any `setPlaying(true)`; a boundary on a `straight` ready screen or a timed block's ready screen says nothing. A cut is `ttsStop()`, only for speech it started. A ready line that comes up while the engine winds down waits for it to stop, and is dropped if a Start comes first. |
| `src/soundGate.ts` (new), `src/ipc.ts` | `soundStarting()` in `setPlaying(true)` and `togglePlayback()`, before the invoke: a Start cuts speech before the count-in's first click. |
| `src/coach/coachSlot.ts` (new) | The keys' one-line answer (`showCoachAnswer`, `useCoachAnswer`; cleared by any Session boundary on the bus) and the finding the result note drew (`noteFinding`, `findingFor`, keyed by the outcome). |
| `src/coach/useCoachVoice.ts` (new), `MainWindow.tsx` | One call: installs voice and slot, feeds `coachVoiceMode === "voice"` (never on a phone) and `state.isPlaying`. |
| `src/coach/bus.ts`, `sessionEvents.ts` | `stepReady.straight` on an `again` (Go again, R, Up to N, the Take for the eyes): every `again` auto-starts its Take. |
| `SessionCoach.tsx` | `ReadyNote`, `ResultNote`, `UngradedNote` compute their headline once and hand it to the voice; `ResultNote` records its finding and history line; `CoachAnswerLine` (testid `coach-answer`) as the note's first child; `useNoCatchVoice`; `lastTakeLead` exported. |
| `SessionView.tsx` | `NoCatchScreen`: its title is the finding (voice and explain key), and the answer line under its why. Nothing else. |
| `src/containers/session/coachKeys.ts` (new), `hooks/useCoachKeys.ts` (new) | `explainLastText`, `whatNextText`, `suggestionsOnScreen`, `acceptSuggestion`; stable callbacks for the dispatcher (read the latest Session from a ref). |
| `hotkeys.ts` | Ids `ask-explain-last`, `ask-what-next`, `accept-suggestion`, group "In a Session", key `""`; `HotkeyEntry.onlyIn` (read by `activeIn`, `actionForCombo`, `scopeNote`) so ids without a `session-` prefix answer only in a Session. |
| `useActionDispatcher.ts` | Three optional `sessionActions` (`explainLast`, `whatNext`, `acceptSuggestion`); off the Session the three return like `session-*`. |
| Locales | `session.keys.*` (5) in `session.json`; `settings.hotkeys.actions/descs` for the three, in all fifteen. |
| Harness | `?voice=1` (Voice on), `?coachKeys=1` (J, U, Y); `tts_speak` lasts 3 s or until `tts_stop`; speech and `set_playing` logged on `window.__yamesSpeech`. |
| Tests | `coach/voice.test.tsx` (real reducer + publishing dispatch), `coachKeys.test.ts` (English, three states), `hotkeys.scopes.test`, dispatcher parity rows, surface manifest (three hotkeys, no settings key), `sessionEvents.test` (`straight`), `noteStrings.test` reads `session.keys`, `tests/layout/coach-voice.spec.ts`. |

## Where speech can start, and what guards it

| Place | Guard |
|---|---|
| Ready note headline (`ReadyNote`, neck and runway) | `voice.test` "says the order...", "Go again does not say...", "a warm-up and a jam"; `coach-voice.spec` "a ready screen", "Go again" |
| Result note finding (`ResultNote`) | `voice.test` "nothing is spoken between takeStarted and the result"; `coach-voice.spec` "a result" |
| Ungraded result question (`UngradedNote`) | same rules (one `result` boundary); `voice.test` covers the boundary |
| No-catch title (`NoCatchScreen`) | same rules |
| A coach key's line (`showCoachAnswer` -> `sayNow`) | `voice.test` (sayNow false in a Take, a loop, a warm-up); `coachKeys.test` "while a Take runs"; `coach-voice.spec` "the coach's keys" |

Cuts: `soundStarting` (`voice.test` "a Start pressed during speech..."; `coach-voice.spec` checks a `stop` before the first `play`), `takeStarted`, `setVoiceSounding(true)`, Voice off.

## Decisions

- **The voice is told the headline by the note that draws it**, not given words of its own: that is the only way to be sure it is the same translated sentence. The bus decides *when* (it is the only thing that sees a boundary before React commits); the note decides *what*.
- **Go again**: `straight` on the event rather than reading `autoStart` (a ref in `useSessionRun.ts`, not ours). Every `again` dispatch in the app sets `autoStart`.
- **Timed blocks** (warm-up, jam, drill) have no order to say and their ready screen has no note: nothing spoken. The keys answer on an Exercise's ready screen and on a result only.
- **accept-suggestion's suggestions** are the coach's offers drawn as tonal buttons: "Up to N" (P1), the loop, "This one is for your eyes". Not the big button (its own key), not the tempo nudges. Exactly one, or nothing.
- **ask-what-next's "why"**: the planner's reason (`step.why`) before a step's first Take; after one, that Take's lead ("Last Take: 79% even."), because after Slower the planner's reason no longer matches the tempo; on a result, the rule's own existing sentence (`session.why.climb`, `.belowBar.plain`, `.notCaught`, `session.note.repeat.onceMore`, P2's history line), or the next step's `step.why`.

## Gates (logs in /tmp/coach-c1b2b/)

- `tsc --noEmit`: pass (`tsc.log`). `npm run build`: pass (`build.log`).
- vitest: 17,955 tests pass, 403 of 404 files; the one is the known worktree-only `TabStage.render.test.tsx` (Bravura through the linked node_modules) (`vitest.log`).
- Layout by name: `settings`, `coach-session`, `smooth`, `coach-voice`: 63 passed, 52 skipped (env-gated variants) (`pw-gates.log`).
- Owed: the full layout suite (gates ran before 8 PM Pacific).

## Review fixes (leg c1b2c, from /tmp/coach-orch/c1b2b-review.md)

1. **Start never waits on speech.** `ipc.ts` posts `set_playing` / `toggle_playback` first, then runs the sound gate (the voice's `tts_stop`, which may wait on a process kill on the main thread). Test `src/ipc.soundGate.test.ts`; `coach-voice.spec.ts` now asks for the cut right after the Start (within 250 ms), never before it.
2. **No dim for the Session's voice.** `tts_speak` takes `dim: Option<bool>` (absent = dims, as before; `tts::speak_dims`); `useCoachVoice` speaks with `ttsSpeak(text, { dim: false })`, so a cut leaves nothing to restore and the count-in's first click is full volume. Every other caller sends `{ text }` only and is unchanged. Rust test `a_speak_dims_unless_told_not_to`; the spec checks every Session speak asked for no dim (the harness logs `dim`).
3. **Lost stops re-sent.** `speaking` is held until the speak settles; every cut (`setVoiceSounding(true)`, `takeStarted`, the gate) sends the stop again while it is set. Tests: "a lost stop is sent again ...".
4. **`speak()` sends no stop of its own** (`tts_speak` cancels what is speaking). Test: "a coach key pressed while the order is being said ...".
5. **Leaving the Session hushes** (`setVoiceInSession(false)` from `MainWindow`'s `view === "session"`): drops a waiting line, cuts one in flight. It is not a gate on entering: the ready note's effect runs before the window's, and a gate refused the first order (the spec caught it). Test: "leaving the Session drops a waiting line ...".
6. **The "starting" window.** The gate sets `startingAt`; `soundIsStarting()` is true until the engine reports sound or stops (`setVoiceSounding`), `takeStarted`, or 2 s pass. The voice's `canSpeak` and `coachKeysAnswer` (so all three keys, and `acceptSuggestion` before it presses anything) read it. Tests in `voice.test.tsx` and `coachKeys.test.ts` ("between a Start and the engine reporting sound").
7. **Not changed: the spoken order is the settled one.** `session.take` is a synchronous `useMemo` of the same `current` that gives `session.exercise`, so the prepared Take never arrives a render later; `useTakeNote`'s inputs (the `takeResult` event, the Take row in `progress.takes`) land in the same batch as the result, before any ready screen. Only a player's own action on the ready screen can change the cue afterwards, which is not a race.

Commits `67b6a89d`, `4ee86679`. Gates: tsc pass; vitest 17,967 pass, the one file is the known `TabStage.render.test.tsx` (`vitest-full.log`); build pass (`build2.log`); `npm run test:rust` 1,219 pass (`rust.log`); layout `coach-voice`, `coach-session`, `smooth`, `settings`: 63 passed, 52 skipped (`pw-fixes2.log`). Owed: the full layout suite after 8 PM, and the jitter probe (the Rust change adds no work on any thread; it only skips two lock-and-write blocks).

## Open

- The tools' coach (`useSession.ts`) pops its own reveal FIFO on any `tts-speech-started`; in a Session it is hushed, so the two never interleave there. Outside a Session our voice never speaks.
- Ask's proposals (leg on the Ask panel) are not suggestions for `accept-suggestion` yet.
- Native read wanted: pass-mark wording in the new lines (de Messlatte, it asticella, es listón, nl lat follow each locale's glossary term).
