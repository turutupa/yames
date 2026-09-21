# M09 — The band fits on a phone

Size: M. Branch: `mob/m09-jam-phone`, from the tip of `mobile` (it must
contain `merge(mob/m08-main-v121)`). Written 2026-09-20. **Your brief is
`plans/tasks/mobile/M08-JAM-GAPS.md`** — read it whole, then
`M03-GAPS.md` and the M03b/M03c briefs for how the rest of the app was
made to fit, then `plans/JAM_MODE.md` and the memory of the Jam UI pass
that lives in the code: Jam's layout uses **container queries**, and
menus are **portalled** (`useMenuPlacement`, 320 px cap). Work with
both; do not replace them.

## What "fits" means, in the gaps file's own order

1. **Tempo is operable on the Jam tab**: `−`, `+` and TAP on screen at
   360, thumb-sized (44 px), no sideways scroll anywhere on the stage.
   The stage's 907–953 px floor is the root cause; give `.jam-view` a
   phone layout rather than shrinking things until they fit.
2. **The band's rows do not overlap.** Name · picker · volume · switch
   cannot be one line at 360. Two lines per player (name + switch, then
   picker + volume) or the picker moving into the per-player sheet that
   already exists: choose on what a player does mid-song (mute someone,
   turn someone down) and keep those two one tap away.
3. **"Set up" is a first-class control**, not third in a `⋯`. Cheat
   sheet may stay in the overflow.
4. **The bottom bar carries seven.** "Metrono…" is the first thing
   anyone sees. Shorter labels are not the fix in fifteen languages
   (M03d already spent that budget — read its notes on "Metro" and
   "Tempo"); look at icon-over-label sizing, dropping the label on the
   two utility buttons (Library, Zen) right of the divider, or moving
   one of them. Decide on what a musician reaches for, say why.
5. **Back closes Jam's layers.** The setup drawer is Jam's own docked
   drawer, not the mobile `Sheet` primitive, so it is not on the Back
   stack (M04's `set_back_intercept` / `back_pressed`). Back closes, in
   order: a portalled menu, the per-player sheet, the cheat sheet, the
   setup drawer; then it backgrounds the app with the band still
   playing. Use the existing stack; do not write a second one.
6. **The cheat sheet's screens** (two tabs, the root × quality chart,
   the stacked necks) were not photographed by M08. Add them to the
   harness at 360 / 390 / 430 and make them fit: a fretboard may scroll
   sideways inside its own container; the page may not.

What already works and is not to be touched: the setup drawer as a
full-width sheet, the 4 × 3 timeline, the NOW block, Stop / Count-in
pinned above the tab bar.

## Desktop must not move

Every rule you add is inside the phone's scope (`IS_MOBILE` class /
the mobile media and container conditions M03 established). The
desktop layout suite (`npm run test:layout`) stays green untouched, and
the desktop parity probe in `npm run shots:mobile -- --parity` shows no
new differences (its one known noise is `.voice-wave__bar`).

## Gates

- `npm run shots:mobile -- --only tab-jam,jam,jam-band,jam-setup,<your
  cheat-sheet scenes> --widths 360,390,430`: **the harness's overflow
  assertion passes on every shot** (all twelve fail today), and you
  have LOOKED at every picture: a passing assertion over an ugly screen
  is not done. Also one run at `--locale de` and `--locale ru` (long
  words) and `--locale ja`.
- Extend `tests/layout/jam.spec.ts` to 360 / 390 / 430 under the mobile
  build rather than writing a new spec (the gaps file says which
  assertion); if the Playwright suite cannot run a `YAMES_MOBILE=1`
  build today, make that possible in the smallest way and say how.
- `npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`,
  the machine is loaded; re-run a failure alone before believing it),
  `YAMES_MOBILE=1 npm run build && node scripts/check-mobile-bundle.mjs`.
- No Rust changes are expected. If you make one, run `npm run test:rust`
  with `CARGO_TARGET_DIR='C:\yt-m09'` and the Android type-check from
  the README. **The emulator is NOT yours** (M10 has it); your proof is
  the shots harness. Say in the report what only a device can show.

## Rules

`git checkout -B mob/m09-jam-phone mobile` first (worktrees start
stale); `rustup override set stable-x86_64-pc-windows-msvc`; copy
`node_modules` from `C:\Users\alber\Dev\yames-mobile\node_modules`
**with robocopy from PowerShell** (from Bash the `/E` flag is mangled
and nothing is copied); never push, never merge, never start the app or
`tauri dev` / `tauri android dev`; explicit `git add` paths; new strings
in all 15 locales, appended at the end of their namespace; nothing the
user reads says WebView, APK or Rust; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stay out of
`src/containers/main-window/hooks/useJamSession.ts`, `jam.rs` and
`kit.rs`: M10 is in them.

## Report

Before/after per gap with the shot paths, the tab-bar decision and why,
what Back does now, what you could not prove without a phone, final
commit, worktree path.
