# Leg c2ca: search of the player's Paths (pure TypeScript and tests)

Branch `coach-c2ca` (from `coach`). Logs in `/tmp/coach-c2ca/`. Brief: `plans/tasks/coach/c2ca-search.md`.

Status: IN PROGRESS.

## What is here

| File | What |
|---|---|
| `src/coach/ask/search.ts` | `fold`, `tokenize`, `buildSearchIndex(paths, lng)`, `searchIndexFor` (lazy, cached), `searchPaths(query, index, opts)`, `searchPathIds(paths, progress)`, `answerSearchFor(text, ctx)`, `SEARCH_FLOOR`. |
| `src/coach/ask/searchData/stopwords/<lng>.json` | Fifteen stop-word lists (data; sonnet helpers; at most thirty each). |
| `src/coach/ask/searchData/fixtures/<lng>.json` | en, de, ja (22 questions each), es, ru, zh-CN (6 each), each with a near-miss `none` list. |
| `src/coach/ask/searchFixtures.test.ts` | Runs every fixture against the real packs; `SEARCH_REPORT=1` prints the scores and the index's size. |

## Next

Calibrate the floor from the report run; unit tests (`search.test.ts`); gates.
