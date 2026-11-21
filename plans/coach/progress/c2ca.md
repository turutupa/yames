# Leg c2ca: search of the player's Paths (pure TypeScript and tests)

Branch `coach-c2ca` (from `coach`). Logs in `/tmp/coach-c2ca/`. Brief: `plans/tasks/coach/c2ca-search.md`.

Status: DONE (gates below). Nothing visible changes; nothing is wired (c2cb wires it).

## What landed

| File | What |
|---|---|
| `src/coach/ask/search.ts` | `fold`, `stem`, `tokenize`, `buildSearchIndex(paths, lng)`, `searchIndexFor(paths, lng)` (lazy, cached), `searchPaths(query, index, opts)`, `searchPathIds(paths, progress)`, `answerSearchFor(text, ctx)`, `SEARCH_FLOOR`, `SEARCH_LIMIT` (5). |
| `src/coach/ask/searchData/stopwords/<lng>.json` | Fifteen stop-word lists, data, at most thirty words (sonnet helpers; trimmed: see below). |
| `src/coach/ask/searchData/fixtures/<lng>.json` | en, de, ja: 22 questions each with the Steps a teacher would point at, 16 / 20 / 20 near-misses; es, ru, zh-CN: 6 questions, 10 near-misses each. de / ja / es / ru / zh-CN written by a sonnet helper as a player would type them, without reading the packs. |
| `src/coach/ask/search.test.ts` | Unit tests on two small packs: folding, bigrams, stems, stop words, one passage a Step, `pathIds`, the played variant, `searchPathIds`, the cache, null cases. |
| `src/coach/ask/searchFixtures.test.ts` | Every fixture against the real packs: hits at 1 and 3 and "answered" (first and over the floor) held to today's numbers; every near-miss none; en and ja answers byte for byte with `{ kind: "path", step: N }`. `SEARCH_REPORT=1` prints every score and the index's size. |

## How it searches (decisions)

- **Passages**: a Step's `why`, `payoff`, each `howTo` line; an Exercise's `purpose`, each `howTo` line; a variant's
  own `purpose` / `howTo` (quotable only when `opts.played` names that variant, and then they replace the Exercise's
  field, as `exerciseWords` does). A sentence a Path says twice is kept once (the Step's own first). Level warm-ups are
  left out (generic). `goal` left out: tried (report row "WITH GOAL", `/tmp/coach-c2ca/goal.log`): at 1 the same 39,
  answered 34 against 35, at 3 four more (de +3, ja +1). Worth re-trying when c3b's model chooses among candidates.
- **Ranking, two levels**: BM25 over Steps (a Step = all its passages + its title x8 + its Exercises' titles), then the
  Step's best passage by BM25 over single passages. Passage-only BM25 was tried first: en 5/22 at 1, short lines with
  one rare shared word won. Grid (title weight 0/1/3/5/8 x Step b 0.5/0.75/0.9/1 x Step-only vs Step+passage): title 8,
  b 0.75, Step-only best (39 of 84 at 1 over six languages; 26 with no titles). k1 1.2, b 0.75 unchanged.
- **Tokens**: NFKC, lower-case (Turkish casing for tr), de ä/ö/ü -> ae/oe/ue and ß -> ss (both typed forms meet), every
  other Latin accent dropped, ru ё -> е; kana/Han/Hangul untouched. One-letter Latin tokens dropped, digits kept.
  ja / zh-CN / zh-TW: stop entries cut out as substrings, then character bigrams (plus each Han character alone in
  documents, so a one-character question word finds it). ko: whole-word stops, then bigrams per word (particles stay
  attached to words, so bigrams match the stem: 코드는 -> 코드, 드는).
- **Stems**: en a light suffix rule (plural, -ing, -ed, doubled consonant); de nl es fr it pt-BR pl ru tr: first six
  letters; vi and the bigram languages none. Stems took en at 1 from 5 to 10 (with Step ranking).
- **The floor** (`SEARCH_FLOOR`): over it one of two ways, score >= 8.5 and strength >= 0.34, or score >= 4.5 and
  strength >= 0.84 (strength = Step score / (sum of the question's idf x (k1+1)); a word no Step has counts in full).
  Chosen by a search over the report (`/tmp/coach-c2ca/floor.mjs`): zero of 77 near-misses through, 36 of 39 first-place
  hits kept. A single score floor kept 30; strength alone let "what time is it" through. Nearest near-misses:
  "was kostet eine neue Gitarre" 8.36 / 0.475, "how do I tune my guitar" 6.32 / 0.745 (matches "Tunes on one string").
- **The player's Paths** (judgement call 1): subscribed Paths plus Paths with a passed Step; none -> all sixteen. The
  index always holds every Path given and the player's are chosen at search time, so one question scores the same
  whatever a player follows and one floor holds for all.

## Numbers (2026-11-20, `/tmp/coach-c2ca/vt.log`)

| lng | at 1 | at 3 | answered (first and over the floor) | near-misses through |
|---|---|---|---|---|
| en | 15/22 | 18/22 | 14/22 | 0/16 |
| de | 11/22 | 14/22 | 10/22 | 0/20 |
| ja | 9/22 | 12/22 | 9/22 | 0/20 |
| es | 2/6 | 3/6 | 1/6 | 0/10 |
| ru | 1/6 | 2/6 | 1/6 | 0/10 |
| zh-CN | 1/6 | 4/6 | 1/6 | 0/10 |

Most misses are vocabulary: the player's word is not the overlay's (ja プリングオフ vs the pack's term, de "Wechselschlag",
ru "питч-оффы", zh 勾弦). A model choosing among the five candidates (c3b) or synonyms per language would help; a
miss that falls under the floor is none, not a wrong passage.

Rows "answered" are what the player is told; everything else under the floor is none.

Index, all sixteen Paths, on the DGX under a shared queue: en 50-117 ms, ja 170-397 ms (de 121-249, zh-CN 156-337).
5,735 passages, 265 Steps; en 1,463 terms / 122k postings, ja 9,955 terms / 409k postings. Heap right after the
build (garbage included): en +12 to +14 MB, ja +23 to +38 MB.

## Stop words: trimmed, and wanting a native read

Dropped from the helpers' lists: en "who" (31 > 30); es kept "mi" (my) though it is also the note; it and pl "mi"
dropped (note name); tr duplicate "mi" and "daha" (more); vi "la", "co", "the", "can", "nen", "de" (folding merges them
with content syllables). Native reads wanted most for vi, tr, ko, ja, zh-TW.

## What c2cb must know

- Call `answerSearchFor(text, { language: i18n.language, paths, progress, played })` after the cards. It is
  synchronous and returns null or `{ answer, source, hit, candidates }`: `answer` is a `CoachAnswer` of one text block
  (the passage byte for byte); `source` is `{ kind: "path", step: N }` for `resolveCoachAnswer(..., { source })`;
  `hit` has `pathId`, `stepId`, `exerciseId?`, `field`, `line?` for a heading or a link.
- `paths` must be the packs already loaded in the player's language (`loadAllPacks(lng)`), and the SAME array each
  call (the index is cached on the array; a new array builds a new index). With none loaded it returns null.
- The first call in a language builds the index (up to ~0.4 s in ja on a busy machine): never during a Take, never
  in a render. Call it from the send handler, or warm it on Ask's first open.
- Search after the router: a command never reaches it.

## Gates

- tsc: pass (job `coach-c2ca-tsc`).
- `npm run build`: pass (`/tmp/coach-c2ca/build.log`).
- vitest full: 47938 passed; failures only `TabStage.render.test.tsx` (known, symlink) and
  `useSessionRun.input.test.tsx` "turns the input on by itself..." under the queue's load ("Timeout calling
  onTaskUpdate" in the same run) (`vitest.log`). Re-run of that file with `src/coach/ask`: all pass (`vt-rerun.log`).
  This leg's modules are imported by nothing outside their tests.
- No layout run: nothing visible changes.
