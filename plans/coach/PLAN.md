# Coach build plan

The owner's decision: the coach is the point of the app. It gives feedback as you go on the learning
paths, answers questions, and is a companion across the whole app. The spec is
`~/yames-coach-design-out/DESIGN.md` (with section 13 and `TOOLS.md`); the binding owner decisions and
the rules for every leg are in `plans/tasks/coach/BRIEF.md`. This file is the order of work.

Branch `coach` (from revamp `05644eec`). Each leg: its own worktree `~/yames-coach-<leg>`, branch
`coach-<leg>`, merged into `coach` by the orchestrator when its gates are green. After each delivery
below: bundle to `/tmp/yames-coach-out.bundle` and one line in `plans/coach/STATUS.md`.

Legend: **R** = needs the independent read-only reviewer before merge. **i18n** = adds strings, lands
them in all fifteen locales. **content** = pack content (`npm run paths -- check`). **probe** = the
click-jitter probe is a gate.

## Milestone 1: feedback as you go, the model selector, no Start button

The owner's first sentence, plus the two items the owner named top priority (the selector; removing the
old Start button). Four deliveries.

| Leg | What | Design | Needs | Flags |
|---|---|---|---|---|
| **c0** | Plumbing: `src/coach/bus.ts`, the lazy `CoachContext`, app-side `ResolvedBlock.source`, publish lines in `useSessionRun.ts`. No visible change. | 9.1, 9.2, 9.3 (first two rows), C0 | – | – |
| **ms1** | The model selector and the resident model. `Off / Standard / Studio` (Cloud later) **at the foot of the right-hand coach panel** (where the old card's Start button sat; the foot of the Ask dock once c2a1 lands); the choice persists; one loader owns load and unload app-wide (after first paint, idle, never while a Take runs); no session loads, unloads or arms an idle unload any more; a quiet Path Session generates nothing; honest state (loading, ready, failed, not downloaded, not on this device) and memory; **a model that is not downloaded shows its size and a Download button in the selector**, on the existing download path. | Brief item 10; owner updates 2 and 3; 9.4 row 1; 5.5 | – | R (session call order; any Rust), i18n |
| **ms2** | What ms1 could not finish of the selector's download: both tiers on disk side by side (if the store holds one brain today), pause / resume, the checksum check, the mobile-data and low-storage warnings. Settings → Coach keeps manage and delete. | Owner updates 2 and 3 | ms1 | R (model store, Rust), i18n |
| **c1a** | The note's brain, pure TypeScript: `takeNote()`, `rounds.ts`, `TakeFacts.lean` and `.heardIt`, export. A table test with one fixture Take per finding. | 4.2, 4.4, 9.3 | – | – |
| **d1** | *Delivery 1a*: selector in the rail; sessions silent. | | c0, ms1, c1a | |
| **pm** | "Pass mark" replaces "the bar" for the threshold in the app's English, translations following; writes `plans/COACH_I18N_BRIEF.md` (glossary, tone, the fifteen locales). | 2 (last row), 10 | c0 merged (quiet tree) | i18n |
| **c1b1** | The line and the note in a Session: `CoachLine`, `CoachNote`, `coach.css`; ready (first and later Takes), the fixed order during a Take, result (finding, bar strip, fact line), `notCaught`, ungraded (listen-for, Yes / Not yet), recap line. New `smooth.spec` case: no commit from the line or note during a Take. English honesty lint over the new keys. | 3.4, 3.6, 4.1 to 4.4; mocks 03 to 07, 11, 13, 14 | c0, c1a, pm | i18n |
| **c1b2** | Today's line (absorbs "Where you left off"), greetings by mood; boundary speech (Voice on only); hotkey and MIDI actions `ask-explain-last`, `ask-what-next`, `accept-suggestion`; phone scenes. | 6.1, 5.1, 8 (Voice, Today); mocks 01, 12 | c1b1 | i18n |
| **d2** | *Delivery 1b*: the coach speaks in every Path Step and on Today. | | | |
| **c1c** | The loop step ("Loop the first bar"), P1 (once more here) and P2 (Move on after the third same miss); "This one is for your eyes". | 4.2, 9.3 | c1b1 | probe (`--song-loop --song-take`), i18n |
| **c2a1** | Ask's shell: `AskPanel` in three shapes (dock, drawer, sheet), `useCoachPanel` (panel state out of `useSession`), Session and Songs mounts, the phone's Ask button in the header, the `?` hotkey as a real action, the model selector at the panel's foot (the sheet's head on a phone). The old chat thread moves in as it is. | 3.2, 3.3, 5.1, 7; mocks 02, 08, 11, 15 | c0, ms1 | R (doors parity), i18n |
| **c2a2** | The old Start and End buttons go. **Listen** on the tools' transport, the tool's coach line and note, History to Progress → Tool runs, `CoachCard` and `coach-card.css` deleted, `DELIBERATELY_REMOVED` keys, the mobile-bundle rule amended and recorded. | 7 (all tables), 8 (Tools, Progress) | c2a1, c1b1 | R (doors parity), i18n |
| **d3** | *Delivery 1c/1d*: loop and the two Session rules; Ask shell; no Start button anywhere; the tools keep their coach. | | | |

**Moved up (2026-11-20):** c4c (the `cues` pack field) and the `cues` content legs from milestone 3 run
beside milestone 2: 825 of 1,010 Exercises have no cue short enough to be the Take's order, so the
Take's line is mostly empty until they are written. c4c also shows the cue under the finding on the
result, because "Go again" skips the ready screen.

Parallelism: wave 1 = c0 ‖ ms1 ‖ c1a. Wave 2 = pm ‖ ms2, then c1b1 ‖ c2a1. Wave 3 = c1b2 ‖ c1c ‖ c2a2.
`useSessionRun.ts`, `useSession.ts`, `MainWindow.tsx` and the locale files are the shared files: each leg
file names which hunks it owns, and the second branch to merge rebases.

## Milestone 2: ask anything, and the tools without a model

| Leg | What | Design | Needs | Flags |
|---|---|---|---|---|
| **t1a** | The tool list and runner: `src/coach/tools/registry.ts` (plain data), `run.ts` (`runCoachTool`, grown from `runCoachAction`), the host in `MainWindow.tsx`; the three kinds (`read`, `go`, `confirm`) and the never-list as a test that those tools do not exist; `when(ctx)`; resolution ("the model names, the app resolves"); undo. | 13; TOOLS 2.1 to 2.3 | c2a1 | – |
| **t1b** | Receipts, proposals, "that one is yours" in the Ask panel; typed commands (`ask/router.ts`: numbers plus a six-verb table per locale); every tool reachable by chip and command; layout scenes. | 13; TOOLS 2.1; mock 16 | t1a | i18n |
| **c2b** | Fact cards (`ask/intents.ts`, `cards.ts`, `suggest.ts`): the fifty question shapes as `read` tools, chips on notes and in Ask, sources attached by the app, `locales/*/ask.json`. | 5.2 to 5.4; mocks 08, 15 | t1a | i18n |
| **c2c** | Search of the player's Paths (BM25; bigrams for ja, zh, ko) and the help set (about forty entries), `explain_screen`. | 5.3 | c2b | i18n |
| **d4** | *Delivery 2*: Ask answers and acts on every device with the selector on Off. | | | |

## Milestone 3: companion, and My exercises

| Leg | What | Design | Needs | Flags |
|---|---|---|---|---|
| **c4a** | Tendencies, the Notebook (Ask's second tab), the goal, the stored keys (`coach.suggestions`, `.cards`, `.goal`, `.suppressed`) in the settings manifest. | 6.7, 9.5; mock 10 | c2a1 | i18n |
| **c4b** | Weekly look-back, plateau question, milestones, the one-card budget, the Progress dot, Path suggestion; `src/session/totals.ts`; the long-view store query (`db.rs`). | 6.2 to 6.6 | c4a | R (`db.rs`), i18n |
| **c4c** | `Exercise.cues` in the pack format, generator, validator, `variantText`; the ready note uses them. | 4.2 | c1b1 | content |
| **cues** | The cues themselves for the sixteen Paths, written as a teacher would, proof-read by a separate reader; pack i18n regenerated. One leg per four Paths. | 4.2 | c4c | content, i18n |
| **t2a–c** | My exercises: `buildCustomExercise(recipe)` on the Paths generator; the recipe store; the list on Paths; a part in Today; `make_exercise` with its preview. | 13; TOOLS 2.4; mock 17 | t1b | R (store), i18n |
| **rem** | The one opt-in practice reminder (owner decision 8): feasibility first (what Tauri and Android offer without a new permission prompt nobody asked for), then Settings → Coach. | 12 q8 | c4a | i18n |
| **d5** | *Delivery 3*. | | | |

## Milestone 4: the model chooses

| Leg | What | Design | Needs | Flags |
|---|---|---|---|---|
| **c3a** | The worker: `GenKind::Ask` with its own prompt, a grammar sampler (verify the crate's API first; a fuzz test that a completed grammar cannot abort), chunked prompt decode, cancel by generation id, prompt caching; probe modes `--llm-load` and `--llm-cancel`. The existing kinds' prompts stay byte-identical (a test). Can start any time after ms1. | 9.4 | ms1 | R, probe |
| **c3b** | The model chooses tools: grammar generated from the registry, `ask/model.ts`, the speed gate (`asksUseModel`, 8 s a turn), token budgets, **the hand-written tool test set (about 300 items, at least 20 per language)** and the harness (`scripts/coach-eval.mjs`, `coach-eval.rs`); stock Standard and Studio measured four ways. Gates: right tool ≥ 90%, wrong action < 2% before a model-read navigation goes at once, per language. | 5.5, 13; TOOLS 3.5 | c3a, t1b, c2b | – |
| **c3c** | Prose: labelled general advice, English first; no digit, no note name (structural). | 5.4 | c3b | i18n |
| **d6** | *Delivery 4*, with the eval numbers in STATUS. | | | |

## Milestone 5: the rest of the app

| Leg | What | Design | Needs | Flags |
|---|---|---|---|---|
| **c5a** | Jam's line on stop, theory answers, `pinShape`, "Make this my finisher"; Songs verdict in the same note, a dock on Songs, due passages in Today's line. | 8 | c2b | i18n |
| **c5b** | "Hear bar N: yours, then the demo": the Take's audio in memory through the engine's output path, parked and freed off the callback like speech. | 4.2 | c1b1 | **R (audio)**, probe (all pairs, with the audio playing) |
| **c5c** | `useSession.ts` split into `usePracticeHistory` and `useToolCoach`; `analyze_free_play` as the tool note's finding source; `templateCatalog.ts` to the locales. | 7 | c2a2 | R (doors), i18n |
| **c6** | Wizard coach step, Settings → Coach regrouped (Answers, Voice, Suggestions, Notebook, In the tools), phone settings; docs: `UI_DECISIONS.md` (U4.1 superseded, U4.3 amended), `COACH_UX.md`, `MOBILE_IMPLEMENTATION_PLAN.md`, `TESTING.md`. | 8 | c4a | i18n |
| **d7** | *Delivery 5*: the plan is done. | | | |

## Not in this plan (recorded so nobody builds them by accident)

- ~~Fine-tuning (T4, T5): decided from c3b's numbers, by the owner.~~ **Approved by the owner on
  2026-11-20 18:35** as leg **c3d**, after c3b: if stock Qwen3 4B / 8B fall short on tool choice or
  latency, build and train the small router for speed (a LoRA of the 4B on our tool set is also
  allowed if the numbers say it helps); training runs as queue jobs (`--gpu`, `--est`); the trained
  router is measured against the stock models on a held-out set before anything ships behind the
  selector.
- Cloud in the selector: a hidden entry point only; no hosted model, on a phone or anywhere.
- "Check your tuning": the sentence is not written until the app has a tuner (owner decision 9).
- Notifications other than the one opt-in reminder.

## Things the orchestrator decided, to revisit only if building proves one wrong

1. **Corrected by the owner (2026-11-20).** The selector sits at the **bottom of the right-hand coach
   panel**: where the old coach card and its Start button sat, and in the new design the foot of the Ask
   dock / drawer. Not the left rail. On a phone: the Ask sheet's head, and Settings → Coach. (My first
   reading, the foot of the left rail, was wrong.)
2. The selector's local entries are named by what they are (the tier's model and size, e.g. "Standard ·
   Qwen3 4B · 2.5 GB"), not "Local 1 / Local 2". Confirmed by the owner.
3. **Corrected by the owner (2026-11-20).** Off means unloaded, never deleted. A model that is not
   downloaded shows its size and a **Download button in the selector itself** (progress, pause / resume,
   checksum check, cancel; a warning on mobile data or low storage), on the existing download path;
   when it finishes it can be selected and loads as usual. Settings → Coach keeps manage and delete. The
   player starts every download with a press; the coach itself never downloads (it stays a never-tool).
   (My first reading, a detour to Settings, was wrong.)
4. A load that is in flight when a Take starts runs on (it cannot be interrupted); the loader never
   *starts* one while a Take runs. The probe run that proves a load under the click is in c3a.
5. Progress notes are one file per leg (`plans/coach/progress/<leg>.md`); `PROGRESS.md` is the index.
