# M11 — A setlist step reads like a sentence on a phone, and the app says when there is a newer one

Size: M. Branch: `mob/m11-setlist-and-update`, from the tip of `mobile`
(it must contain `merge(mob/m08-main-v121)`). Written 2026-09-20 after
the orchestrator looked at every phone screen of the merged build at
360 and 430 px. Two items, one commit each (more if an item needs
them); item 1 first.

## 1. The setlist editor's step card falls apart at phone width

Reproduce: `npm run shots:mobile -- --only setlist-editor,setlist-empty,
library-setlists,tab-setlist --widths 360,390,430` and LOOK at
`setlist-editor-360.png`. On the desktop a step reads as one sentence:
*Loosen up · 70 BPM · 4/4 · quarter · for 8 bars then cut · wood ·
volume 70%*. At 360 px every token is on its own line — "70 BPM",
"4/4", "quarter", "for", "8 bars", "then", "cut", a **stray "·" alone
on a line**, "wood", another stray "·", "volume 70%" — so one step is
650 px tall, a four-step routine is three screens, and the separators
are orphaned punctuation.

What it should be on a phone: still a sentence a musician can read and
tap into, two or three lines per step. The name on its own line; tempo,
meter and subdivision together on one; "for 8 bars, then cut" together
on one; sound and volume together on one (or folded behind the step
when it is not the selected one — decide on what someone editing a
routine on a phone between exercises needs to see, and say why). No
separator ever starts or ends a line. Every tappable token stays at
least 44 px tall to the finger even if it is drawn smaller. The
selected step's controls (move up / down, duplicate, delete, the drag
grip) stay reachable and do not push the name off its line. Check the
step kinds the first screen does not show: a **jam step**, a
**rest / count-in transition**, a **minutes** trigger and a **"when I
say"** trigger, and the long-word locales (`--locale de`, `ru`, `ja`).

Also on that screen: the header reads "D  SETLIST  No changes" — the
routine's name is cut to its first letter. Another worker (M09) owns
the shared top bar; do NOT touch `MainHeader` or the top bar's CSS.
Report what you see and leave it.

Everything stays inside the phone's scope (the `IS_MOBILE` class / the
conditions M03 established). The desktop layout suite stays green
untouched; the running setlist (`SetlistPlayer`, the ribbon) must still
fit too — shoot it.

## 2. An app installed from the website never learns there is a newer one

The owner's plan is to offer the Android build as a download on
yames.app first, the store later. A downloaded app has nothing that
updates it. The desktop has an updater (`ipc.desktop.ts`,
`@tauri-apps/plugin-updater`); a phone must NOT get that plugin — it
cannot replace its own package, and the store build must never try.

Build the smallest honest thing:

- On a phone, at most once a day and only when the app is opened (never
  in the background, never while the click is running — wait for stop),
  ask `https://api.github.com/repos/turutupa/yames/releases/latest` for
  the newest version. One anonymous GET, no identifiers, nothing sent;
  it fails silently offline. Compare with the running version.
- If there is a newer one: a quiet row at the top of Settings → About
  ("Version 1.3.0 is out · Get it") and a small dot on the Settings tab
  — no dialog, no banner over the metronome, nothing that interrupts
  practice. "Get it" opens `https://yames.app/#download` in the system
  browser through the existing `openUrl`. Dismissing it silences that
  version, not the next.
- **A build installed from a store must show none of this** — the store
  updates it, and both stores reject apps that point at their own
  downloads. Make it a build-time switch that is OFF unless the build
  says it is the website's (an env var read by `vite.config` next to
  `YAMES_MOBILE`, e.g. `YAMES_SIDELOAD=1`, folded at build time so the
  store bundle contains neither the URL nor the strings), wire it into
  `android.yml`'s APK job and NOT its AAB job, and add the release-URL
  string to `scripts/check-mobile-bundle.mjs` as something the store
  bundle must not contain (the check needs to know which bundle it is
  looking at — extend it the smallest way).
- The privacy page (`docs/privacy.html`) says the app collects nothing.
  That stays true, but it should say the truth about this too: one
  sentence, in its voice, that the app downloaded from the site asks
  GitHub once a day whether a newer version exists and sends nothing
  about you. Musicians, not developers.
- Strings in all 15 locales, appended at the END of their namespace,
  with the plural forms each language needs if any string counts.
- Tests: version comparison (1.10.0 > 1.9.9, pre-release tags, a
  malformed answer), once-a-day, silence-per-version, never while
  playing, store build shows nothing.

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`;
re-run a failure alone before believing it), `YAMES_MOBILE=1 npm run
build && node scripts/check-mobile-bundle.mjs` for both the store and
the website flavour, and the shots above — looked at, not just passed.
No Rust is expected; if you touch any, `npm run test:rust` with
`CARGO_TARGET_DIR='C:\yt-m11'` and the Android type-check from the
README. The emulator is NOT yours (M10 has it) and the physical phone
attached to this machine is the owner's: no adb at all in this task.

## Rules

`git checkout -B mob/m11-setlist-and-update mobile` first;
`rustup override set stable-x86_64-pc-windows-msvc`; `node_modules` by
robocopy **from PowerShell** from `C:\Users\alber\Dev\yames-mobile`
(from Bash `/E` is mangled and nothing is copied), else `npm install`;
the shots harness uses port 1436 with `--strictPort` and another worker
uses it too: if it is busy, wait and retry, do not kill it; never push,
never merge, never start the desktop app, `tauri dev` or `tauri android
dev`; explicit `git add` paths; do not stage files whose only change is
line endings; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stay out of
`MainHeader`, the top bar's CSS, the bottom tab bar, everything under
Jam (M09), and `useJamSession.ts` / `jam.rs` / `kit.rs` (M10).

## Report

Before/after shots with absolute paths (copy the finals into a
git-excluded folder in your worktree), the line-grouping decision and
why, what each step kind looks like, how the two build flavours differ
and how the check proves it, every gate's real number, final commit,
worktree path.
