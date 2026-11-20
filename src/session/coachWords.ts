/**
 * What the coach says, from what was measured.
 *
 * Templates and nothing else (`BRIEF.md` rule 3): each sentence picks a key and
 * quotes values `grade.ts` and `planner.ts` computed. It returns a key and values
 * rather than a string, so the words live in the locale files, and so a test can
 * say exactly which sentence a Take earns.
 *
 * Never a claim about pick direction, the hands, tone or feel. `honesty` in the
 * test walks every English sentence under `session.coach` and `session.why` for
 * that, the same way `src/paths/honesty.ts` walks a pack.
 */
import type { Exercise, Subdivision } from "../paths/format";
import type { BarCheck, TakeGrade } from "./grade";
import type { Reason } from "./planner";
import type { TakeMeasures } from "./takeMeasures";

export type Line = { key: string; values: Record<string, string | number> };

/** The sentence for why a step is in today's Session. */
export function reasonLine(reason: Reason): Line {
  const { code, values } = reason;
  // A reason quotes a value only when one was measured, so these have a plain
  // sentence for a Take with nothing on record, and a metric of their own.
  if ((code === "belowBar" || code === "easing") && typeof values.value === "number") {
    return { key: `session.why.${code}.${metricKey(String(values.metric))}`, values };
  }
  if (code === "belowBar" || code === "easing") {
    return { key: `session.why.${code}.plain`, values };
  }
  if (code === "backEased" && values.clean === undefined) {
    return { key: "session.why.backEasedNoClean", values };
  }
  // Rotation reasons: a variant per what was measured, never a guessed number.
  if (code === "focusTurn" && typeof values.days === "number") {
    return { key: "session.why.focusTurnAway", values };
  }
  if (code === "keepWarm" || code === "skippedToday") {
    const days = values.days;
    const suffix =
      typeof days !== "number" ? (code === "keepWarm" ? "New" : "Never") : days === 0 ? "Today" : days === 1 ? "Yesterday" : "";
    return { key: `session.why.${code}${suffix}`, values };
  }
  if (code === "reviewDue" && values.left !== undefined) return { key: "session.why.reviewDueLeft", values };
  if (code === "reviewDue" && values.slipped !== undefined) {
    return { key: "session.why.reviewDueSlipped", values };
  }
  return { key: `session.why.${code}`, values };
}

/** The words for a metric, in `session.metric.*`. */
export function metricKey(metric: string): "even" | "heard" | "extras" | "accents" | "notes" {
  switch (metric) {
    case "notesHeard":
      return "heard";
    case "noteIdentity":
      return "notes";
    case "extraNotes":
      return "extras";
    case "accentPlacement":
      return "accents";
    default:
      return "even";
  }
}

/**
 * "Where you left off" on Today after a break: the last Take's headline number
 * with its unit, "78% even at 80 BPM" (QA 2026-11-17 #22). Extra notes are a
 * count, not a share, so they read as the plain line, as does a Take with no
 * number on record.
 */
export function leftOffLine(facts: { headlineMetric?: string; headlineValue?: unknown }, bpm: number): Line {
  const metric = metricKey(facts.headlineMetric ?? "timingEvenness");
  if (typeof facts.headlineValue !== "number" || metric === "extras") {
    return { key: "session.today.leftOffPlain", values: { bpm } };
  }
  return {
    key: `session.today.leftOffValue.${metric}`,
    values: { bpm, value: Math.round(facts.headlineValue * 100) },
  };
}

/** A bar's value as the player reads it: a percentage, or a count. */
export function displayValue(check: Pick<BarCheck, "metric" | "value">): number | null {
  if (check.value === null) return null;
  return check.metric === "extraNotes" ? Math.round(check.value) : Math.round(check.value * 100);
}

/** The bar itself, on the same scale. */
export function displayBar(check: Pick<BarCheck, "metric" | "min" | "max">): number | null {
  if (check.metric === "extraNotes") return check.max ?? null;
  return check.min === undefined ? null : Math.round(check.min * 100);
}

/**
 * The check that decided a Take (UX audit SES-3): on a miss, the first bar not
 * met; on a pass, the one that came closest to its bar. The result leads with
 * it whichever way the Take went, so the big number always means "this is what
 * the verdict turned on", never "% even" on one screen and "% heard" on the next.
 */
export function decidingCheck(grade: TakeGrade): BarCheck | null {
  const measured = grade.checks.filter((c) => c.met !== null && c.value !== null);
  const failed = measured.find((c) => c.met === false);
  if (failed) return failed;
  let best: BarCheck | null = null;
  let bestMargin = Number.POSITIVE_INFINITY;
  for (const c of measured) {
    const value = displayValue(c);
    const bar = displayBar(c);
    if (value === null || bar === null) continue;
    const margin = c.metric === "extraNotes" ? bar - value : value - bar;
    if (margin < bestMargin) {
      best = c;
      bestMargin = margin;
    }
  }
  return best ?? grade.headline;
}

/** One bar of a Take as the result's strip draws it. */
export type BarCell = {
  /** From 1, as the player counts. */
  n: number;
  /** Held its bars; slipped; or too few notes in it to say. */
  state: "met" | "missed" | "thin";
};

/**
 * Bar by bar (UX audit SES-3): each finished bar against the Exercise's
 * evenness and notes-heard floors, from the scorer's own per-bar figures, and
 * the stretch the scorer judged as held. Null when the Take has no per-bar data.
 */
export function barStrip(
  exercise: Pick<Exercise, "passBars">,
  measures: Pick<TakeMeasures, "perBar" | "pass">,
): { cells: BarCell[]; held: { from: number; count: number } | null } | null {
  const bars = measures.perBar;
  if (!bars || bars.length === 0) return null;
  const even = exercise.passBars.find((b) => b.metric === "timingEvenness")?.min;
  const heard = exercise.passBars.find((b) => b.metric === "notesHeard")?.min;
  const cells: BarCell[] = bars.map((bar, i) => {
    if (bar.due === 0) return { n: i + 1, state: "thin" };
    const heardOk = heard === undefined || bar.heard / bar.due >= heard;
    if (bar.evenness === null) {
      // Too few notes due to read evenness from: judged on the notes alone.
      if (bar.due < 3) return { n: i + 1, state: heardOk ? "thin" : "missed" };
      return { n: i + 1, state: "missed" };
    }
    const evenOk = even === undefined || bar.evenness >= even;
    return { n: i + 1, state: heardOk && evenOk ? "met" : "missed" };
  });
  const pass = measures.pass;
  const held =
    pass && pass.heldBars > 0 && pass.heldFromBar !== undefined
      ? { from: pass.heldFromBar + 1, count: pass.heldBars }
      : null;
  return { cells, held };
}

/**
 * One sentence after a Take: why it went the way it went, in words.
 *
 * Honest about what was checked (UX audit SES-2): when the pitches could not
 * be checked, the same sentence says so, rather than "heard 160 of 160" beside
 * a second paragraph that says the notes could not be heard.
 */
export function takeLine(grade: TakeGrade, measures: TakeMeasures, bpm: number): Line {
  const values = {
    bpm,
    heard: measures.heard,
    expected: measures.expected,
    missed: Math.max(0, measures.expected - measures.heard),
    bars: measures.barsPlayed,
    extras: measures.extras,
  };
  const pitchUnchecked = grade.unmeasured.includes("noteIdentity");
  switch (grade.verdict) {
    case "notCaught":
      return {
        key: measures.heard === 0 ? "session.coach.heardNothing" : "session.coach.heardLittle",
        values,
      };
    case "tooShort":
      return { key: "session.coach.tooShort", values };
    case "ungraded":
      return { key: "session.coach.ungraded", values };
    case "passed": {
      // "Even across" is the stretch that held, which with a Take's slack bars
      // (`grade.ts` `TAKE_SLACK_BARS`) can be shorter than the Take.
      const held = { ...values, bars: measures.pass?.heldBars || measures.barsPlayed };
      if (pitchUnchecked) {
        return {
          key: measures.heard >= measures.expected ? "session.coach.passedTiming" : "session.coach.passedTimingSome",
          values: held,
        };
      }
      return {
        key:
          measures.extras > 0
            ? "session.coach.passedExtras"
            : measures.heard >= measures.expected
              ? "session.coach.passed"
              : "session.coach.passedSome",
        values: held,
      };
    }
    case "belowBar": {
      const check = decidingCheck(grade);
      const metric = check ? metricKey(check.metric) : "even";
      const key =
        metric === "even" && measures.heard < measures.expected
          ? "session.coach.below.evenSome"
          : `session.coach.below.${metric}`;
      return {
        key,
        values: {
          ...values,
          value: (check && displayValue(check)) ?? 0,
          bar: (check && displayBar(check)) ?? 0,
        },
      };
    }
  }
}

/** Why a Take was not graded, for "I didn't catch enough". */
export function notCaughtHint(measures: TakeMeasures): Line {
  // The scorer's own reason when it gave one; otherwise what the counts say.
  switch (measures.noCatchReason) {
    case "nothingHeard":
      return { key: "session.noCatch.hintNothing", values: {} };
    case "tooFewHeard":
      return { key: "session.noCatch.hintQuiet", values: {} };
    case "tooManyExtras":
      return { key: "session.noCatch.hintExtras", values: {} };
    case "lowConfidence":
      return { key: "session.noCatch.hintUnsure", values: {} };
  }
  return {
    key: measures.heard === 0 ? "session.noCatch.hintNothing" : "session.noCatch.hintQuiet",
    values: {},
  };
}

/**
 * What an Exercise card says about its tempo: what the tempo counts (when the
 * pack says) and where the ladder starts and where it passes, "16ths · 60→110
 * BPM" (QA 2026-11-17 #14). `to` is null when nothing passes it.
 */
export function tempoRange(exercise: Exercise): { subdivision: Subdivision | null; from: number; to: number | null } | null {
  const from = exercise.tempo.rungs[0]?.bpm;
  if (from === undefined) return null;
  const to = exercise.tempo.passAtBpm;
  return { subdivision: exercise.subdivision ?? null, from, to: to !== null && to !== from ? to : null };
}

/** What a Step's bar reads like, for the Step page and the running screen. */
export function barLine(exercise: Exercise, bpm: number | null): Line | null {
  const even = exercise.passBars.find((b) => b.metric === "timingEvenness");
  const heard = exercise.passBars.find((b) => b.metric === "notesHeard");
  if (!even || even.min === undefined) return null;
  return {
    key: "session.bar.summary",
    values: {
      even: Math.round(even.min * 100),
      heard: Math.round((heard?.min ?? 0) * 100),
      bpm: bpm ?? exercise.tempo.passAtBpm ?? 0,
    },
  };
}
