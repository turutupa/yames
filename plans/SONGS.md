# Songs and the scoring engine under them — decision log and plan

> **Status:** Working document, not the roadmap. Started 2026-09-18.
> **Purpose:** the order of work after Jam, the open questions that block
> the task briefs, and the tracks that can run side by side. Same rules
> as `LEARNING_PATHS_DECISIONS.md`: one entry per decision, a proposed
> default on every open entry, outcomes written inline with the date.
> **Relations:** `LEARNING_PATHS_DECISIONS.md` (paths, built second on the
> same machinery — B6 and D3 there point here), `ECHORA.md` (where this
> leads), `ROADMAP.md` (Phase 1 and 2 items are pulled in below by
> number; the roadmap is rewritten once this log is decided, F4 there).

Status key: **decided** · **open** · **deferred**

---

## 0. Decided (2026-09-18)

- **S0.1 Order of work after Jam:** the scoring engine and Songs
  together → learning paths on the same player → the coach's voice last,
  once it has real facts about what was played. Learning paths is worked
  out on paper (its own log, groups A–F) while the first two are built.
- **S0.2 Why Songs before paths.** Songs is well defined (import, play,
  review), needs no content from us because players already own the
  files, and forces the general score format. "Loop bars 17–24 at 70 %,
  speed up as you pass" is the Drill tab pointed at a section of a song,
  and it is also what a path step is.
- **S0.3 Nothing branches before Jam lands on main.** Jam rewrote large
  parts of `engine.rs`, `lib.rs` and the take recorder. PR #55 is on
  `jam-v5`; the work is on `jam-v6`. Paper work and research only until
  then.
- **S0.4 The app ships no songs.** Players import their own files.
  (`ECHORA.md` S2.)
- **S0.5 Honest scope for the first release.** Timing is scored on
  everything. Which note was played is checked on single-note lines
  only, and the review says so where it cannot tell.

- **S0.6 The coach is the point, and Songs ships with its verdict.**
  (Owner, 2026-09-20.) The smart coach is the main roadmap; every mode is
  an instrument it plays. So the review after a pass does not stop at
  colours: it says where it went wrong and what to do about it ("bars
  17–20, you rush the sixteenths — loop them at 80 % and climb"), and one
  tap sets that loop up. Computed by rule, no model. The talking,
  model-written coach still comes last. The rule from here on: nothing
  ships without saying what it hands the coach.
- **S0.7 Heavier local models, and an optional paid tier.** (Owner,
  2026-09-20.) The light models are not strong enough for where the coach
  is going. Lean towards heavier local models; for players whose machine
  cannot run one, an optional paid tier that only covers the cost of
  running it for them. Same coach for everyone (`ECHORA.md` E0.5). Not
  scheduled; ROADMAP §3 (tiers) and principles 5–6 are rewritten when it
  is.
- **S0.8 Two halves of coach work.** (Owner, 2026-09-20.) The technical
  half — hearing, scoring, remembering — is this plan and runs first. The
  other half is how the coach behaves with a person; that is
  `plans/COACH_UX.md`, drafted by the orchestrator for the owner to react
  to rather than designed by committee.

### State of the engine this stands on (checked 2026-09-18)

Roadmap Phase 0 is done. Phase 1 is untouched: no SQLite store (1.1), no
real high-tempo capture (1.2), the refractory is still keyed to the
click rather than to what is played (1.3), no per-beat divisor voting
(1.4), T06b still open. Phase 2 has no code except what Jam brought (a
fretboard, scales per chord, sampled bass/keys/drums addressed by MIDI
note in `voices.rs`). No pitch tracking of any kind.

1.3 alone blocks Songs: a quarter-note click at 100 BPM gives a ~450 ms
refractory, so a riff in 16ths is swallowed before scoring sees it.

---

## A. Questions that block the briefs

- **A1 — What the player plays over.** *open, not critical (owner,
  2026-09-20): aim for the engine if it is better, a MIDI-style player
  like Songsterr's is acceptable, settle it when the spike reports.* alphaTab (MPL-2.0, reads
  Guitar Pro 3–7, MusicXML, alphaTex; renders a scrolling tab) can also
  play the file's other tracks, but from the webview, on a clock the
  scoring engine does not share.
  Proposed default: alphaTab reads and draws, nothing more. The engine
  plays. The file's drum and bass tracks go through Jam's sampled
  voices, the player's own track is muted or ghosted, other tracks are
  dropped in v1. The click stays available on top. **Spike K1.**
- **A2 — The score format.** *open.* One format for a song, an exercise
  and a pack step (LP B1/B6). Proposed default: our own JSON, produced
  by the importer, holding per-note string/fret/midi/beat position/
  duration/technique, sections, repeats unrolled into a flat timeline
  with a map back to the printed bar, tempo and meter changes. The
  original file is kept beside it so the tab is drawn from the source.
- **A3 — Which track is "mine".** *open.* Proposed default: the player
  picks a track on import; guitar and bass tracks offered first;
  tuning and capo read from the file and shown before play.
- **A4 — Tempo changes and the click.** *open.* The engine has ramps but
  not a tempo map. Proposed default: v1 supports a tempo map in the
  engine (step changes on bar lines); gradual changes are flattened to
  steps; files that need more are flagged at import.
- **A5 — Where Songs lives.** *decided 2026-09-20: its own rail mode,
  beside Jam and the others.* A rail mode of its own beside
  Metronome, Drill, Setlists and Jam, or inside one of them.
  Proposed default: its own mode. A song library is a place.
- **A6 — Practice tools on a song.** *open.* Proposed default for v1:
  pick a section or a bar range, loop it, play it at a percentage of
  tempo, and let the existing speed ramp climb as passes are clean.
- **A7 — Live feedback vs the review.** *decided 2026-09-20, as
  proposed.* Proposed default: while
  playing, notes light as they are hit, on timing alone (the next note
  is known, so an onset is enough). Note identity, bends and the rest
  appear in the review after the pass. Nothing new runs on the audio
  thread.
- **A8 — The take in the review.** *built as proposed 2026-09-20 (W5),
  for the owner to confirm:* the dry stem is a file, `<id>.dry.wav`, under
  the take's existing opt-in — no second switch — listed, sized and deleted
  with its take. This supersedes ROADMAP 2.7's in-memory-only ring, which
  was written before takes existed. A take today is you and the
  band already mixed (`take.rs`). Pitch needs you alone.
  Proposed default: the writer thread also keeps the dry input as a
  second file beside the mix, same opt-in, same delete.
- **A9 — Camera.** *decided 2026-09-18 (owner): in, Songs only for the
  first iteration.* A pass through a song can be recorded with the
  camera on, and the review plays the picture with the colored notes
  beside it. Opt in per recording, kept on the machine under the same
  rules as a take (visible, playable, deletable, never uploaded). The
  review must work exactly the same with sound alone, so the camera
  never blocks the release: if spike K3 says the picture cannot be lined
  up with the sound well enough, Songs ships without it and this entry
  reopens. Which other parts of the app get a camera (Jam takes, Drill,
  path steps — `ECHORA.md` E0.7) is evaluated after Songs has shipped
  with it, not before.
- **A10 — What a video recording is, on disk.** *open.* Proposed
  default: the picture is recorded by the webview as its own file, the
  sound stays the engine's take (mix + dry stem, A8), and a sidecar
  holds the measured offset between them; the review plays them
  together. Joining them into one ordinary video file for sharing is a
  later step (`ECHORA.md` D4), and needs an encoder whose licence has
  to be checked against GPL-3 before it is promised.

## B. Spikes (throwaway code, a written answer each)

- **K1 — Backing through the engine.** Parse one Guitar Pro file with
  alphaTab, hand its bass and drum tracks to Jam's voices as note
  events, draw the tab with the cursor driven by the engine's beat
  events. Answers A1, A2, A4. Also confirm the MPL-2.0 copy carries no
  "Incompatible With Secondary Licenses" notice (GPL-3 needs that).
- **K3 — Camera sync.** Record picture in the webview (all three OSes:
  WebView2, WKWebView, WebKitGTK — camera permission and codec support
  differ on each) while the engine records sound. Put a sharp click and
  a visible flash in the same instant, measure the offset between them
  in the two files, and whether it holds still over five minutes.
  Answers A9 and A10. Also: does recording video cost the click
  anything — re-run the jitter probe with the camera on.
- **K2 — Pitch on a real take.** YIN-class tracker over a dry recording
  of a scale run; measure note accuracy and run time. Answers whether
  S0.5 is as far as v1 can go.

## C. Tracks (after Jam merges; one owner per file set)

| Track | Work | Roadmap | Files it owns |
|---|---|---|---|
| T-A Scoring | 1.2 real 180 BPM capture (**owner plays it**) → 1.3 refractory on the played divisor, virtual ticks → matching against a known score with alignment (2.4, LP C1/C4) | 1.2, 1.3, 2.4 | `timing.rs`, `onset.rs`, fixtures. Serial, one worker at a time |
| T-B Store | SQLite history, attempts, per-note results, take attached to an attempt | 1.1, LP B4 | new `db.rs`, `session.rs` |
| T-C Tab | Importer to the A2 format, tab view, cursor on the engine's beat, track picker | 2.3, LP D1 | new `src/containers/song/`, new importer module |
| T-D Pitch | Dry stem (A8), tracker after the pass, fixtures | 2.7 step A | new `pitch.rs`, `take.rs` |
| T-E Engine | Tempo map (A4), note-event playback of imported tracks through Jam's voices (A1), T06b done alone and first | 0.5c | `engine.rs`, `jam.rs`. Serial with nothing else in these files |
| T-G Camera | After K3: camera picker and preview, record with the pass, offset sidecar, list/play/delete beside takes | — | new `src/containers/song/camera/`, a thin addition to the take list. Never touches the audio threads |
| T-F Paths | Owner and Claude work LP groups A–F on paper | — | the log only |

**First wave launched 2026-09-20** on `songs-v1` (briefs in
`plans/tasks/songs/`): W1 scoring (1.3, then matching against a known
score), W2 store, W3 the allocation-free beat queue, W4 the importer and
the Songs mode, W5 pitch and the dry stem. The camera spike (K3) waits for
the owner: it needs a camera and a person in front of it. The second wave
is the engine's tempo map and imported-track playback (after W3), and the
review with its verdict (after W1, W2, W4).

Then, in order: the review screen (take, colored notes, playback, and
the picture when there is one) → section loop and tempo tools (A6) → release Songs →
paths as curated content and progression on the same player → the
coach's voice in path and song mode (LP group E).

Every track carries the roadmap's gates (§4), and T-A and T-E re-run the
jitter probe.
