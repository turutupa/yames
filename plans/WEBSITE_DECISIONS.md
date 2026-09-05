# Website & UI copy — decisions log

Living record of design and positioning decisions for **yames.app** (`docs/`), so we don't
re-litigate settled things and don't lose the open questions.

Companion to `plans/LEARNING_PATHS_DECISIONS.md`. Design canvas (mockups, variants, headline
candidates): <https://claude.ai/code/artifact/2a4392e5-c8e2-4c1c-a330-a03f58d031f0>.
Working files for the canvas live in `design/`.

Format: **Decided** entries are settled — change them deliberately, not by drift.
**Open** entries need an answer before or during the rebuild.

---

## Audience & voice

### Decided — 2026-09-04 · The reader is a musician, never a developer

No developer-oriented language anywhere an end user reads. Specifically banned from the site,
in-app strings and store listings:

| Don't write | Write instead |
| --- | --- |
| "Sub-millisecond Rust timing" | "It doesn't drift" / "< 1 ms" |
| "Beat scheduling off the UI thread" | "Bar 400 arrives exactly where bar 1 promised" |
| "Native, not Electron" | "Opens instantly", "light enough to leave open all day" |
| "No telemetry" | "Nothing you play ever leaves your computer" |
| "A small binary" | "The app" |

**Kept:** musician-domain vocabulary is the audience's own language and stays — BPM,
subdivision, time signature, MIDI CC, footswitch, DAW, latency in milliseconds.

**Kept but demoted:** `brew` / `winget` one-liners and GPLv3 move to the footer. The people who
want them will look there; putting them in the hero tells everyone else this is a programmer's tool.

**Exempt:** `README.md`, `AGENTS.md`, `CONTRIBUTING.md` and anything else aimed at contributors
may stay technical.

---

## Positioning

### Decided — 2026-09-04 · Sell a metronome, not a coach — for now

Three reasons:

1. "Metronome" is the word a musician actually types into a search box. "Practice coach" is not.
2. It's a promise the app already keeps completely. The coach is beta; leading with it sets an
   expectation the current build has to meet on someone's very first session.
3. The coach still does its job as the section that makes someone pick *this* metronome over the
   free one they already have — it just isn't the headline.

### Open · When does the coach become the headline?

Trigger to agree on: what "polished" means for the coach (accuracy floor? a run of sessions with
no bad advice? out of beta?). When it's hit, the switch is a headline and one hero section, not a
redesign — headline candidate 05 on the canvas ("The metronome that listens back") is written for
that day and deliberately still contains the word *metronome*.

---

## Design direction

### Decided — 2026-09-04 · Direction B ("Spectrum")

Chosen over A (quiet premium, dark) and C (light technical spec sheet). Rationale: the ten themes
and seven live visuals are the thing no competitor has, and B is the only direction that leads
with them. Flashy, chromatic, heavy on real screenshots.

Load-bearing pieces, in the owner's words — do not lose these in later iterations:

- The **tilted fan of screenshots** in the hero.
- The **three claim tiles**: `< 1 ms` / `0 €` / `Offline`.
- The **feature boxes**, especially "60 to 135 without touching the mouse."

### Decided — 2026-09-04 · The site scrolls

The current one-locked-viewport layout is the main reason the site reads like a README. There is
far too much to show for one screen and nothing gets room to land.

### Decided — 2026-09-04 · No invented proof

No download counts, star counts, testimonials or awards until they're real. Trust is carried by
factual claims only: free, open source, works offline, nothing leaves your computer.

### Open · B2 (warm/amber) vs B3 (spotlight hero) vs the current B

Two single-variable variants are on the canvas:

- **B2 · Warm** — same layout, brand amber leading instead of cyan. Amber is warmer and more
  "instrument"; cyan is colder and more "software".
- **B3 · Spotlight** — same colour, one big app window instead of the fan, theme picker directly
  underneath. Trades "variety at a glance" for "the product itself, and a switch you can touch
  above the fold".

### Open · How the theme picker behaves

The row under the hero is meant to recolour the page. Click or hover? Does it also swap the hero
screenshot? Does the choice persist across page loads?

---

## Copy

### Open · Headline

Recommendation: **"Finally, a metronome you won't skip."** — leans on the existing tagline
(*Yet Another Metronome Everyone Skips*), names the problem out loud, and is ownable.

Rejected: "…you'll actually want open for two hours" — the two hours was arbitrary.
Four alternates with their bets and risks are on the canvas.

"Stop skipping the metronome." stays as the closing call to action, where a challenge works
better than it does on arrival.

### Open · Currency in the `0 €` tile

Owner wants it localised. Approach: a small locale→symbol map read from the browser
(`navigator.language`), defaulting to `$` — no server, no geo-IP service, ~10 lines. Worst case it
guesses wrong and still reads as *zero money*.

Decide: which symbols to cover, and whether the tile should instead just say **Free** (translates
everywhere, loses the numeric rhythm of `< 1 ms` / `0 €` / `Offline`).

---

## Not yet discussed

Parked so they aren't forgotten:

- Responsive / phone layout — the mockups are desktop at 1440. B's tilted fan and 3-up tile grid
  both need a deliberate phone answer.
- Light-mode site — the app ships five light themes; the site is dark only.
- Open Graph image and favicon — `docs/og-image.png` is from the old design.
- Accessibility — the gradient-clipped headline text still needs a contrast check, and the
  selected theme swatch needs a non-colour cue (it is currently glow-only). Small-label contrast
  was fixed in the mockups on 2026-09-04: `#6f6890` on `#0a0020` was ~3.9:1, now `#9089ad` (~6:1).
  Carry the corrected value into the build; do not reintroduce `#6f6890` for text.
- Changelog modal — kept from the current site, not yet designed into direction B.
