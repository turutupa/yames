# Yames: converting to a learning-path-first app. Code audit and estimate

Date: 2026-11-08. Repo at `main` 141c7c33 (v1.2.2) and `origin/songs-v1` 93d5b9ad. The repo was not touched: `git status` clean, still on `main`. All builds ran in temp dirs.

**Evidence tags used throughout.**
- **[V]** verified: I read the code or the git history.
- **[M]** measured: I ran it in a temp copy.
- **[I]** inferred: my judgement from the above.
- **[N]** a claim in notes that I did not verify.

Paths are relative to the repo. Unless a path says `main:`, it refers to `songs-v1` as extracted to `/tmp/yames-songs`.

---

## 1. Bottom line

| Scope | Elapsed to "ready for people" (owner at 5 days a week) | Agent wall-clock inside that | Owner hands-on | Then testing with people |
|---|---|---|---|---|
| **Cut first release** (section 12) | **likely 6 weeks** (3.5 to 12) | 18 days (8 to 42) | 29 days (16 to 60) | 4-6 weeks |
| **Everything in the mocks** | **likely 10 weeks** (5.5 to 20) | 32 days (15 to 70) | 48 days (27 to 101) | 4-6 weeks |

**Verdict on "5-9 weeks plus 4-6 testing":**
- It is right for the cut release.
- It is too low for everything in the mocks: the likely case sits above its top, and the worst case is about twice it.
- "Agent-driven building" is the wrong label. In this repo agents have never been the bottleneck: Jam's first build took a day and Songs' took two. Most of those weeks are the owner playing, listening and judging.
- The biggest single swing is not in anyone's plan yet: the scoring path has never met a real guitar, and two defects found here say it will not work first time.

---

## 2. Merge: does songs-v1 merge into main?

**Result [M]:** `git merge-tree --write-tree --name-only main origin/songs-v1` gives **one conflict: `src-tauri/Info.plist` (add/add)**. `package.json`, `Cargo.lock`, `Cargo.toml` and `tauri.conf.json` auto-merge. The same holds against `origin/main`. Divergence is 3 commits behind, 257 ahead.

**What main has that the branch lacks [V]:** exactly three commits, touching six files.
- The v1.2.2 version bump.
- `NSMicrophoneUsageDescription` in `Info.plist`.
- `entitlements.plist` with `com.apple.security.device.audio-input`.
- `"entitlements": "entitlements.plist"` in `tauri.conf.json`.

**Two traps in that one conflict [V]:**
1. The branch's `Info.plist` comment says "No microphone key, deliberately, and it must stay that way". Taking the branch's side silently re-breaks the macOS input bug fixed by #59/#63. Keep both usage keys and delete the comment.
2. After the merge, `entitlements.plist` grants audio input only. The branch adds a camera key but no `com.apple.security.device.camera` entitlement. Under the hardened runtime a signed macOS build should refuse the camera [I]. Add the entitlement, or hide the camera for the first release.

**State of the branch [V, M]:**

| Check | Result |
|---|---|
| `tsc --noEmit` | clean [M] |
| vitest | 224 files, **5469/5469** passed, which matches the handover's claim [M] |
| `vite build` | OK, main chunk 2.4 MB (770 KB gzip), alphaTab lazy at 1.3 MB [M] |
| `test:highbpm`, `test:pitch` | pass on Linux debug [M] |
| CI on PR #57 | draft, `CONFLICTING`, green at 2026-09-29 on the rust-test and LLM-smoke matrix for macOS (both), Ubuntu, Windows, plus frontend [V] |
| `test:rust`, `test:dsp`, layout suite, jitter probe | **not run by me**. The layout suite and jitter probe are also not in `ci.yml` steps [V]. Handover claims 968, layout 352, probe PASS [N] |
| App start, LLM features | not run (brief, and no audio device here) |

Local build note [M]: `aubio-sys` does not compile with this machine's gcc 15 (`strncasecmp` implicit declaration). I needed `CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'`. This affects `main` too, and any fresh Linux setup.

**Would I build on it?** Yes for the code, with conditions. Roughly 112k lines were added: 31k tests, 27.5k Rust, 34k TS, 8k locales. The structure is good and the tests are serious. But most of the handover's own "before main" list is still open, and nothing in the repo shows it was done:
- the manual pass;
- first launch on a copy of a real settings folder;
- "No camera code has met a camera".

The jitter probe is reported passing on 09-29 [N]; the handover does not say the machine was quiet.

The owner's only recorded use is the session on the night of 09-20/21, which found four things in five minutes. Songs has had Jam's first-build phase and not Jam's fix-wave phase (section 9).

Merging also ships a SQLite migration and audio-path changes to every metronome user at once, including the note that anyone who typed 32 to get eight bars now gets 32 bars. Treat the merge as a release with a soak, not a formality.

---

## 3. Scoring and detection

### Can score.rs grade a fixed known exercise today?

**Yes, for timing [V, M].**
- Pipeline: an alphaTex string goes through `src/songs/import.ts` (`SongScore`, with `SourceFormat::AlphaTex` documented as "the format an exercise or a path step is written in"), then `src/songs/schedule.ts` (`ScoreSchedule`), `load_score_schedule`, and `ScheduleRun` on the analyzer thread, giving a `ScheduleReport`.
- `src/songs/starter/pieces.ts` already ships seven tunes this way.
- The format fits Exercises: bars, tempo map, techniques, sections, `loops`, `soft` hammer-ons. It has no field for a pass bar, a "why", or a constraint, so it needs a wrapper type around it.
- Needleman-Wunsch alignment works. Ideal onsets with up to 20 ms of jitter at 16ths: 128/128 hits at 80 and 120 BPM, 127/128 at 160 [M].

### Two defects in what it reports

1. **The number ignores missed notes on guitar [V, M].**
   - `ScoreWeights` for `ElectricGuitar` are `hc: 0, oe: 0` (`instrument.rs:122`, used at `timing.rs:2659-2677`).
   - Golden proof: `120bpm_dotted8th_16th_phrase_dropped_note` and `..._added_note` both score 99.06, identical to `..._played_right`.
   - In my probe a take where 19 of 128 notes were heard scored **98.2** [M].
   - Reports do carry `hitCompleteness` and `findings.rs` does see misses. So a pass bar must be a new rule over components. The current `score` cannot be the bar.
2. **The known-score path has no latency calibration [V, M].**
   - Free play shifts beats by a learned offset (`timing.rs:1302`). `ScheduleRun` receives raw detector timestamps (`timing.rs:911`) against raw beat timestamps (`timing.rs:1149`). `score.rs` has no reference to calibration.
   - Beat timestamps already include output latency (`src/songs/cursor.ts:48`). Input buffering and the detector do not: `ONSET_PIPELINE_LATENCY_NS` is 30 ms, and I measured 20-35 ms for the detector alone.
   - Perfect 16ths with a constant lag, 5 ms human jitter, known score [M]:

   | Constant lag | 80 BPM | 100 BPM | 120 BPM | 160 BPM |
   |---|---|---|---|---|
   | 0 ms | 128 hits | 128 | 128 | 128 |
   | 30 ms | 128, GA .79 | 128, GA .66 | 128, GA .55 | 124, GA .50 |
   | 40 ms | 128, GA .61 | 128, GA .50 | 128, GA .50 | **45/128** |
   | 50 ms | 128, GA .50 | 128, GA .50 | **70/128** | **5/128** |
   | 60 ms | 128, GA .50 | **70/128** | **0/128** | 93/128 (pairs with the next note) |

   Prediction [I]: on a real rig, fast takes read as all-late or all-missed, and the coach says "dragging". The fix is small: seed from `calibration_cache` and/or take the median deviation of the pass. It touches the scoring gate. Evenness itself survives lag until alignment breaks, because IC removes the median.

### Fast playing: A11 and roadmap 1.3

| Case | Status |
|---|---|
| `main` | **Still click-keyed** (`main:src-tauri/src/onset.rs:400`, `tempo_ctx.subdivision_interval_ms()`). A quarter click at 100 BPM has a 450 ms refractory [V] |
| `songs-v1`, known score | **Fixed.** Refractory is `max(40 ms, 0.75 x schedule's smallest gap)`, set from `run.smallest_gap_ms` (`timing.rs:1047`). Needs a first beat interval, which a count-in covers [V] |
| `songs-v1`, free play, player on the locked rhythm or finer click | **Fixed after lock** (about 8 onsets). Before lock it is still click-keyed [V] |
| `songs-v1`, free play, player moves finer than the lock | **Open: this is A11.** Reproduced: 109/160 heard on the 8ths/triplets fixture [M]. Owner's call, and it needs the capture |

So Exercises are safe from A11. Metronome and Ramp with no exercise loaded are not, including Metronome drop-out and any Ramp run with free material [I].

### How fast can it go, really?

**No test exercises the actual detector.** `aubio` appears only in `onset.rs` and `instrument.rs` [V]. The `played/` fixtures that "pass at 200 BPM" (246/256 heard, score 96) feed a list of synthetic timestamps through `RefractoryGate`. They skip audio, aubio and the noise floor.

To get a number I wrote a scratch harness in the temp copy (`/tmp/yames-audit/onset_probe.rs`). It runs the shipped aubio config (`complex`, 1024/512), the noise-floor rule and the gate over the repo's Karplus-Strong plucks, 128 sixteenths. **This is synthetic, not a guitar.** Assumptions: 5.2 ms poll, 256-frame input buffer, the shipped feed simulated.

| Condition | Heard, 80/120/160 BPM | Extras | Timing error SD |
|---|---|---|---|
| Sequential hops, absolute floor only | 128 / 128 / 128 (also 128 at 100, 140, 180, 200 BPM) | 0 | 3.1 ms |
| **As shipped**, damped notes (0.15-0.3 s decay) | 125-128 / 127-128 / 127-128 | 0-3 | 1.8-8 ms |
| **As shipped, sustained notes (2.4 s decay)** | **10 / 19 / 24** | 0-4 | n/a |
| **As shipped, medium decay (0.8 s)** | 124 / **22 / 23** | 0-2 | n/a |
| Shipped feed, absolute floor, sustained | 113 / 123 / 123 | **43 / 15 / 5** | 32 / 15 / 6 ms |

Two new hazards follow [M, I]:

1. **The noise floor can close on steady playing.**
   - `onset.rs` requires `rms > 3 x p10(rms over the last 500 polls)`. That is about 2.6 s of history at the real poll rate, not the "~5 s" the comment says.
   - Once a player has played continuously longer than that, p10 is their own playing. If RMS does not swing by more than 3x between attack and tail, every onset is refused. The heard counts match this exactly: sustained notes at 120 BPM stop at about 2.3 s, or 19 notes. With sequential hops they stop at 4.8 s, or 39 notes.
   - Whether a real guitar swings 3x is unknown. Damped synth notes do. **High-gain, compressed alternate picking, which is exactly the Alternate Picking path, is the likely worst case** [I].
   - The May forensics in the `onset.rs` comments show real sessions produced plenty of onsets, so this does not fail everywhere. It has never been tested at the point that matters.
2. **The poll feed may manufacture ghosts.** The loop sleeps 5 ms and feeds aubio the tail hop of a ring with no cursor, so a 512-sample "hop" overlaps the last one. The comment says aubio "handles this gracefully". Sequential hops gave 0 extras and 3.1 ms SD against 43 extras and 32 ms in the same conditions. That is suggestive for the 103-175 ms "ghost band" the May forensics spent weeks on, but it is unproven. The fix is a write cursor on the ring, which is small, but it moves every score, so it needs real audio to validate.

### Is evenness measurable at sixteenths 80+ BPM?

**On synth, yes. On a guitar, unproven [M, I].**
- IC = `exp(-sigma^2 / 2k^2)` with `k = 0.2 x note gap`. The mock's "85% even" therefore means sigma of about **21 ms at 80 BPM, 14 at 120, 11 at 160, 9.5 at 180** [V, computed].
- Detector noise on damped synth is 2-3 ms, so resolution is ample there.
- IC tracks the true jitter closely: at sigma 10, 120 BPM, ideal 0.932 against detector 0.939.
- Sloppy players: refractory at 0.75 x gap starts eating real notes. 108/128 heard at sigma 20, 160 BPM; 86/128 at sigma 30 [M]. Those read as "missed" unless the bar forgives them.
- Separate risk: alignment picks the nearest of several onsets, so ghosts could make evenness look better than the playing [I].

### pitch.rs

**Does what is claimed on its own terms [V, M].**
- pYIN-class tracker over a finished buffer. 84/84 notes at 160 BPM 16ths, 100% within 50 cents on every clean fixture, 27/27 on real bass samples with zero octave errors, wrong note identified, click bleed tolerated to -3 dB. 30 s takes 1.65 s in a debug build.
- Caveats [V]: guitar fixtures are synthesised; onsets are handed in from ground truth, not from the detector; no fixture has a **band** bleeding in; bends are not measured at all (the word appears only in a comment), so "Bends that land" is new work; chords are `NotAssessed`.
- It works only from a take's dry stem, under the take opt-in (`analyze_take_pitch`, `commands.rs:2544`). `start_take` still runs on the window thread (handover).
- Test-fixture bug, minor: `Rng::bipolar` in `tests/pitch_fixtures/synth.rs` returns [-1, 3), not the [-1, 1) its comment says. It bit my first probe run, and it means the plucks' excitation is not zero-mean [V, M].

**Live use.** Per-note is hard: 31 ms window plus hop and decision, on a new thread, re-running the jitter gate. **Per-bar is much cheaper** and is all the mock's Theory screen wants. One note on beat 1 per bar means slicing about 300 ms from the input ring on a low-priority worker after each downbeat. `score-onset` and `useLiveNoteLights.ts` already exist for live timing lights [V]. Size M. Feedback after the take comes first and needs no new thread.

### Real-audio fixtures

- **Real guitar audio in the repo: none [V].**
- One captured session at the matched-beat layer, no audio (`session_1779164436...`, 140 BPM 6/4, score 62).
- Real recorded bass samples.
- The 180 BPM capture (roadmap 1.2) was owed in September and is still owed. Its gate fixture `captured_180bpm_16ths` does not exist. W5's brief says "No real guitar recording exists".
- The Windows app-data folder on this machine contains only `settings.json` (file names only, no contents read), so nothing to borrow here.
- **Nothing in the known-score path is proven on a real guitar, beyond one short owner session with no recorded numbers.**

---

## 4. Sessions and paths

**Can useSetlistRunner run a mixed Session? Partly, no [V].**
- `SetlistStep` is a metronome config plus optional `jamId`. Triggers are `manual | bars | seconds`.
- `setlist/runtime.ts` is a clean pure reducer, and metronome and jam steps with bar-line switches work.
- It has no exercise step (no score load, schedule, song mode or take result), no ramp step, no click-drop step, no "result decides next", no between-takes state, no time budget.
- Song and Jam engine modes are exclusive and owned by two big hooks (`useSongsSession` 985 lines, `useJamSession` 2020), which are mounted through `MainWindow.tsx` (2392 lines). `setView` stops playback on mode change.

Recommendation [I]: a new `src/session/` reducer in the setlist runtime's style, plus one effects hook that drives the engine directly through `ipc.ts`, reusing `applySetlistStep`, `pushJam`, `loadSong`, `loadScoreSchedule`. Add step kinds to Setlist afterwards. **This is the highest integration risk in the project** because a Session crosses modes that were built to be mutually exclusive.

**Existing Path, Exercise, pass-bar code: none [V].**
- No Path, Step, or pass bar anywhere in `src/` or `src-tauri/src/`.
- `plans/LEARNING_PATHS_DECISIONS.md` is nearly all *open* (A1-A5, B1-B6, C1-C6, D1-D5, E1-E4). The mocks effectively answer many of those, but nobody has recorded it.
- `grep` finds "exercise" only as prose and as `exercise_ceilings`.

**Ceiling and spaced review: arithmetic exists, nothing calls it [V].**
- `srs.rs` has `review`, `due_today`, `update_ceiling` (comfortable = MAD 15 ms over 8 bars, peak = score 70), well tested.
- Outside its own tests nothing calls them; `findings.rs` borrows one constant. `score_due` (coach promises) is live and is the working example.

**Store [V].** `db.rs` schema v4.
- Good: `attempts`, `attempt_onsets`, `attempt_extras`, `scores`, `sessions`, `segments`, `score_due`.
- Created but with no read or write code: `exercise_ceilings`, `routines`, `routine_runs`.
- Missing: path position, step passes, constraint-exercise results (landings per bar and chord), session plan and why-lines, tool results.
- One migration, v5. The rule is good ("never deletes"). A `reviewer` is mandatory per `CLAUDE.md`.

**Theory graders are a different kind of thing [V, I].** "Land on chord tones", "box notes found", "call and response" have no fixed notes, so `match_attempt` does not apply. The landing grader is simple:
- chord per bar from `jam/harmony.ts` (`chordsForForm`, `chordNotes`) and `scales.ts`;
- nearest onset to beat 1;
- pitch class from `pitch::analyse`.

The risk is the input. With a mic and speakers the band bleeds into the only channel; the handover says the guide bleeds, and the mock's answer is "drums only without headphones". Untested [I].

---

## 5. Tools

**How the adaptive drill works [V].**
- The engine's event loop (`engine.rs:8267`, not the audio callback) acts every `barsPerStep`.
- It reads `adaptive_score`, a rolling percent of non-miss feedback over the last 16 grid ticks (`commands.rs:1347-1360`).
- It goes up, holds or goes down on thresholds (70/35 moderate), emits `adaptive-eval`, and the model may only comment (T07).

**Find my edge [I].** Size M, low engine risk.
- Hit rate is not "tight", so feed a rolling evenness over the last N bars instead.
- Add an `edge` mode: climb after N tight bars, hold on a slip, stop after K slips at one tempo.
- Report clean tempo via `update_ceiling`. `DrillClimb.tsx`, `useDrillRuns.ts`, the `DrillReach` record and `TempoCeiling` finding are reusable.
- Tempo changes are safe for scoring because `BeatMap` uses where beats actually fell. With an exercise loaded, it goes through the known-score path and avoids A11.
- Depends on the latency and noise-floor fixes above.

**Click drop-out [V, I].**
- The engine already silences everything including the click in a drop-out bar, but only with a jam table loaded (`jam.rs:1188`, `engine.rs:7290`, `band_state_for_bar`).
- A bare metronome needs either a click-only table or a per-bar mute. Either is at or near the callback, so reviewer and jitter probe are required. Size S-M.
- Scoring "how you held time" reuses `analyze_free_play`'s Drift finding, plus a drift-at-return number.
- Without a schedule it runs the free-play path. Tied to A11 only if the player goes finer than lock.

---

## 6. Coach and hands-free

| Asset | State [V] |
|---|---|
| Rules and facts | `findings.rs` (3200 lines): 13 kinds, ranked, each with evidence and a `Fix` action. `verdict.ts` narrates by template. Strong for known-score attempts |
| Gatekeeper | `coach/gatekeeper.ts` 1792 lines, cooldowns, tiers. Templates `templateCatalog.ts` 2311 lines |
| Tips | `useRealtimeTips`, mid-session. CPU backend skips the model |
| Blocks | `coach/blocks`: catalogue of reference-only components (fretboard, tab excerpt, action), schema and GBNF grammar, one renderer. Used by `SongReview`. **The right shape for "show me"** |
| Chat | `sendChat` in `useSession.ts` feeds preset history and session stats as text; `GenKind::Chat`. Grounded in preset stats, **not** in a take or an exercise. No tools |
| Model | llama.cpp, Qwen3 4B/8B, Metal/Vulkan/CPU; no cloud. **OpenRouter does not exist**, and it contradicts ROADMAP principle 5 unless S0.7 is taken further |
| TTS | Piper plus `speech_out.rs`, through the engine's stream. #60 open: Piper fails on Intel Macs |

**Can it explain Take results today?** For a known-score take: yes by template, right now. For a Theory take: there are no facts to explain yet. **"Why this step": no**, because nothing chooses steps yet. The planner must output reasons as data, then templates and the model word them. Model quality for this has not been evaluated; ROADMAP F3 (grounding and tone transcripts) is open.

**Voice commands: nothing [V].** No STT or wake word anywhere in the code; `grep` for speech recognition or whisper finds only drum-whisper comments.
- It needs a local recogniser (model download, licence check), a small grammar, an always-on or between-takes listener with jitter testing.
- **The catch [I]:** `audio_input.rs` opens one device. A guitar on an interface cannot hear your voice, so voice means a second capture stream.
- The mocks' question 10 (stopping by voice over the band) is unproven. Size L. Cut it.

**MIDI pedal [V].** Generic `MidiBinding` (cc, note, pc) to action strings, with `useActionDispatcher` and `hotkeys.ts` holding `HotkeyAction`. `jam-*` and `songs-*` actions are precedents. New session actions are cheap. **Tap / double / hold is new:** `MidiMsgType` has `NoteOn` only, so hold needs release events and a small gesture layer. Size S.

---

## 7. App shell

**Organisation [V].**
- `App.tsx` mounts `MainWindow.tsx` (2392 lines), which composes ~20 hooks and picks the view by `view ===` chain (31 uses).
- `useTabRouting.ts`: `PLAY_TABS = beat, setlist, drill, jam, songs`, persisted tab, Settings as an overlay.
- `Rail.tsx` is the one navigation surface, and U1.1 built it to grow. `Transport`, `MainHeader`, coach dock as shell geometry (U1.6). U1.8 reserves the Paths slot.

**Making Today the front door touches [I]:**
- `useTabRouting` (add `today`, default rules), `Rail` (modes become a Tools group), `MainHeader`, `Transport` view union, `MainWindow` view chain.
- `hotkeys.ts` `tab-N`, tour `stops.ts`, `useAppHints`, onboarding `ReadyStep`.
- `useSetlistRunner`'s `canStart` rule needs care.

### How to keep metronome users

Ship alongside, never replace. [I]
- `today` is a new tab. The existing tabs stay under Tools, byte-for-byte, with the same hotkeys.
- New installs open on Today. Existing users keep their persisted tab and get a one-time offer, plus a setting "Open on: Today / last tool".
- Develop behind a flag on main. This respects parity rule U8.1, and metronome users lose nothing.
- Open question the mocks leave: Songs is **not in the mocks' Tools list**. Keep it as a fifth Tool, or hide it. The machinery is needed either way. My default: keep Songs, hide camera for the first release.

### Settings, migrations, onboarding

- Settings store is additive; `onboarding.version` and `TOUR_VERSION` give clean versioned resets.
- DB v5.
- The wizard is data-driven (`steps/index.ts`), so new steps are one file each. Coach and instrument steps stay.
- A new-flow `ONBOARDING_VERSION` must not re-run on existing users.

### i18n

15 locales with parity tests (`test/i18n.coverage.test.ts`, `i18n.locales.test.ts`). Every string and every "why" line needs 14 translations; agents did this for Songs in W16/W20/W24 [V]. Decide whether first-release curriculum text is English-only. Doing so means relaxing or allowlisting the gate.

### Tests that would break [I]

Unit tests that know the tab list or rail: `Rail.test`, `useTabRouting.test`, `MainHeader.test`, `Transport.test`, `hotkeys.*.test`, `useTour.test`, `hints/triggers.test`, `HandsFreeStep.test`, `emptyStates.test`, `freeModePreset.test`, `countIn.test`. Layout suite: 21 files on the branch against 4 on main. Specs drive `shots.html?shot=` directly (only 2 hits on tab or view names), so shell changes break few of them. A handful measure rail geometry (`songs-room.spec.ts`). `shots/main.tsx` needs new scenes. Mechanical overall.

### Screen by screen against the mocks

Reuse is my judgement after reading the components. Phone frames are not counted: `MOBILE_IMPLEMENTATION_PLAN.md` is out of horizon, and the desktop window's 480x780 minimum gives the narrow layout.

| Screen | Existing code to reuse | Reuse | New |
|---|---|---|---|
| A Welcome | `WelcomeStep` | high | copy |
| A Pick input | `AudioInputStep`, MIDI onsets (`midi.rs`) | medium | **Tap fretboard: new, cut** |
| A Soundcheck | `HearItWorkStep`, `AudioInputTestModal`, `calibration_cache` | medium | "heard, in tune" needs pitch on a short slice; measured delay display |
| A Goal | wizard shell | low | small |
| A Placement | `HearItWorkStep` shape | low | needs edge and a box-notes grader; **cut or skip** |
| A Placement result | none | low | small |
| B Today x3 | `songs/due.ts`, `LastSession` idea | low | all new: planner, reasons, minute chips, break logic |
| C Theory running | `NowBlock`, `ChordSheet`, `Fretboard`, `JamView` engine use | medium | per-bar strip, live or post, landing grader |
| C Mechanics running | `TabStage`, `useLiveNoteLights`, `DriftMeter`, `SongSpeed` | high | evenness readout, simpler stage |
| C Between takes | `Transport` actions | low | new screen, pedal; voice is cut |
| C Take result x2 | `SongReview`, `CoachBlocks`, `useSongProgress`, marks | medium | "number moved against bar" |
| C Didn't catch | `isAttemptWorthKeeping` (only a floor of 8 onsets) | low | honest threshold on heard ratio and confidence |
| C End of session | `sessionNarrative`, `SessionNarrativeView` | medium | what moved, tomorrow preview |
| D Paths, Path x2 | none | low | small list screens |
| D Step x2 | `Fretboard`, blocks | low | small |
| E Progress | `queryHistory`, `useSongProgress`, `DrillClimb` visual language | low-medium | charts, per-skill series; **only as good as stored facts** |
| F Tools list | Rail | low | trivial |
| F Metronome drop-out and result | `MetronomeView`, `MetronomeFigure`, Drift finding | high | toggle plus engine, result view |
| F Ramp and result | `DrillView`, `DrillClimb`, `useDrillRuns` | high | edge mode, result |
| F Setlist edit, run | `SetlistParagraph`, `StepSentence`, `SetlistPlayer` | medium-high | new step kinds |
| F Jam | `JamView` etc. | high | typed-chords flow exists in part (`parseChordName`, `ChordSheet`); mock's flat screen is simpler than today's |
| G Clash, show me | `CoachCard`, `CoachBlocks` fretboard | medium | clash marks on board, take facts |
| G Why this exercise | `CoachCard` | low | planner reasons |
| G Will not claim | `coach.rs` chat path, B2 honesty rule | medium | fixed answers for these questions |
| H Settings | `containers/settings/*` | high | new rows. **OpenRouter is new and optional: cut** |

**Hidden, not removed [I]:** the preset/setlist/jam/song library from Today, Zen and widget entry points (keep under Tools), share menu, camera. Nothing needs deleting for a first release.

---

## 8. three.js

**Existing:** `components/fretboard/Fretboard.tsx`, 465 lines of SVG, themed by CSS variables, "a picture, not a control", driven by pitch classes [V]. Used in Jam (`NowBlock`, `ChordSheet`) and coach blocks [V]. Mock features such as a clash note and an arrow are an SVG extension (S). Video export paints its own canvases (`takes/tabPainter.ts`) and is unaffected. The app has no WebGL today [V]; `grep` finds only 2D canvases and rAF (zen effects, `DriftMeter`, takes).

**Click [V, I].**
- The click renders on cpal's own thread at `TIME_CRITICAL` on WASAPI, and the webview is separate. A render loop cannot directly block the callback.
- It can compete for CPU and GPU, and repo data shows the callback is load-sensitive: AGENTS.md notes a parallel `cargo test` moved baseline p99 from 0.35 ms to 2.46 ms.
- **The jitter probe cannot see this.** `click-jitter-probe` runs the engine headless with no Tauri or webview. The gate as written would pass while the app fails. Required: an in-app probe. `CallbackProbe` is `None` unless the probe built the engine, so add an env flag to enable it in a real window (S). Without this, "the click is sacred" is untested for this feature.
- GPU contention with Vulkan or Metal inference is a second channel, and matters most on integrated GPUs (`F2` latency gate still open).

**Bundle [M].** three r187, tree-shaken to renderer, standard material, geometries and lights: **543 KB, 136 KB gzip**. Lazy-load like `TabStage`. Against a 2.4 MB main chunk it is modest. Do not put it in `index`.

**Webviews [I, not run].** WebView2 is safest; WKWebView acceptable; WebKitGTK is the risk, so a fallback to SVG is mandatory. Layout suite runs in headless Chromium with software GL: rectangles yes, visual review no; happy-dom has no WebGL.

**Recommendation [I].**
- Build `Fretboard3D` as an additional lazy component; keep SVG for coach blocks, sheets and fallback.
- Render on demand (on change and for a short animation), never a continuous loop while the click runs.
- Pause during takes unless the in-app probe clears it.
- Polish is taste, so it lands on the owner: 4 days likely, 10 worst. **Do it after the first people test, on the single hero screen.**

---

## 9. Calibrating speed from git

All from `git log`, September 2026 [V].

| Feature | First build | Then | Release | Rework signal |
|---|---|---|---|---|
| Onboarding O1-O8 | branches dated 09-02 | hints 09-12/13 | v1.1.0, 09-11 | |
| UI revamp | plan 09-04; 92 commits 09-06/07 | owner sweep 09-08 | v1.1.0, 09-11 | merged in 4 days under a strict parity rule |
| Setlists | model and UI 09-06 | "two rooms" 09-08, "setlists are a mode" and ~10 merges 09-09 | v1.1.0, 09-11 | **"after 8 bars" meant 8 beats** shipped in v1.1.0 and was found 09-20 past ~4000 tests |
| Jam | **~1 day**: 09-11 23:04 to 09-12 22:16, 93 commits | v2-v5 sound rewrites 09-12 to 09-14 (133 commits), v6 owner UI waves 09-15 to 09-19 (65 commits) | v1.2.0, 09-19 | **8 days total. 68% of commits after first build. 31% are `fix`.** The last 5 days were ~25 fix commits, mostly UI, which read as owner-reported |
| Songs | **~2 days**: 192 commits 09-20/21, +53.8k lines | owner's first look: 4 things in 5 minutes. Pre-merge wave 09-29, 17 commits, 1 blocker | **unmerged, 40 days** | 32% `fix`, and the owner fix wave has not happened |
| Post-release | | #59 macOS input never worked in signed builds: filed 10-17, fixed by an outside contributor (PR #63), released 10-26 | v1.2.2 | #64 macOS notarization still failing, so **no Mac build of v1.2.2**. 5469 tests caught none of this |

Reading it [I]:
- **Agent first build: 1-2 days per Jam-sized feature.** This has been repeatable.
- **Owner-driven rework: 4-7 times the build, when feel, sound or real input matters.** Paths have all three.
- **Owner availability is the real clock.** 470 non-merge commits on main in 09-02 to 09-21. Since 09-22, three commits on main, all release or the outside macOS fix. Burst, then seven weeks quiet. My estimates assume 5 owner days a week and do not hold if that repeats.
- Tests are excellent at logic and blind to real audio, signing and hardware. Everything that actually hurt users came from those.

---

## 10. Work breakdown

Days are working days. "Agent" is orchestrated wall-clock if the item ran alone, including fix waves after feedback. "Owner" is hands-on human time and is additive, since there is one owner. In the "Cut" column: **yes** in, **part** reduced, **no** out.

| # | Item | Exists | New | Size | Risk | Depends | Needs a person for | Agent b/l/w | Owner b/l/w | Cut |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Merge songs-v1, soak | Green branch | plist fix, camera entitlement or hide, handover list | S | Med | none | Manual pass, probes on quiet box, migration on real settings | .25/.5/2 | 2/4/8 | yes |
| 1 | **Real-audio gate and detector fixes** | Harness pieces, `debug-bpm.sh`, `dump-fixture` | WAV-through-detector test, corpus, latency calibration, noise-floor and ring-cursor decisions, A11 | M-L | **High** | 0 | Playing the corpus: DI and mic, clean and gain, 80-180 BPM, with and without band | 1/2/7 | 1.5/3/8 | yes |
| 2 | Mechanics grader | `ScheduleRun`, components | Pass-bar rule, evenness, clean tempo definition, "didn't catch" | S | Med | 1 | Define the bars by feel | .5/1/3 | .5/1/2 | yes |
| 3 | Theory graders | `pitch.rs`, `harmony`, `scales` | Landing, box notes, stem always-on or slice; bleed handling. Later: call and response, bends | M | **High** | 1 | Playing over band on mic and DI | 1/2/5 | 1/2/5 | part: landing and box only |
| 4 | Path model, planner, store v5 | `srs.rs`, `exercise_ceilings`, `score_due` | Types, planner with reasons, time fit, ceilings wired, migration (reviewer) | M | Med | 2 | Close LP decisions A2, C5, E2 | .5/1.5/3 | 1/1.5/3 | yes |
| 5 | Session runner | `setlist/runtime.ts`, `apply*`, song and jam engine calls | Reducer, cross-mode effects, take lifecycle, between-takes | M-L | **High** | 2, 4 | Feel of seams | 1/2.5/6 | 1/2/5 | part: no mid-session ramp |
| 6 | Shell | Rail built to grow | `today` tab, Tools group, keep-my-tool setting, test updates | M | Low-med | 0 | Taste | .5/1.5/3 | 1/1.5/3 | yes |
| 7 | Session screens | `TabStage`, `SongReview`, blocks | Running x2, between, results, no-catch, recap | M | Med | 5 | **UI fix waves, Jam-style** | 1/2/4 | 2/4/8 | part |
| 8 | Paths, Step, Progress | Charts language | List screens, trends | S-M | Low | 4 | Check claims | .5/1/2 | .5/1/2 | part: simple Progress |
| 9 | Content, first pack (2 paths, 4-5 steps, ~25 exercises) | Starter shelf format, tests | alphaTex, whys, bars, translations | M | Med | 2, 3 | **Musician plays every exercise**: this is teaching | .5/1.5/3 | 3/5/10 | yes |
| 9b | Rest of content (~55 exercises) | | | M | Med | 9 | same | 1/2/3 | 3/5/10 | no |
| 10 | Find my edge | Adaptive mode, `DrillClimb`, `update_ceiling` | Evenness metric, edge mode, result | M | Med | 1, 2 | Feel | .5/1/2 | .5/1/2 | yes |
| 11 | Click drop-out | Silent bar in jam | Engine (reviewer, probe), result | S-M | Med | 1 | Feel | .5/1/2 | .5/.5/1 | no |
| 12 | Setlist with exercises and tools | Setlist runtime | Step kinds, editor | S-M | Med | 5 | | .5/1/1.5 | .5/.5/1 | no |
| 13 | Live per-bar Theory | `score-onset`, ring | Worker slice, strip | M | Med | 3 | Latency feel | 1/2/4 | 1/2/4 | no |
| 14 | Coach facts, why, chat grounding | `findings`, blocks, chat | Take facts, why-from-reasons, Theory findings, show-me | M | Med | 3, 4 | Tone review | 1/1.5/3 | 1/2/4 | part: templates, no new chat |
| 15 | Pedal gestures and session actions | MIDI bindings | Release events, tap/double/hold | S | Low | 5 | Real pedal test | .25/.5/1 | .25/.5/1 | yes |
| 16 | Voice commands | Nothing (TTS out only) | STT, second capture, grammar, jitter | L | **High** | 5 | Rooms, mics, accents | 1.5/3/6 | 1.5/3/6 | no |
| 17 | First-run | Wizard shell, steps | Goal, soundcheck, placement | M | Med | 2, 10 | New-player test | .5/1.5/3 | 1/1.5/3 | part: no placement, no tap |
| 18 | three.js fretboard, polish, in-app jitter probe | SVG board, `CallbackProbe` | `Fretboard3D`, probe flag, fallback | M | Med | 7 | **Taste, 3 OSes** | 1/2/4 | 2/4/10 | no |
| 19 | Release | `release.yml`, winget | **#64 notarization, #60 Intel Piper**, Linux packaging list, locales, site, notes, 3-OS pass | M | Med | all | Apple account, machines | .5/1.5/3 | 2/3/5 | yes |
| | **Total, everything** | | | | | | | **15 / 32.5 / 70.5** | **26.75 / 48 / 101** | |
| | **Total, cut** | | | | | | | **8 / 18 / 42** | **16 / 29 / 60** | |
| T | Testing with people, in calendar weeks. Inside it: agent 2/4/8, owner 5/8/15 days of rework | | | | | | Recruiting 5-10 guitarists, watching sessions | | | 4-6 wk (worst 8) |

---

## 11. Recommended order

1. **Merge (0), first and small.** Do not build paths on a branch.
2. **Real-audio gate (1), before any product code. One week, and a go/no-go.** Owner plays the corpus, agents build a WAV-through-detector fixture layer, then fix latency, floor and feed against it. Pass criterion to write first: e.g. at least 95% heard and evenness within 5 points of a reference, at 80-140 BPM 16ths, DI and mic, clean and gain.
3. **Tracer: one Mechanics exercise end to end** (2, a thin 4 and 5, minimal 7): Today button, exercise, result, back to Today, stored. Owner uses it daily from here.
4. Shell (6), so it can be used as the front door.
5. Find my edge (10), since it needs the same metric and is the mock's most convincing moment.
6. Theory landing, post-take (3), then content (9) and coach words (14), side by side.
7. Pedal (15), first-run (17), Paths and Progress (8), release (19).
8. **People test.** Only afterwards: live per-bar, drop-out, setlist kinds, three.js, voice, remaining content, in whatever order testers ask for.

## 12. What to cut for a first release

Cut: voice (16), three.js (18), live per-bar (13, use after-take feedback), placement (use goal and first takes), tap input, OpenRouter, click drop-out (11), setlist step kinds (12), camera exposure, bends and call-and-response, mid-session Ramp, phone layouts, 55 of 80 exercises.

Keep: Today, Session, two short Paths, Take result with reasons, Find my edge, pedal, honest "didn't catch", simple Progress, all old tools unchanged.

If still too much: ship **Alternate Picking only** and add Blues in the next release. It needs no pitch and reuses `TabStage` and `DrillClimb`. Only if the gate passes for it; if the gate fails at gain or speed, lead with Blues at slower tempos on DI or headphones instead.

## 13. What would change the estimate most

1. **The real-guitar result.** Passes with small fixes: subtract about 1-2 weeks of contingency. Noise floor and feed need redesign, or high-gain cannot be graded on a mic: add 2-4 weeks, or narrow the promise to DI. The largest unknown.
2. **Owner availability.** September pace halves the elapsed time. The last seven weeks' pace makes it meaningless.
3. **Scope: voice and three.js.** Together 7 owner days likely, 16 at worst, and 5 to 10 agent days. Both are optional.
4. **Theory over a band through a mic.** If it needs headphones or DI, it is cheap. If it must work on speakers, it may not work at all.
5. **Content quality.** A musician must play every exercise; agents cannot judge that. Scales linearly with step count.
6. **Songs stabilisation.** The owner fix wave Songs has not had may land on the same components (`TabStage`, review, takes).
7. **Translations.** English-only curriculum at first saves a gate relaxation's worth of wave time and later rework as text changes.
8. **macOS pipeline (#64).** A failed notarization blocks all Mac testers, and only the owner's Apple account can fix it.

## 14. What I could not verify

- Anything with a real guitar, microphone, interface, pedal, camera or speakers. My detector numbers are synthetic plucks; the shipped feed was simulated with an assumed poll and buffer.
- Real-rig latency. I measured the detector only; I inferred the total.
- App behaviour: not started, no UI seen running; mock reuse is judged from code, not screens.
- `test:rust`, `test:dsp`, the layout suite, jitter probe, LLM builds: not run by me. CI covers Rust and frontend at 09-29.
- Windows and macOS behaviour; WebGL on any webview; Qwen3's explanation quality.
- Owner activity outside git: unrecorded playing or decisions may exist. Calibration reads only commits and notes.
- Time splits and sizes are judgement. The 4-7x rework multiplier is from two features.

## 15. Side effects of this audit

- `git merge-tree` wrote tree objects into the repo's object store, as the brief instructed. No refs or working tree changed.
- An early `npm install` and `cargo check` in the temp copy, before I redirected them, added cached packages to `~/.npm` (365 files) and `~/.cargo/registry` (104 files). Harmless, but outside temp dirs, so disclosed. Later runs used temp caches or `--offline`.
- I listed the top level of `%USERPROFILE%\AppData\Roaming\com.yames.metronome` (file names only) to answer "what real captures exist". It lies outside the repo. Nothing was opened.
- Build output in `/var/tmp/yames-audit-target` removed at the end; scratch probe left in `/tmp/yames-audit/`.
