# Leg hd1: Today's header says the plain fact; two tests get headroom

Branch `coach-hd1` (from `coach`). Logs under `/tmp/coach-hd1/`.

## 1. Today's header

The kicker above Today's title (`TodayView.tsx`, `data-testid="today-lead"`,
uppercase by CSS) has four variants, chosen by `plan.mood` from the planner
(`daysAway` = whole days since the last Take; `back` = `rungsToDrop(daysAway) > 0`,
i.e. 7 days or more, `BREAK_DAYS`):

| Condition | Key | English before | English after |
|---|---|---|---|
| no Take ever, Today's line is the "first" sentence | `session.today.leadFirst` | Your first session | unchanged |
| no Take ever, any other line | `session.today.leadFirstOutcome` | First session · finds where you start | unchanged |
| back after 7+ days (`mood === "back"`) | `session.today.leadBack` → `session.today.leadLast` | Welcome back. It has been 12 days | Last Session: 12 days ago |
| every other day (`returning`) | none (`Intl` weekday) | Friday | unchanged |

Only the "back" variant greeted; the two first-session variants state a fact
(no welcome), so they stay. `leadLast` counts with i18next's plurals
(`{{count}}`; `_one` reads "Last Session: 1 day ago", never shown today since
"back" starts at 7 days, kept for the neighbours' pattern, `backAgo`).
`session.today.leadBack` is gone from all fifteen locales and listed in
`DELIBERATELY_REMOVED` (`src/test/parity/localeKeys.test.ts`).

Translations (sonnet helpers, `plans/COACH_I18N_BRIEF.md`): es "Última sesión:
hace N días", fr "Dernière séance : il y a N jours", de "Letzte Session: vor N
Tagen", it "Ultima sessione: N giorni fa", pt-BR "Última sessão: há N dias", nl
"Laatste sessie: N dagen geleden", pl "Ostatnia sesja: N dni temu", ru "Прошлая
сессия: N дней назад", tr "Son oturum: N gün önce", vi "Buổi tập trước: N ngày
trước", ja "前回のセッション：N 日前", ko "지난 세션: N일 전", zh-CN "上次练习：N 天前",
zh-TW "上次練習：N 天前". Each takes the locale's word for Session from
`line.back.even` and its "N days ago" from `backAgo`.

Read together on `today-back`: header "LAST SESSION: 12 DAYS AGO", then
Today's line "Last Session, X: 79% even at 90 BPM. That was 12 days ago.
Today starts at 85 BPM." Not word for word (the spec checks the line does not
contain the header's text), but the "12 days ago" is said twice. The owner's
decision fixes the header; if the repeat grates, the line's `backAgo` sentence
is the one that could go (it is `todayLine.ts`, nf1's tonight; not touched).

Pictures: `today-line.spec.ts` now checks the header on `today-back` at 1440
and 1024 and on a phone (`phone-today-back`, a new phone copy of the scene in
`src/shots/scenarios.ts`), saved under `YAMES_SHOT_DIR`.

## 2. Two tests

- `src/paths/generate.test.ts`, '"mostly" names a grid ...': a 60 s per-test
  timeout, nothing else.
- `tests/layout/smooth.spec.ts`, "Ask commits nothing during a running Take":
  see the commit and the report. Every measuring window must begin and end
  with the Take playing (`data-phase="playing"`); one the Take ended in is
  discarded (once the Take ends, Ask opens as promised, which read as "rendered
  during the Take"); the scene is reopened once if none fit; the hint's wait
  has a 30 s timeout; two animation frames after the press before measuring;
  the DOM counts are read while the Take plays; AskPanel's renders are summed
  over every kept window (before: the best window's only). Same thresholds.

## Gates

See the leg's report.
