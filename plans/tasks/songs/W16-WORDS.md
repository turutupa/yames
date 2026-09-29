# W16 — Words: Songs and the coach's new sentences in fourteen more languages

Branch `songs-w16-words`, from `songs-v1`. Size M. Locale JSON only
(`src/locales/<lang>/*.json`) plus tests. Last night's workers shipped
English in fourteen locales for everything new: the `songs` namespace, the
review and its verdict sentences, `coachBlocks`, the learning-mode and
report strings W8 added, the takes copy where it was extended. Translate
them: de, es, fr, it, ja, ko, nl, pl, pt-BR, ru, tr, vi, zh-CN, zh-TW.

- **Find the work by diffing, not by guessing**: for every namespace, list
  the keys whose value in a locale is byte-identical to `en` and was added
  since `main` (`git diff main...songs-v1 -- src/locales/en`). Proper
  nouns, note names, chord symbols and units stay as they are and go on an
  explicit allow-list in the test so they do not count as untranslated.
- **Musician's language, not a dictionary's.** Use the words players of
  that language actually use (a German guitarist says "Takt", "Auftakt",
  "Hammer-On"; a Spanish one "compás"; Japanese players use the katakana
  loanwords). Look at how the existing translations in that locale already
  name bar, beat, tempo, loop, take, click, and stay consistent with them —
  build a small glossary per language from the existing files first and
  put it in your report.
- **The coach's voice** (`plans/COACH_UX.md` B1): a patient session
  player, second person, informal where the language has the choice and
  the rest of that locale already uses it, no cheerleading, no
  percentages. Every interpolation placeholder (`{{bars}}`, `{{amount}}`,
  …) survives exactly; plural forms follow i18next's rules for that
  language (`_one`, `_other`, `_few`, `_many` … as the language needs —
  Polish and Russian need more than two).
- Text that must fit: the rail label, buttons, the fader names, the pass
  stepper. Run the layout suite in the three longest languages (de, ru,
  fr by usual experience — measure rather than assume) and fix overflow by
  choosing a shorter word, never by shrinking type.

## Gates

build; vitest, including a new test that fails when a key added since
`main` is still byte-identical to English in any locale and is not on the
allow-list, and one that checks every placeholder and plural form;
`npm run test:layout` with `YAMES_LAYOUT_LOCALE` (add the switch to the
shots harness if it does not exist) for the three longest languages.

## Not yours

Any code outside tests and the shots harness switch. English copy: if an
English string is wrong or unclear, say so in the report; do not edit it.
State plainly in the report that these are machine translations for a
native speaker to review, and which strings you were least sure of.
