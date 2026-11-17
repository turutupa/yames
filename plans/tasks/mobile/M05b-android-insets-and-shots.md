# M05b — System bars, the top gap, and store shots a musician would pick

Size: S/M. Branch: `mob/m05b-insets-and-shots`, from `mobile` (after
M05 merged). Blocks: the first public Android build.

## What the release screenshots show (read them first)

`plans/tasks/mobile/m05/store/01-metronome.png` and
`plans/tasks/mobile/m04/playing-120bpm.png`, both from the emulator:

1. **The Android gesture bar covers the tab labels.** "Setlist" and
   "Settings" sit under the white navigation pill. `MainActivity.kt`
   calls `enableEdgeToEdge()` (the Tauri template does), so the WebView
   draws under both system bars — but Android's WebView reports
   `env(safe-area-inset-*)` as 0, so every `--safe-top` / `--safe-bottom`
   token M03a built resolves to nothing. The tab bar, the sheets and the
   transport all pad with `--safe-bottom`; they are all currently 0.
2. **A gap of roughly 150 px sits between the status bar and the
   header.** The status bar overlays the app (edge-to-edge), then there
   is empty space, then "Save preset". Something reserves that space on
   mobile — the desktop title-bar overlay height, the finish-setup chip
   slot, or a top padding rule — find which and make the mobile header
   start one status-bar inset below the top edge, no more.
3. **Store shots 01 and 02 were taken in a theme whose font stack ends
   in `monospace`.** On a phone none of the named fonts exist, so the
   whole app renders in the system monospace face. That is the theme
   working as designed, but it is the wrong first impression for a
   store listing. Re-shoot 01–05 in the default theme; keep 06-themes
   as the one that shows variety.

## Decisions already made

- **Keep edge-to-edge; feed the real insets to CSS.** Turning
  edge-to-edge off would paint the system bars a fixed colour that
  fights the light themes. Instead the Kotlin half of the
  `yames-mobile` plugin listens with
  `ViewCompat.setOnApplyWindowInsetsListener` on the activity's decor
  view and sends `{ top, bottom, left, right }` **in CSS px** (device px
  divided by `resources.displayMetrics.density`) over the plugin's
  existing event channel as `window_insets`; `useAndroidNative` writes
  them into `--safe-top/right/bottom/left` on `document.documentElement`.
  Emit once on load and again on every change (keyboard, rotation is
  locked so that is all). Desktop and the headless harness keep the
  `env()` fallback and are unaffected.
- The status bar and navigation bar stay transparent
  (`enableEdgeToEdge()` default) so the app's own background shows
  through under them; the header padding is what keeps content clear.
- The two follow-ups M05 flagged are yours too: the "Manuscript" theme
  label wraps mid-word at phone width (fix in the theme grid CSS, not
  by renaming), and `useBackDismiss` re-registers on every render the
  way the Sheet bug did (make it depend on stable values; add the same
  kind of regression test `Sheet.test.tsx` has).

## Files you own

`src-tauri/plugins/yames-mobile/android/**` (Kotlin insets listener),
`src-tauri/plugins/yames-mobile/src/**` only if the Rust side must
declare the event, `src/containers/main-window/hooks/useAndroidNative.ts`
and its test, `src/mobile/**`, `src/styles/shell.css` (the header's
top padding on mobile), `src/styles/settings.css` (theme grid label),
`plans/tasks/mobile/m05/store/*.png` (re-shot), `plans/tasks/mobile/m05b/`.

## Gates

- Release APK (throwaway keystore or the existing gradle debug signing)
  on the emulator: screenshot of the beat view showing the tab labels
  fully clear of the gesture pill and the header one status-bar height
  below the top edge; the same for the library sheet open (its close
  button and last row clear of the pill) and for zen (top controls
  clear of the status bar).
- `getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')`
  read over DevTools on the emulator is non-zero and equals the
  gesture bar height in CSS px; `--safe-top` equals the status bar.
- Store shots 01–05 re-shot in the default theme at 1080×2400.
- Manuscript theme label unbroken at 360 px (harness shot).
- `useBackDismiss` regression test passes and fails if the fix is
  reverted (say how you checked).
- Desktop gates green: `cargo build`, `npm run test:rust`,
  `npx tsc --noEmit`, `npx vitest run`, `npm run build:mobile`,
  `npm run check:css-hover`; `DOCS_RS=1 cargo check --lib --target aarch64-linux-android` clean.

## Report

What was done, the inset values read on the emulator, the cause of the
top gap, exact commands, anything not verified, commit hashes. Never
push; never touch `main`; never run the desktop app; port 1420 is not
yours.
