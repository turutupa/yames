/**
 * C2 — Context-Aware Greetings
 *
 * The greeting is the user's first interaction every session. The plan
 * lays out a 4-tier hierarchy of greeting quality based on how much
 * context we have:
 *
 *   1. Preset with history (≥3 sessions): reference their trend, last
 *      score, suggest a target.
 *   2. Preset, first or second time: reference the preset by name and
 *      set expectations.
 *   3. No preset, has recent sessions (≥1 in last 7 days): reference
 *      recent work without naming exercises.
 *   4. No preset, no recent history: simple, warm, no assumptions.
 *
 * Two important behaviours from the plan:
 *
 *   * **Async race condition** — session history is loaded async from
 *     `tauri-plugin-store`. The greeting builder must wait at most
 *     500ms; if the load times out, we emit tier-4 immediately. If
 *     history arrives AFTER the greeting was already shown, we do NOT
 *     replace the greeting (avoids "greeting flicker" bug). The hook
 *     can surface a quiet "history loaded" log line if it cares.
 *
 *   * **Preset-name semantics** — the template engine treats preset
 *     names as opaque labels. No keyword matching. The LLM (when used
 *     to rephrase) receives the name in context; meaningful names get
 *     used naturally, meaningless ones get ignored.
 *
 * The template returned here is a complete, accurate, specific message
 * on its own. C4 (smart-coaching-timing) can later hand it to the LLM
 * for a paraphrase, but the un-paraphrased template MUST be safe to
 * ship verbatim if the LLM is unavailable.
 */

import type { SavedSession } from "../types";

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export type GreetingTier =
  | "preset-with-history"
  | "preset-first-time"
  | "no-preset-recent-history"
  | "no-preset-cold";

/** Minimum sessions before we consider a preset to have "history". */
export const PRESET_HISTORY_THRESHOLD = 3;

/** "Recent" window for tier 3 — days. */
export const RECENT_DAYS = 7;

/** Solid-work week: ≥this many sessions in the past 7 days. */
export const SOLID_WORK_SESSIONS = 3;

/** Solid-work week: median session score must be at least this. */
export const SOLID_WORK_MEDIAN_SCORE = 75;

/** Max delta the "suggest a target" tier may ask for above last score. */
export const SUGGEST_TARGET_DELTA = 3;

/** BPM tolerance for "struggled with this tempo" checks. */
export const TEMPO_MATCH_BPM_TOLERANCE = 5;

/** "Struggled with this tempo" must be within this many days. */
export const STRUGGLE_LOOKBACK_DAYS = 14;

/** "Struggled with this tempo" score floor. */
export const STRUGGLE_SCORE_THRESHOLD = 70;

/** Plan async budget: emit a fallback greeting if history hasn't loaded. */
export const HISTORY_LOAD_TIMEOUT_MS = 500;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GreetingInput {
  presetId?: string;
  /** Opaque label. NOT parsed for meaning by the template engine. */
  presetName?: string;
  bpm: number;
  /** May be undefined if history hadn't loaded in time. */
  history?: SavedSession[];
  /** Override for tests; defaults to `Date.now()`. */
  now?: number;
  /**
   * Variant picker for the tiers that ship multiple equivalent
   * phrasings (tier-3, tier-4 today). Defaults to `Math.random` so a
   * fresh session pulls a different greeting from the last one; tests
   * pass a fixed RNG (e.g. `() => 0`) to lock onto a specific variant.
   * Tier-1/2 greetings don't use this — they're already keyed off
   * preset + score values so they vary naturally.
   */
  rng?: () => number;
}

/**
 * Tier-4 (cold-start) variants. Plural so the same player doesn't see
 * the same opener two sessions in a row when they're playing without a
 * preset and without recent history (rare but jarring). All variants
 * are warm, short, and non-presumptive — pick one at random per
 * `renderGreeting` call. The first entry is the canonical
 * plan-original copy and stays first so a deterministic-RNG test
 * (`rng: () => 0`) still reads the plan's verbatim greeting.
 */
const TIER4_COLD_VARIANTS = [
  "Hey — good to see you. Play when you're ready and I'll start picking up your timing.",
  "Hey. Take your time tuning up — I'll start listening when you do.",
  "Welcome in. Hit play whenever you're warm and we'll go from there.",
  "Good to have you. Start when you're ready — I'm listening.",
] as const;

/**
 * Tier-3 "solid work" variants — fires when the player has ≥3 sessions
 * in the last 7 days at a respectable median score. All variants
 * include the literal substring `solid work` so the existing
 * `greeting.test.ts` assertion (`expect(out.text.toLowerCase())
 * .toContain("solid work")`) keeps passing across any rng pick. Don't
 * rename the phrase without updating the test.
 */
const TIER3_SOLID_VARIANTS = [
  "Welcome back. You've been putting in solid work this week.",
  "Back at it — solid work showing up this week.",
  "Welcome back. That's solid work stacking up the past few days.",
] as const;

/**
 * Tier-3 generic variants — the player has recent activity but isn't
 * hitting the solid-work bar (low session count or low median). None
 * of these may contain `solid work` (the negative test at
 * `greeting.test.ts:291` enforces that).
 *
 * No numbers and no claims about what was practised: this tier knows only
 * that *something* was saved in the last week, which may have been a
 * learning Session at a tempo the metronome never showed. "Let's keep
 * building on this week's reps" claimed reps, and a model paraphrasing it
 * filled in "120 BPM" (the metronome default). Every line here must be true
 * of any player with one recent session.
 */
const TIER3_GENERIC_VARIANTS = [
  "Welcome back. Pick up where you left off.",
  "Back again — good to see you. Play when you're ready.",
  "Welcome back. Start when you're ready and I'll listen in.",
] as const;

function pickVariant<T>(
  variants: readonly T[],
  rng: () => number = Math.random,
): T {
  // `Math.floor(rng() * n)` — uniform integer in [0, n). Clamp `rng`
  // output defensively in case a caller's seed function returns
  // exactly 1.0 (would index out-of-bounds on the strict reading).
  const idx = Math.min(variants.length - 1, Math.floor(rng() * variants.length));
  return variants[idx];
}

export interface GreetingOutput {
  tier: GreetingTier;
  /** Final string to display. Safe to ship as-is if no LLM available. */
  text: string;
  /**
   * Optional structured context for C4's LLM-paraphrase path. The LLM
   * is told to preserve every number and fact here — it only varies
   * the wording.
   */
  context: {
    presetName?: string;
    bpm: number;
    sessionCount?: number;
    lastScore?: number;
    lastBpm?: number;
    personalBest?: number;
    targetScore?: number;
    /** Mean score across all sessions for this preset (rounded). */
    avgScore?: number;
    medianScore7d?: number;
    sessions7d?: number;
    onDowntrend?: boolean;
    playedWithin4h?: boolean;
    strugglePriorScore?: number;
  };
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

/**
 * Pick a greeting tier from the available context. Pure function — no
 * I/O, no clocks except via `input.now`.
 *
 * Tier-4 (cold) is the safe default any time we lack data.
 */
export function pickGreetingTier(input: GreetingInput): GreetingTier {
  const history = input.history ?? [];

  if (input.presetId) {
    const presetSessions = history.filter((s) => s.presetId === input.presetId);
    if (presetSessions.length >= PRESET_HISTORY_THRESHOLD) {
      return "preset-with-history";
    }
    // 1st or 2nd time on this preset.
    return "preset-first-time";
  }

  // No preset selected. Look at recent activity.
  const cutoff =
    (input.now ?? Date.now()) - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const recent = history.filter((s) => s.timestamp >= cutoff);
  if (recent.length >= 1) {
    return "no-preset-recent-history";
  }
  return "no-preset-cold";
}

// ---------------------------------------------------------------------------
// Greeting rendering
// ---------------------------------------------------------------------------

/**
 * Render the greeting text and structured context for the chosen tier.
 *
 * The text returned here is intentionally specific and number-rich —
 * "Back at $name — you hit 88% at 135 BPM last time." rather than the
 * old generic "Session started — $name." The LLM, if used, will
 * paraphrase this while preserving the numbers.
 */
export function renderGreeting(input: GreetingInput): GreetingOutput {
  const tier = pickGreetingTier(input);
  const now = input.now ?? Date.now();
  const history = input.history ?? [];

  switch (tier) {
    case "preset-with-history": {
      const sessions = history.filter((s) => s.presetId === input.presetId);
      const last = sessions[0]; // history is newest-first per save_session impl
      const personalBest = Math.max(...sessions.map((s) => s.report.score));
      const lastScore = last.report.score;
      const lastBpm = last.bpm;
      const avgScore = Math.round(
        sessions.reduce((sum, s) => sum + s.report.score, 0) / sessions.length,
      );
      const targetScore = Math.min(
        personalBest,
        lastScore + SUGGEST_TARGET_DELTA,
      );
      const playedWithin4h = now - last.timestamp <= 4 * 60 * 60 * 1000;
      const onDowntrend = isOnDowntrend(sessions);

      // Struggle detector: prior session at this preset within 14d at
      // current BPM ±5 that scored under 70.
      const struggleCutoff = now - STRUGGLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
      const struggleHit = sessions.find(
        (s) =>
          s.timestamp >= struggleCutoff &&
          Math.abs(s.bpm - input.bpm) <= TEMPO_MATCH_BPM_TOLERANCE &&
          s.report.score < STRUGGLE_SCORE_THRESHOLD,
      );

      // If user just played within 4h AND is on a downtrend, the plan
      // says: suggest *matching* last attempt, not beating it.
      let text: string;
      if (playedWithin4h && onDowntrend) {
        text = labelOrFallback(
          input.presetName,
          (name) =>
            `Round two on ${name}. Match the ${lastScore} from earlier and we're in business.`,
          () =>
            `Round two. Match the ${lastScore} from earlier and we're in business.`,
        );
      } else if (struggleHit && struggleHit !== last) {
        text = labelOrFallback(
          input.presetName,
          (name) =>
            `Back at ${name} at ${input.bpm} BPM — last time at this tempo you hit ${struggleHit.report.score}. Let's clean that up.`,
          () =>
            `Back at ${input.bpm} BPM — last time at this tempo you hit ${struggleHit.report.score}. Let's clean that up.`,
        );
      } else {
        text = labelOrFallback(
          input.presetName,
          (name) =>
            `Back at ${name} — you hit ${lastScore} at ${lastBpm} BPM last time. Let's see if ${targetScore} is within reach.`,
          () =>
            `You hit ${lastScore} at ${lastBpm} BPM last time. Let's see if ${targetScore} is within reach.`,
        );
      }

      return {
        tier,
        text,
        context: {
          presetName: input.presetName,
          bpm: input.bpm,
          sessionCount: sessions.length,
          lastScore,
          lastBpm,
          personalBest,
          targetScore,
          avgScore,
          onDowntrend,
          playedWithin4h,
          strugglePriorScore: struggleHit?.report.score,
        },
      };
    }

    case "preset-first-time": {
      const sessions = history.filter((s) => s.presetId === input.presetId);
      // 0 or 1 prior session.
      if (sessions.length === 1) {
        const last = sessions[0];
        const text = labelOrFallback(
          input.presetName,
          (name) =>
            `Second session with ${name}. Let's see if we can get past last time's ${last.report.score}.`,
          () =>
            `Second session here. Let's see if we can get past last time's ${last.report.score}.`,
        );
        return {
          tier,
          text,
          context: {
            presetName: input.presetName,
            bpm: input.bpm,
            sessionCount: 1,
            lastScore: last.report.score,
            lastBpm: last.bpm,
          },
        };
      }
      // True first-time on this preset.
      const text = labelOrFallback(
        input.presetName,
        (name) => `First run at ${name}, ${input.bpm} BPM. Let's set a baseline.`,
        () => `First run at ${input.bpm} BPM. Let's set a baseline.`,
      );
      return {
        tier,
        text,
        context: {
          presetName: input.presetName,
          bpm: input.bpm,
          sessionCount: 0,
        },
      };
    }

    case "no-preset-recent-history": {
      const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
      const recent = history.filter((s) => s.timestamp >= cutoff);
      const median = medianScore(recent);

      let text: string;
      if (
        recent.length >= SOLID_WORK_SESSIONS &&
        median >= SOLID_WORK_MEDIAN_SCORE
      ) {
        text = pickVariant(TIER3_SOLID_VARIANTS, input.rng);
      } else {
        text = pickVariant(TIER3_GENERIC_VARIANTS, input.rng);
      }
      return {
        tier,
        text,
        context: {
          bpm: input.bpm,
          sessions7d: recent.length,
          medianScore7d: median,
        },
      };
    }

    case "no-preset-cold":
    default:
      // Tier-4 fires when we have neither a preset nor any recent
      // history — the player is genuinely cold-starting. Lean warm:
      // greet them like a coach saying hello, not a system saying
      // "ready". The history-aware tiers above carry the specificity.
      return {
        tier: "no-preset-cold",
        text: pickVariant(TIER4_COLD_VARIANTS, input.rng),
        context: { bpm: input.bpm },
      };
  }
}

// ---------------------------------------------------------------------------
// 500ms-budget wrapper around an async history load
// ---------------------------------------------------------------------------

/**
 * Race a session-history loader against a 500ms timeout. If the loader
 * wins, returns the loaded array. If the timeout wins, returns
 * `undefined` and the caller renders a tier-4 greeting.
 *
 * The loader promise is NOT cancelled — the caller can await it later
 * to log a "history loaded" feed entry, but per the plan must NOT
 * replace the already-shown greeting.
 */
export async function loadHistoryWithBudget(
  loader: () => Promise<SavedSession[]>,
  budgetMs: number = HISTORY_LOAD_TIMEOUT_MS,
): Promise<SavedSession[] | undefined> {
  const load = loader();
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), budgetMs),
  );
  const result = await Promise.race([load, timeout]);
  return result as SavedSession[] | undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a template that wants a preset name, falling back to a
 * name-less variant when no name was supplied. Keeps the template
 * engine "opaque" — we never inspect the string's content, only its
 * presence.
 */
function labelOrFallback(
  name: string | undefined,
  withName: (n: string) => string,
  withoutName: () => string,
): string {
  return name && name.trim().length > 0 ? withName(name) : withoutName();
}

function medianScore(sessions: SavedSession[]): number {
  if (sessions.length === 0) return 0;
  const sorted = sessions.map((s) => s.report.score).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Downtrend = last 3 sessions trend down vs. the 3 before them.
 * Mirrors the existing `compactPresetSummary` heuristic (delta of 5+).
 */
function isOnDowntrend(sessions: SavedSession[]): boolean {
  if (sessions.length < 4) return false;
  const recent = sessions.slice(0, Math.min(3, sessions.length));
  const earlier = sessions.slice(3, Math.min(6, sessions.length));
  if (earlier.length === 0) return false;
  const recentAvg =
    recent.reduce((a, s) => a + s.report.score, 0) / recent.length;
  const earlierAvg =
    earlier.reduce((a, s) => a + s.report.score, 0) / earlier.length;
  return recentAvg < earlierAvg - 5;
}
