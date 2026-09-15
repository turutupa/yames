import { describe, expect, it } from "vitest";
import { absoluteBarIndex, bandStateForBar, bandStatesForChorus, practiceConfigFrom } from "./practice";
import type { JamBandState, JamPracticeConfig, JamPracticeSettings } from "./types";

const OFF: JamPracticeSettings = {
  dropOutEvery: 0,
  dropOutBars: 0,
  tradeBars: 0,
  tempoStep: 0,
  tempoEveryChoruses: 0,
};

/**
 * The band's state for a run of absolute bars, so a test can read like the
 * brief does: "bars 8-9 silent". Bar 0 is the first downbeat of the jam.
 */
function overBars(
  count: number,
  formBars: number,
  practice: JamPracticeConfig | null,
): JamBandState[] {
  const out: JamBandState[] = [];
  for (let bar = 0; bar < count; bar += 1) {
    out.push(
      bandStateForBar({
        formBar: bar % formBars,
        chorus: Math.floor(bar / formBars) + 1,
        formBars,
        practice,
      }),
    );
  }
  return out;
}

/** Which absolute bars came back with `state`. */
const barsWhere = (states: JamBandState[], state: JamBandState) =>
  states.flatMap((s, bar) => (s === state ? [bar] : []));

describe("absoluteBarIndex", () => {
  it("counts from 0 at the first downbeat of the first chorus", () => {
    expect(absoluteBarIndex({ formBar: 0, chorus: 1, formBars: 12 })).toBe(0);
    expect(absoluteBarIndex({ formBar: 11, chorus: 1, formBars: 12 })).toBe(11);
    expect(absoluteBarIndex({ formBar: 0, chorus: 2, formBars: 12 })).toBe(12);
    expect(absoluteBarIndex({ formBar: 5, chorus: 3, formBars: 8 })).toBe(21);
  });
});

describe("practiceConfigFrom", () => {
  it("is null when every tool is off", () => {
    expect(practiceConfigFrom(OFF)).toBeNull();
  });

  it("reads 0 as off on both halves of a pair", () => {
    expect(practiceConfigFrom({ ...OFF, dropOutEvery: 8 })).toBeNull();
    expect(practiceConfigFrom({ ...OFF, dropOutBars: 2 })).toBeNull();
  });

  it("turns a drop-out setting into a window", () => {
    expect(practiceConfigFrom({ ...OFF, dropOutEvery: 8, dropOutBars: 2 })).toEqual({
      dropOut: { everyBars: 8, bars: 2 },
      trade: null,
    });
  });

  it("trades the same number of bars both ways", () => {
    // You play as many as the band does; that is what trading fours means.
    expect(practiceConfigFrom({ ...OFF, tradeBars: 4 })).toEqual({
      dropOut: null,
      trade: { bandBars: 4, youBars: 4 },
    });
  });

  it("carries both tools at once", () => {
    expect(
      practiceConfigFrom({ ...OFF, dropOutEvery: 4, dropOutBars: 1, tradeBars: 2 }),
    ).toEqual({ dropOut: { everyBars: 4, bars: 1 }, trade: { bandBars: 2, youBars: 2 } });
  });

  it("ignores the tempo trainer - that is not a per-bar decision", () => {
    expect(practiceConfigFrom({ ...OFF, tempoStep: 4, tempoEveryChoruses: 2 })).toBeNull();
  });
});

describe("drop-out bars", () => {
  const practice: JamPracticeConfig = {
    dropOut: { everyBars: 8, bars: 2 },
    trade: null,
  };

  it("goes silent for bars 8-9 and 20-21 of a 12-bar form", () => {
    // The fact from the brief. The window is phase-locked to the chorus, so
    // the silence falls on the same two bars of the form every time round -
    // bars 8 and 9, then bars 8 and 9 of the next chorus, which are absolute
    // 20 and 21.
    const states = overBars(36, 12, practice);
    expect(barsWhere(states, "silent")).toEqual([8, 9, 20, 21, 32, 33]);
  });

  it("lets the band state the form before it takes anything away", () => {
    const states = overBars(36, 12, practice);
    expect(states.slice(0, 8).every((s) => s === "full")).toBe(true);
  });

  it("never drops out on bar 0 of a chorus, however small everyBars is", () => {
    for (const everyBars of [1, 2, 3, 4, 6]) {
      const states = overBars(24, 12, { dropOut: { everyBars, bars: 1 }, trade: null });
      expect({ everyBars, first: states[0] }).toEqual({ everyBars, first: "full" });
      expect({ everyBars, thirteenth: states[12] }).toEqual({ everyBars, thirteenth: "full" });
    }
  });

  it("opens a window at every multiple of everyBars inside the chorus", () => {
    const states = overBars(12, 12, { dropOut: { everyBars: 4, bars: 2 }, trade: null });
    expect(barsWhere(states, "silent")).toEqual([4, 5, 8, 9]);
  });

  it("stays quiet for as many bars as it was asked for", () => {
    const states = overBars(16, 16, { dropOut: { everyBars: 8, bars: 4 }, trade: null });
    expect(barsWhere(states, "silent")).toEqual([8, 9, 10, 11]);
  });
});

describe("trading", () => {
  it("gives you bars 4-7 and brings the band back in full at 12", () => {
    // The fact from the brief: trading 4 and 4 over a 12-bar form. The band
    // plays the first four, you play the next four, the band plays 8-11, and
    // the new chorus starts the cycle over - so bar 12 is the band's again.
    const states = overBars(24, 12, { dropOut: null, trade: { bandBars: 4, youBars: 4 } });
    expect(barsWhere(states, "hatsOnly")).toEqual([4, 5, 6, 7, 16, 17, 18, 19]);
    expect(states[12]).toBe("full");
    expect(states.slice(12, 16).every((s) => s === "full")).toBe(true);
  });

  it("starts with the band, always - you never open a chorus cold", () => {
    for (const bars of [1, 2, 4, 8]) {
      const states = overBars(32, 16, { dropOut: null, trade: { bandBars: bars, youBars: bars } });
      expect({ bars, first: states[0] }).toEqual({ bars, first: "full" });
    }
  });

  it("trades twos and eights as readily as fours", () => {
    const twos = overBars(8, 8, { dropOut: null, trade: { bandBars: 2, youBars: 2 } });
    expect(barsWhere(twos, "hatsOnly")).toEqual([2, 3, 6, 7]);

    const eights = overBars(32, 32, { dropOut: null, trade: { bandBars: 8, youBars: 8 } });
    expect(barsWhere(eights, "hatsOnly")).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31]);
  });

  it("can give you more bars than the band takes", () => {
    const states = overBars(12, 12, { dropOut: null, trade: { bandBars: 2, youBars: 4 } });
    expect(barsWhere(states, "hatsOnly")).toEqual([2, 3, 4, 5, 8, 9, 10, 11]);
  });
});

describe("both tools at once", () => {
  it("lets silence win the bars where they overlap", () => {
    // Drop-out is the stronger instruction: it is the window that produces
    // the honest score, because nothing bleeds into the mic during it.
    const practice: JamPracticeConfig = {
      dropOut: { everyBars: 4, bars: 2 },
      trade: { bandBars: 4, youBars: 4 },
    };
    const states = overBars(12, 12, practice);
    expect(barsWhere(states, "silent")).toEqual([4, 5, 8, 9]);
    // Bars 6-7 would have been yours; the drop-out took 4-5 out from under
    // the trade, and what is left of your four is still hats.
    expect(states[6]).toBe("hatsOnly");
    expect(states[7]).toBe("hatsOnly");
  });
});

describe("the band with nothing switched on", () => {
  it("plays every bar", () => {
    const states = overBars(24, 12, null);
    expect(states.every((s) => s === "full")).toBe(true);
  });

  it("plays every bar when the config exists but both tools are null", () => {
    const states = overBars(24, 12, { dropOut: null, trade: null });
    expect(states.every((s) => s === "full")).toBe(true);
  });
});

describe("bandStatesForChorus", () => {
  it("returns one state per bar of the form, in order", () => {
    const states = bandStatesForChorus({
      chorus: 1,
      formBars: 12,
      practice: { dropOut: { everyBars: 8, bars: 2 }, trade: null },
    });
    expect(states).toHaveLength(12);
    expect(states).toEqual([
      "full",
      "full",
      "full",
      "full",
      "full",
      "full",
      "full",
      "full",
      "silent",
      "silent",
      "full",
      "full",
    ]);
  });

  it("draws the same chorus whichever chorus it is - the timeline never lies", () => {
    const practice: JamPracticeConfig = {
      dropOut: { everyBars: 8, bars: 2 },
      trade: { bandBars: 4, youBars: 4 },
    };
    const first = bandStatesForChorus({ chorus: 1, formBars: 12, practice });
    for (const chorus of [2, 3, 7, 40]) {
      expect(bandStatesForChorus({ chorus, formBars: 12, practice })).toEqual(first);
    }
  });

  it("says the band plays throughout when nothing is on", () => {
    expect(bandStatesForChorus({ chorus: 1, formBars: 8, practice: null })).toEqual(
      new Array(8).fill("full"),
    );
  });
});
