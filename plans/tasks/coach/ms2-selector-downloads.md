# Leg ms2: the selector's downloads, finished

Worktree `/home/dgx-delgado/yames-coach-ms2`, branch `coach-ms2`. Logs under `/tmp/coach-ms2/`.
Read `plans/tasks/coach/BRIEF.md` first (the model selector decision), then `plans/coach/progress/ms1.md`
(what exists: the selector at the foot of the coach panel, the loader, the download rows) and
`/home/dgx-delgado/yames-coach-design-out/OWNER-UPDATES.md` entries 2 and 3 (the owner's words for this
leg). Rust in this leg: `src-tauri/src/models.rs`, `commands.rs` (the download commands), nothing near
the audio path. An independent reviewer reads the Rust diff before it merges.

## What ms1 left (its own table)

| Owner asked for | After ms1 |
|---|---|
| Size and a Download button in the row | Yes |
| Progress | A fraction, then a "voices" step |
| Pause / resume | Yes (Rust's cancel keeps the partial file; the next start resumes) |
| Cancel | Not offered: there is no cancel that discards |
| Checksum check | No: Rust checks a minimum size only |
| Warning on low storage | No |
| Warning on mobile data | Only where the webview reports it |
| "When it finishes it can be selected" for either tier | **One brain on disk**: both tiers write `models/brain/model.bin`, so the second tier's row offers no Download |

## What to build

1. **Both tiers on disk, side by side.** Each tier has its own file (for example
   `models/brain/<tier>/model.bin` with its own marker). An existing install's single brain is adopted
   in place as its tier **without re-downloading and without a copy that needs the space twice** (a
   rename inside the same directory tree, done once, crash-safe: a half-done move is recovered on the
   next start; a test for each state). `check_model_status` reports each tier (on disk, size, family,
   update recommended); the loader loads the selected tier's file; the "Update brain" flow keeps
   working per tier. Deleting stays in Settings → Coach, per tier, the player's own press; nothing
   else ever deletes a brain, and downloading one tier never touches the other.
2. **Cancel that discards**, beside Pause: stops the transfer and removes the partial file. The window's
   existing bottom download strip calls its pause "Cancel": make the strip and the selector say the same
   true words for the same actions.
3. **The checksum.** A SHA-256 per model file, pinned beside the URL in `models.rs`, verified after the
   transfer and before the file is adopted (hashing off the UI thread, in chunks; a row state
   "Checking…"); a mismatch deletes nothing the player had, keeps or discards the partial as is safest,
   and says so with Retry. **Do not invent a hash**: take it from the model's published source (the
   repo's download URLs say where they come from; `~/.local/bin/web-look read <url>` if a lookup is
   needed, with no personal data in the request), or compute it from a file already on this machine
   that you can show is the pinned artifact (`C:\yt06models` does not exist here; look under the app's
   models directory and `~/models`). If neither is possible, build the mechanism with the hash optional
   per model, leave it unset, and report exactly which hashes are missing.
4. **Low storage.** Free space on the models' volume in `check_model_status` (unix through `libc`
   `statvfs`; Windows through the API the crate already links, or one `windows-sys` feature: say which).
   Before a download starts: if free space is under the model's size plus a margin, the row says so and
   Download is not offered ("Needs 5.0 GB, 3.1 GB free"); between 1× and 1.5×, a warning the player can
   press through.
5. **Metered connection.** Where the platform can say so (the webview's `navigator.connection`,
   Android's own API on the phone build), a warning before the download starts that the player can
   press through. Where it cannot, no warning and no pretending.
6. **Progress with bytes** ("1.2 of 2.5 GB") in the progress event and the row; a row that is
   downloading says so instead of "Not downloaded".
7. The selector's rows, Settings → Coach and the wizard read one state; no flow downloads without a
   press; a download finishing never changes the selected model.

## Gates

tsc, vitest, build; `npm run test:rust` (new Rust tests: the migration in each state, the hash check
pass and fail, the free-space figure, partial-file handling on pause, cancel and resume; no network in
tests: a local file or an in-process server); the parity suites (`surface`, `savedFormats`,
`parity_store` if the store's layout is part of it); layout: `settings.spec.ts`, `coach-model.spec.ts`
with new scenes (both tiers on disk; checking; low storage; cancelled); `firstrun.spec.ts` if the
wizard's download changed; `npm run check:mobile-bundle`; strings in fifteen locales with
`plans/COACH_I18N_BRIEF.md`. If the build with `--features coach-llm` is practical on this machine, the
smoke test of AGENTS.md with a GGUF if one is here; say if it is not.

## Report

As BRIEF "The end of a leg", with the Rust diff range for the reviewer, which hashes are pinned and where
each came from, and the migration's states.
