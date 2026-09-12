# Jam — a band to play over

> **Status:** Brief. Decided in principle, not yet scheduled against
> `ROADMAP.md`. Nothing here is calendar-committed.
> **Written:** 2026-09-12, from a brainstorm between the owner and Claude.
> **Audience:** the owner and the coding agents that will implement it.
> **Design:** the canvas at
> https://claude.ai/code/artifact/8ce0a7b5-b51a-45c0-a740-7a95912fa02f
> (three boards: the setup, the jam in progress, trading fours). Working
> files in `design/jam/`. The earlier exploration of the same idea as a
> metronome feature is at
> https://claude.ai/code/artifact/18a72641-6ada-4848-830c-ea295e04def2
> with working files in `design/drummer/`; it is kept for the record and
> for the engine notes, not as the design.
> **How to use:** §0 is the decision and is closed. §1–§6 are the brief:
> what the thing is and what it could grow into. §7 is the release shape.
> §8 is the list of things still open, the coach first among them. When
> an open item is decided, write the outcome inline with the date, the
> way `UI_DECISIONS.md` does.

---

## 0. The decision

**Jam is a mode of its own in the rail, not a feature of the metronome.**
*Decided 2026-09-12.*

The idea started as a drummer for the metronome: a groove instead of a
click. Drawn that way it kept overloading the metronome stage, and the
owner named the real use: improvising over a steady tempo, wanting the
click "on steroids with a cooler drum". That is a different practice
activity. By the same test that makes Drill a mode (a way of practising,
with its own flow and its own library), a band you play over is one.

What was weighed and set aside:

- *A sound preset.* A groove carries a rhythm, a resolution and a meter,
  so picking it silently rewrote the subdivision. It is not an audio
  option, and it confused everyone who looked at it.
- *A groove control next to Meter and Accent.* Correct data model, but it
  turns the metronome into two products on one screen and leaves no room
  for anything beyond a pattern: no feel, no fills, no bass, no form.
- *A companion panel beside the stage.* Closest of the three, but it
  competes with the coach for the same edge and still has nowhere to put
  the form.

The costs accepted with a mode: a jam has its own tempo and meter, so a
Drill cannot ramp a jam and a setlist step cannot name one until a bridge
is built (§8). The metronome stays exactly what it is.

**What Jam is not.** Not a drum machine (no velocity lanes, no song mode,
no sample import). Not a backing-track player (nothing is downloaded or
streamed; everything the band plays is synthesised). Not a lesson.

---

## 1. The name

**Jam.** A verb, one syllable in the rail, true for every instrument,
and still right when a bass and a chord loop arrive. "Drummer" describes
only the first release. "Band" promises more than drums on day one.
"Session" collides with the coach's practice sessions. "Play-along" is a
CD from 1998.

---

## 2. The loop

Thirty seconds to playing. Pick a feel, set a tempo and a key, press
play. The band counts you in, keeps time, and knows the form so you do
not have to. When you stop, the coach tells you what your time did.

The last sentence is the part no play-along app offers, and it is the
reason Jam belongs in Yames rather than in any of the dozen drum apps:
the band is a table on the tick grid the metronome already runs, so the
timing analysis keeps working underneath it.

---

## 3. Principles for Jam

Everything in `ROADMAP.md` §1 applies unchanged: the click is sacred,
eyes-free first, deterministic decides and the model narrates, honest
status, local and free and license-clean. Jam adds five of its own.

1. **The band never plays your instrument.** Onboarding already asks what
   you play. The lineup and the display follow from it: a bass player
   gets drums, a drummer gets bass and keys, a guitarist gets drums and
   bass, a horn player gets the changes in their own transposition.
2. **Everything the band plays is synthesised and deterministic.** Kits,
   bass, keys: generated, like the click sounds today. Nothing to
   license, nothing to download, and the model is never in the music.
3. **The band is a table on the tick grid, never a second clock.** Every
   hit lands on a tick the engine already plays, so the analyser sees the
   same grid the band plays on. Rests are empty columns, not skipped
   ticks.
4. **Thirty seconds to playing.** Every setup control is a card you can
   tap with a plectrum in your hand. Anything that needs a keyboard is a
   later screen, never the first.
5. **Say what the score is worth.** A band is louder than a click. Through
   speakers its hits land on the grid and the mic scores them as your
   notes. The UI says so ("Headphones keep the score honest"), and the
   session record carries a jam flag so the coach never reads a speaker
   session as a clean one. See §8.3.

---

## 4. Features, in layers

### 4.1 The drummer (first release)

- Grooves by feel, each declaring the meter it fits: rock 8ths, rock
  16ths, half-time, shuffle, swing ride, funk, bossa, reggae one-drop,
  waltz, 6/8, train beat, boom bap, four-on-the-floor. Odd meters fall
  back to a rule (kick on group starts, snare late in the group, hats on
  the subdivision) so a 7/8 jam still has a drummer.
- Feel: straight, shuffle, swing. Shuffle and swing are triplet
  subdivisions with the middle tick silent, which is why they need no
  engine change and the analyser already understands them.
- Intensity: soft, normal, loud. Scales ghosts and accents on the same
  pattern rather than swapping patterns.
- Fills every 4 or 8 bars, a crash on the first beat of a new section,
  hats opening into the last bar of a section. The small cues that make a
  loop feel like a drummer.
- Kits: tight, room, brushes, electronic. Synthesised in
  `generate_sounds.py`, tuned by ear the way the snare kit was.
- Count-in, always: sticks, spoken, or none.
- A groove editor (four lanes, columns following the meter, four cell
  states: off, hit, accent, ghost) for making your own. Drawn on the
  drummer canvas; second release.

### 4.2 The form (first release, and the headline for improvisers)

- A jam has a shape: 12-bar blues, 8-bar loop, 16-bar, AABA 32, one
  chord, or your own sections. The stage shows bar 7 of 12, which section
  you are in, and where the turnaround is. Losing your place in the form
  is the number one bedroom improv problem, and no metronome addresses
  it.
- Loop a section. Skip to the bridge with a footswitch.
- Chorus count and elapsed time on the transport.
- Tempo trainer inside the jam: up 4 BPM every two choruses. Drill's ramp
  wearing a band.

### 4.3 The band (second release)

- Key and chords. A progression per section: I IV V blues, ii V I, the
  Andalusian cadence, the pop four, or typed in. Chord names on the form
  timeline; the chord you are on is the largest thing on the screen, with
  the next one beside it.
- A bass line that follows the changes, derived from the groove: roots
  and fifths under a rock beat, walking under swing, the bossa pattern
  under a bossa. Deterministic, never improvised by a model.
- Keys: a pad or simple comping, for people who want harmony under them
  rather than just the root. Third release.
- Scales per chord, shown deterministically: the fretboard for guitar and
  bass, note names for everyone else, transposed for horns. This is where
  `LEARNING_PATHS_DECISIONS.md` D0.5 (theory inside the activity, from
  deterministic data) gets a second home.
- **Chords in the key, and their shapes.** *Owner's request, 2026-09-12.*
  Set a key and the jam shows the chords that live in it (I ii iii IV V vi
  vii°, their sevenths, and the blues dominants), each as a small chord
  diagram. Pick one and see every way to play it along the neck, from the
  smallest triad to the seventh voicings: open shapes where they exist, the
  movable shapes rooted on the sixth, fifth and fourth strings, and the
  three-string triads on the top and middle string sets. The chord the jam
  is on right now is the one shown by default, so the shapes arrive while
  you play, one chord at a time, not as a sheet of eighty. Bass gets the
  same for its four strings. The UX rule: never a wall of diagrams. One
  chord at a time, the shapes ordered by where they sit on the neck, and a
  "next shape" that a footswitch can press. Shape data is musical fact,
  authored once as fret and finger numbers, not drawn from any book.

### 4.4 Practice tools that only make sense over a band

- **Drop-out bars.** The band goes silent for one or two bars every N and
  comes back. You find out whether your time is yours or the drummer's.
  The score during the silence is the most honest score the app can
  produce, because nothing bleeds into the mic.
- **Trading fours.** The band plays four bars, you play four; the drums
  drop to hats and the bass steps out on yours. Then eights, then twos.
  The cue is spoken, because your eyes are on the neck.
- **The drummer stops at random.** Same idea as drop-out, less
  predictable.
- **Record the take.** Opt in, local only, your playing with the band
  mixed in, listen back, keep the best. Listening back is how improvisers
  improve. Rides on the roadmap's Phase 4 record-and-listen work and its
  privacy rule (audio never persisted in release builds without a
  per-feature opt-in).

### 4.5 The coach in the jam (open, see §8.1)

Drawn deliberately quiet: it listens and says nothing until you stop.
What it says then, and whether it should behave more like a person in
the room than a report, is the largest open question in this brief.

### 4.6 Library and sharing

- A jam carries tempo, feel, form, key, kit, intensity, lineup and the
  practice-tool settings. Saved in the rail's library like presets.
- Ship a handful so the first press of Jam already plays: slow blues in
  A, funk in E, bossa in D minor, swing in F, rock in G, waltz in C.
- A setlist step can point at a jam later, so a routine can end with ten
  minutes of playing (§8.5).

### 4.7 Hands-free

MIDI footswitch and hotkeys: start and stop, skip section, trade toggle,
tempo up, loop this section. Spoken cues for count-in, section changes,
"your four", "last chorus". Zen mode for jams: the chord and the beat,
nothing else.

---

## 5. Beyond guitar

The rule that makes this work for everyone is §3.1: the band never plays
your instrument.

| Who | What the band is | What the display shows | What is measured |
|---|---|---|---|
| Guitar | drums, bass, keys optional | chords, scale, fretboard | timing against the grid |
| Bass | drums; keys optional | chords, fretboard | timing against the kick ("kick lock": how tight your notes sit under the kick) |
| Drums | bass and keys, no drums; click or hats optional | the form, the changes | groove against the bass line; drop-out and trading are the core |
| Keys | drums and bass | chords as notes and voicings | timing against the grid |
| Horns, strings, voice | drums, bass, a pad or drone for intonation | the changes in the player's transposition (Bb, Eb, concert) | timing; pitch later |

Everyone shares the same five needs: where am I in the form, a count-in,
a steady tempo, the changes visible, and a recording to learn from.

---

## 6. Engine notes

For whoever builds it. The reason Jam is cheap and safe is that nothing
about timing changes.

- **The band is a lookup table.** `engine.rs` already decides, per tick,
  "accent or not" from a bitmask over bar positions (`accent_mask`),
  rebuilt only when the grouping changes and read with one bit test on
  the audio thread. A groove is that table with more rows (kick, snare,
  hat, one more) and four levels instead of two. Compile it off the audio
  thread when the jam changes; swap it in the way the mask is swapped.
- **Columns are beats × subdivision.** The groove's resolution *is* the
  subdivision (8ths, 16ths, triplets). The analyser's refractory window
  already scales with the audible subdivision, so it follows.
- **Voices.** The mixer sums any number of overlapping voices; a busy
  groove at 240 BPM is a handful. Per-lane ring-out caps so a kick can
  sustain across a 16th tick (today every non-accent voice is capped at
  0.9 of a tick). Re-run the jitter probe with the busiest groove and the
  bass on: zero missed beats, zero dropouts.
- **Sounds.** The bank already holds a kick, a closed hat, a crash, a body
  layer and a snare at two dynamics. Add open hat, ride, rim, then the
  kits. The bass and the keys are synthesised voices scheduled on the
  same table with a pitch per hit; the chord loop is a per-bar lookup of
  what pitch each lane plays.
- **Scoring.** Unchanged for timing. Drop-out bars and trading fours are
  windows where the band's own hits are absent, which the analyser can
  weight as the cleanest evidence. Pitch against the changes waits for
  the roadmap's pitch work.
- **Mobile.** `MOBILE_IMPLEMENTATION_PLAN.md` rewrites the audio engine.
  The groove table and the form are platform-agnostic like the ramp state
  machine; the scheduling is per platform.

---

## 7. Release shape

Sized like the roadmap: S ≤ 1 day, M ≤ 1 week, L > 1 week of agent work,
plus the owner's ears for every sound.

| Release | Ships | Size |
|---|---|---|
| Jam 1 | The rail entry and library, the drummer (grooves, feel, intensity, kits, fills, count-in), the form with bars and sections, tempo trainer, footswitch actions, six starter jams, the headphones rule and the session flag | L |
| Jam 2 | Key and chords on the timeline, the bass, scales per chord with the fretboard, drop-out bars, trading fours, the groove editor | L |
| Jam 3 | Keys comping, record the take, transposition for horns, the setlist bridge, whatever §8.1 decides about the coach | M–L |

Jam 1 is the whole loop in §2 minus the last sentence. It is worth
shipping on its own.

---

## 8. Open questions

- **8.1 The coach in the jam.** *open, the owner's flag.* The coach is
  good at steady time and poor at improvisation today. Its templates,
  gatekeeper and scoring assume a drill. The owner's direction: in a jam
  the coach could be centred on the *flow* of the jam, more like a person
  in the room than a report. To brainstorm separately. Until then Jam
  ships with the coach listening and silent, and a mini-report on stop
  only if the numbers are defensible.
- **8.2 The final name.** *open, default Jam.* See §1.
- **8.3 Speakers and the score.** *open.* Options: score anyway with the
  jam flag; score only in drop-out and trading windows; score only when
  headphones are detected (the output device name is a weak signal). The
  first is the default; the second is the honest one.
- **8.4 Fills and variations.** *open.* How far to go before it becomes a
  drum machine. Default: fills at section boundaries and every N bars,
  one variation per groove, nothing user-sequenced.
- **8.5 Setlists and jams.** *deferred.* A setlist step pointing at a jam
  needs the step to carry a jam id next to a preset id. Not needed for
  Jam 1.
- **8.6 Two-bar grooves.** *deferred.* One bar per groove in Jam 1.
- **8.7 Kit sound quality.** *open, taste.* The snare kit took several
  rounds to stop sounding "shy". Budget listening time for every kit.
- **8.8 Mobile.** *deferred* to the mobile plan.
- **8.9 How much chord-shape UI is right while playing.** *open.* The
  chords-in-the-key panel could be a strip under the NOW block, a drawer,
  or a page of its own you visit between choruses. Default for the first
  build: a strip of the key's chords under NOW, the current chord's shapes
  in a row beside the fretboard, the rest behind a tap. Revisit after the
  owner has jammed with it.
