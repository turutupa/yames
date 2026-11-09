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
import type { Exercise } from "../paths/format";
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
  return { key: `session.why.${code}`, values };
}

/** The words for a metric, in `session.metric.*`. */
export function metricKey(metric: string): "even" | "heard" | "extras" | "accents" {
  switch (metric) {
    case "notesHeard":
      return "heard";
    case "extraNotes":
      return "extras";
    case "accentPlacement":
      return "accents";
    default:
      return "even";
  }
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

/** One sentence after a Take: the thing that matters most. */
export function takeLine(grade: TakeGrade, measures: TakeMeasures, bpm: number): Line {
  const values = {
    bpm,
    heard: measures.heard,
    expected: measures.expected,
    bars: measures.barsPlayed,
    extras: measures.extras,
  };
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
    case "passed":
      return {
        key: measures.extras > 0 ? "session.coach.passedExtras" : "session.coach.passed",
        values,
      };
    case "belowBar": {
      const check = grade.headline;
      const metric = check ? metricKey(check.metric) : "even";
      return {
        key: `session.coach.below.${metric}`,
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
  return {
    key: measures.heard === 0 ? "session.noCatch.hintNothing" : "session.noCatch.hintQuiet",
    values: {},
  };
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
