/**
 * What a cue's trigger means in an Exercise's notes, and what a cue may say.
 *
 * The trigger that chooses a cue (`format.ts` `CueTrigger`) comes only from
 * what a Take measured: the check the verdict turned on, the way the slipped
 * bars leaned, and what the slipped bars have in them. This module reads the
 * last of those off the notes, so the validator (which triggers can an
 * Exercise produce at all) and the coach (which did this Take produce) agree.
 * Pure; it knows nothing of the app.
 */
import { barLengthTicks, CUE_MAX_CHARS } from "./format";
import type { CueTrigger, Exercise, PathNote } from "./format";
import { fingerPlan } from "./fingering";
import { bannedClaimsIn } from "./honesty";

/** The check the verdict turned on, as the trigger it chooses. Null: a check no cue is for. */
export function metricTrigger(metric: string | null | undefined): CueTrigger | null {
  switch (metric) {
    case "timingEvenness":
    case "evennessHold":
    case "restsKept":
      return "even";
    case "notesHeard":
      return "heard";
    case "extraNotes":
      return "extras";
    case "noteIdentity":
    case "scaleMembership":
    case "landingChordTone":
      return "notes";
    default:
      return null;
  }
}

/** The triggers that read where a Take slipped, in the order the coach prefers them. */
export const PLACE_TRIGGERS: readonly CueTrigger[] = ["afterHeld", "openString", "shift", "stringChange", "lastBars"];

type Notes = Pick<Exercise, "notes" | "meter" | "bars" | "loops" | "position">;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/** A held note: a beat or longer, and at least twice the Exercise's usual note. */
export function heldIndices(notes: readonly PathNote[]): Set<number> {
  const usual = median(notes.map((n) => n.dur));
  const out = new Set<number>();
  notes.forEach((n, i) => {
    if (n.dur >= 960 && n.dur >= 2 * usual) out.add(i);
  });
  return out;
}

/**
 * What the given pattern bars (from 1) have in them: a note right after a held
 * one, an open string, a shift of the hand, a change of string, the tune's last
 * bar. `fromRound`: the Take came apart from a round on, which is its last
 * bars whatever the pattern.
 */
export function placeTriggers(ex: Notes, patternBars: readonly number[], fromRound = false): CueTrigger[] {
  const notes = [...ex.notes].sort((a, b) => a.tick - b.tick);
  const found = new Set<CueTrigger>();
  if (notes.length > 0 && patternBars.length > 0) {
    const barTicks = barLengthTicks(ex.meter);
    const inPlace = (n: PathNote) => patternBars.includes(Math.floor(n.tick / barTicks) + 1);
    const held = heldIndices(notes);
    const plan = fingerPlan(notes, ex.position);
    notes.forEach((n, i) => {
      if (!inPlace(n)) return;
      if (n.fret === 0) found.add("openString");
      // The note before it, round the seam when the tune loops.
      const j = i > 0 ? i - 1 : ex.loops ? notes.length - 1 : -1;
      if (j < 0 || j === i) return;
      const before = notes[j];
      if (held.has(j)) found.add("afterHeld");
      if (before.string !== n.string) found.add("stringChange");
      const a = plan[j]?.base ?? null;
      const b = plan[i]?.base ?? null;
      if (a !== null && b !== null && a !== b) found.add("shift");
    });
  }
  if (fromRound || (ex.bars >= 2 && patternBars.includes(ex.bars))) found.add("lastBars");
  return PLACE_TRIGGERS.filter((t) => found.has(t));
}

/**
 * Every trigger an Exercise (as one set of notes) can produce: the checks its
 * pass marks name, a direction where timing is graded, and what any of its
 * bars has in it. An ungraded Exercise produces none.
 */
export function possibleTriggers(ex: Notes & Pick<Exercise, "passBars" | "graded">): Set<CueTrigger> {
  const out = new Set<CueTrigger>();
  for (const bar of ex.passBars) {
    const t = metricTrigger(bar.metric);
    if (t) out.add(t);
  }
  if (out.size === 0 && ex.passBars.length === 0) return out;
  const timed = ex.passBars.some((b) => metricTrigger(b.metric) === "even") || ex.graded.includes("timingEvenness");
  if (timed) {
    out.add("late");
    out.add("early");
  }
  const bars = Array.from({ length: Math.max(1, ex.bars) }, (_v, i) => i + 1);
  for (const t of placeTriggers(ex, bars)) out.add(t);
  // A long Take can come apart from a round on, whatever the pattern's length.
  if (ex.loops) out.add("lastBars");
  return out;
}

/** What a cue's words break, as the validator's rule and a message. */
export type CueWordIssue = { rule: "cue.length" | "cue.order" | "cue.honesty" | "cue.passMark" | "cue.tuning"; message: string };

/** Openings that describe rather than order: "Your pick…", "The open B is…", "I…". */
const NOT_AN_ORDER = /^(?:i|i'm|i'll|we|you|you're|your|it|it's|its|this|that|there|these|those|the|a|an|my)\b/i;
/** A grade named: a percentage, the pass mark, a score. A cue says what to do, never what it is worth. */
const GRADE_WORDS = /%|\b(?:grade[sd]?|grading|scor(?:e|es|ed|ing)|pass mark|passed|passing|percent)\b/i;
/** The threshold is the pass mark, never "the bar" (owner decision 2); a bar is music. */
const THE_BAR = /\bthe bar\b|\bpass bar\b/i;
/** Nothing about tuning until the app has a tuner (owner decision 9). "The tune" is a melody and is fine. */
const TUNING = /\btun(?:e|ing)\s+(?:up|your|the guitar)|\btuning\b|\bin tune\b|\bout of tune\b|\btuner\b/i;
/** Praise is not an order. */
const PRAISE = /\b(?:great|good job|well done|nice|awesome|perfect|excellent)\b|!/i;

/**
 * The rules a machine can check on a cue's English (`plans/coach/CUES_GUIDE.md`
 * has the rest, for the writer and the proof-reader): at most 48 characters;
 * an order, not a description, a question, a grade or praise; the honesty
 * list; never "the bar" for the pass mark; nothing about tuning.
 */
export function cueWordIssues(say: string): CueWordIssue[] {
  const issues: CueWordIssue[] = [];
  const text = say.trim();
  const length = [...text].length;
  if (length === 0 || length > CUE_MAX_CHARS) issues.push({ rule: "cue.length", message: `${length} characters; a cue is 1 to ${CUE_MAX_CHARS}` });
  if (/\?\s*$/.test(text)) issues.push({ rule: "cue.order", message: "ends in a question mark: a cue is an order" });
  else if (NOT_AN_ORDER.test(text)) issues.push({ rule: "cue.order", message: `starts "${text.split(/\s/)[0]}": a cue is an order, not a description` });
  else if (GRADE_WORDS.test(text)) issues.push({ rule: "cue.order", message: "names a grade: a cue says what to do, not what it is worth" });
  else if (PRAISE.test(text)) issues.push({ rule: "cue.order", message: "praise or an exclamation: a cue is an order" });
  for (const claim of bannedClaimsIn(text, true)) issues.push({ rule: "cue.honesty", message: claim.name });
  if (THE_BAR.test(text)) issues.push({ rule: "cue.passMark", message: "\"the bar\": the threshold is the pass mark, and a cue names neither" });
  if (TUNING.test(text)) issues.push({ rule: "cue.tuning", message: "says something about tuning" });
  return issues;
}
