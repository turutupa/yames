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

## Status

- [x] code + unit tests (WIP commit)
- [ ] locales (three sonnet translators, then three proof-readers)
- [ ] scenes `tests/layout/ask-path-cards.spec.ts`
- [ ] merge `coach`, gates
