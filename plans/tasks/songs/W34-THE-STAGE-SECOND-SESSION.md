# W34 — The Songs stage, after the owner's second session

Branch `songs-w34-stage-second-session`, from `songs-v1` as it stands.
Size L. The owner ran `songs-v1` on his Windows PC and his Mac on
2026-09-21 and reported the following, in his words. Each is a bug or a
decision reversed; treat his sentence as the acceptance test. In
priority order, one commit per item, stop cleanly at a boundary —
**except that item 6 (the width) is done FIRST**: the owner has asked
for the tab to use all the room more than once and said on 2026-09-21
that he does not like repeating himself. Its acceptance test is his
window: 2000×1124.

**The app is RUNNING on this machine from
`C:\Users\alber\Dev\yames-songs` (`tauri dev`), in front of the owner.**
Never touch that checkout, never start another copy of the app, never
kill a process you did not start. You work in your own worktree.

Read first: `TabStage.tsx` top to bottom, `SongsView.tsx`,
`useSongsSession.ts`, `src/songs/selection.ts`, `songs.css`, W29's and
W28's briefs and merge commits.

## 1. The line moves in blocks through fast passages

He corrected himself a few minutes later: "it does follow each note
actually, but there's a sweep picking section that it's not following
note per note in a smooth movement, it's doing blocks at a time." So
the line keeps up with eighths and lags behind fast notes: its position
is updated at some coarse cadence (the engine's beat / subdivision
events, or a timer) and a run of sixteenth-triplets or a sweep goes by
between two updates, so the line jumps a block of notes at once.

The playhead must travel the way it does in every tab player:
continuously, at any note density. Find out what cadence it is fed at
(how often the engine's position reaches the webview, what
`api.tickPosition` is set from). The honest design: the engine reports position with a
timestamp at its own cadence, and the webview INTERPOLATES between
reports on `requestAnimationFrame` using the known tempo map (tempo
percent included), snapping on seek, loop seam, stop and tempo change —
so the line glides at 60 fps and is exactly on the note when the note
sounds (account for output latency if the engine knows it). It must not
drift over a five-minute song and must not run ahead at 50 % speed.
The note being played lights as the line crosses it. Unit tests for the
interpolator (steady tempo, a tempo step, 50 %, a loop seam, a seek);
a layout test that samples the cursor's x at several instants during
play and finds it strictly increasing within a bar at sub-beat steps.

## 2. "When it's playing and i stop it, the whole alpha tab flickers as in re-rendering, this is very annoying"

Nothing about the transport may re-render the score. Find what
re-runs `renderScore` / re-creates the api / swaps the DOM on stop
(an effect keyed on something the stop changes; the review mounting and
changing the frame's size so alphaTab re-lays out; the colouring pass
redrawing everything). The tab is rendered when the file, the part,
the notation mode, the zoom, the theme or the WIDTH changes — nothing
else. Colouring notes after a pass is a style change on existing
elements. Prove it with a test that counts renders across
play → stop → play → seek → loop and finds one.

## 3. "Space not working for play pause is by far the most annoying thing ever"

**Fixed by the orchestrator on `songs-v1` (abfc1766) while this brief was
being written**: the dispatcher's `play` action had a branch for every
view except `songs`. What is left for you: check every OTHER transport
and navigation key on the Songs screen the same way, with the tab
focused and not — W18's portion keys, `R`, `C`, ← / →, Home, Esc, and
Space while a text field in the strip (the bar numbers) has focus (it
must type a space there and play nowhere) — and that Space never
scrolls the tab. Anything dead or double-firing gets a test like
`useActionDispatcher.songs.test.tsx`.

## 4. "If i single click a different part of the song it should go to that part but the selected area doesn't get unselected, it's like it doesn't exit loop mode"

W29 kept the portion on a click elsewhere, on the evidence of other
players; **the owner has now decided the other way, and his word
wins**: a plain click OUTSIDE the portion goes there AND clears the
portion and the loop. A click INSIDE the portion moves the playhead and
keeps it. Drag still makes a portion; Shift-click still extends; Esc
still clears. Saved portions ("Save this part") are untouched by any of
this. Update W29's comment block in `TabStage.tsx` and the tests that
assert the old behaviour, saying whose decision it was.

## 5. "I imported a tab and it feels like it's not rendering the entire song, just a section of it"

Reproduce with a long file (build a 120-bar alphaTex fixture with
several sections and a repeat; if you can find a permissively licensed
multi-page Guitar Pro file, use it too). Suspects: alphaTab's lazy
partial rendering against a scroll container it does not own
(`scrollMode = Off`, our own viewport — it may only render the chunks it
believes are visible), a height cap on `.songs-tab-host`, the importer
truncating bars (`MAX_NOTES` is a BACKING limit and must never limit
what is drawn), repeats/alternate endings being unrolled or not. Every
bar in the file is drawn and reachable by scrolling; the playhead,
follow-scroll, portions and the verdict all work on bar 100 as on bar 1.
Say what it was.

## 6. "The alpha tab area … is not using all the space it could — why doesn't it go wider? this is not a page where we want a max width, we want to use all we can"

**The cap itself is already gone** — the orchestrator removed
`max-width: 1176px` on `songs-v1` (68351a26) so the owner would not wait;
at 2000×1124 the frame went from 1320 to 1651 px wide with no sideways
scroll. What is left is yours: there are still TWO gutters' worth of
air on each side (the frame starts 48 px right of the rail and stops
49 px short of the edge; one 24 px gutter is the app's), so finish it: the stage runs from the rail to the window's
edge with the app's normal gutter, at every width, and alphaTab
re-lays out to the new width (more bars per row), debounced, without
the flicker of item 2. In his screenshot the frame also shows a
horizontal scrollbar under an 8-bar piece — the host is a few pixels
wider than its frame; there must never be a sideways scrollbar. The
first row's tempo mark ("♩ = 84") is drawn on top of the section name
and the cursor; give them room. The layout suite's share-of-window
assertions get a width one: the tab's frame is within one gutter of the
content region's width at 1100, 1440 and 2000.

## 7. "Is the drums playing by default? i've played tabs with no drums and it still plays them"

Find out what he hears. Two candidates: (a) the CLICK, whose sound on
his machine is set to "Drum" (the header chip says so) and which Songs
plays at 0.45 by default — to a player that IS a drum playing along;
(b) a band part sounding for a track that is not percussion (W28's
role mapping: check a file with no percussion track renders no kit
voice, with the offline renderer). Then the default: **in Songs the
click is OFF by default when the song has any sounding part** (the
song keeps the time, as in every tab player); it stays on for the
count-in, has its own obvious switch on the strip (not only inside
More), and is remembered per song. A song with no sounding part at all
keeps the click on. Existing songs whose click was never touched take
the new default; ones the player set keep theirs.

## Gates

`npm run build`, `npm run test`, `npm run test:layout` (`--workers=2`),
and if you touch Rust: `npm run test:rust` (via
`node scripts/rust-test.mjs`, `CARGO_TARGET_DIR=C:\yt-w34`,
`--no-default-features`), `test:dsp`, `test:highbpm`, `test:pitch`, and
the jitter probe PASS with zero allocations. Captures (git-excluded,
read by you): the stage at 1440×900 and 2000×1124 stopped and playing,
the long fixture scrolled to bar 100, and a short screen recording or
frame sequence showing the cursor between two notes of one beat.

## Rules

`git checkout -B songs-w34-stage-second-session songs-v1` first; MSVC
override; `node_modules` by robocopy **from PowerShell** from
`C:\Users\alber\Dev\yames-songs` (verify `@coderline/alphatab`); never
push, never merge, never start the app; explicit `git add` paths; no
line-ending-only changes staged; strings in all 15 locales at the END
of their namespace; nothing the app says names a tab site; commits end
with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. **W35 is
working in parallel** on the library and the sidebar: it owns
`src/songs/library*.ts`, the sidebar's songs list and the
"which part" bookkeeping in `useSongsSession`. You own `TabStage`,
`SongsView`, `selection.ts`, the cursor, hotkeys, `songs.css`'s stage
rules and the click default. In `useSongsSession` keep your edits local
to selection / seek / transport.
