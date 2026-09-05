# UI revamp — execution plan

> **Status:** Planned, not started. Nothing in this document has been built.
> **Written:** 2026-09-04.
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
