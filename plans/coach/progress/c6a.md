# Leg c6a: Settings → Coach regrouped, the Notebook group, the phone's Settings → Coach, the wizard's coach step

Branch `coach-c6a` (from `coach` at 3b51af73, merged with `coach` at the end). Logs `/tmp/coach-c6a/`.

## Settings → Coach, five groups (DESIGN 8)

| Group | Rows (each moved with its behaviour; nothing rewritten) |
|---|---|
| Answers | Coach model (Off / Standard / Studio), the honest status, the tiers line, **the Answers line** (new), Update the coach model, the models on disk with their Remove / older copy / Remove models |
| Voice | Voice (silent / voice), Voice Name, the voices download, the jam's spoken cues |
| Suggestions | Suggestions (On / Only when I ask), the practice reminder (rem2, unchanged) |
| Notebook | **new**: the lines left out (`coach.suppressed`, read through `isSuppressed`), each with its day and Bring back; the thirty-day sentence; the goal with the Notebook's own Edit (`Goal` exported from `Notebook.tsx`, `offer` false) |
| In the tools | Scoring Mode and Coaching Style (the "Tools only" tag stays on these two), Verbosity, Hear what I play |

The Beta badge stays on the section's head (`CoachSectionHead`, shared with the phone).

- **The Answers line** (`answersLine` in `CoachSettingsGroups.tsx`) reads `modelLangs()` (`MODEL_LANGS`) for the
  chosen tier: empty (today, both tiers) or Off → "The coach answers from your Takes and Paths."; a language
  switched on → "In its own words in: English and Spanish." (Intl.DisplayNames + ListFormat). A router row can
  be added under it in the Answers group.
- **Bring back**: one press, `saveUnsuppressed(id)`; the row says "Back in your Notebook." with an Undo for
  `LEAVE_OUT_UNDO_MS` (10 s); Undo is `saveSuppressed(id, <the original day>)`, so the line's thirty days are
  unchanged. A save that does not land says "notSaved" (the Notebook's string). Nothing is deleted. A left-out
  id the Takes no longer make is listed as "A line your recent Takes no longer show".

## Phone (judgement call 28)

`CoachSettingsPhone`: Answers (the selector's rows from `useCoachModel()`, each "Not on this device", no
button), Suggestions (with the reminder), Notebook. Voice and In the tools are not shown. The old phone-only
"Practice reminder" section is gone (its row lives in Suggestions); `reminder.spec.ts`'s phone test follows it.

## Wizard (judgement calls 29, 30)

The coach step: what1 rewritten ("The coach reads your Takes and your Paths: …"), the one question "Should
the coach also answer in its own words?", "Off still gives you the line, the note, the tools and answers from
your Takes and Paths.", the privacy line, then Off and the tiers as before. **"Try the listening feature anyway"
is dropped** (no other home: W5 runs before this step on every run); `tryListening` is recorded false. W7's
coach row says "Off: answers from your Takes and Paths"; `reasonNoLlm` says "Off". The phone has no coach step
(since the MVP), so on a phone the wizard asks nothing; no statement-only step was added (open point).
DELIBERATELY_REMOVED: `onboarding.coach.what2`, `timing.title/desc`, `tryListening.label/hint`.

## Strings

Fifteen locales: three sonnet translators (de es fr it ja / ko nl pl pt-BR ru / tr vi zh-CN zh-TW), three
sonnet proof-readers. Native reads wanted: ja `groups.tools` and `what1`; es `bringBack`; ko 한 줄 vs 항목;
tr Yol capitalisation; zh `lineGone`; pl Twój/twoje.

## Gates

See the final report (jobs coach-c6a-tsc-3, -test, -build, -layout).
