# Issue 52 — a drummer's feedback (shared by every worker)

Read this, then your own file. The rules from `plans/tasks/jam-v5/BRIEF.md`
and its ancestors hold: hyphenated worktree branch names, the gates, the
store hazard, no push, no merge, never start the app, no file rewrites,
commits in the repository's voice.

## Why
GitHub issue 52 (djrenault, 2026-09-14): a church drummer who runs
v-drums into a laptop and a metronome on the same machine, on a
four-output interface. Four asks, all sound: route the click to outputs
3-4; a proper 6/8 accent (and, with issue 2, custom accents); duplicate a
setlist from its right-click menu; drag steps to reorder and
shift-select several. The owner's decision: build all four, all the
way — no half features. The accent work (W3) is written up but waits:
W38 on `jam-v5` is rewriting the click sound banks and the gains it
would touch.

## The branch
**`feedback-52`**, from `jam-v5` at `5d5eec0`. Your worktree is already
created and named in your file; verify with `git log --oneline -1` and
`git branch --show-current` before doing anything. `git merge feedback-52`
first so you have these briefs. The orchestrator merges into
`feedback-52`; a PR from `feedback-52` into `jam-v5` closes the issue.

## The owner's app is running
A live Yames (`yames.exe`, port 1420) is open on this machine from the
main checkout. Never start `tauri dev`, never touch
`%APPDATA%\com.yames.metronome\settings.json`. Verify with tests only.

## Who owns what
| Worker | Area | Does not touch |
|---|---|---|
| W1 setlist editor | `src/setlist/**`, `src/components/setlist/**`, `src/components/presets/PresetSidebar.tsx` (the setlist menu only), `src/containers/main-window/hooks/useSetlistSession.ts`, `Rail.tsx`/`MainWindow.tsx` prop threading, `src/styles/setlist.css`, `src/locales/*/setlist.json` | `src-tauri/`, settings, the jam rows in `PresetSidebar.tsx` |
| W2 output pair | `src-tauri/src/engine.rs` (device list, stream config, the mix write, take read-back), `tts.rs`, `commands.rs`, `lib.rs`, `src/ipc.ts`, `src/types.ts`, `src/test/mocks.ts`, `src/components/ChannelDropdown.tsx` or a sibling, `DevicesSettingsSection.tsx`, `useAudioOutputDevices.ts`, `SettingsView.tsx`/`MainWindow.tsx` threading, `src/locales/*/settings.json` | `SoundKit`/`SoundBank`/`BEAT_GAIN`/`SUB_GAIN`/`accent_for` (W38 and W3 own those), setlist code |
| W3 accents (parked) | see `W3-ACCENT-TIERS.md` | — |

## Language
Everything a user reads is for musicians: outputs, steps, accents. No
"channel index", "stream", "device config" in the UI or locale files.
Locale keys go into all fifteen files; `src/test/i18n.locales.test.ts`
fails on a missing one.

## Gates (every worker, on their own tree)
`npx tsc --noEmit`; `npx vitest run` (whole suite, then `git checkout --
src/containers/onboarding/__snapshots__/emptyStates.test.tsx.snap`);
W2 also `npm run test:rust` (MSVC runner, never bare `cargo test`),
`npm run test:dsp`, `npm run test:highbpm`, and the jitter probe
`bun run yames:jitter-probe -- --no-llm` on a quiet machine. Commits
small, subjects in the repository's voice, each ending with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Report
Branch and final commit; every file touched; gate counts (tests before
and after); what a user can now do, in one paragraph; what you could not
verify and why.
