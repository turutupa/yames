# W23 — The next yames.app: practice that listens (a draft on a branch, never published by you)

Branch `site-next`, from the local branch `site-backing-tracks` (it holds
the `/backing-tracks/` page and a fix to `coachFigure.recolour()` that this
work needs). The site is static files in `docs/`, served by GitHub Pages
from `main` — **so nothing here may reach `main`: no push, no PR, no
merge.** The owner wants to SEE the reworked site before anything goes
live; the orchestrator will publish your build as a private preview link.

Owner, 2026-09-20: "let's rework the website to post the most up to date
stuff." The evaluation and the recommendation it follows are in
`plans/WEBSITE_DECISIONS.md` on the `songs-v1` branch, entry "From 'a
metronome' to 'practice that listens'" — read it there
(`C:\Users\alber\Dev\yames-songs\plans\WEBSITE_DECISIONS.md`), with every
older entry, because they are the owner's standing rules: the reader is a
musician and never a developer; **real screenshots live ONLY in the hero
fan, everything else is a drawing or a sketch**; the fan, the three claim
tiles and the feature cards are load-bearing; the site lands on Obsidian;
no invented proof; one sound clip, only on click; sell only what the app
keeps completely.

## What the app is now (claim nothing else)

Read `C:\Users\alber\Dev\yames-songs\plans\tasks\songs\HANDOVER.md`,
`plans/SONGS.md` and `plans/COACH_UX.md` there, and the v1.2.0 notes
(`git log -1 --format=%B 4657f8a`). In one breath: a metronome that does
not drift, speed drills, setlists; **Jam**, a band that follows your
changes; **Songs** — open a Guitar Pro or MusicXML file you already have,
the file's own drums, bass and keys play behind you, select a portion on
the tab and it loops at the tempo you choose, notes light as you play
them, and when you stop the tab is coloured by how it went and the coach
says one thing with its fix as a button; record the take (sound, and
picture if you want) and watch it back with the verdict on the tape; all
free, offline, no account, your own files. Songs is NOT released yet: this
draft is the site for the day it is (v1.3). Mark anything that may not
make v1.3 (video export, then-and-now) so it can be cut in one edit — keep
such claims in one clearly commented block each.

## What to build

1. **The homepage, repositioned.** One thread: *it listens*. The metronome
   becomes the first proof, not the identity.
   - Hero: the fan stays. Headline candidates, all three built and
     switchable with `?h=1|2|3` so the owner can compare in the preview
     (default 1): (1) "The practice room that listens back." (2)
     "Practise with something that listens." (3) "Everything you practise
     with. And it listens." Eyebrow and sub-line rewritten to match;
     guitar and bass first in the examples without shutting anyone out.
   - The three claim tiles stay (`< 1 ms` / `0 €` / `Offline`), copy
     checked against today's truth ("everything that runs on your computer
     is free, for good" is the money promise — write it so a paid cloud
     option later would not break it).
   - **Three rooms**, in this order, each a section with a DRAWING in the
     hand of the existing coach and Jam figures (canvas, line work, solid
     ink is Yames and dashed ink is you, follows the theme picker, still
     frame under reduced motion): **Keep time** (metronome, drill,
     setlists, hands-free — the existing cards live here), **Play with a
     band** (the Jam section as it is, with its clip), **Learn a song**
     (new: a tab line whose notes colour as a sweep passes, a selected
     portion with its handles looping, and a readout like "bars 5–8 · about
     a sixteenth early" — the review in one picture).
   - **The coach is the thread, not a fourth room**: a short band between
     the rooms and the download that says what listening means — it hears
     your timing, scores the song against the page, tells you one thing and
     sets up the fix — honest that the talking coach is beta.
   - Zen keeps its full-bleed canvas. The closing call and download stay.
   - Nav, meta description, Open Graph, keywords, all four JSON-LD blocks
     and the FAQ rewritten for the new truth (add Songs questions: which
     files, does it have songs built in — no, you bring your own, and why;
     does it listen through my interface; is my playing uploaded — never).
     `softwareVersion` and dates as placeholders the release will fill.
2. **`/guitar-pro-player/`** — a front door like `/backing-tracks/` for
   people searching for a Guitar Pro / tab player: "Play the tab. It
   listens." Same system, its own FAQ, the Learn-a-song drawing reused.
   Never name or link a tab site; say "files you already have".
3. **`/metronome/`** — the front door for people who came for a great
   metronome: the current homepage's metronome story, kept whole (does not
   drift, themes, Zen, drills, footswitch), so nothing the old page did
   well is lost.
4. Cross-links, sitemap, and one `site.js` shared by all four pages with
   homepage-only parts guarded (the way `/backing-tracks/` does it).
5. **A preview build the orchestrator can publish as one private page.**
   `node scripts/site-preview.mjs` (new) writes `site-preview/` (git-
   ignored): for EACH of the four pages a body-only HTML fragment (no
   doctype/html/head/body tags; a `<title>` and the page's `<style>`/link
   tags at the top), with every asset path made relative to the preview
   root, page-to-page links rewritten to the sibling fragment files, the
   GitHub API fetches made to fail quietly to their fallbacks (the preview
   host blocks `fetch`), and only the assets the pages actually use copied
   in (list them with sizes; keep the total under 40 MB and under 200
   files — one theme's worth of fan images is enough for a preview if the
   full set is too big, say which you kept). External resources allowed by
   the preview host: Google Fonts only; everything else must be local.

## Judge by looking

Serve `docs/` on a port of your own (a threaded server; the stock
`python -m http.server` drops connections under the fan's image burst),
capture every page headlessly with Playwright from the repo's
`node_modules` at 1360, 940 and 375 px in Obsidian and Ivory, note that
`html { scroll-behavior: smooth }` and the `.reveal` entrance animation
defeat a naive stepped scroll (force reveals visible or wait for them),
OPEN the screenshots, and describe what you saw. No console errors, no
horizontal overflow, the clip only on click, every JSON-LD block parses,
the three headline variants all fit on a phone, `npx vitest run src/shots`
green. Save captures in `site-shots\` (locally excluded, never committed)
and give the paths.

## Rules

No push, no PR, no merge, nothing to `main`. Explicit `git add` paths.
Commits in the repo's voice, ending with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Record what you
decided in `plans/WEBSITE_DECISIONS.md` as dated entries marked DRAFT.
Final message: branch and commits; the full copy of every page as plain
text; what you verified; screenshot paths; the preview folder's path, file
count and size; what you were unsure of.
