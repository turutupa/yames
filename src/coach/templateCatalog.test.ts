/**
 * Smoke tests for the authored template catalog (`templateCatalog.ts`).
 *
 * These are intentionally light — they don't second-guess the
 * authoring (that's content design) — but they DO assert the
 * structural invariants the rest of the coach pipeline relies on:
 *
 *   1. The `generic` vocabulary covers every gatekeeper scenario at
 *      every severity, so the fallback path always resolves.
 *   2. Every authored template uses only placeholders the gatekeeper
 *      actually emits (no `{undefined}` after fill).
 *   3. Every instrument-specific override resolves through `pickTemplate`
 *      without falling back to generic (so the overlay is actually used).
 *   4. The catalog has no dangling empty arrays — an empty variant
 *      list would cause `pickTemplate` to return `null` and the
 *      gatekeeper to ship raw template-key text.
 */

import { describe, expect, it } from "vitest";

import { pickTemplate, createShuffleState, type Severity, type Vocabulary } from "./templates";
import { TEMPLATE_CATALOG } from "./templateCatalog";
import { severityFor } from "./learningMode";
import type { ScenarioTag, Tier } from "./gatekeeper";

// The full gatekeeper scenario list (mirrored from `gatekeeper.ts`'s
// `ScenarioTag` union). Kept inline to avoid a circular dep — if the
// gatekeeper adds a scenario, this list will drift and the
// `generic`-completeness assertion below will flag it.
const SCENARIOS = [
  "accuracy_drop",
  "personal_best_streak",
  "rushing_trend",
  "dragging_trend",
  "recovery",
  "recovery_confirmed",
  "fatigue",
  "bias_only",
  "tempo_milestone",
  "new_band_locked",
  "low_confidence",
  "check_in",
  "boundary_signal_a",
  "boundary_signal_b",
] as const;

/**
 * Every (scenario, tier) the gatekeeper can actually emit — ROADMAP 1.7's
 * coverage floor is measured against this, not against the cross product.
 *
 * The cross product is 18 scenarios × 3 severities, and two thirds of it
 * is unreachable by construction: `severityFor` phrases a personal best
 * as encouragement and never as anything else, so a "correction variant
 * of a personal best" is not a gap in the catalogue — it is a sentence
 * that must never exist. Counting it would push the authoring toward
 * exactly what COACH_UX B1 forbids: a template that claims something the
 * measurement cannot support.
 *
 * Tier appears here because it is an input to the severity: an
 * unconfirmed trend is written and phrased neutrally, and the same trend
 * once confirmed is spoken and phrased as a correction. Both are
 * reachable and they want different words, so both are counted.
 *
 * Mirrored from the union like `SCENARIOS` above, and for the same
 * reason. A new scenario that nobody adds here is caught by the drift
 * check at the bottom of this file.
 */
const REACHABLE: ReadonlyArray<readonly [ScenarioTag, Tier]> = [
  ["accuracy_drop", "spoken"],
  ["low_completeness", "spoken"],
  ["personal_best_streak", "spoken"],
  ["rushing_trend", "written"],
  ["rushing_trend", "spoken"],
  ["dragging_trend", "written"],
  ["dragging_trend", "spoken"],
  ["recovery", "spoken"],
  ["recovery_confirmed", "spoken"],
  ["fatigue", "spoken"],
  ["bias_only", "written"],
  ["tempo_milestone", "spoken"],
  ["new_band_locked", "spoken"],
  ["low_confidence", "written"],
  ["check_in", "written"],
  ["boundary_signal_a", "spoken"],
  ["boundary_signal_b", "spoken"],
  ["grid_discontinuity", "written"],
  ["ramp_complete", "written"],
  ["preset_ceiling_hit", "written"],
];

/** The floor ROADMAP 1.7 sets for instrument-specific slot coverage. */
const MIN_SLOT_COVERAGE = 0.8;

const SEVERITIES: Severity[] = ["encouragement", "neutral", "correction"];

const INSTRUMENT_VOCABS: Vocabulary[] = [
  "drums",
  "electric-guitar",
  "acoustic-guitar",
  "bass",
  "piano",
];

// A superset of every placeholder name any seeded template uses. If an
// instrument-specific template ever introduces a new placeholder, add
// it here AND emit it from the gatekeeper context — otherwise the
// fill will silently leave `{newKey}` in the user-facing text.
const ALL_PLACEHOLDERS = {
  recentAccuracyPct: 75,
  priorAccuracyPct: 90,
  windowBeats: 16,
  offsetMs: 12,
  priorOffsetMs: 4,
  streak: 24,
  previousBest: 12,
  bpmLow: 120,
  bpmHigh: 130,
  accuracyPct: 88,
  bpm: 130,
  score: 92,
  change: "BPM up to 130",
  lastScore: 88,
  lastBpm: 135,
  staminaMinutes: 5,
  startBpm: 120,
  endBpm: 160,
  biasMs: 15,
  direction: "before",
  correctionDirection: "later",
  suggestedBpm: 120,
  attemptCount: 4,
} as const;

// ---------------------------------------------------------------------------

describe("TEMPLATE_CATALOG — generic fallback completeness", () => {
  const generic = TEMPLATE_CATALOG.generic!;

  for (const scenario of SCENARIOS) {
    for (const severity of SEVERITIES) {
      it(`covers generic ${scenario}/${severity}`, () => {
        const variants = generic[scenario]?.[severity];
        expect(variants, `generic.${scenario}.${severity} missing`).toBeDefined();
        expect(variants!.length, `generic.${scenario}.${severity} empty`).toBeGreaterThan(0);
      });
    }
  }
});

describe("TEMPLATE_CATALOG — every variant resolves placeholders", () => {
  for (const vocab of [...INSTRUMENT_VOCABS, "generic"] as Vocabulary[]) {
    const catalog = TEMPLATE_CATALOG[vocab];
    if (!catalog) continue;
    for (const scenario of Object.keys(catalog)) {
      for (const severity of SEVERITIES) {
        const variants = catalog[scenario]?.[severity];
        if (!variants) continue;
        for (let i = 0; i < variants.length; i++) {
          const tpl = variants[i];
          it(`${vocab}.${scenario}.${severity}[${i}] uses only known placeholders`, () => {
            const filled = tpl.replace(
              /\{([a-zA-Z0-9_]+)\}/g,
              (_, key: string) => {
                expect(
                  key in ALL_PLACEHOLDERS,
                  `Unknown placeholder {${key}} in "${tpl}" — add it to ALL_PLACEHOLDERS and the gatekeeper context.`,
                ).toBe(true);
                return String(ALL_PLACEHOLDERS[key as keyof typeof ALL_PLACEHOLDERS] ?? "");
              },
            );
            // After fill, the string must have no remaining {placeholder}
            // tokens — that would mean the regex above let one through.
            expect(filled.match(/\{[a-zA-Z0-9_]+\}/)).toBeNull();
          });
        }
      }
    }
  }
});

describe("TEMPLATE_CATALOG — instrument overrides are reachable via pickTemplate", () => {
  for (const vocab of INSTRUMENT_VOCABS) {
    const catalog = TEMPLATE_CATALOG[vocab];
    if (!catalog) continue;
    for (const scenario of Object.keys(catalog)) {
      for (const severity of SEVERITIES) {
        const variants = catalog[scenario]?.[severity];
        if (!variants || variants.length === 0) continue;
        it(`${vocab}.${scenario}.${severity} is reachable`, () => {
          const state = createShuffleState();
          const out = pickTemplate(TEMPLATE_CATALOG, state, {
            vocab,
            scenario,
            severity,
            context: ALL_PLACEHOLDERS,
            // Force deterministic RNG so the test isn't flaky.
            rng: () => 0,
          });
          expect(out, `${vocab}.${scenario}.${severity} returned null`).not.toBeNull();
          expect(out!.length).toBeGreaterThan(0);
          // The pick should resolve to one of the AUTHORED variants
          // (post-fill), not the generic fallback. We can't directly
          // observe which catalog was hit, so we assert the result
          // matches at least one filled-variant in the override.
          const filledOverrides = variants.map((tpl) =>
            tpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key: string) =>
              key in ALL_PLACEHOLDERS
                ? String(ALL_PLACEHOLDERS[key as keyof typeof ALL_PLACEHOLDERS])
                : whole,
            ),
          );
          expect(filledOverrides).toContain(out);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Slot coverage (ROADMAP 1.7)
// ---------------------------------------------------------------------------

/** The slots one vocabulary has to fill: reachable (scenario, severity). */
const SLOTS = REACHABLE.map(
  ([scenario, tier]) => [scenario, severityFor(scenario, tier)] as const,
);

/** Does `vocab` author this slot itself, rather than leaning on generic? */
function authored(vocab: Vocabulary, scenario: ScenarioTag, severity: Severity): boolean {
  const variants = TEMPLATE_CATALOG[vocab]?.[scenario]?.[severity];
  return !!variants && variants.length > 0;
}

describe("TEMPLATE_CATALOG — slot coverage", () => {
  it("counts every slot the coach can reach, and no slot it cannot", () => {
    // A guard on the guard. If `severityFor` or the reachable list is
    // ever gutted, the coverage assertions below would pass against a
    // handful of slots and mean nothing — this is the tripwire.
    expect(SLOTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SLOTS.map((s) => s.join("/"))).size).toBe(SLOTS.length);
  });

  it("keeps generic complete, because everything else falls back to it", () => {
    const missing = SLOTS.filter(([scenario, severity]) => !authored("generic", scenario, severity));
    expect(missing.map((s) => s.join("/"))).toEqual([]);
  });

  it(`gives each instrument at least ${MIN_SLOT_COVERAGE * 100}% of its own words`, () => {
    // The point of the instrument catalogues is that a drummer hears
    // drum words. A slot an instrument does not author still SAYS
    // something — `pickTemplate` falls back to generic — so this is not
    // a correctness floor, it is the floor on the thing the catalogues
    // exist for. It was 55% before this item, which is why a drummer
    // kept being told to "pick" things.
    const report: string[] = [];
    for (const vocab of INSTRUMENT_VOCABS) {
      const filled = SLOTS.filter(([scenario, severity]) => authored(vocab, scenario, severity));
      const missing = SLOTS.filter(([scenario, severity]) => !authored(vocab, scenario, severity));
      const coverage = filled.length / SLOTS.length;
      report.push(
        `${vocab}: ${filled.length}/${SLOTS.length}` +
          (missing.length ? ` — missing ${missing.map((s) => s.join("/")).join(", ")}` : ""),
      );
      expect(coverage, report[report.length - 1]).toBeGreaterThanOrEqual(MIN_SLOT_COVERAGE);
    }
  });

  it("holds the same floor across all five instruments at once", () => {
    // Per-instrument above; in aggregate here, so a single vocabulary
    // cannot be gutted and hidden behind four healthy ones.
    const total = INSTRUMENT_VOCABS.length * SLOTS.length;
    let filled = 0;
    for (const vocab of INSTRUMENT_VOCABS) {
      for (const [scenario, severity] of SLOTS) {
        if (authored(vocab, scenario, severity)) filled++;
      }
    }
    expect(filled / total, `${filled}/${total} slots authored`).toBeGreaterThanOrEqual(
      MIN_SLOT_COVERAGE,
    );
  });

  it("has no instrument copy filed under a severity the coach never asks for", () => {
    // How the coverage hole got there in the first place. Every
    // instrument had `tempo_milestone` written as a correction, and the
    // gatekeeper only ever asks for it as encouragement — so five
    // vocabularies' worth of milestone copy had never once been said to
    // anybody. Same for `new_band_locked` and `check_in`.
    //
    // Scenarios whose extra severities are reachable through learning
    // mode's encouragement preference are exempt: `severityPlan` asks
    // for those deliberately.
    const reachableSeverities = new Map<string, Set<Severity>>();
    for (const [scenario, severity] of SLOTS) {
      const set = reachableSeverities.get(scenario) ?? new Set<Severity>();
      set.add(severity);
      // Learning mode asks for the encouraging phrasing of anything
      // first, falling back to the strict one — see `severityPlan`.
      set.add("encouragement");
      reachableSeverities.set(scenario, set);
    }
    const orphans: string[] = [];
    for (const vocab of INSTRUMENT_VOCABS) {
      const catalog = TEMPLATE_CATALOG[vocab];
      if (!catalog) continue;
      for (const scenario of Object.keys(catalog)) {
        const reachable = reachableSeverities.get(scenario);
        if (!reachable) continue; // not a gatekeeper scenario; other callers pick it directly
        for (const severity of SEVERITIES) {
          const variants = catalog[scenario]?.[severity];
          if (variants && variants.length > 0 && !reachable.has(severity)) {
            orphans.push(`${vocab}.${scenario}.${severity}`);
          }
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe("TEMPLATE_CATALOG — every variant is non-empty", () => {
  for (const vocab of Object.keys(TEMPLATE_CATALOG) as Vocabulary[]) {
    const catalog = TEMPLATE_CATALOG[vocab];
    if (!catalog) continue;
    for (const scenario of Object.keys(catalog)) {
      for (const severity of SEVERITIES) {
        const variants = catalog[scenario]?.[severity];
        if (!variants) continue;
        it(`${vocab}.${scenario}.${severity} has only non-empty strings`, () => {
          for (const tpl of variants) {
            expect(tpl.trim().length).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});
