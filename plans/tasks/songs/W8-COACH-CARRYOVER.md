# W8 — The coach's carried-over work: the small things that never started

Branch `songs-w8-coach`. Size M–L, made of S items. Roadmap §6 items 1.5,
1.6 and 1.7 — read each in full, they are the spec and name the files.
TypeScript only (`src/coach/**`, `CoachFeedMessage.tsx`, the coach
settings, locales). One commit per item, in this order; stop cleanly at an
item boundary if you run out of road, and say where.

1. **1.6 Report clarity.** The six problems carried from the old
   REPORT_UI_CLARITY plan, in `CoachFeedMessage.tsx`: stat values still
   render `toFixed(2)` where an integer percent belongs; IC/GA are
   unlabelled jargon; the timeline's "70 %" label; "semi-structured" and
   "on beat" are never defined; the score ring has no context; timing
   errors carry no units. Tooltips, not modals. Musician's words
   (`plans/WEBSITE_DECISIONS.md`, the audience rule). Gate: a snapshot
   test of `EndReportSummary`.
2. **1.5 Learning mode.** Window × 1.5, corrections demoted to the written
   tier, encouragement templates preferred; strict mode is today's
   behaviour; the setting lives beside `coachMode`. It is a presentation
   layer: scores are still computed strictly and stored. Gate: vitest on
   tier demotion; nothing in Rust moves.
3. **1.7 Polish, each its own commit:** the `preset_ceiling_hit` scenario
   wired from `detectBpmCeiling`; the cross-session pace line on the fourth
   attempt at a ceiling; `evaluateScore()` consolidated to one
   implementation; the template catalogue to ≥ 80 % slot coverage
   including `acoustic-guitar` and `piano` vocabularies (write like a
   patient session player: specific, second person, no cheerleading, no
   jargon — `plans/COACH_UX.md` B1 — and never a template that claims
   something the measurement cannot support).
4. **The open DSP question** carried in 1.7 (IC = 0.116 with MAD 62 ms in
   burst practice, 2026-05-22): you cannot capture a session, so do the
   desk half — find in `timing.rs` how that combination can arise, write
   the explanation and a proposed fixture in your report, and change
   nothing in Rust.

## Gates

build, vitest. Coverage of the template catalogue asserted by a test that
counts slots, so it cannot silently fall back below 80 %.

## Not yours

`src/coach/blocks/**` (W7 is building it tonight), any Rust, the Songs
files. `tuning-check` and `preset-recap` interventions wait for pitch and
the store respectively; leave them.
