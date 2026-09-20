/**
 * The tape's model: what the review paints under the picture.
 *
 * Pure arithmetic over a pass the coach has already judged, so it is tested
 * with a hand-made pass rather than a rendered one. The two things worth
 * guarding are the ones a reader cannot check by eye: that everything lands on
 * the ONE clock the picture and the excerpt also read (transport milliseconds,
 * integrated over the tempo steps), and that "next slip" walks mistakes and
 * not merely notes.
 */
import { describe, expect, it } from "vitest";
import { barLengthMs, buildTape, slipJump } from "./tape";
import { passLengthMs } from "./offset";
import { cameraSupport } from "./support";
import { mediaSrc } from "./src";
import type { OnsetResult, ScoreSchedule, SongScore } from "../types";

/** Four bars of 4/4 at 120, with a section name on bar 3. */
function score(): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "Four bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
      { index: 2, startTick: 7680, lengthTicks: 3840, printedBar: 2 },
      { index: 3, startTick: 11520, lengthTicks: 3840, printedBar: 3 },
    ],
    notes: [],
    sections: [{ name: "Chorus", startBar: 2, endBar: 3 }],
  };
}

/** One onset on every quarter of the four bars. */
function schedule(): ScoreSchedule {
  return {
    onsets: Array.from({ length: 16 }, (_, i) => ({
      id: i,
      beat: i,
      noteIds: [i],
      soft: false,
      accent: i % 4 === 0,
    })),
    lengthBeats: 16,
    loops: true,
  };
}

function hit(id: number, deviationMs: number, pass = 0): OnsetResult {
  return { id, state: "hit", deviationMs, pass };
}
function miss(id: number, pass = 0): OnsetResult {
  return { id, state: "miss", deviationMs: null, pass };
}

/** The boundaries the scorer would have used at this tempo. */
const BANDS = { perfect: 25, good: 50, window: 120 };

describe("the tape", () => {
  it("puts every note on the transport's clock", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [hit(0, 0), hit(4, 0), hit(8, 0)],
      extras: [],
      bands: BANDS,
    });
    // 120 BPM: a quarter is 500 ms, so beat 4 is two seconds in.
    expect(tape.ticks.map((t) => Math.round(t.atMs))).toEqual([0, 2000, 4000]);
    expect(tape.passMs).toBeCloseTo(8000, 3);
  });

  it("lays the second time round after the first", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [hit(0, 0, 0), hit(0, 0, 1)],
      extras: [],
      bands: BANDS,
    });
    expect(tape.passes).toEqual([0, 1]);
    expect(tape.ticks.map((t) => Math.round(t.atMs))).toEqual([0, 8000]);
    expect(tape.lengthMs).toBeCloseTo(16_000, 3);
  });

  it("wears the same marks the excerpt does", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [hit(0, 2), hit(1, -35), hit(2, 90), miss(3)],
      extras: [],
      bands: BANDS,
    });
    expect(tape.ticks.map((t) => t.mark)).toEqual([
      "onTime",
      "slightlyEarly",
      "late",
      "missed",
    ]);
  });

  /**
   * A slip is a note the review would have you look at. A note that was a
   * little early is not one — a tape that stopped at every one of those would
   * stop at half the notes in the piece and mean nothing.
   */
  it("counts only the notes worth stopping at as slips", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [hit(0, 2), hit(1, -35), hit(4, 90), miss(8)],
      extras: [],
      bands: BANDS,
    });
    expect(tape.slips.map(Math.round)).toEqual([2000, 4000]);
  });

  it("draws the bar lines, the section names and where a pass opens", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [hit(0, 0)],
      extras: [],
      bands: BANDS,
    });
    expect(tape.bars).toHaveLength(4);
    expect(tape.bars[0].passStart).toBe(true);
    expect(tape.bars[2].section).toBe("Chorus");
    expect(tape.bars.map((b) => b.printedBar)).toEqual([1, 2, 3, 4]);
  });

  it("puts the notes nobody asked for between the notes", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [hit(0, 0), hit(2, 0)],
      extras: [{ beat: 1.5, pass: 0 }],
      bands: BANDS,
    });
    expect(tape.extras.map((e) => Math.round(e.atMs))).toEqual([750]);
  });

  it("runs on the click's tempo, not the score's, when the speed is turned down", () => {
    const slow = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 50,
      results: [hit(4, 0)],
      extras: [],
      bands: BANDS,
    });
    expect(slow.ticks[0].atMs).toBeCloseTo(4000, 3);
    expect(slow.passMs).toBeCloseTo(passLengthMs(score(), { startBar: 0, endBar: 3 }, 50), 3);
  });
});

describe("jumping to a mistake", () => {
  const tape = buildTape({
    score: score(),
    schedule: schedule(),
    range: { startBar: 0, endBar: 3 },
    tempoPercent: 100,
    results: [miss(2), miss(9), miss(14)],
    extras: [],
    bands: BANDS,
  });
  // Half a bar at 120 in 4/4.
  const lead = barLengthMs(score(), { startBar: 0, endBar: 3 }, 100, 0) * 0.5;

  it("lands half a bar before the note, not on it", () => {
    expect(lead).toBeCloseTo(1000, 3);
    const jump = slipJump(tape, 0, 1, lead)!;
    expect(jump.slipMs).toBeCloseTo(1000, 3);
    expect(jump.atMs).toBeCloseTo(0, 3);
  });

  /**
   * Pressing it twice moves twice — which only works because the search runs
   * from the last SLIP and not from where the picture now is. The lead puts
   * the playhead in front of the note it just jumped to, so a search from the
   * playhead would find the same mistake for ever.
   */
  it("moves on when it is pressed again", () => {
    const first = slipJump(tape, 0, 1, lead)!;
    const second = slipJump(tape, first.slipMs, 1, lead)!;
    expect(second.slipMs).toBeCloseTo(4500, 3);
    expect(second.atMs).toBeCloseTo(3500, 3);
    const third = slipJump(tape, second.slipMs, 1, lead)!;
    expect(third.slipMs).toBeCloseTo(7000, 3);
  });

  it("goes back the other way, and says so when there is nowhere to go", () => {
    expect(slipJump(tape, 5000, -1, lead)!.slipMs).toBeCloseTo(4500, 3);
    expect(slipJump(tape, 0, -1, lead)).toBeNull();
    expect(slipJump(tape, 99_999, 1, lead)).toBeNull();
  });

  it("never puts the picture before the start of the take", () => {
    const early = buildTape({
      score: score(),
      schedule: schedule(),
      range: { startBar: 0, endBar: 3 },
      tempoPercent: 100,
      results: [miss(0)],
      extras: [],
      bands: BANDS,
    });
    expect(slipJump(early, -5000, 1, lead)!.atMs).toBe(0);
  });
});

/**
 * What this webview can do, asked of the browser rather than of the platform.
 *
 * WebKitGTK is the case that matters: some builds have no `MediaRecorder` for
 * video at all, and the switch has to become a sentence rather than a thing
 * that throws when it is pressed.
 */
describe("what the webview can record", () => {
  it("prefers mp4, then VP9, then VP8", () => {
    const only = (type: string) => ({
      mediaDevices: { getUserMedia: () => {}, enumerateDevices: () => {} },
      mediaRecorder: { isTypeSupported: (t: string) => t === type },
    });
    expect(cameraSupport(only("video/mp4;codecs=avc1"))).toEqual({
      ok: true,
      mimeType: "video/mp4;codecs=avc1",
      container: "mp4",
    });
    expect(cameraSupport(only("video/webm;codecs=vp9"))).toEqual({
      ok: true,
      mimeType: "video/webm;codecs=vp9",
      container: "webm",
    });
    expect(cameraSupport(only("video/webm;codecs=vp8")).ok).toBe(true);
  });

  it("says which part is missing, in the order a person would ask", () => {
    expect(cameraSupport({ mediaDevices: undefined, mediaRecorder: undefined })).toEqual({
      ok: false,
      reason: "noDevices",
    });
    expect(
      cameraSupport({ mediaDevices: { getUserMedia: () => {} }, mediaRecorder: undefined }),
    ).toEqual({ ok: false, reason: "noRecorder" });
    expect(
      cameraSupport({
        mediaDevices: { getUserMedia: () => {} },
        mediaRecorder: { isTypeSupported: () => false },
      }),
    ).toEqual({ ok: false, reason: "noContainer" });
  });

  /** A build whose `isTypeSupported` throws is a "no", not a crash. */
  it("treats a thrown answer as no", () => {
    expect(
      cameraSupport({
        mediaDevices: { getUserMedia: () => {} },
        mediaRecorder: {
          isTypeSupported: () => {
            throw new Error("nope");
          },
        },
      }),
    ).toEqual({ ok: false, reason: "noContainer" });
  });
});

describe("a path as a media source", () => {
  /** The harness hands the review a blob URL; it has to survive untouched. */
  it("leaves something that is already a URL alone", () => {
    expect(mediaSrc("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    expect(mediaSrc("https://example.test/x.webm")).toBe("https://example.test/x.webm");
  });
});
