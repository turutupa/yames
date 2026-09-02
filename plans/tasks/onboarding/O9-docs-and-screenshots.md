# O9 — Screenshots, website/README "First run", locale review

Size: S. Branch: `onboarding/o9-docs`. Depends on: O1–O8 merged.

## Deliverables

1. Extend `scripts/take-screenshots.sh` (macOS) with an `onboarding`
   section: W0, W2, W6, tour stop 5, at the Obsidian theme, 2800×2100
   like the existing docs images; add a PowerShell equivalent for
   Windows captures if practical, else document the manual steps.
2. `docs/img/onboarding/*.webp` (compress like the rest of `docs/img`).
3. README: a short "First run" section after Features, three images,
   one paragraph, no marketing fluff. Website (`docs/index.html`): the
   same section in the existing style.
4. Locale review: read every `onboarding.*`, `emptyStates.*`,
   `whatsNew.*` key in all 15 locales for length (fits at 480 px width)
   and obvious mistranslation; fix what is clearly wrong; list anything
   that needs a native speaker in the report.
5. `plans/ONBOARDING_PLAN.md`: mark shipped items, move anything
   deferred to a "Later" list.

## Gates

- i18n parity test green; images ≤ 400 KB each; README renders on
  GitHub; the website builds via `pages.yml`.
