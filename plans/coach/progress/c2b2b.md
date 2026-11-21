# c2b2b: the source line opens what it cites; fourteen locales; the scenes

Branch `coach-c2b2b` (from `coach` at `aadecbdd`). No Rust. Logs: `job logs coach-c2b2b-*`, files in `/tmp/coach-c2b2b/`.

## What a source line opens (`src/containers/coach/askSources.ts`, pure `sourceAnswer` + `pressSource`)

| Label | Outside a Session | In a Session |
|---|---|---|
| Measured · Take N | a turn in Ask: "Take N, as its result said it: …", the result note's finding as drawn (`coachSlot.findingFor`), source Measured · Take N. Only the Take the card read (`CardBody.cites`, stamped in `cardBodyFor`), never another Exercise's Take N; a Take whose note is not kept: `ask.source.takeGone` | the same (it never navigated) |
| From the Path · Step N | `open_step {path: <the Path's title>, step: N}` through the runner (its receipt and its way back). The Path is the one the line names (`BlockSource.pathId`, new, set by `pathCards.fromPath` and `search.ts`), else the one on screen | the Step's own words quoted in Ask (`ask.source.step` + its goal and why as `ask.card.path.quote`), no tool call; a Step not found: `ask.source.stepGone` |
| Worked out by the app / General advice / a label with no Take or Step | one line saying what the label means (`ask.source.app` / `general` / `measured` / `path`) | the same |

"In a Session" = the tools' host says a Session is active, or the context's screen is the Session, or a run phase is not idle, or there is no context (then nothing navigates).
Nothing here runs during a Take (Ask is not mounted then; unchanged).

Where the lines are pressable: Ask's card turns (`AskCardTurn`) and the model's "General advice" turn (`AskPanel`). The tools' own source line
(`AskToolTurn`, "Done by the app") and the Session's note (`CoachNote`) are not targets: no `onSource` there.
On a phone the line is a button 44 px tall (`.ask-sheet .coach-block-source-press`), measured in `ask-path-cards.spec.ts`.
A double-click is one press (`detail > 1` dropped, as the chips).

Tests: `askSources.test.tsx` (each label, in and out of a Session; a press in a Session calls no go tool and changes nothing on the host;
the drawn line is a button only with `onSource`; a card's Measured line pressed through the panel; a scale named by its Jam label in German).

## The two sentences checked against the metric (decision 1)

- `ask.card.term.accentsMark` was FALSE. `accentPlacement` is `accent_agreement` (`src-tauri/src/score/pass.rs:446`, `:481-493`; the
  report's `score.rs:1908`): the mean amplitude of the accented hits over the mean amplitude of the other hits, less one, clamped to 0..1.
  Not a share of the accents, and against all the other notes, not "the notes around them". Now: "{{bar}}% is the accents pass mark: on
  average, the marked accents must come out at least {{bar}}% louder than the other notes."
  The same false claim was in `ask.card.below.accents`, `ask.card.made.check.accents` and `session.coach.below.accents`: corrected the same
  way and re-translated. Left (vaguer, "accents landed: N%"): `session.metric.accents`, `session.today.*.accents` (:74), `session.why.*accents`
  (:217, :225), `ask.card.changed.metric.accents`, `ask.card.distance.*.accents`. Named for a later leg.
- `ask.card.term.notesMark` holds: `noteIdentity` over a window is right / (right + wrong + octave) (`pass.rs:447-453`, `pitched()` :234),
  an octave counting as not the written note, notes without a pitch left out (`pass.rs:37-41`), so "of every 100 notes I could pitch".

## Decisions

- Scale names: `theory.scale` lines carry the scale's id (`scale`) beside its English `name`; `AskCardTurn.cardLineText` says
  `t(SCALES[id].labelKey)` (the Jam screen's label). No locale translates a scale name a second time.
- Note names stay letters in every locale: no screen of the app names notes any other way (no locale file has solfège or H).
- Item 3 done: a placed key whose root by letter is not on the app's controls (Cb, Fb, Bbb) is said with the root it sounds as:
  `theory.scalesPlacedMajorAlso` / `MinorAlso`, "(Bbb sounds the same as A)". Every letter stays as the theory code spells it.
- No card, tool, `intents.ts` entry, `note` or `short` was added or changed (decision 4).

## Locales

Three sonnet translators (de nl pl ru / es fr it pt-BR tr / ja ko vi zh-CN zh-TW), then three separate sonnet proof-readers.
Proof-read fixes: ru degree "аккорд V ступени"; es/fr/it/pt-BR "home chord" as the tonic chord; it Take feminine in the keys of this
leg; tr apostrophes; ko no particle glued to a placeholder; zh-CN quote marks; zh "保持到最后". Settings labels in `noPassMarkSet` checked
against each locale's `settings.json` / `shell.json`.
Want a native read: it (the rest of `ask.json` still says "il take", masculine, against the glossary: a sweep for a later leg); the
tonic wording in es/fr/it/pt-BR; ko "{{chord}} 코드는"; ja Test out 飛び級テスト (coachTools) vs テストアウト (session.json); zh Test out
跳级测试 vs 测试 likewise; ru `plan.minutes`; pl `term.notesMark`.

## Scenes (`tests/layout/ask-path-cards.spec.ts`)

1440 Ember (Session: Path passage quoted, its source pressed, the Step quoted in Ask, no receipt, the Session stays); 1440 Manuscript
(Today: `plan_minutes` with its proposal, then `scale_fits` with the neck, "Worked out by the app" pressed); phone de Manuscript
(the source line 44 px tall, pressed in the Session); phone Ember (the neck fits the sheet).
Seen in the pictures: a quote longer than a block is cut between words into two blocks, each with its own source line (c2b1a's
`cardAnswer` rule, already named in c2b1b). Not changed here.

## Gates (after `git merge coach`, rem2)

- tsc pass (`coach-c2b2b-tsc-2`); build pass (`coach-c2b2b-build`).
- vitest (`coach-c2b2b-test`, `/tmp/coach-c2b2b/test.log`): 51211 passed, 10 skipped; only the known `TabStage.render.test.tsx` load failure.
- `npm run paths -- check`: not owed (nothing under the packs changed).
- Layout `ask`, `ask-tools`, `ask-cards`, `ask-path-cards` (`coach-c2b2b-layout-2`): 42 passed, 3 failed: two `ask-cards` 30 s timeouts
  at `openInSession` (load), one mine (a strict locator, fixed). Re-run of `ask-cards` + `ask-path-cards` with 2 workers
  (`coach-c2b2b-layout-3`): 8 of 8 passed. Pictures in `/tmp/coach-c2b2b/shots/`.
