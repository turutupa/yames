# How the coach behaves — a draft for the owner to react to

> **Status:** Draft, 2026-09-20. Written by the orchestrator on the owner's
> instruction ("follow your gut feeling given all the context we already
> have"). Nothing here is decided until the owner says so; every entry
> carries a proposed default so that reacting is one line each.
> **Relations:** `SONGS.md` S0.6 (the verdict ships with Songs), S0.8 (this
> is the other half of coach work), `LEARNING_PATHS_DECISIONS.md` group E,
> `ROADMAP.md` §1 principles 2 and 3.

Status key: **decided** · **open** · **deferred**

---

## 0. What a good teacher does, and the coach does not yet

The owner's north star: a teacher a player logs in to, because guidance is
what most players are missing. A good teacher does five things in a
lesson. They **remember** where you were last week. They **choose** what
today is for. They **stay out of the way** while you play. They **say one
thing** when you stop — the thing that matters most — and show you what to
do about it. And they **notice progress** you cannot hear yourself.

Today's coach talks during play, about timing against the click, from a
feed beside the metronome. It has no plan, no memory a player can see, and
nothing to say about what was played. The technical wave gives it ears,
a score and a memory. This document is about manners.

## A. The shape of a session

- **A1 — The coach is a person in the room, not a panel.** *open.* One
  voice, one place, in every mode: the same coach greets you in Metronome,
  Drill, Jam and Songs, and knows what you did in the others.
  Proposed default: the coach card stays where it is and becomes
  mode-aware; no separate "coach mode".
- **A2 — Arrival.** *open.* What you see when you open the app.
  Proposed default: one line from memory and one suggestion, never a
  dashboard: "Yesterday bars 17–24 got to 85 %. Pick it up there?" with a
  single button that loads exactly that. Dismissed by just doing
  something else. Silent if there is nothing worth saying.
- **A3 — While you play, the coach is quiet.** *open.* A teacher who talks
  over your playing is a bad teacher, and speech during a take ruins the
  take.
  Proposed default: in Songs and Jam, nothing spoken and nothing that
  moves in the feed while the transport runs; the only live feedback is
  the notes lighting on the tab (`SONGS.md` A7). Metronome and Drill keep
  today's live tips, because there the exercise is the conversation. A
  footswitch "how am I doing?" is the one way to ask mid-pass.
- **A4 — When you stop: one thing.** *open.* The verdict.
  Proposed default: the single most useful finding, in a sentence a
  teacher would say, with the fix as a button. Everything else is there if
  you open it, never pushed. Ranking rule, in order: a passage you
  consistently miss (same bars, several passes) → a tendency (rushing
  sixteenths, late after position shifts) → a tempo ceiling → praise that
  is specific ("the bend in bar 9 was dead on, three times") when nothing
  is wrong. Never generic praise; never more than one correction.
- **A5 — The fix is always an action.** *open.* Guidance nobody can act on
  is commentary.
  Proposed default: every correction resolves to something the app can set
  up in one tap or one footswitch press: loop these bars at this tempo,
  start a ramp from here, switch the click to eighths for this passage,
  come back to this tomorrow.
- **A6 — Leaving.** *open.* Proposed default: when a session ends, one
  line on what moved and what is due next time. It becomes tomorrow's A2.

## B. Voice and tone

- **B1 — Who is speaking.** *open.* Proposed default: a patient session
  player, not a cheerleader and not a drill sergeant. Plain musician's
  words, second person, present tense. Numbers when they help ("about a
  sixteenth early"), never a percentage as the headline.
- **B2 — Honesty about what it could not hear.** *open.* Chords are not
  checked for notes yet; a quiet hammer-on may go undetected.
  Proposed default: the coach says so once, where it matters ("I can't
  check the notes in chords yet, only their timing"), and never guesses.
- **B3 — Rules decide, the model narrates.** *decided* (roadmap principle
  3). Findings, rankings and fixes are computed. A model, when one is
  loaded, only rephrases and answers questions from those facts. With no
  model the coach is the same coach with plainer sentences.
- **B4 — Speech.** *open.* Proposed default: spoken only at boundaries
  (arrival, stop, leaving) and only if the player turned voice on; never
  over playing; always skippable by starting to play.

## C. Memory a player can see

- **C1 — The notebook.** *open.* A teacher's notes on you, readable by you.
  Proposed default: a short, dated list per song, exercise and tendency —
  "rushes sixteenths above 140", "bars 17–24 of <song>: 70 % → 85 % → 100 %
  over nine days" — that the coach reads from and the player can correct
  or delete. This is what makes it feel like someone who knows you, and it
  is also the trust view: nothing the coach believes is hidden.
- **C2 — Due today.** *open.* Proposed default: at most three things,
  chosen by spaced review and by what was left unfinished, each one tap to
  start. Never a backlog, never a streak to protect.
- **C3 — Progress you cannot hear.** *open.* Proposed default: the coach
  volunteers a before-and-after only when it is real and it is big
  ("a month ago this passage topped out at 96; today you held 120"), with
  the two takes side by side if both were recorded.

## D. Asking the coach things

- **D1 — Chips before chat.** *open.* Proposed default: after a verdict,
  two or three tappable questions drawn from the facts at hand ("why do I
  rush there?", "what should I do tomorrow?", "show me that bar"). A text
  box exists but is not the front door. Every answer is grounded in
  computed facts, and says so when it has none.
- **D2 — The model, and who runs it.** *deferred* to the tier rewrite
  (`SONGS.md` S0.7): heavier local models are the direction, with an
  optional paid tier for players whose machine cannot run one. The
  behaviour in this document must not depend on which.

## E. What the first Songs release needs from this

Only A3, A4, A5 and B2: quiet while playing, one finding with its fix as a
button, and honesty about chords. Everything else can follow.
