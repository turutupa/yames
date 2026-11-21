# Leg t1b2b: typed commands in fifteen languages, wired into Ask's text box

Branch `coach-t1b2b` (from `coach` at `838a3675`). Logs in `/tmp/coach-t1b2b/`.

Status: IN PROGRESS (tables being written by four sonnet helpers; wiring done; gates owed).

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
- **Roots stay letters.** No solfège: "la" is the article in es/fr/it. A Romance-language player who types "la menor" gets `none` (safe).
