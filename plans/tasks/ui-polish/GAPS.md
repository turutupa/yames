# Mockup → build: the gaps that are actually there

Method: the artboards in `design/app/*.dc.html` were rendered at 1440×900 in a
browser next to the running app at the same size, and compared region by
region. Every item below was seen on screen, not inferred from the plan docs.

Two things that LOOK like gaps and are not — do not "fix" them:

- **The document title.** `PresetSaveBar` already renders the preset name, the
  Edited pill, Update and Revert. It reads "Save preset" only when no preset
  is loaded, which is correct. An earlier pass called this missing because the
  preview never loaded a preset.
- **The climb.** `DrillClimb` is built and renders the stepped columns. The
  "old mesh" is gone. What is wrong with it is styling and its neighbours,
  listed under D below.

Artboards to compare against: `Main.dc.html` (metronome at rest),
`MetronomePlaying.dc.html`, `Drill.dc.html`. Serve them from the dev server —
`http://localhost:1421/design/app/Main.dc.html` — they render without
`support.js`.

---

## M · Metronome stage — `Main.dc.html`

**M1. The section order is wrong.** Design: TEMPO → ruler → METER (+ ACCENT) →
beat dots → SUBDIVISION. Build: TEMPO → ruler → dots → a summary sentence →
SUBDIV → METER. The meter belongs above the dots because the meter is what the
dots *are*; reading "9/8" after counting nine circles is backwards.

**M2. The stage ignores half its width.** At 1440 the stage is 1207px and the
content occupies roughly the left 45% — the ruler is ~320px where the design
draws ~900px, and the right half is empty. In the design the ruler, the
subdivision row and the meter row all span the stage, and ACCENT / LAST SESSION
are right-aligned to its far edge.

**M3. The ruler.** Design: no fill; numbers *above* the ticks, era names below,
and a single vertical caret at the current tempo. Build: an accent progress bar
filling from the left, numbers below the ticks.

**M4. The dots are filled discs; the design draws rings** — outlined circles,
accent ring on group starts, filled only while that beat sounds.

**M5. The beat-count stepper is missing.** Design puts a compact `− 6 +` beside
the dots. Build has instead a text line "9 beats  3 + 3 + 3  36 clicks/bar" and
a "3 beats" caption under every group. The design has neither: the grouping is
already stated next to the meter chip, and the captions repeat what the dots
show. Keep whatever the stepper cannot express (clicks/bar is genuinely useful)
but do not keep all three.

**M6. SUBDIVISION is styled as an afterthought.** Design: a section label above
the row like TEMPO, cards ~150px wide spread across the stage, glyph large,
name in normal weight, the active card a raised panel with an accent border and
accent text. Build: a small "SUBDIV" label to the left, ~65px cards, and the
active card is a solid accent block with dark text.

**M7. No divider under the ruler.** The design separates tempo from meter with
a hairline; without it the two sections read as one run-on block.

**M8. LAST SESSION is missing** (UI_DECISIONS U2.6) — "Yesterday · 24 min ·
score 78", right-aligned at the top of the stage. `get_session_history` exists.
If the stored sessions cannot produce all three numbers, show the ones they can
and say in the commit which were not available. Do not invent a score.

**M9. ACCENT is still absent** and stays absent. Two of its three states —
"every beat", "none" — have no engine behind them, and FREE mode already is
"none". Leave U2.3 half-built; do not draw a control that cannot do anything.

## D · Drill stage — `Drill.dc.html`

**D1. A leftover tempo block heads the stage** — a large "80 / BPM" and four
empty circles, above THE PLAN. The design has no such block. The plan sentence
is the hero of this screen; delete the block.

**D2. The plan sentence is too small** — ~20px against the design's ~40px
display type, and it should span the stage.

**D3. The mode selector is in the wrong place.** Design: right-aligned on the
plan's own line. Build: left, on the "THE PLAN" label row above it.

**D4. The second plan line is missing** — "4 beats per bar · quarter notes ·
wood click". The build shows "4 beats · 9 steps · 12 repeats · 4m 23s" there
instead, which is D5's content in D4's slot.

**D5. The run stats belong right-aligned** — "9 steps · 108 bars · about
4m 21s" against the stage's right edge, not under the plan.

**D6. The climb has no legend.** Design: "▪ Last run   ▪ Tonight" at the right
of the THE CLIMB label. Build: "One column per tempo · one cell per bar".

**D7. The climb's columns are grey.** Design: accent-filled cells for tonight's
plan, a dimmer wash for last run, tempo number under each column.

**D8. The LAST RUN note is missing** — a right-hand column reading "You got
five bars into 110 before the timing came apart. That is the wall to move
tonight." (U3.3). This needs per-run history the app may not record. If it does
not, do not fake it: leave the column out and say so in the commit, so the gap
is recorded rather than papered over.

## S · Shell — `Main.dc.html`, `Drill.dc.html`

**S1. No wordmark.** Design: a small gradient mark and "yames" at the left of
the titlebar, window controls at the right. Build: controls at the left, no
wordmark.

**S2. Rail preset rows show tempo only.** Design: "Warmup  130 · 6/8" — tempo
*and* meter — with a dot marking the loaded one. Build: "Warmup  130", no
meter, no marker.

**S3. The rail's list header does not follow the mode.** In drill the design
titles it DRILLS; the build says PRESETS on both screens.

**S4. Search is a permanent field.** Design: a search icon next to `+` in the
list header, opening the field when asked for. Build: a field always taking a
row.

**S5. Practice Coach has no status.** Design: a "Ready" label at the right of
the rail row.

**S6. The transport says "— BAR" at rest**; the design says "1 BAR". You are
always about to play bar one.

**S7. The drill transport is missing three things** the design puts there:
"80 STARTS AT", a **Count-in** toggle and a **Loop** toggle. All three exist as
drill settings elsewhere; the design promotes them to the transport because
they are decided immediately before pressing Start.

**S8. The transport's right side is a "Listening" pill**; the design writes a
sentence — "Coach listens when you press play" on the metronome, "Coach stays
quiet mid-step" on the drill. The pill is a control, the sentence is an
explanation; the design wants the explanation, since input status is already a
chip in the context bar.

**S9. The drill transport's button says "Play"**; the design says "Start".

---

## Rules for this round

- Parity is still the hard rule (UI_DECISIONS U8.1): no capability may be lost.
  If a change would remove one, keep the capability and say how in the commit.
- Every user-visible string is a key in `src/locales/<lang>/<ns>.json`, all 15
  languages. `npm test` includes the coverage check.
- Gates before reporting: `npx tsc --noEmit` and `npm test`, both clean.
- Never `git add -A`. Add explicit paths. `src/main.tsx` in the orchestrator's
  checkout carries a local dev-shim import that must never be committed.
