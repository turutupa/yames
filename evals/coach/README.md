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
1 yours, 2 none). A question a fact card will answer is not in it (it is not a `none`). Leg c3b1b adds the
card items when the cards are on `coach` (the full mix: 20 a language, 60 in en / es / de, four actions /
four answers / two ask or refuse in ten), then records the new hashes.

## Hashes (sha256)

| file | sha256 |
|---|---|
| en.jsonl | 64d00626b926d274e21e62e6ac3924df55c3539943ff50398ca952614ed3185a |
| es.jsonl | f4c2fabbb0d7fcdd0db2d2ddeed8928aab4da8a1b534f6a77758b262add354e9 |
| de.jsonl | fe5a362dbadbaa5c5ecda9af66ffd791f78f4c4036e915c5db39c976bc7fe288 |
| fr.jsonl | dfa799156edc7020ca38e06a55bcdad82f96410ddf61a31b35cb5209e5023d03 |
| it.jsonl | fe048781a98dd8fb5bb14b8c1f2db6d07e775d8d9c5ad7896e52399a4fe499d7 |
| pt-BR.jsonl | c48aff7c46ee1d87d22b15548b4571f0fb942b5bb76ba333e1846366232820f7 |
| nl.jsonl | c4491422a9e2dc9b95927358491f9ccdbdc3f03816106daa390e8032dd0d0a13 |
| pl.jsonl | ebf4f2618a3af6c019bd082ebbd590033bd16f2e7f49406897c0d4fca8b0a688 |
| tr.jsonl | 10b6de03f3e71f4509927de973e6d06e0ab624edeeb4be34c7257dc6559625f3 |
| ru.jsonl | 9e55f28eef7c7cc25c7747b10f29d8c5f0996cd1550bef213a92041caad25c42 |
| vi.jsonl | 59fafb09e2c24334c7eacb767478518b9fb3b7df780d29b139c2af0445096492 |
| ja.jsonl | 5ef840d4136e39ce10ded6c8d82f7f2a76ceb727751a225756dd6c252e26f193 |
| ko.jsonl | 29b962a72c696694b69bc60dd8d1c106715ac44dcc1bf61a5476834134636a68 |
| zh-CN.jsonl | 548f725aee0c9fad74cc79de5560130c076b185b9863b469d9fd44a6c76402a7 |
| zh-TW.jsonl | ee9d1f8285af877e7d1f4cee1a41278ddbf942676fc93ca8914e472cc55de995 |
