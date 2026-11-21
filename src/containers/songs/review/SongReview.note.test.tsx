/**
 * The Songs verdict in the Session's note (c5a2, DESIGN 3.1): the same
 * sentence, now the note's headline, with "Measured" under it and one fact
 * line; the fix is the same button with the same handler, under the note.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "../../../i18n";
import { SongReview } from "./SongReview";
import type { SongAttemptReview } from "./useSongAttempt";
import { songFacts } from "./songNote";
import { attemptFacts } from "../../../songs/attempt";
import { buildSchedule } from "../../../songs/schedule";
import type { Finding, NoteVerdict, SongNote, SongScore } from "../../../songs/types";
import type { PracticeSegmentEndedPayload } from "../../../ipc";

vi.mock("../../../ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../ipc")>()),
  storeLoad: vi.fn(() => Promise.resolve(undefined)),
  storeSave: vi.fn(() => Promise.resolve()),
}));

afterEach(cleanup);

const note = (id: number): SongNote => ({
  id,
  tick: id * 960,
  durTicks: 960,
  string: 1,
  fret: 0,
  midi: 64,
  tieFromPrevious: false,
  ghost: false,
  dead: false,
  accent: false,
  techniques: [],
});

const SCORE: SongScore = {
  schema: 1,
  id: "s1",
  title: "Practice piece",
  artist: "",
  source: { fileName: "p.alphatex", format: "alphatex", trackIndex: 0, trackName: "Guitar" },
  tuning: [64, 59, 55, 50, 45, 40],
  capo: 0,
  ticksPerQuarter: 960,
  tempoMap: [{ tick: 0, bpm: 96 }],
  meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
  bars: Array.from({ length: 4 }, (_, i) => ({ index: i, startTick: i * 3840, lengthTicks: 3840, printedBar: i })),
  notes: Array.from({ length: 16 }, (_, i) => note(i)),
  sections: [],
};

const RANGE = { startBar: 0, endBar: 3 };

const RUSHING: Finding = {
  kind: "rushing",
  bars: [2, 3],
  noteIds: [8, 9, 10, 11, 12, 13, 14, 15],
  severity: 0.6,
  evidence: {
    onsets: 8,
    hits: 8,
    hitRate: 1,
    meanDeviationMs: -40,
    deviationBeats: -0.25,
    spreadMs: 12,
    passes: 1,
    passesAffected: 1,
    referenceBpm: 96,
    printedBars: [2, 3],
  },
  fix: { type: "loopBars", start: 2, end: 3, tempoPercent: 80 },
};

function review(findings: Finding[], extras = 0): SongAttemptReview {
  const schedule = buildSchedule(SCORE, RANGE);
  const results = schedule.onsets.map((o) => ({ id: o.id, state: "hit" as const, deviationMs: 0, pass: 0 }));
  const extraOnsets = Array.from({ length: extras }, (_, i) => ({ beat: 0.5 + i, pass: 0 }));
  const facts = attemptFacts({ results, extras: extraOnsets, score: 80 });
  return {
    attemptId: "a1",
    scoreId: "s1",
    score: SCORE,
    schedule,
    range: RANGE,
    tempoPercent: 100,
    bpm: 96,
    startedAt: Date.UTC(2026, 10, 20, 10),
    facts,
    bands: null,
    findings,
    saved: true,
    segment: {} as PracticeSegmentEndedPayload,
  };
}

describe("the Songs verdict, in the coach's note", () => {
  it("draws the sentence as the note's headline, with Measured and the fact line", () => {
    render(<SongReview review={review([RUSHING])} onAction={() => {}} onDismiss={() => {}} />);
    const note = screen.getByTestId("songs-note");
    expect(note).toHaveAttribute("data-kind", "song");
    const head = note.querySelector(".coach-note-head");
    // The verdict's own sentence (one of rushing's three), quoting the PRINTED bars.
    expect(head?.textContent ?? "").toMatch(/bars 3.4/i);
    expect(note).toHaveTextContent("Measured");
    const facts = within(note).getByTestId("coach-facts");
    expect(facts).toHaveTextContent("no extras");
    // Not said twice: the head's summary already counts the notes that landed.
    expect(facts).not.toHaveTextContent("notes heard");
    // The note is not a second copy of the sentence elsewhere in the head.
    expect(document.querySelectorAll(".songs-review-said .coach-block-sentence")).toHaveLength(0);
  });

  it("keeps the fix as the same button, with the same handler and the finding", () => {
    const onAction = vi.fn();
    render(<SongReview review={review([RUSHING])} onAction={onAction} onDismiss={() => {}} />);
    const said = document.querySelector(".songs-review-said") as HTMLElement;
    const button = said.querySelector(".coach-block-button") as HTMLButtonElement;
    expect(button).not.toBeNull();
    // Under the note, not inside it: a change is a button with the controls (DESIGN 3.6).
    expect(screen.getByTestId("songs-note").contains(button)).toBe(false);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ kind: "loopBars", score: "s1", fromBar: 3, toBar: 4 });
    expect(onAction.mock.calls[0][1]).toBe(RUSHING);
  });

  it("says nothing in a note when nothing was found, as before", () => {
    render(<SongReview review={review([])} onAction={() => {}} onDismiss={() => {}} />);
    expect(screen.queryByTestId("songs-note")).toBeNull();
    expect(document.querySelector(".songs-review-quiet")).not.toBeNull();
  });

  it("counts extras when there were some, with no cross: a song has no pass mark", () => {
    render(<SongReview review={review([RUSHING], 3)} onAction={() => {}} onDismiss={() => {}} />);
    const facts = within(screen.getByTestId("songs-note")).getByTestId("coach-facts");
    expect(facts).toHaveTextContent("3 extra notes");
    expect(facts.querySelector("[data-mark=cross]")).toBeNull();
  });
});

describe("songFacts", () => {
  const verdict = (state: NoteVerdict["state"]): NoteVerdict => ({
    noteId: 0,
    onsetId: 0,
    expectedMidi: 64,
    heardMidi: 64,
    centsOff: 0,
    state,
    confidence: 1,
  });

  it("is extras alone without the ear", () => {
    expect(songFacts({ extraCount: 0, hits: 8 })).toEqual([
      { kind: "extras", mark: "check", line: { key: "session.note.fact.noExtras", values: {} } },
    ]);
    expect(songFacts({ extraCount: 2, hits: 8 })[0]).toMatchObject({ mark: "none", line: { values: { count: 2 } } });
  });

  // Review c5a2 finding 5: a silent guitar has no extras, and no praise either.
  it("no check for 'no extras' on a pass where nothing was heard", () => {
    expect(songFacts({ extraCount: 0, hits: 0 })).toEqual([
      { kind: "extras", mark: "none", line: { key: "session.note.fact.noExtras", values: {} } },
    ]);
  });

  it("adds right notes of those it could pitch, never a cross", () => {
    const facts = songFacts({ extraCount: 0, hits: 8 }, [
      verdict("right"),
      verdict("right"),
      verdict("right"),
      verdict("wrong"),
      verdict("notAssessed"),
      verdict("unheard"),
    ]);
    expect(facts[1]).toEqual({
      kind: "rightNotes",
      mark: "none",
      line: { key: "session.note.fact.rightNotes", values: { value: 75, base: 4 } },
    });
  });

  it("leaves right notes out when it could pitch none (no reason it cannot give)", () => {
    expect(songFacts({ extraCount: 0, hits: 8 }, [verdict("notAssessed"), verdict("unheard")])).toHaveLength(1);
  });
});
