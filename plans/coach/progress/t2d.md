# t2d: typed recipes in fourteen languages, the make_exercise strings translated, the scenes

Branch `coach-t2d` (from `coach` 7cb9c9c9). Brief `plans/tasks/coach/t2c-make-exercise-tool.md` (the t2d
part). Logs `/tmp/coach-t2d/`. Today's part (brief item 5) is NOT here: it needs more than a planner
input and one runner hook, so it is leg t2e (`t2d-HANDOFF.md`).

## What landed

| What | Where |
|---|---|
| `recipe.rootNames` (new, optional): a language's own note name to a root ("h" B, "fis" F#), or null for a letter that names another note there than in English (German / Polish / Russian "b"): a line holding it is not read as a recipe at all. Recipe reading only; `show_scale` unchanged. | `commandTable.ts` (type + validator), `router.ts` (`recipeRootAt`, the null check in `recipeCall`) |
| The `recipe` group in the fourteen command tables (sonnet writer + a second sonnet reader per group) | `src/coach/ask/commands/<code>.json` |
| Hand-written lines per language: at least 8 that propose (11 to 14 each), at least 6 near-misses (7 to 15 each), `yours` lines; `keyless` in it / pt-BR | `src/coach/ask/recipeCases/<code>.ts`, read by `recipe.locales.test.ts` |
| Every make_exercise string translated in fourteen `coachTools.json` (three translators + three proof-readers) | `src/locales/<code>/coachTools.json` |
| Scenes: preview, receipt with Undo, "the Undo ended" at 1440 (dock, Manuscript), phone sheet (Ember), German at 1024 | `tests/layout/ask-make.spec.ts` (shots only with `YAMES_SHOT_DIR`) |

## Per-language decisions

- de: `rootNames` h=B, b=null, fis cis gis dis ais, as=Ab, ges; "es"/"des" left out (pronoun, article).
  "ab" (from) is not nulled: it is read as Ab only right before a scale word, which no German phrase does.
- nl: B is B; bes=Bb, es=Eb, as=Ab and the -is names. pl: h=B, b=null, Polish -is/-es names ("as" left
  out: ace); "a moll pentatonika" is not read (the scales table has "molowa"), safe. ru: h=B, b=null;
  Latin letters only ("ля минор" falls through).
- es, fr: no article; a bare "a menor" / "a mineur" is A. it: `article` ["e"] (and), root only after
  in / di / su; "e" added to it's `fillers`. pt-BR: `article` ["a", "e"], root only after em / de / do:
  "faça a pentatônica" asks which key; "e" added to pt-BR `fillers`. es / fr / pt-BR have no "three notes
  per string" words: "notas" / "notes" is a never-list word there (answered `yours`).
- Fixed-do names (do re mi fa sol la si), ja/ko/zh native names (イ短調, 가단조, 甲) and scale-before-root
  word orders are never read: they fall through, and each language's `none` holds one.
- ja / ko / zh: no article or rootNames; "Am7" glued is tokenized "am" and falls through; ja ペンタ /
  zh 五声 alone mean the minor pentatonic (the existing scales table, as English "pentatonic").
