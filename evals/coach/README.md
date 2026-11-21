# The coach's tool test set (held out)

`tools/<lng>.jsonl`: what a player types into Ask, where they are, and what the app should do with it
(a tool call, "which one?", "that one is yours", or nothing). It measures a language model's tool
choice (`scripts/coach-eval.mjs`, DESIGN C3b, TOOLS 3.5) against the rules every device already runs.

**Held out: never used for training.** No item, wording or paraphrase of an item may go into a training
or tuning set (c3d: check every training file against these hashes and against the texts). A change to a
file changes its hash below, and `src/coach/ask/evalSet.test.ts` fails until the new hash is recorded:
that is deliberate, so every edit is a visible one.

**Written by hand, never generated from the app.** Each language was written by one helper (a sonnet
agent) from the tools' one-line descriptions, the real Path / Step / Exercise titles of that language
(`coach-eval.mjs titles`), and the item format, and re-read by a second helper as a native player would
type it (`writer`, `reader` on each line). Neither looked at the app's command tables
(`src/coach/ask/commands/`), its example lines, or its templates: a set made from those would measure the
tables against themselves.

## Format (`src/coach/ask/evalWorld.ts`)

`{ id, lang, situation, text, expect, tags, writer, reader }`; `situation` is `{ view, path?, step?, phase?,
grading?, tempo? }` (app ids: the situation is the app's side); `expect` is `{kind:"call", tool, args}` |
`{kind:"card", card, args?}` | `{kind:"which"}` | `{kind:"yours", item?}` | `{kind:"none"}`. Every
expected call is judged by the app's own runner in its situation against a fixed world (three followed
Paths, three jams, three presets, a plan of three parts): `node scripts/coach-eval.mjs check`.

## What is in it (leg c3b1a, 2026-11-20)

The first half: the actions and the asks and refusals, 252 items, about two actions to one ask or refuse.
en, es, de: 36 each (24 calls, 4 which, 4 yours, 4 none); the other twelve: 12 each (8 calls, 1 which,
1 yours, 2 none). A question a fact card will answer is not in it (it is not a `none`). Leg c3b1b added the
card items (below; the full mix: 20 a language, 60 in en / es / de, four actions / four answers / two ask
or refuse in ten) and recorded the new hashes.

## The card items (leg c3b1b, 2026-11-21)

195 items appended to the same files (ids continuing), for the seven fact cards on `coach` (`FACT_CARDS`,
`src/coach/ask/intents.ts`): `where_slipped`, `early_or_late`, `why_not_counted`, `what_changed`,
`improving`, `score_made_of`, `pass_mark_distance`. en, es, de: 24 each (20 card items, 2 none, 1 call,
1 which); the other twelve: 10 each (8 cards, 1 none, 1 call), 11 in fr, ru and vi (9 cards). The set is
now 447 items; every language meets the full mix (`evalSet.test.ts`).

- **Where**: always a Session; `phase: "result"` for a card about the last Take (the world keeps no
  Takes, so the result screen stands for "a Take just ended"), `ready` allowed for `score_made_of` and
  `why_not_counted` with a `what` (they read the Exercise). A Session's Step must exist (the validator).
- **Arguments are part of the answer**: `early_or_late` has `premise` (`early` / `late`) only when the
  question assumes a direction; `why_not_counted` has `what` (pitch, pickDirection, muting, posture,
  tension, handAttribution, fingering, tone, feel) when the question names one thing ("is my muting
  graded" gets "I didn't measure that" from this card). A card is right when its id and those arguments
  match (`take: "last"` and `what: "take"` are the defaults and ignored).
- **Near-misses**: `none` for things nothing measures and no card names (vibrato, a bend reaching its
  note, loudness), and in en / es / de a card question asked while a Take runs (`phase: "playing"`,
  `wrong-screen`); `call` for an action in a card's words (`set_tempo` slower after a word for
  dragging); `which` (en / es / de) for "how far off" with nothing saying off the beat or off the pass mark.
- **Not in it**: questions for the cards being built beside this (Path, plan, theory, what a word means):
  neither card items nor `none` items until those cards are on `coach`. The item format already takes any
  card id; a new card's items are appended and the hashes recorded again.
- Written by a sonnet helper per language (en by the leg itself) from a kit that described each card in
  its own words; none looked at the matcher (`match.ts`), its tests or the locale's card sentences.
  Cross-read by a second helper per language (`sonnet-cards-reader-<lng>`): 20 texts changed (wrong verb
  forms, translated-sounding words, one that asked for slower in words meaning "dragging" in Korean),
  no `expect` changed. The leg re-read every English and German item and every `none`: one German card
  item named two things and now names one; one `none` each in de, ru and vi asked whether vibrato is
  graded or heard (which `score_made_of` partly answers) and now asks whether it was good.

## The rule baseline on the card items (`node scripts/coach-eval.mjs rules`)

The rules are the router, then the cards' own matcher as the text box runs it (`matchCard`: English
only; only where a card has something to read: a Session's result screen, or the Exercise for
`score_made_of` / a `what`), then Path search. On the 159 card items: **right card 7 (all English: 7 of
20), wrong card 0, no card 152** (every non-English item: the matcher reads English only). A card given
where the item expects none: 0. The new `none` items: all none; the new `call` and `which` items: 0
of 15 and 0 of 3 (the router has no "take it down a notch"). Whole set: 447 items, right 108, wrong
actions 0. The English card misses are chatty or indirect wordings (no item is quoted here: the README
is read by the training leg); one went to a Path search passage (an answer, never an action).

## Hashes (sha256)

| file | sha256 |
|---|---|
| en.jsonl | 0c27f32f4c29cef841d60cd398f1fbce5c33228d0912e6d61f57b269add7bfad |
| es.jsonl | 33fc07d8ad6d98afded433b50e6af2c11e9496ccf599e3c2f8e924eb98df6f15 |
| de.jsonl | ebfa9419983afc4ff0f87ff94242b8deda28c3af8938ff9632e9a7e17f5fcd12 |
| fr.jsonl | 38c3e67e0bbb9044c4a51887ee318794f2c8971be5421bdee11d6e8c5897ad6d |
| it.jsonl | c344eff9c041167523422580139a51d0514fb06daeda5ca207d01189d843cf28 |
| pt-BR.jsonl | 7d20b9dd64664d64dca0147bc6ee2c7430bd5ab4f23fcdd31a176d7cd38ea5ac |
| nl.jsonl | e591e3ede33b29c56e15b591a4c379797441b84d095ad2b056ad731315044e07 |
| pl.jsonl | 0f9999481293db084e62145e6f190bd81f9d0554bc0a2766309d53892414cdb0 |
| tr.jsonl | f7f62150c0070eb8b2b65ec29c146de0c2d762eec4f379b70093d855d8b77386 |
| ru.jsonl | be44f91d9454f0bbc8edb36933b98cfd32b2980d352cf7384d51537a7bab8679 |
| vi.jsonl | 5ef01d943149eaaa332c24f319f5e5de6afa4c1223992ed1727f72adb3a79e87 |
| ja.jsonl | 3943526f93d55d0a47518ccd8ecddef07ac5dc18ed70aaa16e248b88b3de77b9 |
| ko.jsonl | dc95fe2d5a4cbd59eba44c03a1f0c055bd6742b8a1a2bc4b8613df671c1025c1 |
| zh-CN.jsonl | f01dac0ca09f40b4b0173e1ec7c715b3df4607ede28629de9fd75c6c1c505918 |
| zh-TW.jsonl | 2b8529ae48b2090df0252564946e4bb78c4bd13e1e428aa779738ae3bb1fc253 |
