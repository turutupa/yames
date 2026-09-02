/**
 * The six trigger predicates (ONBOARDING_PLAN §5) as pure functions.
 *
 * Everything here is plain data in, boolean out — no React, no store, no
 * Tauri. Each rule gets its positive case and the cases that must NOT fire,
 * because a hint that appears at the wrong moment is worse than no hint.
 */
import { describe, expect, it } from "vitest";
import type { Preset } from "../../../types";
import {
  PRESET_SUGGEST_SESSIONS,
  SETUP_HISTORY_LIMIT,
  WIDGET_DISCOVER_SESSION,
  presetMatchesSetup,
  recordSetup,
  sessionsWithSetup,
  setupKey,
  shouldHintCoachAsk,
  shouldHintDrillFirstOpen,
  shouldHintMidiPlugged,
  shouldHintWidgetDiscover,
  shouldHintZenFirst,
  shouldSuggestPreset,
  type SetupRecord,
  type SetupSignature,
} from "./triggers";

const SETUP: SetupSignature = { bpm: 120, subdivision: 2, groups: [3, 2, 2] };

function preset(over: Partial<Preset> = {}): Preset {
  return {
    id: "p1",
    name: "Preset",
    createdAt: 0,
    bpm: 120,
    subdivision: 2,
    timeSignature: 7,
    beatGroups: [3, 2, 2],
    soundType: "click",
    volume: 0.7,
    view: "beat",
    ...over,
  };
}

function history(sessions: number[], setup: SetupSignature = SETUP): SetupRecord[] {
  return sessions.map((session) => ({ ...setup, session }));
}

describe("drill-first-open", () => {
  it("fires on the Drill tab only", () => {
    expect(shouldHintDrillFirstOpen("drill")).toBe(true);
    expect(shouldHintDrillFirstOpen("beat")).toBe(false);
    expect(shouldHintDrillFirstOpen("track")).toBe(false);
    expect(shouldHintDrillFirstOpen("settings")).toBe(false);
  });
});

describe("preset-suggest", () => {
  it("setupKey distinguishes BPM, subdivision and beat groups", () => {
    expect(setupKey(SETUP)).toBe(setupKey({ ...SETUP, groups: [3, 2, 2] }));
    expect(setupKey(SETUP)).not.toBe(setupKey({ ...SETUP, bpm: 121 }));
    expect(setupKey(SETUP)).not.toBe(setupKey({ ...SETUP, subdivision: 3 }));
    // Same beat count, different grouping — a different feel, so a different setup.
    expect(setupKey(SETUP)).not.toBe(setupKey({ ...SETUP, groups: [2, 2, 3] }));
  });

  it("matches a preset on bpm + subdivision + groups", () => {
    expect(presetMatchesSetup(preset(), SETUP)).toBe(true);
    expect(presetMatchesSetup(preset({ bpm: 100 }), SETUP)).toBe(false);
    expect(presetMatchesSetup(preset({ subdivision: 4 }), SETUP)).toBe(false);
    expect(presetMatchesSetup(preset({ beatGroups: [4] }), SETUP)).toBe(false);
  });

  it("falls back to timeSignature for presets saved before beat groups", () => {
    const legacy = preset({ beatGroups: undefined, timeSignature: 4 });
    expect(presetMatchesSetup(legacy, { bpm: 120, subdivision: 2, groups: [4] })).toBe(true);
    expect(presetMatchesSetup(legacy, SETUP)).toBe(false);
  });

  it("records one entry per (session, setup) and caps the history", () => {
    const rec: SetupRecord = { ...SETUP, session: 1 };
    const once = recordSetup([], rec);
    expect(once).toHaveLength(1);
    // Same session, same setup — nothing to add, and the same array back so
    // the caller can skip the store write.
    expect(recordSetup(once, rec)).toBe(once);
    // Same setup, next session — a genuinely new data point.
    expect(recordSetup(once, { ...rec, session: 2 })).toHaveLength(2);
    // Same session, different setup — also new.
    expect(recordSetup(once, { ...rec, bpm: 90 })).toHaveLength(2);

    const full = Array.from({ length: SETUP_HISTORY_LIMIT }, (_, i) => ({
      ...SETUP,
      bpm: i,
      session: 1,
    }));
    const capped = recordSetup(full, { ...SETUP, bpm: 999, session: 1 });
    expect(capped).toHaveLength(SETUP_HISTORY_LIMIT);
    expect(capped[0].bpm).toBe(1); // oldest dropped
    expect(capped[capped.length - 1].bpm).toBe(999);
  });

  it("counts distinct sessions, not records", () => {
    const h = [...history([1, 2]), ...history([2])];
    expect(sessionsWithSetup(h, SETUP)).toBe(2);
    expect(sessionsWithSetup(h, { ...SETUP, bpm: 60 })).toBe(0);
  });

  it(`fires after the same setup in ${PRESET_SUGGEST_SESSIONS} sessions with no preset`, () => {
    expect(
      shouldSuggestPreset({ current: SETUP, history: history([1, 2, 3]), presets: [] }),
    ).toBe(true);
  });

  it("stays quiet below the session threshold", () => {
    expect(
      shouldSuggestPreset({ current: SETUP, history: history([1, 2]), presets: [] }),
    ).toBe(false);
  });

  it("stays quiet when the same session is recorded three times", () => {
    expect(
      shouldSuggestPreset({
        current: SETUP,
        history: [...history([7]), ...history([7]), ...history([7])],
        presets: [],
      }),
    ).toBe(false);
  });

  it("stays quiet when a preset already stores the setup", () => {
    expect(
      shouldSuggestPreset({
        current: SETUP,
        history: history([1, 2, 3]),
        presets: [preset()],
      }),
    ).toBe(false);
  });

  it("still fires when the user's presets are all for other setups", () => {
    expect(
      shouldSuggestPreset({
        current: SETUP,
        history: history([1, 2, 3]),
        presets: [preset({ bpm: 90 }), preset({ id: "p2", beatGroups: [4] })],
      }),
    ).toBe(true);
  });
});

describe("coach-ask", () => {
  it("fires on a mini-report and on nothing else in the feed", () => {
    expect(shouldHintCoachAsk("mini-report")).toBe(true);
    expect(shouldHintCoachAsk("session-end")).toBe(false);
    expect(shouldHintCoachAsk("coach-tip")).toBe(false);
    expect(shouldHintCoachAsk("chip-prompt")).toBe(false);
  });
});

describe("zen-first", () => {
  it("fires in Zen only", () => {
    expect(shouldHintZenFirst(true)).toBe(true);
    expect(shouldHintZenFirst(false)).toBe(false);
  });
});

describe("widget-discover", () => {
  it(`waits for session ${WIDGET_DISCOVER_SESSION}`, () => {
    expect(
      shouldHintWidgetDiscover({ session: WIDGET_DISCOVER_SESSION - 1, widgetOpened: false }),
    ).toBe(false);
    expect(
      shouldHintWidgetDiscover({ session: WIDGET_DISCOVER_SESSION, widgetOpened: false }),
    ).toBe(true);
    // Later sessions still qualify — the user may have skipped hints so far.
    expect(
      shouldHintWidgetDiscover({ session: WIDGET_DISCOVER_SESSION + 20, widgetOpened: false }),
    ).toBe(true);
  });

  it("never suggests a widget the user already found", () => {
    expect(
      shouldHintWidgetDiscover({ session: WIDGET_DISCOVER_SESSION + 3, widgetOpened: true }),
    ).toBe(false);
  });

  it("stays quiet before the store has been read (session 0)", () => {
    expect(shouldHintWidgetDiscover({ session: 0, widgetOpened: false })).toBe(false);
  });
});

describe("midi-plugged", () => {
  it("fires when a device is present and nothing is bound", () => {
    expect(shouldHintMidiPlugged({ devices: [{}], bindings: [] })).toBe(true);
  });

  it("stays quiet with no device, or when bindings already exist", () => {
    expect(shouldHintMidiPlugged({ devices: [], bindings: [] })).toBe(false);
    expect(shouldHintMidiPlugged({ devices: [{}], bindings: [{}] })).toBe(false);
    expect(shouldHintMidiPlugged({ devices: [], bindings: [{}] })).toBe(false);
  });
});
