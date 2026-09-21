# M12 — The last things between this branch and a phone in somebody's hand

Size: S–M. Branch: `mob/m12-pre-ship`, from the tip of `mobile` (it must
contain `merge(mob/m10-band-memory)`). Written 2026-09-20. The owner's
rule for this release: **ship first, polish later** — cosmetic work goes
in `plans/tasks/mobile/POLISH-LATER.md`, not here. This task is only
what stops someone using the app, or makes it look broken at first
sight. One commit per item.

## 1. The top bar cannot say what you are working on

At 360 px, measured on the merged branch:

- **Setlist tab:** the routine's name is cut to its first letter —
  "D  [SETLIST]  No changes" (`setlist-editor-360`). The badge repeats
  what the lit tab already says, and "No changes" is the state nobody
  needs to read; "Unsaved changes" is the one that matters. On a phone:
  drop the badge, keep the unsaved state as a mark rather than a
  sentence (keep its accessible text), give the name the room.
- **Metronome / Drill tabs:** "Unsaved metronome" still truncates
  ("Unsaved metr…"). The lit tab says which mode it is; on a phone the
  bar can say just "Unsaved". That is a new short string in 15 locales,
  appended at the END of its namespace — a word a musician would say,
  not "Untitled".
- Whatever a name is, a long one ends in an ellipsis inside its own
  box; it never pushes the volume controls or `⋯` off the bar, at 360,
  390 or 430, in `de`, `ru` and `ja`.

`MainHeader` is shared with the desktop: every change is inside the
phone's scope (`IS_MOBILE` / `.main-window.is-mobile`), and
`npm run test:layout` stays green untouched. Extend the three header
tests M09 added rather than writing a new spec.

## 2. A sweep, with your own eyes

`npm run shots:mobile -- --widths 360,390,430` for every scene, then
`--locale de`, `--locale ru`, `--locale ja`, `--locale vi` and
`--locale pt-BR` at 360 (M03d flagged the last two for the tab bar; the
bar has since gained a tab and changed its sizing). **Read every PNG.**
A passing overflow assertion is not the gate; your eyes are. Fix what
is *broken* — text under another control, a control off screen or under
the tab bar, clipped or overlapping words, a sheet that cannot be
closed, a control under 44 px that someone must hit mid-practice.
Write what is merely *ugly* into `POLISH-LATER.md` (append; items 1–5
are there) with the shot's name, and leave it.

Known to check while you are there:
- First launch: the three-step setup, then the metronome, in the
  website's flavour (`YAMES_SIDELOAD=1`) and the store's. The update
  row must not appear on a fresh install with no network answer.
- "Reset hints" in Settings → General (POLISH-LATER item 3): if no hint
  can appear on a phone, the row goes (`IS_MOBILE`, folded out), and
  that is in scope because a button that does nothing looks broken.
- The Jam tab with NO jam loaded (a fresh install): is there a way in
  that a first-time player can see, or a blank stage? If blank, the
  smallest honest fix: the stage says what Jam is in one line and
  offers "Set up".

## 3. The website's row and the release notes, as drafts

Do not publish anything; write two drafts under `plans/tasks/mobile/`:

- `WEBSITE-ANDROID-DRAFT.md`: the download section's Android row and a
  short "how to install" (three steps a musician can follow on their
  phone: download, allow the browser to install, open), plus one
  sentence on what is not in the phone version yet (the coach, playing
  into the microphone, a footswitch, Songs). Musicians, not developers:
  never APK-sideload-SDK talk beyond the one word "APK" where the file
  is named. Follow `docs/index.html`'s existing download rows for tone.
- `RELEASE-NOTES-ANDROID-DRAFT.md`: what a player gets, in the voice of
  the existing release notes (`git log --grep "^release" -3 --format=%B`
  on `main`).

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`;
the suite's port is fixed and `reuseExistingServer` is on — make sure
nothing else is serving it before you trust a result, and re-run a
failure alone; `jam.spec.ts` › "does not move when a player is switched
on or off" is known to be racy under CPU load and is somebody else's
task), `YAMES_MOBILE=1 npm run build && node
scripts/check-mobile-bundle.mjs`, the same with `YAMES_SIDELOAD=1` and
`--sideload`. No Rust is expected. No adb, no emulator, no device.

## Rules

`git checkout -B mob/m12-pre-ship mobile` first; `rustup override set
stable-x86_64-pc-windows-msvc`; `node_modules` by robocopy **from
PowerShell** from `C:\Users\alber\Dev\yames-mobile`, else `npm install`;
never push, never merge, never start the desktop app, `tauri dev` or
`tauri android dev`; explicit `git add` paths; do not stage files whose
only change is line endings; CRLF files stay CRLF; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Report

What was broken and is fixed (before/after shot paths, copied into a
git-excluded folder in your worktree), what went to POLISH-LATER, the
two drafts' paths, every gate's real number, final commit, worktree path.
