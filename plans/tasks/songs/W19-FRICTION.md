# W19 — Getting a song in: the download is caught, the file opens with Yames, and the library is never empty

Branch `songs-w19-friction`, from `songs-v1`. Size M–L. Owner's decisions,
2026-09-20 (`plans/SONGS.md` S0.9). **No tab site is embedded, scraped or
called from inside Yames** — those sites host mostly unlicensed
transcriptions, and an app that fetches them is no longer a bystander. The
player searches in their own browser; Yames removes every step after the
click on "download".

W18 is rebuilding the Songs stage and its sidebar right now
(`SongsView.tsx`, `TabStage.tsx`, `SongBand.tsx`, `songs.css`, the songs
entries in `PresetSidebar`). Put your UI in NEW components and mount them
with the fewest lines you can; say exactly which lines in the report.

1. **The download is caught.** While Songs is the open mode, watch the
   user's Downloads folder (Tauri path API for the real location; a setting
   to choose another folder or turn it off; off means no watcher exists at
   all). When a file with a supported extension (`.gp`, `.gp3`, `.gp4`,
   `.gp5`, `.gpx`, `.musicxml`, `.mxl`, `.xml` only if it parses as
   MusicXML) finishes arriving — size stable for a moment, not a
   `.crdownload`/`.part` — offer it: a quiet, dismissible "Import *name*?"
   on the Songs screen, never a system dialog, never automatic. Only files
   that arrived while Songs was open or in the ten minutes before it was
   opened; a dismissed file is not offered again; the file in Downloads is
   never moved, renamed or deleted. Rust side small and off every audio
   thread (the `notify` crate if its licence is MIT/Apache and it is not
   already in the tree under another name; say what it costs the bundle),
   reading file bytes only after the player says yes. Tests with a temp
   directory standing in for Downloads: partial file ignored, stable file
   offered once, dismissed file stays dismissed, watcher gone when the mode
   is left.
2. **Open with Yames.** Register the file types in `tauri.conf.json`
   (`fileAssociations`) for Windows, macOS and Linux bundles, and handle
   the open — cold start with a path argument and the single-instance case
   where Yames is already running — by switching to Songs and going to the
   track picker for that file. Do not make Yames the DEFAULT app for any
   type; it is offered in "Open with". Check how the existing deep-link or
   single-instance plumbing works before adding any. Note in the report
   what each platform's installer does with the association and anything
   the winget/snap/flatpak manifests need.
3. **What you opened is kept, and the library is "recently played".** The
   imported file's bytes already live in the practice store
   (`scores.source_b64`, W10) and a song's id is a hash of its bytes and
   track, so re-importing the same file does not duplicate it and clearing
   Downloads loses nothing — confirm both with tests and say so plainly in
   the import UI ("Yames keeps its own copy"). Add, through a FOURTH
   migration, `scores.last_opened_at` and `scores.open_count`; the library
   sorts by last opened, newest first, with the search W4 built still
   working; opening a song restores the portion, loop state, tempo and mix
   it was left with (W18 persists the portion — read what it writes, do
   not write a second copy). An "Export the original file" action gives the
   player their file back (save dialog through a Rust command; the webview
   cannot write where it likes).
4. **"Find a tab for this song"** — one quiet link in the import empty
   state and the import dialog: opens the DEFAULT BROWSER with an ordinary
   web search for `<what the player typed> guitar pro tab`, through the
   existing `open_url` path. It names no tab site, embeds nothing, and
   sends nothing but the words the player typed. Wording reviewed against
   `plans/WEBSITE_DECISIONS.md`'s audience rule.
5. **The library is never empty.** A small starter shelf shipped with the
   app, marked as such and deletable: six to eight short pieces written as
   alphaTex in `src/songs/starter/` — ORIGINAL studies and licks written
   for Yames (a picking study, a legato run, a bending phrase, a blues
   lick in A, a bass groove in E, a fingerstyle pattern) plus at most two
   melodies that are unambiguously public domain worldwide (composer dead
   more than 100 years: e.g. the Ode to Joy theme, a Carcassi or Giuliani
   study) — and ONLY if you can write them note-for-note correctly; a wrong
   note in a famous tune is worse than not shipping it, so when unsure ship
   the original instead. Each with a title, a one-line "what this is for",
   a drum and a bass track so the band has something to play, sections
   named, sensible tempo. Imported through the same importer as any file on
   first open of Songs, idempotently; deleting one is remembered. Vitest:
   each parses, bars add up, the player's track has no impossible fret or
   string for its tuning. List them in the report for the owner's ear.

## Gates

build, vitest, `npm run test:rust`, layout tests for the import offer and
the starter shelf at the minimum window size. No new runtime dependency on
the frontend. 15 locales (append new keys at the END of their namespace;
W16 is translating values in those files).

## Not yours

The stage, the tab, the review, scoring, the engine. Any network request
to a tab site, by any route.
