# M03d — Phone polish: three-step onboarding, tab labels that fit

Size: S. Branch: `mob/m03d-phone-polish`, from `mobile`. Parallel with
M04 (which owns `src-tauri/`, the Android project, and adds
*notification* keys to the locale files — you only edit existing tab
label values and remove onboarding wiring, so the two do not collide).

## Decisions already made

- **The instrument step leaves the phone onboarding.** On mobile
  nothing consumes the answer (the coach and the mic evaluation were
  its consumers and do not exist there). A question with no effect is
  dishonest. Mobile onboarding is three steps: welcome → sound & look →
  ready. Desktop keeps all of its steps.
- **Tab bar labels must fit in every locale without an ellipsis.**
  The bar has six tabs at 360 px, each ~56 px wide at 0.58 rem. M03b
  reported Vietnamese "Máy đếm nhịp" and Portuguese "Configurações"
  truncate. Fix by giving the tab bar its own short label keys
  (`shell.json` → `mobileTabs.*`) in all 15 locales, chosen to fit
  (e.g. pt-BR "Ajustes", vi "Nhịp"), not by shrinking the font further.
  The full names stay in each tab's `aria-label`.
- The beat view may scroll at 360 px; do not change the tempo block.

## Files you own

`src/containers/onboarding/` (the step registry and the mobile step
list only), `src/containers/main-window/MobileTabBar.tsx` (label keys
only), `src/locales/*/shell.json` (values for the new `mobileTabs`
keys; add the key to all 15 — `i18n.locales.test.ts` demands an
identical key set), `src/locales/*/onboarding.json` only if a string
becomes unreferenced (leave unreferenced strings alone unless a test
complains), `src/mobileComposition*.test.tsx` for the onboarding step
count.

## Steps

1. Worktree sanity (`git log --oneline -1` on the tip of `mobile`).
2. Mobile step list → three steps; the "ready" summary must not
   mention an instrument. Composition test updated.
3. `mobileTabs` keys in `en/shell.json`, then the other 14 locales
   with labels that fit ~56 px at 0.58 rem (measure with the M03b
   harness `scripts/m03b-shots.mjs` if you can; otherwise keep every
   label ≤ 9 characters and say so).
4. Gates.

## Acceptance gate

- `npx tsc --noEmit`, `npx vitest run`, `npm run build:mobile`,
  `npm run check:css-hover` green.
- A tab-bar screenshot at 360 px in `vi`, `pt-BR`, `de` and `ja`
  (switch the language via the settings dropdown in the shots harness,
  or by `localStorage`/store override) with no ellipsis; committed
  under `plans/tasks/mobile/m03d/`.
- Desktop onboarding test count unchanged.

## Report

What was done, the label table for all 15 locales, exact commands and
results, anything not verified, commit hashes. Never push; never touch
`main`; never run the desktop app.
