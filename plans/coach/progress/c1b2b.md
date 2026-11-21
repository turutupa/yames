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

### Second review (leg c1b2d, from /tmp/coach-orch/c1b2c-review.md)

1. **A stop during the device wait cancels the speak (fixed, both halves).** Rust: `tts_speak` takes the generation it owns from `cancel_active_speech` (which now returns what it bumped to, read under its own lock) and passes it to `speak_standalone`, which checks `speech_is_current` first and no longer re-reads the generation after `wait_for_stream()`. A `tts_stop` any time after the speak was accepted (the cold-device window included) now returns the speak `Ok` without Piper running or anything playing. Rust test `tts_dim_tests::a_stop_during_the_device_wait_cancels_the_speak`. Frontend, second line: the voice listens to `tts-speech-started` through its own listener (`VoiceOut.onStarted`, wired in `useCoachVoice`; `useSession.ts` untouched) and, while a speak of ours is unsettled and sound plays, a Take runs or a Start is pending, sends the stop again. Test "a line that starts to sound after every stop was lost is stopped again (a cold output device)".
2. **Accepted as is (known limit):** a cut still leaves 0-20 ms (the speaking thread's poll) plus one buffer of speech under the count-in's first click, undimmed. Reviewer's remedy if zero is wanted: have `tts_stop` also clear the speech handoff (`SpeechHandoff::set_clip(None)` from the non-callback side), so the callback drops the line on the buffer the first click is in; never touch the callback for it; verify with the e2e probe, Voice on, Start mid-sentence, speech energy after the first click.
3. **`tts_stop` is `#[tauri::command(async)]` (fixed).** It touches only `SharedTtsActive` (a mutex) and spawns `taskkill` / `kill`; no window or webview handle. The kill now runs on an async-runtime worker, so Start's `state-changed` and the commands behind it no longer wait on it.
4. **Left (recorded):** `togglePlayback` arms the "starting" window on a stop too. `ipc.togglePlayback` does not know the toggle's direction: its callers include the floating widget (its own window) and key handlers, and knowing it needs either a state read that could be stale or `toggle_playback` returning the new state (a changed IPC, and the cut would then wait a round-trip). In the Session the floating play button is not rendered, so it is rare; the effect is the keys and voice shut for up to 2 s and a deferred order dropped.
5. **Settings over a Session is still the Session (fixed).** `sessionIsTheView(view, mode)` in `useTabRouting.ts` is the window's own notion (`MainWindow`'s `inSession`), now also what `useCoachVoice` gets. Test "Settings opened over a Session is still the Session" in `useTabRouting.test.ts`.

Commits `3c348b09` (Rust, 1 and 3), `03384e0a` (voice, 1), `c9d2c8ea` (5). Gates (logs in /tmp/coach-c1b2b/): `npm run test:rust` 1,220 pass (`rust-d.log`); tsc pass (`tsc-d.log`); vitest on the touched files 45 pass (`vt-d.log`), whole suite 17,969 pass, the one file is the known `TabStage.render.test.tsx` (`vitest-full-d.log`); build pass (`build-d.log`); layout `coach-voice`, `coach-session`, `smooth`: 46 passed, 52 skipped (`pw-d.log`). Owed: the full layout suite after 8 PM. No probe re-run: nothing touches the callback, the engine's frame loop, the beat queue or any lock the callback try-locks; the Rust change only moves where a generation is read and which thread `tts_stop` runs on.

### Third review (leg c1b2e, from /tmp/coach-orch/c1b2d-review.md)

1. **`tts_stop` is a sync command again; only the kill leaves the main thread (fixed, the reviewer's second remedy).** Making it `(async)` (second review, 3) put its generation bump on a tokio task, and tokio does not order two tasks: the Settings preview sends `ttsStop()` then `ttsSpeak(line)` in one tick, so the stop could land after the speak's own cancel and silence the new line. Now `tts_stop` calls `tts::cancel_active_speech_deferred_kill`: the bump and the PID taken under the lock on the main thread, in IPC arrival order as before the second review; the kill of that PID (`taskkill` on Windows) on a detached `std::thread::spawn`, no lock held across it. `cancel_active_speech` (used by `tts_speak` on its async worker) is unchanged in behaviour; both share `bump_and_take_pid`. Note 2 of the review (`taskkill` blocking a tokio worker in `tts_stop`) goes away with it. Rust test `tts_dim_tests::the_stop_path_bumps_and_takes_the_pid_before_any_kill` (on the shared step, with no real process); the ordering itself is asserted by the attribute. No frontend change.

## Open

- The tools' coach (`useSession.ts`) pops its own reveal FIFO on any `tts-speech-started`; in a Session it is hushed, so the two never interleave there. Outside a Session our voice never speaks.
- Ask's proposals (leg on the Ask panel) are not suggestions for `accept-suggestion` yet.
- Native read wanted: pass-mark wording in the new lines (de Messlatte, it asticella, es listón, nl lat follow each locale's glossary term).
