// The review, from the stop to the colours on the page.
//
// Four things are checked here that nothing else can check:
//
//   1. the stop does what it does IN ORDER — close the segment, clear the
//      schedule, save, judge — and drops a pass under the floor without
//      saving it or speaking about it;
//   2. a mark is the scorer's own band and not the review's;
//   3. an action changes the state it names, in the numbering the transport
//      takes rather than the one the button prints;
//   4. a fixture attempt actually colours: the right glyph, on the right
//      note, in the right bar.
//
// Colours themselves are not measurable here — happy-dom computes no geometry
// and no cascade — so `tests/layout/songs-review.spec.ts` is where "it fits
// and it is legible in thirteen themes" lives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { act, renderHook } from "@testing-library/react";
import { mockInvoke, mockListen, resetTauriMocks, setInvokeResponse } from "../../../test/mocks";
import { ReviewTab } from "./ReviewTab";
import { MARK_GLYPH, markFor, noteNameOf, passesIn, pitchMarkFor } from "./marks";
import {
  markFromFeedback,
  markFromOnset,
  onsetsInBeat,
  useLiveNoteLights,
} from "./useLiveNoteLights";
import { useSongActions } from "./useSongActions";
import { __finishAttemptForTests } from "./useSongAttempt";
import { takePitchFor } from "./useSongTakePitch";
import { scriptFindings, scriptPass } from "./reviewFixtures";
import { buildSchedule } from "../../../songs/schedule";
import type { LiveOnset, TimingBands } from "../../../ipc";
import type { OnsetResult, SongNote, SongScore } from "../../../songs/types";

// ---------------------------------------------------------------------------
// A score, written by hand — eight quarter notes over two bars
// ---------------------------------------------------------------------------

function note(id: number, tick: number, fret: number, over: Partial<SongNote> = {}): SongNote {
  return {
    id,
    tick,
    durTicks: 960,
    string: 3,
    fret,
    midi: 55 + fret,
    tieFromPrevious: false,
    ghost: false,
    dead: false,
    accent: false,
    techniques: [],
    ...over,
  };
}

function twoBars(): SongScore {
  return {
    schema: 1,
    id: "song-1",
    title: "Two bars",
    artist: "Nobody",
    source: { fileName: "two.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
    ],
    notes: Array.from({ length: 8 }, (_, i) => note(i, i * 960, i + 1)),
    sections: [],
  };
}

const WHOLE = { startBar: 0, endBar: 1 };
const BANDS: TimingBands = { windowMs: 80, perfect: 16, good: 40, ok: 80, smallestGapBeats: 1 };

// ---------------------------------------------------------------------------

beforeEach(() => {
  resetTauriMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a mark is the scorer's own band", () => {
  const hit = (deviationMs: number | null): OnsetResult => ({
    id: 0,
    state: "hit",
    deviationMs,
    pass: 0,
  });

  it("takes two steps either side of the beat, at the thresholds it was given", () => {
    expect(markFor(hit(0), BANDS)).toBe("onTime");
    expect(markFor(hit(15.9), BANDS)).toBe("onTime");
    expect(markFor(hit(-20), BANDS)).toBe("slightlyEarly");
    expect(markFor(hit(20), BANDS)).toBe("slightlyLate");
    expect(markFor(hit(-60), BANDS)).toBe("early");
    expect(markFor(hit(60), BANDS)).toBe("late");
  });

  it("never turns a soft onset into a miss", () => {
    expect(markFor({ id: 0, state: "softAbsent", deviationMs: null, pass: 0 }, BANDS)).toBe(
      "notAssessed",
    );
  });

  it("calls a miss a miss", () => {
    expect(markFor({ id: 0, state: "miss", deviationMs: null, pass: 0 }, BANDS)).toBe("missed");
  });

  /**
   * With no bands there are no boundaries, so the review draws a coarser
   * picture rather than a wrong one — everything that landed is on time and
   * everything that did not is missed.
   */
  it("goes coarse rather than guessing when nobody said what the bands are", () => {
    expect(markFor(hit(-60), null)).toBe("onTime");
    expect(markFor({ id: 0, state: "miss", deviationMs: null, pass: 0 }, null)).toBe("missed");
  });

  it("gives every state a glyph, so a colour is never the only signal", () => {
    const glyphs = Object.values(MARK_GLYPH);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(glyphs.every((g) => g.length > 0)).toBe(true);
  });

  it("counts every pass anybody reported, including one only an extra reached", () => {
    expect(passesIn([hit(0)], [{ beat: 1, pass: 2 }])).toEqual([0, 1, 2]);
  });
});

describe("what the ear said", () => {
  it("names the note that was actually heard", () => {
    expect(noteNameOf(60)).toBe("C4");
    expect(noteNameOf(66.4)).toBe("F#4");
  });

  it("is honest about a chord rather than guessing at it", () => {
    expect(
      pitchMarkFor({
        noteId: 0,
        onsetId: 0,
        expectedMidi: 60,
        heardMidi: null,
        centsOff: null,
        state: "notAssessed",
        confidence: 0,
      }),
    ).toEqual({ kind: "notAssessed" });
  });

  it("does not claim a wrong note when nothing was heard at all", () => {
    expect(
      pitchMarkFor({
        noteId: 0,
        onsetId: 0,
        expectedMidi: 60,
        heardMidi: null,
        centsOff: null,
        state: "wrong",
        confidence: 0,
      }),
    ).toEqual({ kind: "unheard" });
  });
});

describe("the tab, coloured by a fixture attempt", () => {
  const score = twoBars();
  const schedule = buildSchedule(score, WHOLE);

  it("draws a column per attack, grouped by bar", () => {
    const pass = scriptPass(schedule, "clean", { quarterMs: 500 });
    render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={0}
      />,
    );
    expect(document.querySelectorAll(".songs-review-bar")).toHaveLength(2);
    expect(document.querySelectorAll(".songs-review-col")).toHaveLength(8);
  });

  it("marks the bars that went wrong and leaves the rest alone", () => {
    const pass = scriptPass(schedule, "missed", { quarterMs: 500, passes: 1 });
    render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={0}
      />,
    );
    const marks = [...document.querySelectorAll<HTMLElement>(".songs-review-col")].map((c) =>
      c.getAttribute("data-mark"),
    );
    // The recipe breaks the back half: four on time, four missed, and the two
    // extras the hand added while the ear was lost.
    expect(marks.filter((m) => m === "onTime")).toHaveLength(4);
    expect(marks.filter((m) => m === "missed")).toHaveLength(4);
    expect(marks.filter((m) => m === "extra")).toHaveLength(2);
  });

  it("puts an extra between the notes it fell between", () => {
    const pass = scriptPass(schedule, "missed", { quarterMs: 500, passes: 1 });
    render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={0}
      />,
    );
    // The extras are at beats 4.5 and 5.25 — inside the second bar, after its
    // first note and before its second.
    const secondBar = document.querySelectorAll(".songs-review-bar")[1];
    const marks = [...secondBar.querySelectorAll<HTMLElement>(".songs-review-col")].map((c) =>
      c.getAttribute("data-mark"),
    );
    expect(marks[0]).toBe("missed");
    expect(marks[1]).toBe("extra");
  });

  it("shows one go at a time, and they differ", () => {
    const pass = scriptPass(schedule, "missed", { quarterMs: 500, passes: 2 });
    // Make the second go clean, so stepping through them is visible.
    for (const r of pass.results) {
      if (r.pass === 1 && r.state === "miss") {
        r.state = "hit";
        r.deviationMs = 2;
      }
    }
    const view = render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={0}
      />,
    );
    const missesIn = () =>
      [...document.querySelectorAll(".songs-review-col")].filter(
        (c) => c.getAttribute("data-mark") === "missed",
      ).length;
    expect(missesIn()).toBe(4);
    view.rerender(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={1}
      />,
    );
    expect(missesIn()).toBe(0);
  });

  it("draws only the bars it was asked for", () => {
    const pass = scriptPass(schedule, "clean", { quarterMs: 500 });
    render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        showRange={{ startBar: 1, endBar: 1 }}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={0}
      />,
    );
    expect(document.querySelectorAll(".songs-review-bar")).toHaveLength(1);
    expect(document.querySelectorAll(".songs-review-col")).toHaveLength(4);
  });

  it("says nothing rather than drawing an empty box", () => {
    render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={[]}
        extras={[]}
        bands={BANDS}
        pass={0}
      />,
    );
    expect(document.querySelector(".songs-review-tab")).toBeNull();
    expect(screen.getByText(/nothing was played/i)).toBeTruthy();
  });

  it("names the note that was heard under a note that was not the written one", () => {
    const pass = scriptPass(schedule, "clean", { quarterMs: 500 });
    render(
      <ReviewTab
        score={score}
        scheduleRange={WHOLE}
        schedule={schedule}
        results={pass.results}
        extras={pass.extras}
        bands={BANDS}
        pass={0}
        pitch={[
          {
            noteId: 2,
            onsetId: 2,
            expectedMidi: 58,
            heardMidi: 60,
            centsOff: 200,
            state: "wrong",
            confidence: 0.9,
          },
        ]}
      />,
    );
    expect(screen.getByText("C4")).toBeTruthy();
  });

  it("whispers about an accent that was written and did not come out", () => {
    const accented = twoBars();
    accented.notes[0] = note(0, 0, 1, { accent: true });
    const withAccent = buildSchedule(accented, WHOLE);
    render(
      <ReviewTab
        score={accented}
        scheduleRange={WHOLE}
        schedule={withAccent}
        results={[{ id: 0, state: "hit", deviationMs: 1, pass: 0, accentHeard: false }]}
        extras={[]}
        bands={BANDS}
        pass={0}
      />,
    );
    expect(document.querySelector(".songs-review-accent")).not.toBeNull();
  });
});

describe("the live lights, which are a stand-in and say so", () => {
  it("reads a beat's verdict the way the review reads an onset's", () => {
    const feedback = {
      beatIndex: 0,
      intervalErrorMs: 0,
      amplitude: 1,
      calibrationOffsetMs: 0,
      calibrationConfidence: 1,
      gridCorrelation: 1,
    };
    expect(markFromFeedback({ ...feedback, classification: "perfect", deviationMs: 0 })).toBe(
      "onTime",
    );
    expect(markFromFeedback({ ...feedback, classification: "ok", deviationMs: -40 })).toBe("early");
    expect(markFromFeedback({ ...feedback, classification: "ok", deviationMs: 40 })).toBe("late");
    expect(markFromFeedback({ ...feedback, classification: "miss", deviationMs: 0 })).toBe("missed");
  });

  /** A beat nobody played over is not a verdict about the score. */
  it("says nothing about a beat that was skipped", () => {
    expect(
      markFromFeedback({
        beatIndex: 0,
        intervalErrorMs: 0,
        amplitude: 0,
        calibrationOffsetMs: 0,
        calibrationConfidence: 1,
        gridCorrelation: 1,
        classification: "skipped",
        deviationMs: 0,
      }),
    ).toBeNull();
  });

  it("lights every attack inside one beat — which is the smear it admits to", () => {
    const score = twoBars();
    const sixteenths = buildSchedule(
      { ...score, notes: [0, 1, 2, 3].map((i) => note(i, i * 240, i + 1)) },
      WHOLE,
    );
    expect(onsetsInBeat(sixteenths, 0.3)).toEqual([0, 1, 2, 3]);
    expect(onsetsInBeat(sixteenths, 1.1)).toEqual([]);
  });

  it("draws a live note's verdict on the same bands the review will", () => {
    // The point of going through `markFor`: a note that lights amber while
    // the pass runs must not turn green in the panel underneath it a second
    // later. Same function, same bands, same answer.
    const live = (deviationMs: number | null, state: LiveOnset["state"] = "hit"): LiveOnset => ({
      id: 3,
      pass: 0,
      state,
      deviationMs,
    });
    expect(markFromOnset(live(4), BANDS)).toBe("onTime");
    expect(markFromOnset(live(-30), BANDS)).toBe("slightlyEarly");
    expect(markFromOnset(live(60), BANDS)).toBe("late");
    expect(markFromOnset(live(null, "miss"), BANDS)).toBe("missed");
    expect(markFromOnset(live(null, "softAbsent"), BANDS)).toBe("notAssessed");
    // No bands — an older build, or a command that did not answer. Coarser,
    // and not wrong.
    expect(markFromOnset(live(60), null)).toBe("onTime");
  });
});

describe("the live lights, per note, while the pass runs", () => {
  /** The callback the hook handed to `listen` for one event name. */
  function listenerFor(event: string): ((payload: { payload: unknown }) => void) | undefined {
    const call = [...mockListen.mock.calls].reverse().find(([name]) => name === event);
    return call?.[1] as ((payload: { payload: unknown }) => void) | undefined;
  }

  function sixteenthsSchedule() {
    const score = twoBars();
    return buildSchedule(
      { ...score, notes: [0, 1, 2, 3].map((i) => note(i, i * 240, i + 1)) },
      WHOLE,
    );
  }

  it("lights the note the analyzer named, and only that one", async () => {
    const schedule = sixteenthsSchedule();
    const { result } = renderHook(() =>
      useLiveNoteLights({ schedule, beatInRange: 0.3, isPlaying: true, bpm: 120 }),
    );
    // The bands come back from an invoke the hook fires on mount.
    await act(async () => {
      await Promise.resolve();
    });
    const onScore = listenerFor("score-onset");
    expect(onScore).toBeTypeOf("function");
    act(() => {
      onScore?.({ payload: { id: 2, pass: 0, state: "hit", deviationMs: 0 } });
    });
    expect([...result.current.entries()]).toEqual([[2, "onTime"]]);
  });

  it("stops smearing the beat as soon as a note has been named", async () => {
    const schedule = sixteenthsSchedule();
    const { result } = renderHook(() =>
      useLiveNoteLights({ schedule, beatInRange: 0.3, isPlaying: true, bpm: 120 }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const onBeat = listenerFor("beat-feedback");
    const onScore = listenerFor("score-onset");
    const beat = {
      beatIndex: 0,
      intervalErrorMs: 0,
      amplitude: 1,
      calibrationOffsetMs: 0,
      calibrationConfidence: 1,
      gridCorrelation: 1,
      classification: "perfect",
      deviationMs: 0,
    };
    // Before the analyzer has said anything about a note, the beat's verdict
    // is all there is and it lights all four attacks inside that beat.
    act(() => {
      onBeat?.({ payload: beat });
    });
    expect(result.current.size).toBe(4);
    // The first per-note verdict takes over. The beat events that follow it
    // are ignored rather than repainting three notes the analyzer has a
    // better answer for.
    act(() => {
      onScore?.({ payload: { id: 1, pass: 0, state: "miss", deviationMs: null } });
    });
    act(() => {
      onBeat?.({ payload: { ...beat, classification: "perfect" } });
    });
    expect(result.current.get(1)).toBe("missed");
  });

  it("clears the page when the transport stops", async () => {
    const schedule = sixteenthsSchedule();
    const { result, rerender } = renderHook(
      ({ playing }: { playing: boolean }) =>
        useLiveNoteLights({ schedule, beatInRange: 0.3, isPlaying: playing, bpm: 120 }),
      { initialProps: { playing: true } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      listenerFor("score-onset")?.({
        payload: { id: 0, pass: 0, state: "hit", deviationMs: 0 },
      });
    });
    expect(result.current.size).toBe(1);
    rerender({ playing: false });
    expect(result.current.size).toBe(0);
  });
});

describe("the stop", () => {
  const score = twoBars();
  const schedule = buildSchedule(score, WHOLE);
  const pass = {
    score,
    scoreId: "song-1",
    schedule,
    range: WHOLE,
    tempoPercent: 80,
    bpm: 96,
    startedAt: 1_700_000_000_000,
  };

  function segment(results: OnsetResult[]) {
    return {
      score: 72,
      onsetResults: results,
      extraOnsets: [],
    } as never;
  }

  it("closes the segment, clears the schedule, saves, and judges — in that order", async () => {
    const findings = scriptFindings(score, schedule, "rushing", scriptPass(schedule, "rushing"));
    setInvokeResponse("analyze_attempt", findings);
    setInvokeResponse("score_timing_bands", BANDS);

    const runRef = { current: segment(scriptPass(schedule, "rushing").results) };
    const waiterRef = { current: null as null | (() => void) };
    const result = await __finishAttemptForTests(pass, runRef, waiterRef);

    const calls = mockInvoke.mock.calls.map((c) => c[0]);
    expect(calls.indexOf("close_open_segment")).toBeLessThan(calls.indexOf("clear_score_schedule"));
    expect(calls.indexOf("clear_score_schedule")).toBeLessThan(calls.indexOf("save_attempt"));
    expect(calls).toContain("score_timing_bands");
    expect(calls).toContain("analyze_attempt");
    expect(result.kind).toBe("review");
  });

  it("does not compare the attempt against itself", async () => {
    setInvokeResponse("analyze_attempt", []);
    const runRef = { current: segment(scriptPass(schedule, "clean").results) };
    const result = await __finishAttemptForTests(pass, runRef, { current: null });
    const judged = mockInvoke.mock.calls.find((c) => c[0] === "analyze_attempt");
    const request = (judged?.[1] as { request: Record<string, unknown> }).request;
    expect(request.excludeAttemptId).toBe(
      result.kind === "review" ? result.review.attemptId : undefined,
    );
    expect(request.earlierBars).toEqual({ startBar: 0, endBar: 1 });
  });

  it("keeps nothing and says nothing about a pass under the floor", async () => {
    const short = scriptPass(schedule, "clean").results.slice(0, 7);
    const runRef = { current: segment(short) };
    const result = await __finishAttemptForTests(pass, runRef, { current: null });
    expect(result.kind).toBe("tooShort");
    expect(mockInvoke.mock.calls.map((c) => c[0])).not.toContain("save_attempt");
    expect(mockInvoke.mock.calls.map((c) => c[0])).not.toContain("analyze_attempt");
    // And the schedule is still cleared: the next play is a new attempt.
    expect(mockInvoke.mock.calls.map((c) => c[0])).toContain("clear_score_schedule");
  });

  it("has nothing to say about a segment that carried no verdicts", async () => {
    const result = await __finishAttemptForTests(pass, { current: null }, { current: null });
    expect(result.kind).toBe("nothing");
  });

  /**
   * A build whose Rust half is older than this branch answers none of these.
   * The review still appears — with no colours and no findings — rather than
   * the screen throwing when you stop.
   */
  it("still produces a review when the store and the judgement both refuse", async () => {
    setInvokeResponse("save_attempt", () => {
      throw new Error("no store");
    });
    setInvokeResponse("analyze_attempt", () => {
      throw new Error("no judgement");
    });
    setInvokeResponse("score_timing_bands", () => {
      throw new Error("no bands");
    });
    const runRef = { current: segment(scriptPass(schedule, "clean").results) };
    const result = await __finishAttemptForTests(pass, runRef, { current: null });
    expect(result.kind).toBe("review");
    if (result.kind !== "review") return;
    expect(result.review.saved).toBe(false);
    expect(result.review.bands).toBeNull();
    expect(result.review.findings).toEqual([]);
  });

  it("judges a song that is not in the library by sending the score itself", async () => {
    setInvokeResponse("analyze_attempt", []);
    const runRef = { current: segment(scriptPass(schedule, "clean").results) };
    await __finishAttemptForTests({ ...pass, scoreId: null }, runRef, { current: null });
    const judged = mockInvoke.mock.calls.find((c) => c[0] === "analyze_attempt");
    const request = (judged?.[1] as { request: Record<string, unknown> }).request;
    expect(request.scoreId).toBeUndefined();
    expect(request.score).toBeTruthy();
    expect(mockInvoke.mock.calls.map((c) => c[0])).not.toContain("save_attempt");
  });
});

describe("an action changes the state it names", () => {
  function host() {
    const calls = { range: [] as unknown[], loop: [] as boolean[], percent: [] as number[] };
    const { result } = renderHook(() =>
      useSongActions({
        scoreId: "song-1",
        setRange: (r) => calls.range.push(r),
        setLoop: (l) => calls.loop.push(l),
        setTempoPercent: (p) => calls.percent.push(p),
        review: null,
      }),
    );
    return { calls, result };
  }

  it("loops the played bars the fix named, at the percentage it named", () => {
    const { calls, result } = host();
    const finding = scriptFindings(
      twoBars(),
      buildSchedule(twoBars(), WHOLE),
      "rushing",
      scriptPass(buildSchedule(twoBars(), WHOLE), "rushing"),
      { firstBar: 1, lastBar: 1 },
    )[0];
    act(() => {
      result.current.run(
        { kind: "loopBars", score: "song-1", fromBar: 2, toBar: 2, bpm: 77 },
        finding,
      );
    });
    // Played bars, counted from zero — not the 2 the button printed.
    expect(calls.range).toEqual([{ startBar: 1, endBar: 1 }]);
    expect(calls.loop).toEqual([true]);
    expect(calls.percent).toEqual([80]);
  });

  it("starts a ramp at the bottom of its climb", () => {
    const { calls, result } = host();
    const finding = {
      kind: "tempoCeiling" as const,
      bars: [0, 1] as [number, number],
      noteIds: [],
      severity: 0.5,
      evidence: {
        onsets: 8, hits: 6, hitRate: 0.75, meanDeviationMs: 0, deviationBeats: 0,
        spreadMs: 20, passes: 1, passesAffected: 1, referenceBpm: 120,
      },
      fix: { type: "ramp" as const, start: 0, end: 1, fromPercent: 70, toPercent: 100 },
    };
    act(() => {
      result.current.run({ kind: "ramp", fromBpm: 84, toBpm: 120 }, finding);
    });
    expect(calls.percent).toEqual([70]);
    expect(result.current.ramp).toEqual({
      fromPercent: 70,
      toPercent: 100,
      range: { startBar: 0, endBar: 1 },
    });
  });

  it("puts the click where the fix asked for it", () => {
    const { result } = host();
    const finding = {
      kind: "uneven" as const,
      bars: [0, 1] as [number, number],
      noteIds: [],
      severity: 0.4,
      evidence: {
        onsets: 8, hits: 6, hitRate: 0.75, meanDeviationMs: 0, deviationBeats: 0,
        spreadMs: 20, passes: 1, passesAffected: 1,
      },
      fix: { type: "clickSubdivision" as const, start: 0, end: 1, subdivision: 4 },
    };
    act(() => {
      result.current.run({ kind: "clickSubdivision", subdivision: 4 }, finding);
    });
    expect(mockInvoke.mock.calls.some((c) => c[0] === "set_subdivision")).toBe(true);
  });

  it("does nothing at all with an action that is not this mode's", () => {
    const { calls, result } = host();
    act(() => {
      result.current.run({ kind: "loadJam", jam: "whatever" }, {
        kind: "clean",
        noteIds: [],
        severity: 0,
        evidence: {
          onsets: 8, hits: 8, hitRate: 1, meanDeviationMs: 0, deviationBeats: 0,
          spreadMs: 4, passes: 1, passesAffected: 1,
        },
      });
    });
    expect(calls.range).toEqual([]);
    expect(calls.loop).toEqual([]);
    expect(calls.percent).toEqual([]);
  });
});

describe("asking the ear which note it was", () => {
  const score = twoBars();
  const schedule = buildSchedule(score, WHOLE);
  const pass = scriptPass(schedule, "clean", { quarterMs: 500 });

  const review = {
    attemptId: "a1",
    scoreId: "song-1",
    score,
    schedule,
    range: WHOLE,
    tempoPercent: 80,
    bpm: 96,
    startedAt: 0,
    facts: {
      ...pass,
      passes: 1,
      hits: 8,
      misses: 0,
      softAbsent: 0,
      extraCount: 0,
      meanDevMs: 0,
      madMs: 0,
      scoredOnsets: 8,
    },
    bands: BANDS,
    findings: [],
    saved: true,
  };

  /**
   * The tempo map, not one BPM. A song that steps from 100 to 140 at bar nine
   * has every note after the step read out of the wrong part of the audio
   * without it — and that failure looks like a tracker that cannot hear.
   */
  it("sends the click's tempo across the range, stepping where the score steps", async () => {
    setInvokeResponse("analyze_take_pitch", []);
    await takePitchFor(review, { takeId: "tk1", jamId: "j1", startOffsetMs: 1500 });
    const call = mockInvoke.mock.calls.find((c) => c[0] === "analyze_take_pitch");
    const request = (call?.[1] as { request: Record<string, unknown> }).request;
    expect(request.tempoMap).toBeTruthy();
    expect((request.tempoMap as { beat: number }[])[0].beat).toBe(0);
    expect(request.startOffsetMs).toBe(1500);
    expect(request.scoreId).toBe("song-1");
  });

  it("sends the extras, because they are where the tracker is cut", async () => {
    setInvokeResponse("analyze_take_pitch", []);
    const missed = scriptPass(schedule, "missed", { quarterMs: 500, passes: 1 });
    await takePitchFor(
      { ...review, facts: { ...review.facts, extras: missed.extras } },
      { takeId: "tk1", jamId: "j1", startOffsetMs: 0 },
    );
    const call = mockInvoke.mock.calls.find((c) => c[0] === "analyze_take_pitch");
    const request = (call?.[1] as { request: Record<string, unknown> }).request;
    expect((request.extras as unknown[]).length).toBe(2);
  });

  it("says nothing rather than failing when the take cannot be read", async () => {
    setInvokeResponse("analyze_take_pitch", () => {
      throw new Error("that take was recorded without a microphone");
    });
    await expect(
      takePitchFor(review, { takeId: "tk1", jamId: "j1", startOffsetMs: 0 }),
    ).resolves.toEqual([]);
  });
});
