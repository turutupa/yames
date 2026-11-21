/**
 * The tools' note's measured sentence (C5, DESIGN 7 "Code"): the top finding
 * `analyze_free_play` (`src-tauri/src/findings.rs`) ranked for a free-play
 * segment, as one sentence with its number. Pure: a key and its values, put
 * into words by the note.
 *
 * Every sentence names what was measured and nothing else: where in the bar
 * the time sat, which position of the beat had no note on it, the tempo where
 * the timing came apart, how far the timing moved between the first and the
 * last third of the run. No cause, no advice, no praise. When there is
 * nothing to say (no finding, a run under the note's 10 s, a number that
 * would read as nothing) the answer is `null` and the note is what it was.
 *
 * The findings ride on `practice-segment-ended` and are never stored
 * (NEXT-LEGS s4a, judgement call 9).
 */
import type { Finding } from "../songs/types";

/** A run under this gets no note at all (`useSegmentCoach`), so no sentence. */
export const TOOL_FINDING_MIN_RUN_MS = 10_000;

/**
 * Under this many ms a "beat N came early" sentence would quote a number that
 * reads as on time; the finding is about the beat being out of line with the
 * others, which is then the others' doing, so nothing is said.
 */
const MIN_QUOTED_MS = 3;

/** The beat's subdivisions `timing.rs` clicks: eighths, triplets, sixteenths, sextuplets. */
const POSITIONS: Record<number, number> = { 2: 2, 3: 3, 4: 4, 6: 6 };

export type ToolFindingLine = {
  key: string;
  values: Record<string, string | number>;
  /** The finding the sentence is about, for tests and the note's data attribute. */
  kind: Finding["kind"];
};

/** One sentence for `findings[0]`, or `null`. Numbers are whole, and positive. */
export function toolFinding(findings: readonly Finding[] | undefined, playedMs: number): ToolFindingLine | null {
  if (!findings || findings.length === 0 || !(playedMs >= TOOL_FINDING_MIN_RUN_MS)) return null;
  const top = findings[0];
  const e = top.evidence;
  switch (top.kind) {
    case "beatPositionBias": {
      const ms = Math.round(Math.abs(e.meanDeviationMs));
      if (e.beatPosition === undefined || ms < MIN_QUOTED_MS) return null;
      return {
        kind: top.kind,
        key: e.meanDeviationMs < 0 ? "toolCoach.finding.beatEarly" : "toolCoach.finding.beatLate",
        values: { beat: e.beatPosition, ms },
      };
    }
    case "subdivisionWeak": {
      const [position, total] = e.subdivisionPosition ?? [-1, 0];
      const missed = e.onsets - e.hits;
      if (!POSITIONS[total] || position < 0 || position >= total || missed <= 0 || e.onsets <= 0) return null;
      return {
        kind: top.kind,
        key: "toolCoach.finding.subdivision",
        values: { position: `toolCoach.finding.position.${total}.${position}`, missed, total: e.onsets },
      };
    }
    case "tempoCeiling": {
      if (!e.bpmBand) return null;
      const [holds, breaks] = e.bpmBand;
      if (!(breaks > holds)) return null;
      return { kind: top.kind, key: "toolCoach.finding.ceiling", values: { holds, breaks } };
    }
    case "drift": {
      const ms = Math.round(Math.abs(e.meanDeviationMs));
      if (ms < MIN_QUOTED_MS) return null;
      return {
        kind: top.kind,
        key: e.meanDeviationMs < 0 ? "toolCoach.finding.driftEarly" : "toolCoach.finding.driftLate",
        values: { ms },
      };
    }
    default:
      // Songs' and Paths' kinds never come out of free play.
      return null;
  }
}

/**
 * The sentence in the reader's language. `position` is itself a key (the
 * name of the position inside the beat), translated before it goes in.
 */
export function toolFindingText(line: ToolFindingLine, t: (key: string, values?: Record<string, unknown>) => string): string {
  const values: Record<string, unknown> = { ...line.values };
  if (typeof values.position === "string") values.position = t(values.position);
  return t(line.key, values);
}
