/**
 * A finding, said out loud — and turned into blocks the coach can draw.
 *
 * `findings.rs` decides. This file only narrates, and it narrates by rule:
 * a kind picks a template, the evidence fills its numbers, and the result is
 * a `CoachAnswer` in exactly the catalogue `COACH_UX.md` D3 fixed. **There is
 * no model anywhere in this.** With one loaded the coach would say the same
 * thing in different words; with none it says this, and that is the whole
 * point of rule 3 — "the coach looks identical with no model loaded".
 *
 * ## The voice (`COACH_UX.md` B1)
 *
 * A patient session player. Second person, present tense, plain musician's
 * words. Numbers where they help — **"about a sixteenth early", never a
 * percentage as the headline** — and bar numbers as they are PRINTED on the
 * page, because that is what the player is looking at. `Finding.bars` are
 * played-bar indices and are never quoted; `Evidence.printedBars` is.
 *
 * ## Why the templates are locale keys
 *
 * W7's seventh finding: a `text` block holds a finished sentence, so a key
 * that reached the renderer would be drawn as `songs.review.rushing.2`. So
 * every variant is translated HERE, with its parameters, and the block is
 * built from the result. Three variants a kind, drawn through the coach's
 * existing shuffle-bag (`src/coach/templates.ts`) so the same finding twice
 * in an evening is not the same sentence twice — and the bag's similarity
 * guard sees real sentences rather than keys, which is why the translation
 * happens before the draw rather than after it.
 *
 * English is written properly. The other fourteen locales carry the English
 * until somebody translates them, which is the rule the whole wave runs on.
 */
import { pickTemplate, type ShuffleState } from "../coach/templates";
import type { CoachAction, CoachBlock } from "../coach/blocks";
import { printedBarNumber } from "./position";
import type { Evidence, Finding, FindingKind, Fix, SongScore } from "./types";

/** What a template is handed. Everything is already a word or a number. */
export type SentenceValues = Record<string, string | number>;

/** How a sentence is asked for, before anybody translates it. */
export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Three a kind. More would be authored content; fewer repeats within a session. */
export const VARIANTS_PER_KIND = 3;

/**
 * The finding kinds a song can produce, in the ranking's own order.
 *
 * The three free-play kinds are in the list too. Songs never emits them —
 * they come from the half of `findings.rs` that judges playing with no score
 * — but the coach is one voice in every mode (`COACH_UX.md` A1), and a kind
 * with no sentence is a kind that renders as nothing the day it first fires.
 */
export const FINDING_KINDS: readonly FindingKind[] = [
  "consistentMiss",
  "rushing",
  "dragging",
  "afterShift",
  "fallsApart",
  "extras",
  "uneven",
  "beatPositionBias",
  "subdivisionWeak",
  "drift",
  "tempoCeiling",
  "improved",
  "clean",
];

/** The three locale keys a kind's sentence may be drawn from. */
export function sentenceKeys(kind: FindingKind): string[] {
  return Array.from({ length: VARIANTS_PER_KIND }, (_, i) => `songs.review.say.${kind}.${String(i + 1)}`);
}

// ---------------------------------------------------------------------------
// Turning evidence into words
// ---------------------------------------------------------------------------

/**
 * How far off, as a musician would say it.
 *
 * A fraction of a beat, not milliseconds: "eleven milliseconds early" is a
 * measurement and "about a sixteenth early" is a note value you can feel.
 * The bands are generous on purpose — the sentence is about which note value
 * you are hearing, and a player who is 0.22 of a beat out is hearing a
 * sixteenth, not 0.22.
 */
export function beatFractionKey(deviationBeats: number): string {
  const off = Math.abs(deviationBeats);
  if (off < 0.06) return "songs.review.amount.hair";
  if (off < 0.19) return "songs.review.amount.thirtySecond";
  if (off < 0.29) return "songs.review.amount.sixteenth";
  if (off < 0.42) return "songs.review.amount.tripletEighth";
  if (off < 0.7) return "songs.review.amount.eighth";
  if (off < 0.9) return "songs.review.amount.mostOfABeat";
  return "songs.review.amount.beat";
}

/** Early or late, from the sign. Negative is early, the way the wire says it. */
export function directionKey(deviationBeats: number): string {
  return deviationBeats < 0 ? "songs.review.when.early" : "songs.review.when.late";
}

/**
 * "bar 9" or "bars 17–20", in printed numbers.
 *
 * `Finding.bars` are played-bar indices, which is what an action needs and
 * what nobody says out loud; `Evidence.printedBars` is the page's own
 * numbering and is what the sentence quotes. Both are zero-based on the wire
 * and a page is not, so one is added here and nowhere else.
 */
export function barsPhrase(t: Translate, finding: Finding, score: SongScore | null): string {
  const printed = printedBarsOf(finding, score);
  if (!printed) return t("songs.review.bars.here");
  const [from, to] = printed;
  return from === to
    ? t("songs.review.bars.one", { bar: from })
    : t("songs.review.bars.range", { from, to });
}

/** The printed numbers a finding is about, 1-based, or null for free play. */
export function printedBarsOf(
  finding: Finding,
  score: SongScore | null,
): [number, number] | null {
  const printed = finding.evidence.printedBars;
  if (printed) return [printed[0] + 1, printed[1] + 1];
  if (!finding.bars || !score) return null;
  return [printedBarNumber(score, finding.bars[0]), printedBarNumber(score, finding.bars[1])];
}

/**
 * Everything a template may name, filled once.
 *
 * Templates take only what their own kind needs; building them all costs
 * nothing and means a translator who moves `{{goes}}` into a sentence that
 * did not have it gets a number rather than a literal `{{goes}}`.
 */
export function sentenceValues(
  t: Translate,
  finding: Finding,
  score: SongScore | null,
): SentenceValues {
  const e: Evidence = finding.evidence;
  const band = e.bpmBand ?? [0, 0];
  const position = e.subdivisionPosition ?? [0, 0];
  return {
    bars: barsPhrase(t, finding, score),
    amount: t(beatFractionKey(e.deviationBeats)),
    when: t(directionKey(e.deviationBeats)),
    goes: t("songs.review.goes", { count: Math.max(1, e.passes) }),
    affected: Math.max(1, e.passesAffected),
    passes: Math.max(1, e.passes),
    notes: t("songs.review.notes", { count: Math.max(0, e.onsets - e.hits) }),
    extras: t("songs.review.notes", { count: e.extras ?? 0 }),
    beat: e.beatPosition ?? 1,
    position: position[0] + 1,
    outOf: Math.max(1, position[1]),
    hold: Math.round(band[0]),
    collapse: Math.round(band[1]),
    ms: Math.round(e.spreadDeltaMs ?? 0),
    bpm: Math.round(e.referenceBpm ?? 0),
  };
}

/**
 * One sentence for one finding.
 *
 * The three variants are translated first and the bag chooses between
 * finished sentences — see the note at the top of the file. `state` is the
 * caller's; hold one per session and the coach stops repeating itself across
 * an evening rather than only within one review.
 */
export function sentenceFor(
  t: Translate,
  finding: Finding,
  score: SongScore | null,
  state: ShuffleState,
  rng: () => number = Math.random,
): string {
  const values = sentenceValues(t, finding, score);
  const variants = sentenceKeys(finding.kind).map((key) => t(key, values));
  // The catalogue's key and the scenario asked for have to be the same
  // string, or `resolveVariants` finds nothing and the bag hands back null —
  // which looks exactly like a coach that always says the first thing.
  const scenario = `songs.${finding.kind}`;
  const severity = severityOf(finding.kind);
  const chosen = pickTemplate(
    { generic: { [scenario]: { [severity]: variants } } },
    state,
    { vocab: "generic", scenario, severity, rng },
  );
  // The bag only ever returns null with no variants at all, which would mean
  // a kind with no keys. The first variant is then still a real sentence.
  return chosen ?? variants[0];
}

/** Praise is encouragement; everything else is a correction (`A4`). */
function severityOf(kind: FindingKind): "encouragement" | "correction" {
  return kind === "improved" || kind === "clean" ? "encouragement" : "correction";
}

// ---------------------------------------------------------------------------
// Turning a fix into a button
// ---------------------------------------------------------------------------

/**
 * `Fix::ComeBack { days }` and the catalogue now say the same thing.
 *
 * The catalogue used to name three occasions — tomorrow, next session, in
 * three days — and this file mapped a number of days onto the nearest of
 * them and back. That round trip was lossy in one direction and silently
 * wrong in the other: `findings.rs` asks for whatever `srs.rs`'s ladder
 * returns, and the moment that was four days it came back out as three.
 * The action carries the number, and the BUTTON is where the words go —
 * `resolve.ts` says "tomorrow" for one day and counts for the rest.
 *
 * The clamp is the catalogue's own bound, so a fix outside it loses its
 * button rather than producing a block the resolver drops.
 */
const MAX_COME_BACK = 14;

function comeBackDaysOf(days: number): number | null {
  if (!Number.isFinite(days)) return null;
  const whole = Math.round(days);
  return whole >= 1 && whole <= MAX_COME_BACK ? whole : null;
}

/** A percentage of the reference tempo, as a BPM the button can say. */
function bpmOf(evidence: Evidence, percent: number): number | undefined {
  const reference = evidence.referenceBpm;
  if (reference === undefined || !Number.isFinite(reference) || reference <= 0) return undefined;
  return Math.max(20, Math.round((reference * percent) / 100));
}

/**
 * The fix as the catalogue's action (`COACH_UX.md` A5).
 *
 * `Fix` speaks in percentages of the score's own tempo because that is how a
 * song is practised; `CoachAction` speaks in BPM because that is what a click
 * is set to and what a button can print. `Evidence.referenceBpm` is the one
 * that converts them, and a fix without one loses its tempo rather than
 * inventing a number — a loop of the right bars at the tempo you are already
 * on is still a useful button.
 *
 * **Bar numbers in a block are PLAYED bars, counted from 1.** The catalogue
 * checks them against `ScoreRef.bars`, which is how many bars a song has as
 * played (`resolve.ts`), and the transport loops played bars because that is
 * the only numbering the schedule, the store and the cursor agree on. The
 * printed numbers are for the sentence, and only for the sentence.
 */
export function actionFor(finding: Finding, scoreId: string | null): CoachAction | null {
  const fix = finding.fix;
  if (!fix) return null;
  switch (fix.type) {
    case "loopBars": {
      if (!scoreId) return null;
      const bpm = bpmOf(finding.evidence, fix.tempoPercent);
      return {
        kind: "loopBars",
        score: scoreId,
        fromBar: fix.start + 1,
        toBar: fix.end + 1,
        ...(bpm === undefined ? {} : { bpm }),
      };
    }
    case "ramp": {
      const from = bpmOf(finding.evidence, fix.fromPercent);
      const to = bpmOf(finding.evidence, fix.toPercent);
      // A ramp with no tempo to climb between is not a ramp, and the
      // catalogue drops one that starts where it ends anyway.
      if (from === undefined || to === undefined || from === to) return null;
      return { kind: "ramp", fromBpm: from, toBpm: to };
    }
    case "clickSubdivision":
      return { kind: "clickSubdivision", subdivision: fix.subdivision };
    case "comeBack": {
      const days = comeBackDaysOf(fix.days);
      return days === null ? null : { kind: "comeBack", days };
    }
  }
}

/**
 * The bars a ramp or a loop is about, as a range the transport can take.
 *
 * `CoachAction` carries printed-looking bar numbers for `loopBars` and none
 * at all for `ramp`, so the host cannot read the range off the action. It
 * reads it off the finding, which has it as played-bar indices — the only
 * numbering the schedule, the store and the cursor agree on.
 */
export function rangeForFix(fix: Fix | undefined): { startBar: number; endBar: number } | null {
  if (!fix) return null;
  if (fix.type === "loopBars") return { startBar: fix.start, endBar: fix.end };
  if ((fix.type === "ramp" || fix.type === "clickSubdivision") && fix.start !== null && fix.end !== null)
    return { startBar: fix.start, endBar: fix.end };
  return null;
}

/** The tempo percentage a fix wants to start at, or null for "leave it". */
export function tempoPercentForFix(fix: Fix | undefined): number | null {
  if (!fix) return null;
  if (fix.type === "loopBars") return fix.tempoPercent;
  if (fix.type === "ramp") return fix.fromPercent;
  return null;
}

// ---------------------------------------------------------------------------
// Turning a finding into blocks
// ---------------------------------------------------------------------------

export type BlocksOptions = {
  /** The song in the library, so `tabExcerpt` and `loopBars` have something
   *  to point at. Null for free play, where neither resolves and both go. */
  scoreId: string | null;
  /** The attempt the colours come from, by the id the store gave it. */
  attemptId?: string;
  /** Whether this passage has a history worth drawing (C3). */
  withProgress?: boolean;
  /**
   * W21 — the attempt was filmed, so the coach can point at the tape.
   *
   * Exactly `withProgress`'s shape and for the same reason: whether there is
   * a recording is a fact about the world, not about the finding, and this
   * function is pure. The host knows; it says so here, and a `take` block
   * appears in the answer. A block naming an attempt with no picture resolves
   * to nothing, which is correct, so this is belt as well as braces.
   */
  withTake?: boolean;
};

/**
 * One finding as a `CoachAnswer`'s blocks: the sentence, the bars, the button.
 *
 * Three blocks at most, which is far inside the catalogue's six. A4 is the
 * reason: a teacher says one thing, shows you where, and gives you something
 * to press. A fourth block is a second thing being said.
 *
 * Every block carries references and no content (D3 rule 1) — `resolve.ts`
 * is what turns the score id and the bar numbers into a drawing, and drops
 * the block if they point at nothing.
 */
export function blocksFor(t: Translate, finding: Finding, score: SongScore | null, opts: BlocksOptions, state: ShuffleState, rng?: () => number): CoachBlock[] {
  const blocks: CoachBlock[] = [{ type: "text", text: sentenceFor(t, finding, score, state, rng) }];

  // Played bars, from 1 — see the note above `actionFor`.
  const played = finding.bars;
  if (opts.scoreId && played) {
    const fromBar = played[0] + 1;
    const toBar = played[1] + 1;
    if (opts.withProgress && finding.kind === "improved") {
      blocks.push({ type: "progress", score: opts.scoreId, fromBar, toBar });
    }
    blocks.push({
      type: "tabExcerpt",
      score: opts.scoreId,
      fromBar,
      toBar,
      ...(opts.attemptId === undefined || opts.attemptId === ""
        ? {}
        : { attempt: opts.attemptId }),
    });
    // W21 — and the tape, when the pass was filmed. After the excerpt, never
    // instead of it: the notes are what the sentence is about and the picture
    // is the evidence for it, and a teacher points at the page before they
    // point at your hands.
    if (opts.withTake && opts.attemptId) {
      blocks.push({ type: "take", attempt: opts.attemptId, fromBar, toBar });
    }
  }

  const action = actionFor(finding, opts.scoreId);
  if (action) blocks.push({ type: "action", action });

  return blocks;
}
