/**
 * nf1b L4: the long view's SQL (`clean_tempo_spans_sql`, `db.rs`) and
 * `countsTowardCleanTempo` read the same rows. One fixture, odd shapes
 * included, is read by both: `every_shared_clean_tempo_row_agrees` in `db.rs`
 * stores each row's facts as the exact text and asks the query; this parses
 * the text as `list_path_takes` does (unreadable text is null facts) and asks
 * TypeScript. `counts` is the answer both must give.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PathTakeRow } from "../ipc";
import { CLEAN_TEMPO_MIN_BARS } from "./grade";
import { countsTowardCleanTempo } from "./progress";

type Row = { id: string; bars: number; caught: boolean; passed: boolean; factsJson: string; counts: boolean };
const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src-tauri/fixtures/clean_tempo_rows.json"), "utf8"),
) as { minBars: number; rows: Row[] };

/** `serde_json::from_str(&facts).unwrap_or(Value::Null)`, as `list_path_takes` hands a row over. */
function factsAsRead(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

describe("the long view and the app agree on every shared row", () => {
  it("reads the same pass mark for old rows", () => {
    expect(fixture.minBars).toBe(CLEAN_TEMPO_MIN_BARS);
    expect(fixture.rows.length).toBeGreaterThanOrEqual(20);
  });

  it.each(fixture.rows.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    const row: PathTakeRow = {
      id: r.id,
      pathId: "p",
      stepId: "s",
      exerciseId: "x",
      startedAt: 10,
      bpm: 80,
      bars: r.bars,
      caught: r.caught,
      passed: r.passed,
      facts: factsAsRead(r.factsJson) as PathTakeRow["facts"],
    };
    expect(countsTowardCleanTempo(row)).toBe(r.counts);
  });
});

/**
 * nf1b L4, the runner's wiring. No test settles a graded Take through
 * `useSessionRun` (that needs the scorer's events through `useSongAttempt`),
 * so this pins the source: what the result quotes as "before" is the shown
 * clean tempo, on both settle paths, while what is stored (`newClean`, the
 * clean tempo handed to `savePathTake`) is decided against the ceiling.
 * Reverting either `cleanBefore:` to the ceiling fails here.
 */
describe("useSessionRun: 'before' is the shown tempo, what is stored is the ceiling's", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/containers/session/hooks/useSessionRun.ts"), "utf8");

  it("both outcomes quote the shown clean tempo as 'before'", () => {
    const quoted = source.match(/cleanBefore: [^,\n]+/g) ?? [];
    expect(quoted).toEqual([
      "cleanBefore: shownCleanTempoOf(progress",
      "cleanBefore: shownCleanTempoOf(progress",
    ]);
  });

  it("whether the Take raised it, and what is saved with it, read the ceiling", () => {
    expect(source).toMatch(/const cleanBefore = cleanTempoOf\(progress, path\.id, exercise\.id\);/);
    expect(source).toMatch(/const raised =\s+grade\.cleanBpm !== null && \(cleanBefore === null \|\| grade\.cleanBpm > cleanBefore\);/);
    expect(source).toMatch(/newClean: raised,/);
    expect(source).toMatch(/const cleanBpm = raised \? grade\.cleanBpm : null;/);
  });
});
