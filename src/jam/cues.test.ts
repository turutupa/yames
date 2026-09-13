import { describe, it, expect } from "vitest";
import {
  countInCue,
  countInPhraseCues,
  perBeatCountFits,
  sectionCue,
  shouldSpeak,
  tradeCue,
} from "./cues";
import { formSectionNames, sectionStarts } from "./forms";

describe("whether the jam speaks at all", () => {
  /**
   * The whole decision, in one place. A fresh install has no voice — Piper is
   * downloaded on purpose in Settings — so "cues on, no voice" is the ordinary
   * case and it has to come out silent rather than as an error.
   */
  it("speaks only when the cues are on AND a voice is set up", () => {
    expect(shouldSpeak({ cues: true, voiceReady: true })).toBe(true);
    expect(shouldSpeak({ cues: true, voiceReady: false })).toBe(false);
    expect(shouldSpeak({ cues: false, voiceReady: true })).toBe(false);
    expect(shouldSpeak({ cues: false, voiceReady: false })).toBe(false);
  });

  it("is silent for a jam that has never been asked", () => {
    expect(shouldSpeak({ voiceReady: true })).toBe(false);
    expect(shouldSpeak({ cues: undefined, voiceReady: true })).toBe(false);
  });
});

describe("the count", () => {
  it("says the number of the beat, one-based", () => {
    expect(countInCue(0)).toEqual({ key: "jam.cues.n1" });
    expect(countInCue(3)).toEqual({ key: "jam.cues.n4" });
    expect(countInCue(7)).toEqual({ key: "jam.cues.n8" });
  });

  it("says nothing past the eighth beat, which the engine cannot count to", () => {
    expect(countInCue(8)).toBeNull();
    expect(countInCue(-1)).toBeNull();
  });

  it("has the whole count to fall back on when the beats are too close together", () => {
    // The numbers, for the caller to join — the same four words, not a
    // second string a translator could write differently.
    expect(countInPhraseCues(4).map((c) => c.key)).toEqual([
      "jam.cues.n1",
      "jam.cues.n2",
      "jam.cues.n3",
      "jam.cues.n4",
    ]);
    expect(countInPhraseCues(0)).toEqual([]);
    // Never longer than the count the engine can arm.
    expect(countInPhraseCues(99)).toHaveLength(8);
  });

  it("counts beat by beat only while an utterance fits inside a beat", () => {
    // 100 BPM is a 600 ms beat; the margin is 70% of it.
    expect(perBeatCountFits({ bpm: 100, speechMs: 300 })).toBe(true);
    expect(perBeatCountFits({ bpm: 100, speechMs: 500 })).toBe(false);
    // 200 BPM is a 300 ms beat: the same utterance no longer fits.
    expect(perBeatCountFits({ bpm: 200, speechMs: 300 })).toBe(false);
  });

  it("tries once before it knows, because trying is how it finds out", () => {
    expect(perBeatCountFits({ bpm: 100, speechMs: null })).toBe(true);
  });
});

describe("the trade", () => {
  it("speaks on the change and not on every bar of it", () => {
    expect(tradeCue({ previous: "full", current: "hatsOnly" })).toEqual({ key: "jam.cue.yours" });
    expect(tradeCue({ previous: "hatsOnly", current: "hatsOnly" })).toBeNull();
    expect(tradeCue({ previous: "hatsOnly", current: "full" })).toEqual({ key: "jam.cue.back" });
    expect(tradeCue({ previous: "full", current: "full" })).toBeNull();
  });

  it("says you are alone when the band goes right out", () => {
    expect(tradeCue({ previous: "full", current: "silent" })).toEqual({ key: "jam.cue.silent" });
    expect(tradeCue({ previous: "silent", current: "full" })).toEqual({ key: "jam.cue.back" });
  });

  it("says nothing on the first bar of a take, having nothing to compare to", () => {
    expect(tradeCue({ previous: null, current: "full" })).toBeNull();
    expect(tradeCue({ previous: null, current: "hatsOnly" })).toBeNull();
  });
});

describe("the section", () => {
  const AABA = { kind: "aaba32", bars: 32 } as const;
  const starts = sectionStarts(AABA);
  const names = formSectionNames(AABA);

  it("names the section on the bar it starts on", () => {
    expect(sectionCue({ bar: 0, starts, names })).toEqual({
      key: "jam.form.section",
      params: { name: "A" },
    });
    expect(sectionCue({ bar: 16, starts, names })).toEqual({
      key: "jam.form.section",
      params: { name: "B" },
    });
  });

  it("says nothing in the middle of one", () => {
    expect(sectionCue({ bar: 3, starts, names })).toBeNull();
    expect(sectionCue({ bar: 17, starts, names })).toBeNull();
  });

  it("says nothing for a form whose sections have no names", () => {
    // A blues is three fours and no musician calls them A, B and C — a voice
    // announcing every four bars would be the first thing anybody turned off.
    const blues = { kind: "blues12", bars: 12 } as const;
    for (const bar of sectionStarts(blues)) {
      expect(
        sectionCue({ bar, starts: sectionStarts(blues), names: formSectionNames(blues) }),
      ).toBeNull();
    }
  });
});
