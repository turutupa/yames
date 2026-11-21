# c2cb handoff to c2cc: the layout scenes (item 6) and the native reads

c2cb stopped after items 1 to 5 (context past the 170k line). Item 5 (fourteen locales of `help.json`) is
done by sonnet helpers; item 6 is c2cc's.

## Item 6: layout scenes (brief `c2cb-help-set.md`, item 6)

A new spec, e.g. `tests/layout/ask-help.spec.ts`, pictures only when `YAMES_SHOT_DIR` is set, `--lock coach-layout`:

- a search answer quoting a Path passage, en and ja: type a question c2ca's fixtures answer
  (`src/coach/ask/searchData/fixtures/{en,ja}.json`; `askAnswerers.test.ts` `searchable()` picks the first that
  answers) on Today; expect `[data-testid=ask-card][data-card=search]` with the "From the Path · Step N" source;
- `explain_screen` on the Session's result and on Today: press `[data-testid=ask-card-chip-help]` in Ask's empty
  state; expect `[data-card=help]`;
- at 1440 and a phone, Ember and Manuscript.

The shot harness (`src/shots/`) must have packs loaded in the scene for search (`host.paths()` is
`useCoachToolHost`'s `session.paths`).

## Native reads wanted (from the translators)

- All locales: "Add it" is still English in every `coachTools.json`; de/es/fr/it/nl/ja/ko/zh quote it in English,
  pl/ru/tr/vi/pt-BR translated it. One of the two must change when `coachTools.json` is translated.
- de "Wiederholung" for both review and loop; fr "Paramètres" vs "Réglages"; pt-BR "Configurações" vs "Ajustes";
  ko rung and Step both 단계; zh-CN 练习 for Session and Exercise; ja 聞く/聴く; nl "Herhaling"; it "Off" in English;
  tr "alıştırma"/"egzersiz"; Jam's vibe/feel words free in pl/ru/tr/vi/pt-BR.

## Open points for later legs

- `modelCallBody` (askTools.ts): if the model ever chooses `explain_screen`, its answer is drawn as a receipt, not a
  help card (dark today: `MODEL_LANGS` empty).
- The tuning line is English-only matching; a tuning question in another language goes on to search, whose floor
  held "how do I tune my guitar" out in en (c2ca) but is untested in other languages.
