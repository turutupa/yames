# ms2: the selector's downloads, finished

Branch `coach-ms2` from `237d9d85`. Rust diff for the reviewer: `237d9d85..coach-ms2 -- src-tauri/`
(all of it in the first commit, `bdbd7d69`; nothing in Rust after it).

## What the owner can see

- **Both models on disk, side by side.** With one model on disk, the other row still offers Download;
  with both, both are picked from the menu and switching loads the other file (nothing downloads or
  deletes). Settings → Coach lists each model on disk with its own Remove (removing the chosen one
  turns the coach model Off; the other stays chosen and loaded). "Remove models" still removes
  everything, voices included.
- **Pause and Cancel** in the row while it downloads; **Resume and Cancel** once paused (a pause
  survives a restart: Rust reports the kept bytes, so the row comes back as "Paused at 1.2 of 5.0 GB").
  Cancel removes the partial file and says so ("Cancelled. What had downloaded was removed."). The
  window's bottom strip says the same two words for the same two actions (its old "Cancel" was a pause).
- **Bytes**: "Downloading… 1.2 of 2.5 GB" in the row, "1.2 of 2.5 GB" in the strip (decimal GB in both,
  and in Settings' list and the download dialog, so every screen says the same size).
- **Checking**: after the transfer, "Checking the download against its published checksum… 40%";
  the button reads "checking the download". A mismatch: "The downloaded file didn't match its published
  checksum, so it was removed. Nothing you already had was changed." with Try again.
- **Low storage**: under need + 300 MB (voices, engine, air) the row says "Not downloaded. Needs 5.3 GB,
  3.1 GB free" and offers no Download (also in Settings' download dialog); between that and 1.5× the
  size, Download asks first ("Only 3.1 GB is free and this needs 2.8 GB. It fits, with little to
  spare.") with Download anyway / Not now. A resume needs only what is left. Rust also refuses to start
  a transfer that does not fit (`code: "space"`).
- **Metered**: unchanged from ms1 and honest: asks first only where the webview says so.

## The store (models.rs)

`models/brain/<tier>/{model.bin, model.json, tier, model.<url-key>.part}`. Each entry point (status,
load, download, delete) first runs `adopt_legacy_brain`, which adopts an older install's single
`models/brain/model.bin` as its tier by one rename inside the tree. States, and the test for each
(`models::brain_store_tests`):

| State | Outcome | Test |
|---|---|---|
| Old single brain (tier file + marker) | renamed into `brain/<tier>/` (same inode), old small files removed | `an_older_install_is_adopted_in_place_as_its_tier` |
| Stopped after step 1 (tier dir has tier/marker, weights still old place) | redone, marker rewritten from the old place's | `a_run_stopped_before_the_rename_is_finished_by_the_next` |
| Stopped after the rename (old tier/marker left) | tidied | `a_run_stopped_after_the_rename_is_tidied_by_the_next` |
| Old small files, no weights anywhere | left alone | `the_old_small_files_stay_while_no_tier_holds_weights` |
| Brain in old place AND in its tier dir (only by hand) | nothing moved or deleted; the tier dir's is used | `a_conflict_moves_nothing_and_deletes_nothing` |
| Pre-T04 brain without marker (+ a stale marker in the tier dir) | adopted, still legacy (Update brain) | `a_pre_t04_brain_without_a_marker_stays_legacy` |
| Tier unreadable | marker's tier, else size (Studio floor) | `an_unreadable_tier_comes_from_the_marker_then_the_size`, `a_studio_sized_brain_without_records_is_studio` |
| Paused download in the old place | moves to its tier (never over a part there) | `a_paused_download_moves_with_its_tier` |
| Adoption could not run (rename failed) | status and load still find it in place, as its tier; a download of that tier refuses rather than fetch over it | `a_failed_adoption_still_finds_the_brain_where_it_is` |

A download writes marker + tier file, then renames the verified part over `model.bin` (atomic). A marker
whose `bytes` disagree with `model.bin` reads as no marker (legacy), so a crash between the two never
dresses old weights as new (`a_marker_that_does_not_describe_its_weights_is_ignored`).

## The checksum

`BRAIN_ARTIFACTS` pins URL, size and SHA-256 per tier. Both pinned, from Hugging Face's published LFS
object ids (`/api/models/Qwen/Qwen3-4B-GGUF/tree/main`, `/api/models/Qwen/Qwen3-8B-GGUF/tree/main`, read
2026-11-20 with web-look; `lfs.oid` is the file's SHA-256; sizes match the ones already in the code):
- Qwen3-4B-Q4_K_M.gguf `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`, 2,497,280,256 B
- Qwen3-8B-Q4_K_M.gguf `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`, 5,027,783,488 B
No GGUF of either was on this machine to cross-check. Hashing: `sha2` (already in the graph under wry),
8 MiB chunks on the download thread, cancel read between chunks. Size exact first: short kept (resume),
long removed; mismatch removes the part. `brainArtifacts.test.ts` holds `MODEL_URLS` equal to the table.

## Commands (no new ones, so lib.rs and the parity manifest are untouched)

`load_coach_model(tier?)`, `cancel_model_download(discard?, tier?, url?)` (discard: removed by the
download thread after curl is killed and waited for; at once when paused), `delete_models(tier?)`
(that tier only; unloads only when the resident brain may be that tier's: `RESIDENT_BRAIN`).

## Platform facts

- Free space: unix `statvfs` (f_bavail × f_frsize), tested here. Windows `GetDiskFreeSpaceExW` via the
  windows-sys feature `Win32_Storage_FileSystem` (signature checked against windows-sys 0.59's source;
  **not compiled here**: this machine has no Windows target). `null` elsewhere, which gates nothing.
- Metered: only `navigator.connection` (`saveData`, and `type === "cellular"` where the OS gives it).
  WebView2 has the API but desktop Chromium reports no `type`; WebKit (macOS, Linux) has none. No
  native metered query was added (Windows WinRT `ConnectionCost` would need the `windows` crate's
  Networking features; untestable here). The phone never downloads a model (rows say not on this device).

## Gates (logs in /tmp/coach-ms2/)

- `npm run test:rust` 1185 passed (40 in `models::`, 26 new). `cargo check --lib` no new warnings.
- tsc green; build green; build:mobile + check:mobile-bundle clean.
- vitest full: 11732 passed; 1 coverage failure (`coachDownload.cancelHint` unused) fixed in `e62eda03`
  and re-run green with `src/test` (`vt-cov.log`); TabStage load failure and one "Timeout calling
  onTaskUpdate" are the known ones. Locale and parity suites green.
- Layout: coach-model.spec 22 passed; full suite 1278 passed, 2 failed: `short-window` session-input-failed
  in aurora at 1024x700 (known, fix1's), and `songs-stage` "plays with the space bar" (timed out under
  load; passes alone, `pw-songs-rerun.log`).

Logs: `rust.log` (full lib), `rust-models.log`, `check.log`,
`tsc.log`, `vitest.log`, `vt-cov.log`, `build.log`, `build-mobile.log`, `mobile-bundle.log`,
`pw-coach-model.log`, `pw-layout.log`. Screenshots `/tmp/coach-ms2/shots/`.

## Open points

- The Windows free-space call and the Windows build were not compiled; worth one `npm run test:rust` on
  the RTX before release.
- The URLs are `resolve/main`: if Qwen re-uploads a file, the check fails (and says so) until the pin is
  updated. Pinning the URL to a commit would change the `.part` key; left as is.
- The wizard starts its download on Next without the low-storage check (Rust still refuses one that
  does not fit, and the error strip says why).
- Translations by helpers; worth a native read: zh-TW 核對碼 for "checksum", vi Hủy, de Abbrechen beside
  the existing "abgebrochen".
- No `coach-llm` build or GGUF smoke test was run (no Qwen GGUF here; the only GGUF is another leg's
  0.6B scratch file, and nothing in this leg touches inference).
