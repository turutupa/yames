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

### Decided — 2026-09-04 · B3 (spotlight hero) rejected, the fan stays

The tilted fan is the hero. B3 traded it for a single large app window; the owner wants the fan.

### Decided — 2026-09-04 · The site lands on Obsidian (warm/amber)

Settled by the favicon. The mark is the one asset that cannot follow the theme picker — it is
fixed across the tab, the dock and every store listing — so it carries the brand, and the brand is
amber. Landing the page on Aurora would mean the tab icon and the page disagree at the moment of
arrival, which is the most visible inconsistency available.

It stays a one-word change: `LANDING_THEME` in `docs/site.js`, plus the `:root` token block in
`docs/style.css` (which holds Obsidian so the page is still right if the pre-paint script never
runs), the `data-theme` on `<html>`, the pre-paint fallback, and the LCP image preload.
`?theme=<id>` still overrides for testing, and a visitor's own pick still wins on their next visit.

### Decided — 2026-09-04 · The mark

A Y knocked through a filled amber tile. Chosen over a metronome-silhouette mark, which is more
ownable but turns to mush at 32px — and a favicon is seen at 16-32px essentially always. A filled
colour block also stands out in a tab strip where nearly every other icon is a dark tile.

`docs/favicon.svg` is the source of truth; `scripts/make-icons.py` renders the PNG sizes from the
same geometry. There is no SVG rasteriser on this machine, so those numbers are duplicated —
change both together.

### Decided — 2026-09-04 · How the theme picker behaves

Click, not hover — hover fires by accident and the whole page recolouring by accident is
unpleasant. Choosing a theme:

1. rolls the fan so that theme's card lands centre-stage (the "slot machine"),
2. crossfades every page token to that theme's palette,
3. recolours the live Zen canvas,
4. persists to `localStorage`.

Arrow keys move through the picker, which is marked up as a radiogroup. The selected swatch has a
dot under it as well as a glow, so the selection is not carried by colour alone.

---

## Copy

### Open · Headline

Recommendation: **"Finally, a metronome you won't skip."** — leans on the existing tagline
(*Yet Another Metronome Everyone Skips*), names the problem out loud, and is ownable.

Rejected: "…you'll actually want open for two hours" — the two hours was arbitrary.
Four alternates with their bets and risks are on the canvas.

"Stop skipping the metronome." stays as the closing call to action, where a challenge works
better than it does on arrival.

### Decided — 2026-09-04 · Currency in the price tile is localised

`CURRENCY_BY_REGION` in `docs/site.js` maps the region from `navigator.language` to a symbol,
defaulting to `$`. Symbol leads for $/£/¥/₹ and trails for the rest, which is how those currencies
are actually written. No server, no geo-IP service. Zero is zero in every currency, so a wrong
guess still reads as *no money*.

Still worth revisiting if it ever looks odd in the wild: the tile could just say **Free**, which
translates everywhere but loses the numeric rhythm of `< 1 ms` / `0 €` / `Offline`.

---

## Not yet discussed

Parked so they aren't forgotten:

- Motion is implemented and all of it sits behind `prefers-reduced-motion: reduce`: staggered
  entrance on load, scroll-triggered reveals, parallax on the hero glows and the fan, the eyebrow
  dot pulsing at 120 BPM, and the Zen canvas (which also stops when off-screen or when the tab is
  hidden, so it costs nothing in the background).
- Responsive / phone layout — the fan and the tile grid now collapse sensibly and there is no
  horizontal overflow at 375px, but the phone layout deserves a proper look on a real device.
- Light-mode site — the app ships five light themes; the site is dark only.
- Open Graph image — redrawn 2026-09-04, set in the site's own faces, regenerable with
  `scripts/make-og-image.py`. It still shows the Aurora palette while the site now lands on
  Obsidian; worth deciding whether the card should be warm too.
- `src-tauri/icons/` still holds the old desktop app icon, so the website and the app now
  disagree. The app icons should be regenerated from the new mark.
- Accessibility — the gradient-clipped headline text still needs a contrast check, and the
  selected theme swatch needs a non-colour cue (it is currently glow-only). Small-label contrast
  was fixed in the mockups on 2026-09-04: `#6f6890` on `#0a0020` was ~3.9:1, now `#9089ad` (~6:1).
  Carry the corrected value into the build; do not reintroduce `#6f6890` for text.
- Changelog — rebuilt against the new markup and reachable from the version badge in the footer.
  The old release *timeline* rail was dropped; add it back only if it is missed.
- The seven Zen visuals were rewritten for a single full-bleed canvas. The old page drew them
  across two canvases with an "amplify" pass that no longer has anything to amplify.
