# Leg c5c3: `templateCatalog.ts` to the locales (i18n; size-led)

Worktree `/home/dgx-delgado/yames-coach-c5c3`, branch `coach-c5c3`. Logs under `/tmp/coach-c5c3/`.

PLAN's c5c, last third. DESIGN 7: "`templateCatalog.ts`, `templates.ts`, `narrative.ts`: kept for the
tools. The catalogue is English only; moving it to the locales is C5." **Needs c5c1 merged**
(`useSession.ts` imports `TEMPLATE_CATALOG`; after the split the import lives in `useToolCoach.ts`).

## Settle before launching (the orchestrator)

**The size.** `src/coach/templateCatalog.ts` is 2,311 lines holding about **1,305 English strings**: a
`GENERIC` catalogue and five instrument catalogues (`DRUMS`, `ELECTRIC_GUITAR`, `BASS`,
`ACOUSTIC_GUITAR`, `PIANO`), each scenario x severity with three to eight variants, plus
`DEFAULT_MODE_CATALOG` and `PRO_MODE_CATALOG` (lines 2000-2311). Fourteen locales is about 18,000
translated lines, and `src/test/i18n.locales.test.ts` requires **every language to carry the same
namespace files**, so a namespace cannot land in some locales first. This brief is written for: one
new namespace, all fifteen in this leg, translated by **seven sonnet helpers of two locales each**
(the leg's own context never reads their output, only the parity test's result), with a conditional
**c5c4** (the remaining locales on the same branch) if the leg passes 170k tokens. The other way, if
the orchestrator prefers it: translate the first three variants of each slot only (every slot still
answers in every language; English keeps all of them). That trims content the design did not ask to
trim, so it is not chosen here.

Read: `plans/COACH_I18N_BRIEF.md`; `plans/coach/progress/c5c1.md` (where the catalogue is imported
now). Code: `src/coach/templates.ts` (`Vocabulary` 57, `ScenarioCatalog` 83, `TemplateCatalog` 86,
`pickTemplate` 133, `pickTemplateForSeverities` 209), `templateCatalog.ts` (the header: the generic
fallback is by design), its importers (`useToolCoach.ts` after c5c1, `useRealtimeTips.ts`,
`useSegmentCoach.ts`, `src/songs/verdict.ts`, five tests), `src/test/i18n.locales.test.ts`.

## What to build

1. **The catalogue as data**: a script (`scripts/`, committed) writes `src/locales/en/toolTips.json`
   from the three TS catalogues, byte-for-byte the same strings in the same order; a test proves
   the JSON and the old constants equal before the constants go. Then `templateCatalog.ts` becomes a
   loader that reads the active language's catalogue (same exported names and types, so importers
   do not change). Placeholders stay the catalogue's own `{name}` form, filled by its own code, not
   i18next's.
2. **The language.** `pickTemplate` takes the catalogue of `i18n.language`; the instrument fallback to
   `generic` is unchanged. The LLM rephrase (`safeRephrase`) runs only on English text (owner decision
   3: model prose English first); in any other language the template ships as written. Tests for both.
3. **Parity tests**: every locale has every vocabulary x scenario x severity slot with the same number
   of variants as English, and each variant carries exactly the English variant's placeholders. The
   English honesty lint over the catalogue (no cause claimed, "pass mark", nothing about tuning); a
   line that fails it in English today is reported, not silently rewritten.
4. **Fourteen locales** by the helpers (two locales each, `plans/COACH_I18N_BRIEF.md`; drum words for
   drums, guitar words for guitar: the vocabulary rule in the file's header). Commit each pair as it
   lands. Stop at 170k tokens with the parity test naming the missing locales: that is c5c4.
5. Nothing on screen changes in English (`tool-coach.spec.ts` unchanged and green).

## Not yours

`templates.ts`' selection logic, the gatekeeper, the shuffle bag, `narrative.ts` (English, kept),
`useSession.ts` and the two hooks beyond an import line. Songs' verdict wording (it calls
`pickTemplate`; it follows the language like everything else, and its own tests say what changed).

## Gates

tsc, vitest (`i18n.locales.test.ts`, the five catalogue tests, `songs/verdict.test.ts`), build. Layout
by name: `tool-coach.spec.ts` in English and one run in German (`--lock coach-layout`); a line wider
in German is a layout question to name, not fix by shortening.

## Report

As the rules block's end of the leg: the string count per locale; the helpers' pairs and their
commits; the English lines the lint caught; the locales that want a native read; what c5c4 owes, if
anything.
