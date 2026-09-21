# Phone polish, after the first APK is out

Owner's call, 2026-09-20: **ship first, polish later.** Nothing here
blocks the first Android build on the website. Each item says who saw
it and where.

## 1. The metronome's tempo block sits hard left (owner, 2026-09-20)

On a phone the big BPM number, `−` / `+` and TAP hug the left edge and
the right half of the screen is empty: the layout is the desktop's
wide left column, narrowed. The owner's instinct: centre it, "or maybe
not so much to the left"; possibly a proper phone design for the
metronome screen rather than a narrowed desktop one.

When this is picked up: two or three variants as phone shots at 360 /
390 / 430 for the owner to choose from, not one implementation. Think
about thumbs: `−` / `+` and TAP are the controls used mid-practice, and
Play is already bottom-left. Same question applies to the drill's BPM
readout and Jam's tempo row (M09 only makes that one *fit*).
See `plans/tasks/mobile/m06/01-metronome.png` (iPhone) and the
`beat-360` shot from `npm run shots:mobile`.

## 2. Settings toggles are full-width slabs (orchestrator, 2026-09-20)

"On" as a 600 px wide filled button under every setting (M03c stacked
the rows so they fit). It fits and works; it reads heavy. A label-left,
switch-right row is what a phone user expects.

## 3. ~~"Reset hints" is offered on a phone~~ — done (M12, 2026-09-20)

None of the nine hints can appear in a mobile build: `useAppHints` is
not called at all (`MainWindow`), the card is not rendered, and Zen's
own `zen-first` is gated the same way. The row went.

## 4. One loaded jam is 122 MB of memory (M10, 2026-09-20)

After M10 a phone pays nothing for the band until Jam is opened (81 MB
total with Jam never opened, was 455), and gives it back when the app
is put down. With the band playing the app sits at about 255 MB. M10's
proposal, in `M10-FINDINGS.md`: store the decoded sounds as 16-bit and
convert in the voice (exactly half, and lossless, the files are 16-bit
already), then keep the five mono kits mono. The first is a change to
the mixer the desktop shares, so it needs the jitter and free gates
re-run and is not something to slip in before a first release. Pick it
up if the real-phone session shows Android killing the app in the
background, or before Songs comes to a phone.

The same launch warm costs the DESKTOP 342 MB for a 50-jam library,
spent whether or not Jam is opened. Nobody has complained; worth the
owner knowing.

## 5. A setlist stepping from one band straight to another (M10)

On a phone the next jam's sounds are decoded at the boundary, not a
step ahead (a phone's cache holds two sets, and warming a third would
evict the one playing). Expect a short gap where the click plays alone
on the big kits (Club ~0.6-0.8 s, Studio ~0.4 s on the emulator).
