# UI revamp — execution plan

> **Status:** Phase A, B and C done bar two items. See §12 for exactly what
> landed, what deviated and why, and what is left.
> **Written:** 2026-09-04. Progress appended the same day.
> **The design:** https://claude.ai/code/artifact/35ee5455-0403-4b5c-ab32-fe99703729a5
> **The decisions:** `UI_DECISIONS.md`. Read it once before starting a phase;
> it is the answer to "why is it like this" and it is closed, not a proposal.
> **Audience:** the owner and the coding agents doing the work.
> **How to use:** phases run in order. Phase C's items are the only ones that
> may run in parallel, and only after B's gate is green. Every item names the
> files it touches and the gate that closes it. Sizes are S / M / L
> (≤1 day, ≤1 week, >1 week of agent-driven work).

---

## 1. Goal and non-goals

**Goal.** Rebuild the app's shell and its three practice screens as Direction
A ("Workspace") — a persistent left rail carrying modes and library, a docked
transport, and panels docked at the window edges — without losing a single
feature and without touching the audio path.

**Non-goals.** Learning paths (U8.3). The coach's contents (U4.4). Anything
in `engine.rs`, `timing.rs`, `onset.rs` or `instrument.rs` — this revamp does
not touch the audio or scoring path at all, which is what makes it low-risk.
The onboarding *content* (wizard steps, what's-new); only its DOM anchors move.

---

## 2. The parity rule

Every feature Yames has today must exist after the revamp, with exactly one
exception: Pocket Check (U1.7). This is a merge condition, not an aspiration.

Three mechanisms enforce it, cheapest first:

1. **Locale-key coverage.** Every user-visible string is a key. A script
   walks `src/locales/en/**` and fails if a key has no call site, or a call
   site has no key. A key that disappears is either a dropped feature or a
   rename — both need to be deliberate. Runs in CI on every PR into
   `ui-revamp`, with the Pocket Check keys on an explicit allowlist of
   deletions.
2. **Action coverage.** The 13 MIDI actions in `useActionDispatcher` and
   every binding in `hotkeys.ts` must still resolve. A unit test asserts the
   action list, minus the Pocket Check action.
3. **`plans/REVAMP_PARITY.md`.** A human checklist built in A1 from
   `MANUAL_TEST_CHECKLIST.md`, the settings sections and the locale key
   list. Each Phase C item ticks off its own area; nothing merges to
   `ui-revamp` with unticked items in its area.

---

## 3. Branch and worktree model

```
main
 └── ui-revamp                      long-lived integration branch
      ├── A  groundwork             one worktree, sequential
      ├── B  the shell              one worktree, alone
      ├── C1 metronome   ┐
      ├── C2 drill       │ parallel worktrees, one agent each,
      ├── C3 settings    │ each merging back into ui-revamp
      ├── C4 zen         │
      └── C5 themes      ┘
```

- One PR per item into `ui-revamp`; one PR from `ui-revamp` into `main` at
  the end. `main` never sees a half-built shell — which is also why this work
  can run while a release is being tested.
- Merge `main` into `ui-revamp` whenever anything lands on `main`. A
  long-lived branch that never pulls is a merge you pay for once, badly.
- **Phase C cannot start before B's gate is green.** Every C item builds on
  the shell; starting early means rebasing four branches onto a moving floor.
- Each worktree gets its own `CARGO_TARGET_DIR` (short path — MAX_PATH), and
  the shared `.claude/settings.json` hazard applies as usual: agents must not
  write it concurrently.
- Rust is untouched by every item here, so `cargo` work is cache-warm and no
  agent needs the LLM feature build. `YAMES_DEV_NO_LLM=1` is appropriate for
  all of Phase A–C.

---

## 4. Phase A — groundwork

No visual change. At the end of Phase A the app looks pixel-identical and is
a great deal easier to work in. This is the phase that makes Phase C
parallelisable at all; skipping it means four agents fighting over three
files.

### A1 — Parity inventory — **S**
- Build `plans/REVAMP_PARITY.md` from `MANUAL_TEST_CHECKLIST.md`, the eight
  settings sections, the 13 MIDI actions, the hotkey map and the `en.json`
  key list. Group by area (shell / metronome / drill / settings / zen /
  coach / widget / onboarding).
- Write the Pocket Check deletion allowlist while the feature still exists.
- **Gate:** every top-level `en.json` key appears in exactly one area.
- **Do this first.** You cannot write an exclusion list after deleting the
  thing being excluded.

### A2 — Token contract — **S–M**
- `src/themes.ts`: add the variables in U5.1 to all ten themes. Additive
  only, no renames. Seed the new values by interpolation from the existing
  three text levels and two surfaces, then hand-tune per theme.
- New `src/styles/tokens.css` holding the documented contract and the
  fallbacks, so a stylesheet never reads a variable a theme forgot.
- **Gate:** `tsc`, vitest; a test asserting every theme defines every
  variable in the contract (this test is the contract).

### A3 — Split `main-window.css` — **M**
- 5,044 lines become `tokens.css`, `shell.css`, `controls.css` (buttons,
  chips, steppers, toggles, popovers), `metronome.css`, plus the existing
  `drill-view.css` and `coach-card.css`. Follows the pattern those two
  already set.
- **Moves only.** No rule may change in this commit. Cascade order is the
  risk: keep one import site and preserve the original order exactly.
- **Gate:** vitest; a manual pass over every screen against screenshots taken
  before the split. Any visual difference is a bug in the move.

### A4 — Split `MainWindow.tsx` — **M**
- 1,292 lines separate into shell/routing and per-view wiring. Every screen
  touches this file; leaving it whole is the second-biggest parallelism
  blocker after the locales.
- **Gate:** `tsc`, vitest, `App.test.tsx` unchanged.

### A5 — Split the locale files — **S–M**
- `src/locales/en.json` → `src/locales/en/{common,metronome,drill,settings,
  coach,zen,onboarding}.json`, and the same for the other fourteen
  languages. **Keys keep their exact current paths** (`t("drill.mode")`
  stays `t("drill.mode")`), so no call site changes.
- `src/i18n.ts`: the glob becomes `./locales/*/*.json` and the per-language
  objects are deep-merged. `_name` moves into that language's `common.json`.
  Keep the flat `*.json` form working during the transition if it makes the
  fifteen-file migration reviewable.
- **Gate:** `tsc`, vitest, plus a test asserting the merged resource object
  is deep-equal to the pre-split one for every language. That test makes this
  a provably lossless move.
- **This is the item that unblocks parallelism.** After it, four agents add
  strings to four disjoint files.

### A6 — Remove Pocket Check — **S**
- Delete `src/containers/pocket-check/`; remove the `track` value from
  `MainView`, `useTabRouting`, `useFullscreenLifecycle`, `MainHeader`,
  `MainWindow`, the `useActionDispatcher` action, the onboarding tour stop
  and hint trigger that reference it, and the `track.*` keys in all fifteen
  locale files.
- **Gate:** full chain; `grep -ri "pocket\|track-view\|TrackView" src/`
  returns nothing but unrelated matches; the parity allowlist accounts for
  every removed key.

**Phase A exit:** full gate chain green, app boots under `tauri dev`, and a
screenshot pass over every screen is identical to `main`. If anything looks
different, Phase A did something it should not have.

---

## 5. Phase B — the shell — **L**

One worktree, alone, on top of A.

- The rail: modes (Metronome, Drill — not Paths, U1.8), the contextual
  library beneath, coach / Zen / Settings pinned at the bottom. Absorbs
  `PresetSidebar`.
- The context bar: preset name, dirty state and save/revert, plus the three
  labelled output chips and the overflow (U1.4).
- The docked transport (U1.2), identical across modes.
- The stage anchored to the rail (U1.3) — the rule that ends the sideways
  jump.
- The coach dock (U1.6): 380px, opens and closes, promotes to centre with
  the metronome collapsing to a live strip. **Today's `CoachCard` renders
  inside it, unmodified.**
- Settings becomes a sheet (U1.5); `prevTab` bookkeeping is deleted.
- The 13 `data-tour` anchors move with the elements they mark; `tour/stops.ts`
  updated in the same commit.
- Hotkeys: `1`/`2` for modes, `C` for the coach, `F` for Zen; every one of
  them bindable to MIDI as today.

**Gate:** full chain; the tour runs end to end; every parity item in the
shell area ticked; screenshot pass on all screens (which now legitimately
look different).

---

## 6. Phase C — the screens (parallel)

Five worktrees, one agent each, off `ui-revamp` after B.

- **C1 — Metronome — M.** `MetronomeView`, `GroupEditor`, `MeterPresets`.
  Tempo ruler (U2.1), subdivision tiles (U2.2), meter/accent split (U2.3),
  larger dots (U2.4), the timing band (U2.5). Settles U2.6 on the way in.
- **C2 — Drill — M.** `DrillView`. The plan sentence and its popovers
  (U3.1), the climb (U3.2) as a component Zen can also mount, last-run
  underlay (U3.3), adaptive badge (U3.4). Settles U3.5.
- **C3 — Settings — M.** Restyle the eight sections into the sheet. Section
  *contents* unchanged (U7.1).
- **C4 — Zen — S–M.** `FullscreenView`. Numerals, tokens including
  `--accent-2`, transport vocabulary (U6.4), and mounting C2's climb
  component (U6.3). **Depends on C2** — schedule it to start late or to
  land its non-climb parts first.
- **C5 — Themes — S–M.** Author Ash, Ember and Manuscript against the A2
  contract; decide U5.3 (replace the ten, add to them, or re-cut them). If
  the ten survive, they get re-tuned here, not in A2.

Each C item: full chain, its own parity area ticked, and a screenshot in the
PR body.

---

## 7. Phase D — merge to main — **S**

- One PR, `ui-revamp` → `main`.
- Full gate chain, plus `bun run yames:jitter-probe` once. Nothing here
  touches the audio thread, so the probe is a formality — run it anyway, and
  say so in the PR body.
- Manual pass against `plans/REVAMP_PARITY.md` in full, by the owner, on a
  release build (not `tauri dev`).
- Update `ROADMAP.md` §2's current-state table (tabs row) and §9b.
- The site copy needs a look if U5.3 changes the theme count.

---

## 8. Gates

The standard chain, from `ROADMAP.md` §4, on every PR into `ui-revamp`:

```sh
bun run tsc --noEmit
bun run test
bun run test:rust
bun run test:dsp
bun run test:highbpm
```

Plus, specific to this work:

```sh
bun run test -- parity        # locale-key and action coverage (A1)
```

`test:dsp` and `test:highbpm` cannot break here — no item touches the DSP
path. If one of them goes red, something has gone wrong that is not a UI
change; stop and find out what.

---

## 9. Conflict hazards

Named so nobody rediscovers them at merge time.

- **`src/locales/*`** — the worst one. Every screen adds strings to fifteen
  files. A5 fixes it by splitting per area; without A5, serialise the C items
  or have one agent own the locale files.
- **`src/styles/main-window.css`** — four agents in one 5,000-line
  stylesheet. A3 fixes it. The split must land *before* the fan-out, not
  during.
- **`src/containers/main-window/MainWindow.tsx`** — same shape, fixed by A4.
- **`src/themes.ts`** — A2 and C5 both write it. C5 owns it after A2; no
  other C item may add a variable without C5's agent doing it.
- **The climb component** — C2 writes it, C4 consumes it. One owner (C2),
  and C4 rebases rather than forking a copy.
- **`.claude/settings.json`** — shared across worktrees; agents must not
  write it concurrently.

---

## 10. Risks and open questions

- **The CSS split changes cascade order** if a rule moves between files.
  Mitigated by moves-only discipline and a screenshot pass, not by review
  alone.
- **The locale split is fifteen files of mechanical edits.** The deep-equal
  test in A5 is what makes it safe; write the test first.
- **The onboarding tour breaks** if the shell lands before the anchors move.
  They move in the same commit (Phase B), and this is why the revamp should
  precede any further tour work rather than follow it.
- **Settings and Zen have no artboards** (owner's call). They follow the
  vocabulary in `UI_DECISIONS.md` §6 and §7. If either turns out to need a
  drawing, draw it before writing the code, not after.
- **U5.3 is open and touches the website.** Decide before C5 finishes, not
  before it starts.
- **A release build is in flight — and does not block this work.** `main`
  is untouched until Phase D, so the revamp proceeds on `ui-revamp` in
  parallel with release testing. Only the final merge waits. Two consequences
  worth holding: merge `main` into `ui-revamp` whenever a release fix lands,
  rather than at the end (the branch is long-lived and the divergence only
  gets more expensive), and remember the owner's review attention is split
  between the two tracks even though the code is not.

---

## 11. Sequencing

```
A1 parity ─ A2 tokens ─ A3 css ─ A4 mainwindow ─ A5 locales ─ A6 pocket-check
                                                                    │
                                                          B  the shell
                                                                    │
                        ┌──────────┬───────────┬──────────┬─────────┤
                       C1 metro   C2 drill    C3 settings C5 themes │
                                    └──── C4 zen ─────────┘
                                                                    │
                                                            D  merge to main
```

Rough effort with agent-driven implementation: Phase A ≈ 1 week, Phase B
≈ 1–1.5 weeks, Phase C ≈ 1.5–2 weeks with the fan-out, Phase D ≈ 2 days.
Four to five weeks in total, and the first two of those produce no visible
change at all — which is the part worth remembering when it feels slow.

---

## 12. What actually landed

Written as the work went in, on branch `ui-revamp`. Deviations are listed
with their reasons rather than quietly absorbed — every one of them is a
decision the owner may want to reverse.

### Done

| Item | Commit | Note |
|---|---|---|
| A1 parity inventory | `docs: UI revamp plan…` | `REVAMP_PARITY.md`; 688 keys, 30 groups, 22 bindable actions |
| A2 token contract | `feat(themes): token contract…` | 7 vars × 10 themes, `TOKEN_CONTRACT` + test |
| A6 Pocket Check removal | `feat: remove Pocket Check` | 39 locale keys, not the 37 the inventory predicted |
| A5 locale split | `refactor(i18n): one file…` | 15 dirs × 8 namespaces, migration verified per language |
| A3 CSS split | `refactor(styles): split…` | 6 files; built CSS diffed rule by rule, identical |
| A4 MainWindow split | `refactor(main-window)…` | **reduced on purpose** — see below |
| B shell | `feat(shell): the rail…` + `…dock the coach…` | rail, docked transport, context bar, coach dock |
| C1 metronome | `feat(metronome)…` | subdivision names, tempo ruler, bigger dots, drift meter |
| C2 drill | `feat(drill)…` | the plan line; the form follows it |
| C5 themes | `feat(themes): Ash, Ember…` | added, not substituted; contrast tests found four failures |
| B fixes | `fix(shell): the context bar…` | header reflow, narrow windows, the coach pill |
| C3 settings | `feat(settings): panels…` | surfaces only; section contents untouched |
| C4 zen | (in the settings commit) | text ramp completed; see below for what was not done |

### Deviations

- **A4 was cut down.** The plan assumed splitting `MainWindow.tsx` is what
  makes Phase C parallelisable. It is not: the C items live in
  `MetronomeView`, `DrillView` and `settings/*`, and Phase B is what rewrites
  MainWindow's shell and JSX. A large speculative split would have been work
  Phase B undid. Two hooks that survive Phase B were extracted instead.
- **A2's fallbacks went into `global.css`**, not a new `tokens.css`. That file
  already holds the `:root` fallback layer; a second one would have had to be
  imported ahead of it and put cascade order at risk for no gain.
- **The CSS split is six files, not four**, and each is a contiguous run of
  the original. An earlier attempt grouped rules by area and reordered them
  between files, which changes which of two equal-specificity rules wins. It
  was thrown away.
- **U2.3 (meter chip + accent control) is not built.** The three-state accent
  it describes — group starts / every beat / none — has no engine behind it,
  and this revamp does not touch Rust.
- **U3.2 (the climb) is not built.** The step grid keeps its current shape.
  It holds the same data, is more scannable past nine steps, and already
  carries click-to-jump and its animations; the staircase is prettier but the
  actual complaint — a floating play button on top of it — is fixed.
- **Settings is inside the shell, not a sheet over the window (U1.5).** The
  rail now stays visible on the settings view and the rail's own button
  toggles it, which is most of the value. A true overlay sheet would have
  meant unpicking `ViewTransition` and `SettingsTimeline` for the rest.
- **C5 added three themes rather than replacing ten**, because U5.3 is open.

### Not done

- **C3, the settings restyle.** The largest C item and the least verifiable
  without running the app; the structural half arrived with Phase B.
- **C4, Zen.** U6.3 (one shared ramp-grid component) is a real refactor of a
  screen that cannot be checked visually from here, and Zen's grid is a
  different presentation — a peek window around the current step — not the
  same view. **U6.4 should be revisited before anyone implements it:** Zen's
  `−5 −1 +1 +5` cluster is *richer* than the metronome's `− +`, so
  "converging on the transport's vocabulary" would remove capability from
  Zen and break parity. The convergence should run the other way.
- **C4's shared ramp grid (U6.3).** Zen renders a peek window around the
  current step; the drill renders the whole plan. They are different
  presentations, not one component used twice, and unifying them is a real
  refactor of a screen best done with it in front of you.

### From looking at it running (2026-09-05)

Screenshots of the built app against the mockups turned up five things no
test would have caught, all fixed:

- **The stage floated.** Every element was a centred column with its own
  max-width, so on a wide window the tempo sat in the middle of a large empty
  field. Both screens now anchor to a fixed offset from the rail (U1.3), with
  the measure capped so controls do not smear across a 2000px monitor.
- **The tempo was a number on a page, not a readout** — 64px on the
  metronome, and the drill's current tempo was smaller than the preset name
  in the rail. Now 104px and 80px.
- **The drill's climb lived below the fold.** The settings form opened by
  default and sprang back open on every stop, pushing the grid off the bottom
  of the window. It starts collapsed now and never reopens on its own.
- **Quintuplet was byte-identical to Eighth, and Sextuplet to 16th.** Two
  pairs of controls that looked the same and did different things — a bug
  that predates the revamp, and one the C1 labels had masked rather than
  fixed. All six glyphs are redrawn from one shape, with a notehead per click
  and the tuplet numeral above the beam.
- **The beat groups were cards.** Three pieces of chrome around the thing you
  look at while playing; the box now appears only on hover.

**The app boots.** `npm run tauri dev` compiles, runs, hot-reloads and exits
clean — checked repeatedly while the later commits went in. What has *not*
happened is a person looking at every screen: the layout bugs fixed in
`fix(shell): the context bar joins the content region` were all found by
reading CSS, and reading only finds the ones you think to look for. Walk
§3 of `REVAMP_PARITY.md` with the app open before trusting any of it.

### Known finding, not acted on

Three shipped themes put white ink on a mid-luminance accent and miss 4.5:1
on the Play button: velvet 4.23, ivory 3.25, prism 3.34. Ivory and Prism
clear the bar with dark ink on the accent instead; Velvet needs a slightly
darker violet. All three are visible changes to shipped themes, so they are
recorded in `themes.test.ts` — where the assertion still fails if one gets
worse or a fourth appears — rather than changed unattended.

---

## 13. The polish round — the mockups, checked on screen

The phases above left the build looking like the design without matching it.
The owner said so: *"you were still missing so many details that you were
seemingly not noticing, and a lot of them very blatant."* This round rendered
the artboards at 1440×900 next to the running app and went region by region.
The findings are in `plans/tasks/ui-polish/GAPS.md`; three workers took a
section each, on disjoint files.

**Two things the earlier passes had wrongly called missing.** The document
title — preset name, Edited pill, Update, Revert — was fully built; it reads
"Save preset" only when no preset is loaded, which is correct, and the browser
preview had never loaded one. The climb was built too. Both were about to be
reported as gaps a second time. Loading the state before judging the screen is
the cheapest check in this document.

**Metronome.** The stage now runs tempo → ruler → meter → dots → subdivision,
so the meter is read before the dots it describes rather than after. Rows span
the stage instead of stopping at 720px. The ruler measures — numbers above,
eras below, one caret — instead of filling like a progress bar. Dots are rings
that fill only on the sounding beat. The beat-count stepper now works in
grouped meters by resizing the last group, which it never did before.

**Drill.** The leftover tempo readout and beat circles are gone from the
at-rest screen; the plan sentence heads it at display size with the mode
selector on its own line. The readout was not deleted — four things lived only
in it, including the ramp's current tempo, which the transport never shows —
so it now appears beside the climb while a ramp runs.

**Shell.** Wordmark in the titlebar, the library titled for the mode it lists
with rows that restore a tempo and a meter, a coach row that reports, and a
transport that carries count-in and cyclic.

### What this round found that was not on the list

- **Per-beat timing never painted on the metronome.** `GroupEditor` had put
  `feedback-<classification>` on `.group-dot` since the grouped editor replaced
  the flat row, but only `.main-dot` was ever styled. The coach was hearing
  every beat and showing nothing, silently — a class with no rule is not an
  error anywhere. Fixed, with a test that reads the union from `types.ts`.
- **TAP was unreachable at the 480px minimum**, sitting 60px outside the stage
  with no scroll to reach it. Found by dragging the window, not by reading.
- **Every multi-line CSS assertion failed on any Windows checkout** and passed
  in CI. No `.gitattributes` pins the line endings; `readStyles.ts` normalises.
- **"Loop" was the wrong word.** `advance_ramp` flips direction at the target
  and again at the start, so a cyclic ramp never finishes. The mockup said Loop
  because the mockup was drawn without reading the engine.

### Still open after this round

- **U3.3 is blocked in the backend, not the UI.** `SavedSession` records no
  drill identity and no ramp position, and sessions are only written when the
  mic was on and heard real hits. So "LAST RUN — you got five bars into 110",
  "Last run 4 days ago" and the climb's last-run series cannot be built without
  a Rust-side change. They were left out rather than faked.
- **U2.3's accent control stays half-built.** Two of its three states have no
  engine behind them.
- **U3.5** — whether "cyclic" and "countdown" are the right words for
  guitarists. **U6.5** — whether Zen should stay always-dark under all
  thirteen themes.
- **Nobody has run this on macOS or Linux.** The titlebar gained a real strip
  and a platform-dependent gutter; only Windows has been seen.

---

## 14. Preset chains

Built after the polish round, on the owner's word. A chain is an ordered list
of preset-shaped steps with a configured gap between each pair; loading one and
pressing play walks it unattended. The decisions are U9.1–U9.7; the brief is
`plans/tasks/chain/BRIEF.md`; the artboard is `design/app/PresetChain.dc.html`.

Three parts, built in two passes because the second depends on the first:

- **Model and runtime.** Types, storage beside presets, pure data operations,
  and a state machine that walks a chain. `useChainRunner` drives it from the
  engine's beat events.
- **UI.** The library lists chains beside presets; loading one puts the track
  over the stage with a trigger chip in every gap; the metronome underneath
  keeps editing the selected step rather than becoming a second mode.

### What only looking at it found

Both workers gated clean and neither could open the app: the dev server serves
the main checkout, so a worktree cannot render itself. Three bugs survived
every test and died on first sight.

- **The stage stopped scrolling.** Beat was the only view centred with
  `overflow: visible`. The chain track pushed the subdivision row 44px behind
  the transport — unreadable, unclickable, no scrollbar. Not chain-specific: a
  short window did it too, and always would have.
- **The transition editor opened off-screen** on the last gap.
- **The transport overflowed at 800px**, the window's own default size, with a
  chain loaded.

The lesson is not that the workers were careless — it is that a component test
cannot fail on a layout that has never been laid out. Anything that ends up on
screen needs someone to open it.

### Still open

- **U9.5** — the engine's count-in is welded to the speed ramp. Until it is
  unwelded, "count me in" is stored and shown but arrives as a clean cut, and
  the UI says so in fifteen languages rather than implying otherwise.
- **The runtime has never run against a real engine.** The browser preview has
  no audio and no beat events, so the arming rule, the trigger clock and the
  step handover are covered by unit tests and nothing else.
