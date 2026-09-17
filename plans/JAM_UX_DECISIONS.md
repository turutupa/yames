# Jam, second pass — the UX and the sound

> **Status:** Decided by default on 2026-09-12 (the owner: "the board looks very cool"); implemented on branch `jam-v2` (pull request #51, on top of `jam`), briefs in `plans/tasks/jam-v2/`. Built 2026-09-13: every decision below is on the branch, two read-only reviews ran and all 22 findings are fixed, all gates green (3733 front-end tests, 460 engine tests, probe with a custom kit at p99 0.28 ms and zero dropouts). Waiting on the owner's ears for the Raw kit and the voices (`scripts/sounds/ab.html`) and on the merge of #50 and #51. Working document. Started 2026-09-12 (night), after the owner's
> first session with the finished Jam on two machines.
> **Purpose:** the first build delivered every feature in `JAM_MODE.md` and
> the owner's verdict was: "a lot of polishing", "an overwhelming number of
> settings, all over the place", and "the sounds are the soundtrack of a
> porno". This document is the evaluation and the decisions that fix it.
> UX defines the path, code follows: nothing in the second pass is coded
> before its board is on the canvas and its entry here is decided.
> **Design:** the canvas at
> https://claude.ai/code/artifact/b40980af-b92a-470d-91b1-0c2a93e44ade
> (three boards: the playing screen, the setup sheet, the kit list).
> Working files in `design/jam-v2/`.
> **How to work it:** top to bottom. Each open entry carries a proposed
> default so the common case is one exchange.

Status key: **decided** · **open** · **deferred**

---

## 0. What the first session showed

Three sessions' worth of findings, from the owner's own words and from the
screens as built.

- **The screen is one page of twenty-three blocks.** Everything set once per
  jam (groove, form, key, meter, ticks, kit, count-in, fills, transposition,
  cues, takes) is drawn at the same weight and in the same scroll as the
  things that change while you play (the chord, the timeline, the band, the
  tools). The owner's first word was "overwhelming". The boards had two
  screens; the build made one.
- **Nothing says "rock" in one word.** To get a rock drummer you have to know
  to set five controls (groove, feel, intensity, kit, form). The first
  starter jam is a shuffle at 92, so the first impression is bluesy whatever
  you meant.
- **The band sounds smooth, not raw.** The kits are sine-and-noise
  synthesis with no transient shaping; the bass is a soft sine pluck; the
  keys are an electric-piano pad. Together they are a lounge. The owner
  wanted a raw drum backing track and could not get one with any setting.
- **The band is on by default.** A guitarist's lineup starts with a bass
  player, so the smooth bass is under everything from the first press of
  play. Drums alone was one toggle away and nobody would know.
- **The order of the page is inside out.** The tempo readout, set once, is
  at the top; the timeline, which is the headline for improvisers, is below
  the fold; the groove cards, a choosing tool, sit in the middle of the
  playing screen.
- **The captions are permanent.** "Everything synthesised, nothing to
  download", "the band never plays your instrument", "Headphones keep the
  score honest", "Takes stay on this machine" are all true and all worth
  saying once. They are said forever.

What worked and stays: the timeline (sections, fills, chord names, loop and
jump), the NOW chord with the next change, the shapes row one chord at a
time, Zen over a jam, the jam step in a setlist, the takes, the engine.

---

## A. The shape of the screen

- **A1 — Two states, not one page.** *decided 2026-09-12 by default, on the boards.* Proposed default: a loaded jam
  shows a PLAYING screen of five blocks — NOW chord and next change, the
  timeline, tempo with feel and intensity beside it, the band as one row
  with mutes, the practice switches — and a SETUP sheet behind one button
  that holds everything else. New jam opens the sheet; Play closes it; Esc
  closes it. See the canvas, board "Playing".
- **A2 — A vibe picker at the top of the setup.** *decided 2026-09-12 by default, on the boards.* Proposed default:
  eight tiles, one tap each, that set groove, feel, intensity, kit, fills,
  lineup and a sensible tempo and key together: Rock, Hard rock, Blues,
  Funk, Jazz, Latin, Pop, Metal. Every other control on the sheet is a
  refinement of the vibe, and the sheet says which vibe it started from.
  This is the thirty-second rule made real. See board "Setup".
- **A3 — The setup sheet's groups.** *decided 2026-09-12 by default, on the boards.* Proposed default, in order:
  Vibe · The drummer (groove cards, feel, intensity, kit, fills) · The form
  (shape, key, chords edit, count-in) · The band (who plays, per-lane
  volume) · More (meter override, transposition, takes). "More" is
  collapsed by default.
- **A4 — What leaves the setup entirely.** *decided 2026-09-12 by default, on the boards.* Proposed default: ticks
  per beat (the groove decides; a meter override implies it), spoken cues
  (a preference; moves to Settings › Voice), the count-in sound merged into
  the count-in control ("1 bar · sticks"), transposition shown only when
  the instrument is not guitar, bass or keys.
- **A5 — Order on the playing screen.** *decided 2026-09-12 by default, on the boards.* Proposed default: NOW and
  timeline first, tempo and feel to their right, the band row and the
  practice switches below, the shapes row last and collapsed by default.
- **A6 — The key's chord strip.** *decided 2026-09-12 by default, on the boards.* Proposed default: behind a
  "Chords in this key" toggle, off by default. The shapes row shows the
  current chord only and follows the jam; "Next shape" is its one control.
- **A8 — Shapes are a cheat sheet, not a live view.** *decided 2026-09-12 by default, on the boards.* "The fretboard and the chords are amazing, but
  they shouldn't keep changing." Proposed default: on the playing screen
  only two things ever change on their own, the timeline and the chord you
  are on. Shapes leave it entirely. A "Chords" button opens a sheet with
  the key's chords each drawn once as its basic shape (the open one or the
  first barre), so it reads as a page you can glance at; tapping a chord
  expands every way to play it. A shape can be pinned to the playing
  screen and then stays put; following the jam is a switch on the sheet,
  off by default. The fretboard is the same: opt in, and when open it
  shows one scale for the key, the box you would use, not a scale that
  swaps on every chord.
- **A9 — Variations inside a vibe.** *decided 2026-09-12 by default, on the boards.* Proposed default: picking a
  vibe shows a second row of variations, each a groove, a kit, a feel and
  an intensity together: Rock → classic, hard, punk, alt, ballad,
  half-time; Blues → shuffle, slow, Texas, boogie; Jazz → swing, ballad,
  bossa, up-tempo; Funk → 16ths, half-time, New Orleans; and so on. Depth
  for a player who lives in one family, without a single extra control.
  A variation tuned to taste is saved as your own jam, and the vibe tile
  can start from one of yours.
- **A7 — Captions become first-run hints.** *decided 2026-09-12 by default, on the boards.* Proposed default: the
  four permanent captions move to the onboarding hint system, shown once
  each at the moment they apply; the headphones line stays as a tooltip on
  the input chip.

- **A10 — The chord sheet is a true cheat sheet.** *decided 2026-09-13 by the
  owner ("create a true cheatsheet… the proper way").* The owner's session
  with the A8 sheet: "only major and 7ths chords? … the user should be able
  to see ALL chords for all keys, or filter by the chords the user can play
  in the key of the current jam. Feels incomplete." It was: the sheet showed
  the seven (eight, five) chords that belong to the key and nothing else,
  the library's fifteen chord types were hidden, and the rock player's
  first chord, the power chord, did not exist. The sheet becomes two pages:
  - **In key** (the default, what A8 built) gains a four-way flavour:
    **Triads · 7ths · Colours · Power**. Colours are the sus2, sus4, add9,
    6 and 9 chords whose every note lies in the key, grouped by degree.
    Power is every degree as a two-note power chord (I5, IV5, V5…). The
    flavour a jam opens on follows the vibe: rock, hard rock and metal
    open on Power; jazz and blues on 7ths; the rest on Triads.
  - **All chords** is the browser: a row of twelve roots spelled the way
    the key spells them, and for the chosen root every chord type the
    library knows, each drawn once as its basic shape, grouped Basic /
    Sevenths / Colours. A chord that fits the current key carries a small
    mark; a switch, **Only in key**, off by default, hides the rest. This
    is the owner's "filter by what I can play" without hiding anything
    from the player who wants to look something up.
  - Tapping a card on either page opens "every way to play it" underneath,
    and **Pin** works from both pages: a shape found in the browser can sit
    on the playing screen too. Follow the jam and the static fretboard stay
    as A8 left them.
  - **Power chords are a chord type**, not a drawing: `"5"` joins the
    quality union, the band plays it without a third (bass root and fifth,
    keys root, fifth and octave), the progression editor can pick it, and
    the library has guitar and bass shapes for it on every root.
  A chord "fits the key" when every one of its notes is in the key's note
  set, and that set is derived from the chords already listed for the key
  (for a major key that is exactly the seven scale notes; for minor it adds
  the raised seventh the V7 carries; for a blues it is the union of the
  five blues chords' notes). One rule, no second scale table.
- **A11 — Everything that appears, arrives.** *decided 2026-09-13 by the
  owner ("clicking on chords just shows the sidebar but it should smoothly
  do the entry animation").* Both sheets slide in from the right and out
  again; the scrim fades; the groove editor drawer rises from the bottom;
  "every way to play it", a vibe's variation row, the pinned shape and the
  first-run hints unfold and fold. One vocabulary for all of it: an enter
  of 240 ms and an exit of 160 ms on the app's standard easing, declared
  once as tokens, driven by a presence primitive that keeps a closing
  surface mounted until its exit finishes. It honours the OS reduced-motion
  setting, the app's own View transitions "off", and the Mono theme, in
  which case surfaces appear and vanish in one frame as they do today.
  Nothing inside a sheet animates on its own: the sheet moves, its content
  does not.
  **The two sheets are one docked frame**, added 2026-09-13 from the owner's
  testing ("switching between Set up and Chords makes the right drawer do
  weird flickering"): Set up and Chords are two contents of a single panel,
  not two panels in the same place. The frame slides in when the first of
  them opens and out when the last of them closes; switching between them
  moves nothing — the heading and the body change under a short cross-fade,
  focus goes to the first control of the new content, and the scrim comes or
  goes with whether Set up is the one showing.
- **A13 — What is on the stage and what is in the drawer.** *decided
  2026-09-17 by the owner ("the key of the song it's maybe too hidden inside
  the setup drawer? I think we have to take another look at what's inside the
  setup drawer and what's outside... It's fine to duplicate stuff but for
  example I change keys often for improv purposes and the key change is too
  hidden imo").*

  The rule, and everything below follows from it: **the playing screen holds
  what each player is DOING; the drawer holds who the players are and what
  the song is.** A thing you reach for with an instrument in your hands is on
  the stage; a thing you set once before you count in is in the drawer.

  - On the stage: the key, the tempo, the band feel, the drum intensity, each
    player's own style — the drummer's groove, the bass's figure, the keys'
    comping — each player's volume, and who is in or out.
  - In the drawer: the vibe, the form and its bars, the arrangement, the
    count-in, the changes, the kits and the voices, the percussion set, the
    meter and the transposition.
  - **Duplication is fine and sometimes right.** The key, the feel and the
    intensity are in both places. The drawer is where a jam is set up, and a
    control that MOVED out of it would be missing from the place people
    learned it was; the stage copy is the same control, not a shortcut to the
    drawer.
  - The drummer's row picks from the shelf its groove is on, not from all
    hundred and fifteen. The card wall exists so you can cross between
    shelves, which is a setting-up gesture; swapping a shuffle for a boogie
    mid-chorus is not.
  - Two settings stay in the drawer that the rule would put on the stage —
    how busy the bass is, and how often the drummer fills. Both are
    second-order next to the style itself, and a row with four controls on it
    stops being readable at a glance, which is the stage's whole job.
  - **Everything on the stage takes effect while the band plays.** A setting
    that waits for the next press of Play is a setting in the wrong place
    even when it is drawn in the right one.

- **A12 — The Set up drawer closes when you look away, and stands beside the
  stage when there is room.** *decided 2026-09-13 by the owner ("clicking
  outside of the Setup drawer should close it, and maybe if the window is
  wide enough the drawer should push the stage content to the left instead of
  rendering on top, that way it'd be easier to do everything at the same
  time").* Two behaviours, both about the same feeling: the drawer should not
  be in the way.
  - **A press outside puts Set up away**, anywhere in the content region that
    is not the sheet, through the same door Done uses so it slides out rather
    than vanishing. Not the chord sheet: that is a page you keep open while
    you play, and a tap on the timeline must not put it away. Not the context
    bar's own two buttons either — they toggle the sheet from whatever state
    it is in, so closing on their press would have the click that follows
    open it straight back up.
  - **At 1400px of content region or wider the drawer pushes rather than
    covers.** The sheet takes a column of its own, the stage shrinks beside
    it and keeps its own centring and scroll, and there is no scrim because
    there is nothing behind anything: the timeline keeps moving and the band
    row is still yours to press. Below 1400 it is the docked overlay it has
    always been, scrim and all. Measured on the content region rather than on
    the window, because the rail collapses. The chord sheet follows the same
    rule and carries no scrim in either layout.
  - The two do not both apply at once: **the outside press closes the drawer
    only when it is covering the stage.** In push mode the stage is a live
    column beside the sheet, and a drawer that shut every time you touched
    the timeline would take back the whole reason for the wide layout.
  - The push and the overlay slide in the same way, and the stage's width
    change is not animated: a layout reflowing over a quarter of a second
    beside a sliding sheet reads as the app struggling rather than as motion.
  - Escape and Play still close Set up as they did.

---

## B. The sound

- **B1 — Drums only by default.** *decided 2026-09-12 by default, on the boards.* Proposed default: a new jam's
  lineup is drums alone for every instrument; the bass and keys are one tap
  each in the band row, off until asked. A drummer's default is bass alone.
  The rule "the band never plays your instrument" still governs what is
  offered, not what is on.
- **B2 — A raw kit.** *decided 2026-09-12 by default, on the boards.* Proposed default: a fifth synthesised kit,
  "Raw", built for rock: kick and snare with a shaped transient (a short
  click layer, a saturated body, a compressed envelope), hats brighter and
  shorter, a crash with a longer wash, no room tail. Measured like the
  others, then tuned in the owner's presence by A/B against the current
  four, because this one is judged by ear and the first four were not.
- **B3 — Your own samples.** *decided 2026-09-12 by default, on the boards.* Proposed default: a kit can be a
  folder of WAVs you point the app at (kick, snare, hat, open hat, ride,
  rim, crash, any subset; missing voices fall back to Raw). Loaded from
  disk, never shipped, so the license rule holds and a player with a good
  sample pack gets a real drummer. Listed beside the built-in kits.
- **B4 — Grooves that drive.** *decided 2026-09-12 by default, on the boards.* Proposed default: three new grooves
  with no ghost notes: Hard rock (straight 8ths, open hats on the
  off-beats, crash on the one), Stomp (half-time, kick heavy, crash every
  section), Double kick (16ths under a straight backbeat). The existing
  Rock 8ths and 16ths keep their ghosts and are what "Pop" picks.
- **B5 — Intensity changes the pattern, not only the level.** *decided 2026-09-12 by default, on the boards.*
  Proposed default: Loud removes ghosts, opens the hats on the off-beats,
  and adds the crash on section starts; Soft does the reverse and closes
  the hats. Normal is the groove as written.
- **B6 — The bass and the keys, less smooth.** *decided 2026-09-12 by default, on the boards.* Proposed default:
  the bass gains a pick attack and a shorter decay under rock and funk
  styles; the keys' stab style gets a shorter, drier envelope. Both stay
  off by default (B1), so this is second to B2 and B4.
- **B8 — A vibe is a sound set.** *decided 2026-09-12 by default, on the boards.* Proposed
  default: every vibe bundles a kit, a bass voice, a keys voice, a groove
  family, a feel, an intensity, a fill habit and a tempo range. Rock: Raw,
  picked bass, organ. Hard rock and metal: Raw with double kick, driven
  bass, no keys. Blues: Room, fingered bass, organ, shuffle. Jazz: Brushes,
  upright, electric piano, swing ride. Funk: Tight, slap, clav stabs.
  Latin: Room with rim, fingered, nylon-ish pad, bossa. Pop: Electronic,
  synth bass, pad. The voices are the sound of the style; the pattern is
  only its rhythm.
- **B9 — The voice roster.** *decided 2026-09-12 by default, on the boards.* Proposed default: five bass voices
  (fingered, picked, upright, slap, synth) and four keys voices (electric
  piano, organ, clav, pad), each its own synthesis recipe — envelope,
  harmonics, filter, attack noise — built at bank time like the kits.
  Drums stay the one place your own samples replace the synthesis (B3),
  because a drum is one hit and a bass is a whole instrument. Every voice
  is a dropdown in the setup under its player, so a vibe's choice can be
  overridden without leaving the vibe.
- **B10 — Tuned by listening, against references.** *decided 2026-09-12 by default, on the boards.* Proposed
  default: every vibe gets a reference card, two or three well-known
  tracks with the tempo, feel and sound named, and its voices are tuned
  A/B against them with the owner in the room for the styles the owner
  plays and with a bass player and a jazz player for the ones the owner
  does not. Every vibe tile gets a two-bar preview so a user hears the
  band before committing. The first four kits were measured and never
  heard; this is the rule that prevents a repeat.
- **B7 — Kit choice on the vibe tile, not a separate card row.** *decided 2026-09-12 by default, on the boards.*
  Proposed default: the vibe sets the kit; the kit control becomes a
  dropdown under The drummer, with a preview button that plays two bars.

---

## C. Process

- **C1 — Boards before code.** *decided 2026-09-12.* Every entry above gets
  a board or a note on the "Yames Jam v2" canvas before it is briefed. The
  owner picks on the canvas; this log records the pick; then the briefs.
- **C2 — Sound is a separate track with the owner's ears in the loop.**
  *decided 2026-09-12.* B2, B4 and B6 are auditioned A/B in a session with
  the owner before they are called done. A measurement script is a gate,
  not a verdict.
- **C4 — A jam is a file.** *deferred, noted now because it costs nothing.*
  A jam is a small JSON record, so jams can be exported and imported as
  files with no cloud and no accounts. A community of rock players building
  rock jams covers more taste than the stock set ever will. Not in the
  second pass; the record format should not be changed in ways that make
  it harder.
- **C3 — Its own pull request.** *decided 2026-09-12.* The second pass lands
  as a PR on top of #50, so the first build is judged as built and the
  redesign on its own.
