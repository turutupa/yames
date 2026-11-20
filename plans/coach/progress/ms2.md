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

## Review fixes (leg ms2b)

The reviewer's MERGE AFTER FIXES, fixed after `45abc598`; `coach` merged in first (`acad0f7d`, one
comment conflict in `coach-model.spec.ts`). Rust re-read: `git diff 45abc598..coach-ms2 -- src-tauri/`
(all in `35aa5fd0`). Tests in `models::brain_store_tests`, each in its own temp dir.

1. **Misfiled old brain.** `legacy_tier` asks the weights first (`weights_tier`): a marker whose `bytes`
   match them, else a pinned file's exact size, else ≥ Studio floor → `full`; only then the `tier` file,
   then a marker without `bytes`, then Standard. `refuse_foreign_weights` refuses (before the transfer
   and again before the rename) to put a download over a `model.bin` that its marker or size says is
   the other tier's; the file and the verified part stay. **Pre-T04 (no marker)**: the old files
   (Qwen2.5-1.5B, Phi-3.5-mini) are under the Studio floor and not pinned, so size cannot tell them
   apart and the `tier` file decides; a stale one can still misfile such a file, which is harmless: it
   is legacy wherever it sits (Update, never loaded), and nothing of the other tier is renamed over it.
   Tests: `a_marker_that_describes_the_weights_outranks_a_stale_tier_file`,
   `stale_records_lose_to_the_size_of_the_weights`, `a_pre_t04_brain_follows_its_tier_file`,
   `a_download_is_never_renamed_over_another_tiers_file`.
2. **Same-tier conflict.** The folder's copy is used; `TierStatus.olderCopyBytes` reports the other
   (and is counted in `brainSizeBytes`); Settings → Coach shows "An older copy of this model is also
   on disk · 5.0 GB" with its own Remove (`delete_models(tier, olderCopy: true)`, removes only it, never
   the only copy). The tier's Remove removes the copy in use (one file per press); the older copy is
   then the tier's only copy and is adopted on the next call. Download of the tier no longer refuses.
   Tests: `an_older_copy_is_reported_and_removed_only_by_its_own_press`,
   `the_only_copy_is_never_an_older_copy`; vitest `CoachSettingsSection.tiers.test.tsx`; layout
   `coach-model.spec.ts` "an older copy of a model in Settings" (520/1024/1400). Strings in 15 locales.
3. **One transfer at a time.** Chosen: **wait**, not refuse. A new download's thread first waits for
   every earlier download thread to exit (they were all told to stop; a stop is seen within about a
   second), up to 90 s, then gives up with "the previous download is still stopping" rather than
   overlap. Pause→Resume and Cancel→Download are two quick presses that should just work. A Cancel of
   a paused download waits (30 s) for that tier's exiting curl before removing the part
   (`cancel_model_download` is now async). Every download event carries `generation`; a superseded
   thread's events are not sent at all, and `useCoachDownload` drops any event older than the download
   it started (floor raised before the invoke, set to the answer after). Tests:
   `a_new_download_waits_for_the_old_one_and_the_old_ones_events_stop`; vitest "a stopped download's
   late events do not touch the download that replaced it".
4. **Residency.** Loads, unloads and both per-tier removals hold `models::residency_lock`; a load is
   recorded only on `Ok(true)` (`load_and_record`), so coach's "another load is in progress" `Ok(true)`
   can never be recorded (coach.rs untouched). An adoption moves an old-place record to the tier's
   folder; an old-place record whose file is gone reads as unknown (unload first). Test:
   `residency_is_recorded_only_for_a_load_that_happened`.
5. **Marker order.** The new marker is written beside the part (`<part>.verified.json`), the part is
   renamed over `model.bin`, then the record over `model.json`. A failed rename leaves the old marker
   with the old weights, and keeps part + record; the retry skips the hash when the part's length and
   modification time (ns) are those the record was checked at (a changed part is hashed again). A stop
   between the renames is finished by the next `adopt_legacy_brain`; an orphan record is dropped.
   Tests: `a_failed_rename_leaves_the_old_marker_with_the_old_weights`,
   `a_stop_between_the_two_renames_is_finished_by_the_next_call`.
6. **Leftovers.** A paused download stranded in the old place is in `olderCopyBytes` and removed by
   the tier's Remove (and by Cancel's discard, as before). Test roots are guards removed on drop
   (sparse file included). Tests: `a_stranded_part_is_counted_and_cleared_by_the_tiers_remove`,
   `a_test_root_is_removed_when_it_is_dropped`.
7. **URLs.** `start_model_download` takes only `component == "brain"` and the tier's pinned URL
   (`pinned_download`); everything else is refused. Searched: only `useCoachDownload`'s `MODEL_URLS`
   calls it; voices and the speech engine take their URLs from Rust's own tables; no dev override or
   test passes another URL, so no debug hook was added. curl gets `--` before the URL. Test:
   `only_the_pinned_files_are_downloaded`. It now answers with the download's number.

Gates (logs in `/tmp/coach-ms2b/`): `npm run test:rust` 1198 passed (`rust.log`; models 53,
`rust-models.log`); `cargo check --lib` no warning in models.rs / commands.rs (`check.log`); tsc
green; vitest 11877 passed, only the known TabStage load failure (`vitest.log`); build, build:mobile,
check:mobile-bundle green; layout coach-model + settings + ask + firstrun 88 passed (`pw-named.log`);
full layout suite 1326 passed, 0 failed, 268 skipped (`pw-layout.log`).
Owed: the Windows build (`npm run test:rust` on the RTX: `GetDiskFreeSpaceExW`, the rename-over-a-
mapped-file path that item 5 is for, curl.exe with `--`); no `coach-llm` build was run here.

### Re-read fixes (`877fcd58`)

- **A stopped download renames nothing.** The vouched-for path read no cancel flag, and with a
  full-size part curl is skipped too: a Cancel pressed while a new download waited for the previous
  one could still rename the part over `model.bin`. The flag is now read at the top of `fetch_brain`
  (right after the wait), at the top of `finish_brain_part`, after the check and just before the
  rename; a stop returns `Cancelled` and a Cancel's discard runs (`after_brain_stop`). Tests:
  `a_stop_during_the_wait_renames_nothing`; `a_failed_rename_leaves_the_old_marker_with_the_old_weights`
  now expects a stopped retry to rename nothing (and proves the hash skip with swapped bytes under
  the same length and modification time).
- **A status poll between the two renames.** Both renames take the ADOPTION lock (nothing else held;
  the order residency → coach engine → ADOPTION → RESIDENT_BRAIN is kept). Test:
  `a_status_poll_cannot_come_between_the_two_renames`.
- **Cancel and Resume crossing.** Chosen: tie the discard to the download number at the press rather
  than refuse the Resume, because the Resume is the player's later press and should win. The discard
  is dropped if any download started since (`discard_if_current`, under the lock downloads are
  numbered under, so no start slips between the check and the unlink). Test:
  `a_discard_never_removes_a_newer_transfers_part`.

Gates: `npm run test:rust` 1201 passed (`rust2.log`), tsc, the touched vitest files, layout
`coach-model.spec.ts` + `settings.spec.ts` (`tsc2.log`, `vt-focus2.log`, `pw-named2.log`).

### Known limits, not fixed here

Neither can occur on an install that never ran an unmerged build of this branch:
- The "older copy" label is a guess in one case: the tier's folder holds a legacy-family file and an
  older build later wrote a current file to the old place. The folder's (legacy) copy is used and the
  current one is called "older". Nothing is lost (each has a Remove), but the words are wrong.
- A tier folder holding the other tier's file, written by a pre-fix build of this branch (before
  `35aa5fd0`), has no re-file path: downloads into it are refused (`refuse_foreign_weights`), and only
  that tier's Remove clears it.

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
