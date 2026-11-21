# Leg t1b2b: typed commands in fifteen languages, wired into Ask's text box

Branch `coach-t1b2b` (from `coach` at `838a3675`). Logs in `/tmp/coach-t1b2b/`.

Status: DONE. Full layout suite owed (the orchestrator's).

## What landed

| File | What |
|---|---|
| `src/coach/ask/commandTable.ts`, `router.ts` | Two optional table fields. `verbFinal` (de, nl, tr): when no verb leads, a verb that ends the text is taken ("pfade öffnen"). `ordinalPlaces` (`{ bar, step }`, `#` = the number: "第#小节", "#단계"): the nth bar or Step written with the counter around its number; only phrases that cannot mean a count. Validator checks both. Tests in `router.test.ts`. |
| `src/coach/ask/commands/<lng>.json` | Fourteen tables (helpers). |
| `src/coach/ask/commands/lines/<lng>.json` | Per language: the dozen commands as typed (with the name args where a name is typed), `nearMissNone`, `nearMissYours`, `notes`. Outside `COMMAND_TABLES`' glob (`commands/*.json`). |
| `src/coach/ask/commandTables.test.ts` | Every locale has a table and lines; the dozen reach the same calls as English; none of them is a call during a Take; ≥ 15 near-misses, each `none` (or `yours` with its item) on eight screens; every never-list word alone is `yours`, and before or after every verb never a call. |
| `src/containers/coach/askTyped.ts` (new) | `answerTyped(text, language)`: router → `call` `runAskCall` / `which` refusal turn "Which one?" with the choices / `yours` `askYours` / `none`+`notHere` the runner's refusal; then the slot `setAskNextAnswerer(fn)`; then `sendAsk` (the model, or the plain statement). `askTyped.test.ts`. |
| `src/containers/coach/AskPanel.tsx` | The send calls `answerTyped(draft, i18n.language)` instead of `sendAsk(draft)` (three small hunks: import, `i18n` from `useTranslation`, the call). |
| `src/locales/*/coachTools.json` | `coachTools.command.*` (the "Which one?" labels t1b2a left owed), fifteen locales. |
| `tests/layout/ask-typed.spec.ts` (new) | Typed command and receipt, then a typed never-list request: 1440 English, phone Japanese. Pictures with `YAMES_ASK_SHOTS`. |

## Decisions and why

- **No "Try: slower, 80, open paths" line**: neither DESIGN 5.5 nor mock 16 shows one.
- **The wiring lives in its own module** (`askTyped.ts`), so `AskPanel.tsx` changes in three lines and `askStore.ts` not at all (c2b1a edits both).
- **The slot for c2b1b**: `setAskNextAnswerer((text) => boolean)` in `askTyped.ts`: true = answered (it wrote its own turns, the player's among them), false = go on to the model / plain statement. Today nothing is plugged in.
- **Roots stay letters.** No solfège: "la" is the article in es/fr/it. A Romance-language player who types "la menor" gets `none` (safe). German "h" for B is not modelled either.
- **Two router defects fixed, with tests**: (1) no way to say a verb-last command or an nth bar/Step written number-first (the two optional fields above); (2) `parseBare` returned null on "<number><step unit>" before an ordinal place was tried ("7단계").
- **One app defect fixed**: on a phone the send button's press blurred the box, the sheet's footer came back (`data-typing`), the button moved and the send was lost. `onMouseDown` preventDefault on the button keeps the focus in the box. Found by the new scene.

## Numbers (near-misses: none / yours, after the second readers)

en 20/9 in its lines (router.test.ts keeps 71/18); de 36/11, nl 35/11, tr 34/11, pl 37/11, ru 35/11, vi 34/11,
es 38/12, fr 35/12, it 35/12, pt-BR 34/12, ja 40/11, ko 36/11, zh-CN 36/11, zh-TW 36/11. Every one is checked on eight
screens (Today, Paths, Progress, Metronome, Jam, Settings, Session ready, Take). The second readers found two near-misses
that routed to a call (ja 「ブルースを再生しながら練習する」 → play_exercise; ko 「블루스 코스 열어봐도 돼」 → open_path), fixed
in the tables' `notCommand`.

## Gates (logs in /tmp/coach-t1b2b/)

- tsc: pass (`tsc.log`); `npm run build` (tsc + vite) after the last code change: pass (`build.log`).
- vitest full: 29982 passed; failures only `TabStage.render.test.tsx` (known, symlink) and three 20 s timeouts at load 75-83
  (`paths/generate.test.ts` x2, `session/packs.test.ts`) in files this leg does not touch (`vitest.log`). Re-run of
  generate + packs + `src/coach/ask` + `src/containers/coach` + `i18n.locales`: 1182 passed, packs timed out again at load 83
  (`vt-rerun.log`); packs alone: pass here and on `coach` (`packs-mine.log`).
- Layout: `ask-typed`, `ask`, `ask-tools`, `short-window` pass; `smooth` passes except the neck's long-task test at load
  50-83 (fails here twice; passes alone at load 39: `smooth-4.log`; also passes on `coach`). Logs `layout.log`, `layout-2.log`.
- Pictures: `/tmp/coach-t1b2b/shots/ember-typed-1440.png`, `ember-typed-phone-ja.png`.

## Open points

- **Leftover as a name in ja/ko/zh**: a sentence with a verb word, other characters and no marker from `notCommand` can still
  become `open_path` / `follow_path` / `load_jam` / `play_exercise` with the leftover as the name. The runner then resolves
  it (an unknown name is a refusal; play and load are proposals that wait for a press; open is a navigation with a way back).
  A stricter rule (the name must resolve before the router calls it a command) would be a router change for a later leg.
- tr: "giriş" (input) is on the never-list, so "giriş sayımı" (the UI's count-in) answers "yours"; tr apostrophe suffixes
  ("80'e") are one token and do not route; tr ordinals ("7. adım") are left out on purpose (also "seven steps").
- A never-list request that contains a pronoun ("nimm mich auf", "録音したい") answers `none`, not `yours` (`notCommand` is
  checked first): safe, but the "show me" is lost.
- Native reads wanted: all fourteen; most of all tr, vi, ko, ja (each lines file's `notes` lists the doubtful words).
