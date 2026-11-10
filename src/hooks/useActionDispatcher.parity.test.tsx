/**
 * P5: every action, on every view, does what it did.
 *
 * Forty-two actions reach the app by key, MIDI, gamepad and pedal, and they all
 * come through this one dispatcher. Its `play` action is a chain of branches, one
 * per view, and a view with no branch silently does nothing: that shipped once on
 * Songs. So the table below says, for each action, exactly where it works and what
 * it does there, and every situation it is not listed in must do NOTHING.
 *
 * **A new view has to be added to `SITUATIONS`, and that is the point.** The test
 * "knows every view there is" fails until someone has decided what all 42 actions
 * do on it. See TOOLS_PARITY.md section 3.1 item 6.
 *
 * Known gaps are pinned as they are, not as they should be: `toggle-sidebar` is
 * ignored on the Setlist, and `toggle-coach` on the Setlist and Songs (section 6.1
 * item 14). Keep them or change them, but on purpose.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { renderHook } from "@testing-library/react";
import { actionForCombo, HOTKEYS, type HotkeyAction } from "../hotkeys";
import { DEFAULT_TEST_STATE, mockInvoke } from "../test/mocks";
import { TOOLS } from "../test/parity/tools";
import type { AppState } from "../types";
import { useActionDispatcher, type ViewName } from "./useActionDispatcher";

const win = vi.hoisted(() => ({
  isFullscreen: vi.fn(() => Promise.resolve(false)),
  setFullscreen: vi.fn(() => Promise.resolve()),
  setAlwaysOnTop: vi.fn(() => Promise.resolve()),
  setFocus: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));

interface Situation {
  view: ViewName;
  setlistLoaded?: boolean;
  jamLoaded?: boolean;
  jamEditorOpen?: boolean;
  songsLoaded?: boolean;
  ramping?: boolean;
}

const SITUATIONS = {
  beat: { view: "beat" },
  drill: { view: "drill" },
  drillRamping: { view: "drill", ramping: true },
  setlist: { view: "setlist", setlistLoaded: true },
  setlistEmpty: { view: "setlist" },
  jam: { view: "jam", jamLoaded: true },
  jamEmpty: { view: "jam" },
  jamEditor: { view: "jam", jamLoaded: true, jamEditorOpen: true },
  songs: { view: "songs", songsLoaded: true },
  songsEmpty: { view: "songs" },
  settings: { view: "settings" },
} as const satisfies Record<string, Situation>;

type Where = keyof typeof SITUATIONS;
const EVERYWHERE = Object.keys(SITUATIONS) as Where[];
const without = (...not: Where[]) => EVERYWHERE.filter((w) => !not.includes(w));

/** The meter and tempo actions work everywhere except Settings. */
const NOT_SETTINGS = without("settings");
/** And the meter ones not on a loaded jam, where the groove owns the meter. */
const METER = without("settings", "jam", "jamEditor");

const STATE: AppState = {
  ...DEFAULT_TEST_STATE,
  bpm: 100,
  subdivision: 1,
  beatGroups: [4],
  freeMode: false,
};

/** What one action is documented to do, as what `observe` would report. */
type Row = { where: readonly Where[]; does: readonly string[] };

const bpmTo = (bpm: number) => [`invoke set_bpm ${JSON.stringify({ bpm })}`];
const sub = (subdivision: number) => [
  `invoke set_subdivision ${JSON.stringify({ subdivision })}`,
];
const groups = (g: number[]) => [`invoke set_beat_groups ${JSON.stringify({ groups: g })}`];

const JAM = (name: string): Row => ({ where: ["jam"], does: [`jam ${name}`] });
const SONGS = (...what: string[]): Row => ({ where: ["songs"], does: what.map((w) => `songs ${w}`) });

/** `Record<HotkeyAction, …>`: a new action does not compile until it has a row. */
const ACTIONS: Record<HotkeyAction, Row | Partial<Record<Where, readonly string[]>>> = {
  // `play` is different in every mode, and an empty stage starts nothing.
  play: {
    beat: ["invoke toggle_playback"],
    drill: ["invoke start_speed_ramp"],
    drillRamping: ["invoke stop_speed_ramp"],
    setlist: ["invoke toggle_playback"],
    jam: ["onToggleJam"],
    jamEditor: ["onToggleJam"],
    songs: ["invoke toggle_playback"],
  },
  "bpm-up": { where: NOT_SETTINGS, does: bpmTo(105) },
  "bpm-down": { where: NOT_SETTINGS, does: bpmTo(95) },
  "bpm-up-1": { where: NOT_SETTINGS, does: bpmTo(101) },
  "bpm-down-1": { where: NOT_SETTINGS, does: bpmTo(99) },
  "sub-next": { where: METER, does: sub(2) },
  "sub-prev": { where: METER, does: sub(6) },
  "sub-1": { where: METER, does: sub(1) },
  "sub-2": { where: METER, does: sub(2) },
  "sub-3": { where: METER, does: sub(3) },
  "sub-4": { where: METER, does: sub(4) },
  "sig-next": { where: METER, does: groups([3, 2]) },
  "sig-prev": { where: METER, does: groups([3]) },
  fullscreen: { where: NOT_SETTINGS, does: ["setIsFullscreen true"] },
  "os-fullscreen": { where: NOT_SETTINGS, does: ["window.setFullscreen true"] },
  "toggle-widget": { where: EVERYWHERE, does: ["invoke show_floating"] },
  "toggle-sidebar": {
    where: ["beat", "drill", "drillRamping", "jam", "jamEmpty", "jamEditor", "songs", "songsEmpty"],
    does: ["setSidebarOpen"],
  },
  "toggle-coach": {
    where: ["beat", "drill", "drillRamping", "jam", "jamEmpty", "jamEditor"],
    does: ["toggleCard"],
  },
  // The saved meaning of these five is exactly this, whatever else the rail grows.
  "tab-1": { where: EVERYWHERE, does: ["setView beat"] },
  "tab-2": { where: EVERYWHERE, does: ["setView setlist"] },
  "tab-3": { where: EVERYWHERE, does: ["setView drill"] },
  "tab-4": { where: EVERYWHERE, does: ["setView jam"] },
  "tab-5": { where: EVERYWHERE, does: ["setView songs"] },
  // Settings is a layer: closing it returns to the mode it covered.
  settings: {
    ...Object.fromEntries(without("settings").map((w) => [w, ["setView settings"]])),
    settings: ["setView drill"],
  },
  "jam-next-groove": JAM("nextGroove"),
  "jam-prev-groove": JAM("prevGroove"),
  "jam-trade": JAM("toggleTrade"),
  "jam-dropout": JAM("toggleDropOut"),
  "jam-next-shape": JAM("nextShape"),
  "jam-next-section": JAM("nextSection"),
  "jam-prev-section": JAM("prevSection"),
  "jam-loop-section": JAM("loopSection"),
  "jam-take": JAM("toggleTakes"),
  "jam-camera": JAM("toggleCamera"),
  "songs-loop-start": SONGS("loopStartsHere"),
  "songs-loop-end": SONGS("loopEndsHere"),
  "songs-loop": SONGS("toggleLoop"),
  "songs-loop-clear": SONGS("clearSelection"),
  "songs-loop-earlier": SONGS("nudge -1"),
  "songs-loop-later": SONGS("nudge 1"),
  "songs-take": SONGS("toggleTakes"),
  "songs-camera": SONGS("toggleCamera"),
};

function expectedFor(action: HotkeyAction, where: Where): readonly string[] {
  const row = ACTIONS[action];
  if ("does" in row) return (row as Row).where.includes(where) ? (row as Row).does : [];
  return (row as Partial<Record<Where, readonly string[]>>)[where] ?? [];
}

/** Run one action in one situation and report everything it set off. */
async function observe(action: HotkeyAction, where: Where, state: AppState = STATE) {
  const s: Situation = SITUATIONS[where];
  const seen: string[] = [];
  const spy = (label: string) => (...args: unknown[]) => {
    seen.push(args.length && typeof args[0] !== "function" ? `${label} ${args[0]}` : label);
  };
  const named = (prefix: string, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, spy(`${prefix} ${n}`)]));
  const { result } = renderHook(() =>
    useActionDispatcher({
      view: s.view,
      setView: spy("setView") as (v: ViewName) => void,
      prevTab: { current: "drill" },
      setlistLoaded: s.setlistLoaded === true,
      jamLoaded: s.jamLoaded === true,
      jamEditorOpen: s.jamEditorOpen === true,
      onToggleJam: spy("onToggleJam"),
      jamActions: named("jam", [
        "nextGroove",
        "prevGroove",
        "toggleTrade",
        "toggleDropOut",
        "nextShape",
        "nextSection",
        "prevSection",
        "loopSection",
        "toggleTakes",
        "toggleCamera",
      ]) as never,
      songsLoaded: s.songsLoaded === true,
      songsActions: named("songs", [
        "loopStartsHere",
        "loopEndsHere",
        "toggleLoop",
        "clearSelection",
        "nudge",
        "toggleTakes",
        "toggleCamera",
      ]) as never,
      state: {
        ...state,
        speedRamp: { ...state.speedRamp, active: s.ramping === true },
      },
      isFullscreen: false,
      setIsFullscreen: spy("setIsFullscreen"),
      setIsOsFullscreen: () => {},
      setSidebarOpen: spy("setSidebarOpen") as never,
      toggleCard: spy("toggleCard"),
      forceWebviewFocus: () => Promise.resolve(),
    }),
  );
  mockInvoke.mockClear();
  win.setFullscreen.mockClear();
  result.current(action);
  // The fullscreen branches and the hint bookkeeping finish a few ticks later.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (const [cmd, args] of mockInvoke.mock.calls) {
    seen.push(args === undefined ? `invoke ${cmd}` : `invoke ${cmd} ${JSON.stringify(args)}`);
  }
  for (const [value] of win.setFullscreen.mock.calls as unknown as Array<[boolean]>) {
    seen.push(`window.setFullscreen ${value}`);
  }
  return seen;
}

describe("the action table", () => {
  it("has a row for every action", () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(HOTKEYS.map((h) => h.id).sort());
    expect(HOTKEYS.length).toBeGreaterThanOrEqual(42);
  });

  it("knows every view there is: a new one needs a decision for all 42", () => {
    const covered = [...new Set(Object.values(SITUATIONS).map((s) => s.view as string))].sort();
    const union = (file: string, name: string) => {
      const found = new RegExp(`type ${name}\\s*=([^;]+);`).exec(fs.readFileSync(file, "utf8"));
      return [...(found?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();
    };
    expect(union("src/hooks/useActionDispatcher.ts", "ViewName")).toEqual(covered);
    expect(union("src/containers/main-window/MainHeader.tsx", "MainView")).toEqual(covered);
  });
});

describe("every action in every situation", () => {
  const cases = HOTKEYS.flatMap((h) =>
    EVERYWHERE.map((where) => [h.id, where] as [HotkeyAction, Where]),
  );

  it.each(cases)("%s on %s", async (action, where) => {
    expect(await observe(action, where)).toEqual(expectedFor(action, where));
  });
});

describe("the limits of the tempo keys", () => {
  beforeEach(() => mockInvoke.mockClear());

  it("stop at 300", async () => {
    expect(await observe("bpm-up", "beat", { ...STATE, bpm: 299 })).toEqual(bpmTo(300));
  });

  it("stop at 20", async () => {
    expect(await observe("bpm-down", "beat", { ...STATE, bpm: 21 })).toEqual(bpmTo(20));
  });

  it("step the subdivision round from the top", async () => {
    expect(await observe("sub-next", "beat", { ...STATE, subdivision: 6 })).toEqual(sub(1));
  });
});

describe("the shared keys", () => {
  const defaults = Object.fromEntries(HOTKEYS.map((h) => [h.id, h.key]));

  // Each key belongs to several actions. Which one depends on the tab, and a new
  // view named unlike its action prefix would quietly change these. KEY-06.
  const table: Array<[string, Partial<Record<ViewName, HotkeyAction>>]> = [
    ["[", { beat: "sub-prev", setlist: "sub-prev", drill: "sub-prev", jam: "sub-prev", songs: "songs-loop-start" }],
    ["]", { beat: "sub-next", setlist: "sub-next", drill: "sub-next", jam: "sub-next", songs: "songs-loop-end" }],
    ["L", { jam: "jam-loop-section", songs: "songs-loop" }],
    ["R", { jam: "jam-take", songs: "songs-take" }],
    ["C", { beat: "toggle-coach", drill: "toggle-coach", jam: "jam-camera", songs: "songs-camera" }],
    ["Space", { beat: "play", setlist: "play", drill: "play", jam: "play", songs: "play" }],
  ];

  const cases = table.flatMap(([combo, byView]) =>
    Object.entries(byView).map(([view, action]) => [combo, view, action] as const),
  );

  it.each(cases)("%s on %s means %s", (combo, view, action) => {
    expect(actionForCombo(defaults, combo, view)).toBe(action);
  });
});

describe("the tab hotkeys", () => {
  // Positional and stored. The last renumbering moved Drill and did not migrate
  // anybody's bindings (SYS-33). Today gets an action of its own.
  it.each(TOOLS.map((t) => [t.action, t.mode] as const))("%s opens %s", async (action, mode) => {
    expect(await observe(action, "beat")).toEqual([`setView ${mode}`]);
  });

  it("keep the keys players have learned", () => {
    const keyOf = (id: string) => HOTKEYS.find((h) => h.id === id)?.key;
    expect(TOOLS.map((t) => keyOf(t.action))).toEqual(["⌘1", "⌘2", "⌘3", "⌘4", "⌘5"]);
  });
});
