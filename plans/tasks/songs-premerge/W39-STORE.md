# W39 — store and file-boundary fixes before Songs reaches main

Read `CLAUDE.md`, `AGENTS.md`, then `BRIEF.md` in this folder. Branch
`songs-w39-store-fixes` from `songs-v1`. Context: `practice.db` (SQLite,
`db.rs`) is new on this branch; v1.2.1 kept history in `settings.json`
under `evalSessionHistory`. The review walked the first launch on a v1.2.1
user's data and found the migration itself sound (transactional schema
steps, idempotent import, legacy JSON only read). Keep all of that.

## 1. SHOULD-FIX — a finished session is thrown away silently

`db.rs` ~1489-1493 and ~1510-1526 → `commands.rs` ~1978 (`save_session`)
→ `src/hooks/useSession.ts` ~1606, where `.catch(() => {})` drops the
error. If `practice.db` cannot be opened (corrupt, locked > 5 s, written by
a newer build, disk full), or a save arrives while the open is still in
progress past its 5 s wait, every session is lost with no word to the user;
v1.2.1's JSON write never failed like that.

Fix: when the store is not usable, the session still goes to
`evalSessionHistory` in `settings.json` exactly as v1.2.1 wrote it (same
shape, same cap), and the user is told once per launch, in plain words for
a musician, that history is being kept the old way — the wording lives in
the locale files like every other string (English is enough; add the key
to the other locales with the English text if that is what the locale
tests require, and say so in the report). When the store later works, the
next launch's import (item 3) brings those sessions in. Tests: a store that
fails to open → the session lands in the JSON and the notice fires once.

## 2. SHOULD-FIX — opening two song files at once can crash Yames at launch

`lib.rs` ~253 (single-instance plugin registered on the Builder) and ~467
(`app.manage(PendingOpenState)` inside `setup()`), used at ~478 and
`commands.rs` ~4793. The second copy's hand-off can arrive before `setup()`
has managed the state, and `app.state::<PendingOpenState>()` panics inside
a window callback. Fix: `.manage(PendingOpenState::default())` on the
Builder before `.plugin(...)` (preferred), and drop the one in `setup()`.
While there: the handler ignores `_cwd`, so a relative path from a terminal
is resolved against the running app's folder and dropped — join each
argument onto `cwd` before queuing it. Test the path-joining; the ordering
fix is proven by reading it — say so.

## 3. SHOULD-FIX — the import is marked done even when it read nothing

`commands.rs` ~1948-1955 and `db.rs` ~906-929. If `settings.json` cannot be
read or parsed, `legacy` quietly becomes `[]`, `import_json_history(&[])`
still sets `META_JSON_IMPORTED`, and the import never runs again. Also: a
user who goes back to v1.2.1 for a week and returns never gets that week.

Fix: set the flag only when the key was actually read; and on every launch
import JSON sessions newer than the newest one already imported (skip ids
already present — the import is already idempotent per id), so item 1's
fallback and a round-trip through v1.2.1 both come back. The JSON holds at
most 30, so this is cheap. Tests for: unreadable settings → flag not set;
a session added to the JSON after the first import → imported on the next
launch, once.

## 4. NOTE — the Downloads watcher can be steered by the webview

`commands.rs` `start_download_watch`, `downloads.rs` ~417-420.
`check_offer` canonicalises the folder but not the file, so a symlinked
file is followed; and the command accepts any folder. Fix: canonicalise
the file itself and require it to sit inside the canonical folder; accept
only the user's Downloads folder or a folder the player chose in a dialog
(if the chosen-folder case has no record today, accept Downloads only and
report it). Tests.

## 5. NOTE — file writes on the window's thread

`take_video_append`, `take_video_finish`, `take_thumb_write`,
`clip_save_append`, `clip_save_finish` are plain (sync) commands: their
file I/O runs on the main thread. Make them `async` (or `spawn_blocking`).
The comment at `commands.rs` ~2262 claims the `(async)` store commands run
on a blocking pool — they run on tokio workers; correct the comment, and if
the 5 s store-open wait can hold a worker, move that wait to
`spawn_blocking`.

## 6. NOTE — the camera is allowed for any page in the main window

`camera_permission.rs` ~89. The handler grants the camera, persisted in
the WebView2 profile, without checking which page asked. Grant only when
`args.Uri()` is the app's own origin (dev `http://localhost:1420` and the
production `tauri://` / `http://tauri.localhost` origins — check which the
build uses). Test the origin check as a pure function if the handler
itself cannot be unit-tested.

Stop and report if item 1's fallback turns out to need a change in how the
history screen reads sessions, or if any item needs files outside your
column.
