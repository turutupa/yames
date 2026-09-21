# Echora — idea log

> **Status:** Idea under iteration, not scheduled. Started 2026-09-18.
> **Purpose:** keep the thinking about Echora in one place while learning
> paths gets built, so the two do not drift apart. Same rules as
> `LEARNING_PATHS_DECISIONS.md`: one entry per decision, a proposed
> default on every open entry, outcomes written inline with the date.
> **Prototype:** `github.com/turutupa/echora` (Next.js + Supabase, Dec
> 2025 – Jan 2026). Screens, recorder and schema exist; nothing is ever
> uploaded, there is no video pipeline, payments or moderation, and the
> deployment is down. Treat it as a design sketch, not a codebase to
> resume.

Status key: **decided** · **open** · **deferred**

---

## 0. Decided so far (2026-09-18)

- **E0.1 Learning paths come first.** Yames has neither the audience nor
  the content format Echora needs. Learning paths produces both.
- **E0.2 Echora is where learning paths lead, not a rival to them.** The
  unit of Echora is a learning-paths exercise or path that somebody
  other than the owner wrote. What Yames adds that no lesson site has:
  the lesson is played over a band, at the player's tempo, and heard.
- **E0.3 It cannot be local-only.** (Owner, 2026-09-18.) The finished
  thing has a place to browse courses and other people's takes, and the
  browsing is what makes a player want to post their own. Files sold on
  someone's Gumroad are a way to test creators early, never the product.
- **E0.4 Video matters, and for the player more than for the teacher.**
  (Owner, 2026-09-18, from testing the prototype on themselves.) Seeing
  yourself play is the reward. A course step that is only complete once
  you have recorded it is a commitment device players will thank us for.
  A scored take tells a teacher more; a video keeps the student going.

- **E0.5 Local by default, online by choice.** (Owner, 2026-09-18.)
  "Everything is local" may be dropped as an absolute, so long as the
  player chooses. The same rule covers a possible paid coach that runs
  on our hardware for players whose laptop cannot run the brain: the
  capability is the same for everyone, what is paid for is somebody
  else's computer. ROADMAP principles 5 and 6 get rewritten to say this
  when the first online feature is scheduled.
- **E0.6 The point is practice, not scrolling.** (Owner, 2026-09-18.)
  Engagement counts when it pulls the player back to improve on their
  exercises. Any social mechanic is judged on that.
- **E0.7 Record to complete is in.** (Owner, 2026-09-18.) The reward is
  the review: your own take with the notes you played, colored by how
  well you played them, over or beside the video. It is also what a
  posted take looks like, so Echora has a face nobody else has.

---

## A. The loop

- **A1 — Record to complete.** *open.* A path step can ask for a take
  as its finish line. Does every step ask, or only milestone steps?
  Proposed default: milestone steps only (end of a section, a target
  tempo reached), so recording stays an event and never a chore.
- **A2 — Single-player value first.** *open.* The take is kept on the
  player's machine and builds a progress reel: the same exercise on day
  1 and day 30, side by side. Works with an audience of zero, costs no
  hosting, needs no moderation, and is the local half of E0.3.
  Proposed default: yes, and it ships inside learning paths, before any
  server exists.
- **A3 — Posting is a second, separate act.** *decided 2026-09-18*
  (follows from E0.5). Nothing leaves the machine until the player
  posts it. The site promise changes from "nothing you play leaves your
  computer" to "nothing leaves unless you post it".
- **A4 — Takes hang off a lesson, not a global feed.** *open.* Twelve
  takes under one lesson feel alive; twelve posts in a feed feel dead.
  Density per lesson is reachable early; density per platform is not.
  Proposed default: no global feed at launch. Browse is courses and the
  takes under them.
- **A5 — Who sees a take.** *open.* Proposed default: private → the
  course's author → everyone on that lesson, the player choosing each
  time. Also the first answer to moderation and to under-age players.

## B. Where it lives

- **B1 — Web, app, or both.** *open.* Proposed default: both. The web
  side is for browsing and watching, so a creator's link works for
  someone who has never heard of Yames; playing and recording happen in
  Yames. Echora becomes the way people find Yames.
- **B2 — Accounts.** *open.* Proposed default: only to post, buy or
  sell. Yames keeps working with no account, forever.
- **B3 — Same brand or its own.** *open.*

## C. Creators and money

- **C1 — Who posts.** *open.* Anyone may. But sellers are never the
  shortage in a marketplace, buyers are, so opening the doors does not
  solve the empty room. Creators with an audience are how players
  arrive; the long tail earns once they have.
- **C2 — First outside creator.** *open.* One guitarist with 10k–100k
  subscribers authoring one pack is the cheapest real test there is,
  and it can run as soon as the pack format is importable.
- **C3 — Authoring.** *open.* Nobody re-types a lick. Import from Guitar
  Pro / MusicXML is a precondition for C2.
- **C4 — What is sold and how.** *deferred* until C2 has an answer.
  Yames stays free and no capability is ever paywalled; content is what
  costs money. A merchant of record carries tax and payouts.
- **C5 — Scope of content.** *open.* Proposed default: original
  exercises, licks and courses. Covers of released songs over released
  backing tracks stay out until there is a takedown process.

## S. Songs

The owner's older idea, documents not found on this machine as of
2026-09-18: a hybrid of Guitar Hero and Songsterr, play over the song
you are learning and see at once how you played it.

- **S1 — A song is a long exercise.** Same format, same player, same
  review as a path step. Tracked as B6 in `LEARNING_PATHS_DECISIONS.md`.
- **S2 — Whose songs.** *open.* A released song carries two rights, the
  composition (the tab) and the recording (the audio); Rocksmith and
  Songsterr pay for them and a one-person project cannot.
  Proposed default: the app ships no songs. The player imports their
  own Guitar Pro file and plays over its other tracks, over a Jam band,
  or over an audio file of their own.
- **S3 — Songs and Echora.** *open.* Proposed default: song takes stay
  on the machine or go out as a video file to places that already deal
  with the rights (YouTube). Echora hosts original material (C5).
- **S4 — Order.** *open.* Proposed default: songs come after the first
  paths release and before Echora. Learning songs is what most bedroom
  players actually want, it needs no server, and it grows the audience
  Echora will need.

## D. What learning paths must leave room for

Decide these inside `LEARNING_PATHS_DECISIONS.md`; listed here so the
reason is not forgotten.

- **D1 — B1/B2/B5 there:** packs carry a stable pack id, step ids,
  author and version, and are importable files from the first release,
  so a take can always say which step of whose course it answers.
- **D2 — B4 there:** progress storage can attach a take to an attempt.
- **D3 — The take recorder (`src-tauri/src/take.rs`) gains a camera.**
  The one real technical unknown: picture captured by the webview, sound
  by the engine, and the two have to line up. Worth a spike before A1
  is promised.
- **D4 — A take can be exported as one ordinary video file**, band and
  playing mixed, that posts cleanly anywhere. Useful on its own, and the
  upload format later.
