/**
 * C5 — Coach Personality & Templates.
 *
 * Three pieces working together:
 *
 *   1. **Template catalogs** — `templates[instrument][scenario][severity]`
 *      lookups returning phrasing variants with `{placeholder}` slots.
 *      Plan calls for ~5 instruments × ~30 scenarios × ~3 severities =
 *      ~450 slots; full authoring is content-design work and lives in
 *      `templateCatalog.ts` (seeded with a working subset).
 *
 *   2. **Shuffle-bag selection** — draws without replacement until the
 *      bag is empty, then refills. Guarantees maximum variety before
 *      any repetition. State is per-(scenario, severity) and lives on
 *      the caller; this module only exposes the draw operation.
 *
 *   3. **Cross-scenario similarity guard** — keeps a ring buffer of
 *      the last 6 utterances and computes bigram overlap against
 *      candidates. If overlap > 0.5, the caller re-rolls (up to 2
 *      retries, then ships anyway). Catches the case where two
 *      different scenarios happen to produce near-identical wording.
 *
 * The LLM, when available, receives the FILLED template (not the raw
 * metrics) and is instructed to rephrase preserving every number.
 * That keeps the model on the "rephrase only" rail per the plan.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size of the ring buffer used by the similarity guard. */
export const SIMILARITY_RING_SIZE = 6;

/** Bigram-overlap threshold above which the candidate is rejected. */
export const SIMILARITY_THRESHOLD = 0.5;

/** Max re-rolls before shipping a candidate anyway. */
export const SIMILARITY_MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Severity gradient used across all scenarios. Per plan: same
 * observation, different tone.
 */
export type Severity = "encouragement" | "neutral" | "correction";

/**
 * The full set of vocabularies we author for. These mirror the
 * `InstrumentProfile.vocabulary` values from D0, with `generic` as
 * the always-available fallback when no instrument-specific phrasing
 * exists for a (scenario, severity) slot.
 */
export type Vocabulary =
  | "drums"
  | "electric-guitar"
  | "acoustic-guitar"
  | "bass"
  | "piano"
  | "generic";

/**
 * Scenario tags mirror the C4 gatekeeper's event tags. We keep them
 * as a free-form `string` here so adding a scenario doesn't require
 * a cross-module type update — but the canonical list lives in
 * `gatekeeper.ts`.
 */
export type ScenarioKey = string;

/**
 * One template entry. `text` may contain `{placeholder}` tokens that
 * `fillTemplate` replaces with values from the context map.
 */
export type Template = string;

/** Per-(scenario, severity) variants. */
export type SeverityVariants = Record<Severity, Template[]>;

/** Per-scenario by-severity by-vocabulary. */
export type ScenarioCatalog = Record<ScenarioKey, Partial<SeverityVariants>>;

/** Top-level by-vocabulary catalog. */
export type TemplateCatalog = Partial<Record<Vocabulary, ScenarioCatalog>>;

/**
 * Per-slot shuffle-bag state. Maps a `vocab|scenario|severity` key
 * to the remaining indexes to draw from. Reseeded when empty.
 *
 * Use `createShuffleState()` to make a fresh state — keep one per
 * session so cross-session variety is bounded.
 */
export type ShuffleState = {
  remaining: Map<string, number[]>;
  /** Ring buffer of the last N emitted utterances (newest LAST). */
  ring: string[];
};

// ---------------------------------------------------------------------------
// Public API — construction
// ---------------------------------------------------------------------------

export function createShuffleState(): ShuffleState {
  return {
    remaining: new Map(),
    ring: [],
  };
}

// ---------------------------------------------------------------------------
// Public API — lookup
// ---------------------------------------------------------------------------

/**
 * Pick a template from `catalog[vocab][scenario][severity]`. Falls
 * back to `generic` if the requested vocabulary doesn't have an
 * entry for this slot. Returns `null` if there are no templates
 * available even after fallback.
 *
 * If `modeCatalog` is provided it is checked first — before both
 * the main catalog and the generic fallback. This lets callers
 * overlay mode-specific phrasing (e.g. "default" vs "pro") without
 * polluting the shared catalog or the test iteration over it.
 *
 * Mutates `state` to track shuffle-bag draws and the similarity
 * ring. Returns the filled (placeholder-substituted) text.
 *
 * The `rng` parameter exists so tests can inject a deterministic
 * random source; production callers pass `Math.random`.
 */
export function pickTemplate(
  catalog: TemplateCatalog,
  state: ShuffleState,
  args: {
    vocab: Vocabulary;
    scenario: ScenarioKey;
    severity: Severity;
    context?: Record<string, string | number | boolean>;
    rng?: () => number;
  },
  modeCatalog?: TemplateCatalog,
): string | null {
  const rng = args.rng ?? Math.random;
  const variants =
    (modeCatalog
      ? resolveVariants(modeCatalog, args.vocab, args.scenario, args.severity)
      : null) ??
    resolveVariants(catalog, args.vocab, args.scenario, args.severity);
  if (!variants || variants.length === 0) return null;

  const key = slotKey(args.vocab, args.scenario, args.severity);
  let bag = state.remaining.get(key);
  if (!bag || bag.length === 0) {
    bag = shuffledIndexes(variants.length, rng);
  }

  let attempts = 0;
  let chosen: string | null = null;
  // Track the most recent attempt so we can "ship anyway" if either the
  // retry budget is exhausted OR the bag drains without any candidate
  // clearing the similarity guard. Without this, a small bag (size <
  // SIMILARITY_MAX_RETRIES + 1) full of similar variants would return
  // null even though the plan calls for shipping a candidate.
  let lastCandidate: string | null = null;

  while (attempts <= SIMILARITY_MAX_RETRIES && bag.length > 0) {
    const idx = bag.pop()!;
    const candidate = fillTemplate(variants[idx], args.context ?? {});
    lastCandidate = candidate;
    if (!exceedsSimilarity(state.ring, candidate)) {
      chosen = candidate;
      break;
    }
    attempts++;
  }

  // Retries exhausted or bag drained without a clean pick — ship the
  // most recent attempt rather than nothing.
  if (chosen === null && lastCandidate !== null) {
    chosen = lastCandidate;
  }

  // Bag exhausted or accepted — reseed for next draw.
  if (bag.length === 0) {
    bag = shuffledIndexes(variants.length, rng);
  }
  state.remaining.set(key, bag);

  if (chosen) {
    pushRing(state.ring, chosen);
  }
  return chosen;
}

/**
 * Draw a template for the first severity the catalogue can satisfy.
 *
 * Learning mode asks for an encouraging phrasing first and falls back
 * to the strict one (`learningMode.severityPlan` builds the list), so
 * the coach never goes silent for want of a cheerful variant. Returns
 * which severity was actually used, because that is what the debug log
 * and the tests want to know.
 *
 * A single-entry list behaves exactly like `pickTemplate`, so strict
 * stance costs nothing.
 */
export function pickTemplateForSeverities(
  catalog: TemplateCatalog,
  state: ShuffleState,
  args: {
    vocab: Vocabulary;
    scenario: ScenarioKey;
    severities: Severity[];
    context?: Record<string, string | number | boolean>;
    rng?: () => number;
  },
  modeCatalog?: TemplateCatalog,
): { text: string; severity: Severity } | null {
  for (const severity of args.severities) {
    const text = pickTemplate(
      catalog,
      state,
      { vocab: args.vocab, scenario: args.scenario, severity, context: args.context, rng: args.rng },
      modeCatalog,
    );
    if (text) return { text, severity };
  }
  return null;
}

/**
 * Push a directly-authored utterance (e.g. one the LLM produced or
 * a hand-picked fallback) into the similarity ring without going
 * through `pickTemplate`. Useful so an LLM rephrase still primes
 * the bigram guard for the next selection.
 */
export function recordUtterance(state: ShuffleState, text: string): void {
  pushRing(state.ring, text);
}

// ---------------------------------------------------------------------------
// Public API — placeholder substitution
// ---------------------------------------------------------------------------

/**
 * Substitute `{key}` tokens in `template` with values from `context`.
 * Unmatched tokens are left in place; numeric values pass through
 * `String(...)`. Stays simple on purpose — templates are authored
 * with the placeholder vocabulary the scenario emits.
 */
export function fillTemplate(
  template: string,
  context: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key: string) => {
    if (key in context) return String(context[key]);
    return whole;
  });
}

// ---------------------------------------------------------------------------
// Public API — similarity guard
// ---------------------------------------------------------------------------

/**
 * Bigram overlap between `a` and `b`, in [0, 1]. Uses lowercase
 * whitespace-split tokens; reasonable for short utterances. Returns
 * 1.0 for identical strings.
 */
export function bigramOverlap(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const bg of A) if (B.has(bg)) shared++;
  return shared / Math.max(A.size, B.size);
}

function exceedsSimilarity(ring: string[], candidate: string): boolean {
  for (const prior of ring) {
    if (bigramOverlap(prior, candidate) > SIMILARITY_THRESHOLD) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slotKey(
  vocab: Vocabulary,
  scenario: ScenarioKey,
  severity: Severity,
): string {
  return `${vocab}|${scenario}|${severity}`;
}

function resolveVariants(
  catalog: TemplateCatalog,
  vocab: Vocabulary,
  scenario: ScenarioKey,
  severity: Severity,
): Template[] | null {
  const direct = catalog[vocab]?.[scenario]?.[severity];
  if (direct && direct.length > 0) return direct;
  if (vocab !== "generic") {
    const fallback = catalog.generic?.[scenario]?.[severity];
    if (fallback && fallback.length > 0) return fallback;
  }
  return null;
}

function shuffledIndexes(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  // Fisher–Yates. We pop from the end of the returned array, so
  // shuffling produces a uniform draw order regardless of n.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pushRing(ring: string[], item: string): void {
  ring.push(item);
  while (ring.length > SIMILARITY_RING_SIZE) ring.shift();
}

function bigrams(s: string): Set<string> {
  const toks = s
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 1 < toks.length; i++) {
    out.add(`${toks[i]} ${toks[i + 1]}`);
  }
  return out;
}
