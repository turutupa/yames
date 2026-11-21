/**
 * The coach's tools in Ask's thread (leg t1b1), against the recording fake
 * host: receipts written from what happened, the way back and its expiry,
 * proposals that do nothing until the press, "Which one?", "that one is
 * yours", and the English the panel shows for them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeHost, toolCtx, type FakeHost } from "../../coach/tools/fakeHost";
import { ALT } from "../../coach/tools/testPaths";
import type { CoachContext } from "../../coach/context";
import type { Subdivision } from "../../types";
import { bannedClaimsIn } from "../../paths/honesty";
import en from "../../locales/en/coachTools.json";
import i18n from "../../i18n";
import { __resetAskStoreForTests, getAskState, useAskState } from "./askStore";
import {
  UNDO_MS,
  __setAskToolsForTests,
  askYours,
  noteAskToolView,
  notNowProposal,
  pressProposal,
  pressUndo,
  runAskCall,
  showMeYours,
  type ToolBody,
} from "./askTools";
import { AskToolTurn } from "./AskToolTurn";
import { NEVER_ITEMS, NEVER_LIST, SHOW_ME_TOOLS } from "./neverList";
import { findTool } from "../../coach/tools/registry";
import { lineKey, lineText } from "./toolWords";

const t = i18n.t.bind(i18n);

function Thread() {
  const { turns } = useAskState();
  return (
    <div>
      {turns.map((turn) => (turn.kind === "tool" ? <AskToolTurn key={turn.id} id={turn.id} body={turn.body} /> : <p key={turn.id}>{turn.kind === "user" ? turn.text : ""}</p>))}
    </div>
  );
}

function lastBody(): ToolBody {
  const turns = getAskState().turns;
  const last = turns[turns.length - 1];
  if (!last || last.kind !== "tool") throw new Error("no tool turn");
  return last.body;
}

function use(host: FakeHost, ctx: CoachContext | (() => CoachContext) = toolCtx()) {
  __setAskToolsForTests(host, ctx);
  return host;
}

beforeEach(() => {
  __resetAskStoreForTests();
  void i18n.changeLanguage("en");
});
afterEach(() => {
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
  vi.useRealTimers();
});

describe("a receipt", () => {
  it("is written from what happened, with its way back; the press goes back once and says so", () => {
    const host = use(fakeHost({ view: "today", paths: [ALT] }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "open_step", args: { path: "alternate", step: 2 } }, "Open Step 2"));
    expect(host.where()).toEqual({ view: "paths", at: { pathId: "alternate-picking", stepId: "ap-2" } });
    expect(screen.getByText("Open Step 2")).toBeInTheDocument();
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("Opened Alternate Picking · Step 2: Crossing two strings");
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent(t("coachTools.source.did"));
    const back = screen.getByTestId("ask-undo");
    expect(back).toHaveTextContent("Back to Today");
    expect(back).toHaveClass("btn-tonal");
    act(() => fireEvent.click(back));
    expect(host.where().view).toBe("today");
    expect(screen.queryByTestId("ask-undo")).toBeNull();
    expect(screen.getByTestId("ask-undone")).toHaveTextContent("Undone. Back on Today");
  });

  it("a way back goes when the player moves to another screen by hand, and does nothing then", () => {
    const host = use(fakeHost({ view: "today", paths: [ALT] }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "go_to", args: { screen: "progress" } }, ""));
    act(() => noteAskToolView("progress"));
    expect(screen.getByTestId("ask-undo")).toBeInTheDocument();
    host.setView("jam");
    act(() => noteAskToolView("jam"));
    expect(screen.queryByTestId("ask-undo")).toBeNull();
    const id = getAskState().turns[0].id;
    act(() => pressUndo(id));
    expect(host.where().view).toBe("jam");
  });

  it("a confirmed change's Undo is offered for a few seconds, then goes", () => {
    vi.useFakeTimers();
    let now: Subdivision = 1;
    const host = use(
      fakeHost({ view: "beat" }, { clickSubdivision: () => now, setClickSubdivision: (s) => ((now = s), "done") }),
      toolCtx({ screen: "beat" }),
    );
    render(<Thread />);
    act(() => void runAskCall({ tool: "click_subdivision", args: { subdivision: 2 } }, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    expect(now).toBe(2);
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("Clicks per beat: 2");
    expect(screen.getByTestId("ask-undo")).toHaveTextContent("Undo");
    act(() => void vi.advanceTimersByTime(UNDO_MS + 100));
    expect(screen.queryByTestId("ask-undo")).toBeNull();
    act(() => pressUndo(getAskState().turns[0].id));
    expect(now).toBe(2);
    expect(host.changes().map((c) => c.member)).toEqual(["setClickSubdivision"]);
  });

  it("an Undo pressed after the screen changed under it says so plainly and changes nothing", () => {
    let now: Subdivision = 1;
    let view: "beat" | "jam" = "beat";
    const host = use(
      fakeHost({ view: "beat" }, { view: () => view, clickSubdivision: () => now, setClickSubdivision: (s) => ((now = s), "done") }),
      toolCtx({ screen: "beat" }),
    );
    render(<Thread />);
    act(() => void runAskCall({ tool: "click_subdivision", args: { subdivision: 3 } }, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    view = "jam";
    // The host has not said yet that the view changed: the press reaches the runner, which refuses.
    act(() => fireEvent.click(screen.getByTestId("ask-undo")));
    expect(now).toBe(3);
    expect(screen.getByTestId("ask-undo-note")).toHaveTextContent(t("coachTools.ui.undoGone"));
    expect(screen.queryByTestId("ask-undo")).toBeNull();
    expect(host.changes().map((c) => c.member)).toEqual(["setClickSubdivision"]);
  });

  it("a preset's receipt says Loading, then the truth: loaded, or gone", async () => {
    let report: ((ok: boolean) => void) | undefined;
    use(fakeHost({ view: "beat" }, { presets: () => [{ id: "p1", name: "Warm up 80" }], loadPreset: (_id, applied) => ((report = applied), "done") }), toolCtx({ screen: "beat" }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "load_preset", args: { preset: "warm" } }, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("Loading Warm up 80…");
    expect(screen.getByTestId("ask-receipt")).not.toHaveTextContent("Loaded");
    await act(async () => {
      report?.(false);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("Warm up 80 is gone, so nothing was loaded");
  });

  it("a load the unsaved-work question holds is worded truthfully, never Loaded", () => {
    use(fakeHost({ view: "beat" }, { jams: () => [{ id: "j1", name: "Funk vamp" }], loadJam: () => "asked" }), toolCtx({ screen: "beat" }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "load_jam", args: { jam: "funk" } }, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("Yames asked about your unsaved changes first.");
    expect(screen.getByTestId("ask-receipt")).not.toHaveTextContent("Loaded");
  });
});

describe("a proposal", () => {
  function subdivisionHost() {
    let now: Subdivision = 1;
    const host = fakeHost({ view: "beat" }, { clickSubdivision: () => now, setClickSubdivision: (s) => ((now = s), "done") });
    return Object.assign(host, { now: () => now, set: (s: Subdivision) => (now = s) });
  }

  it("does nothing until the press; one tonal button with a verb, and Not now; no solid button", () => {
    const host = use(subdivisionHost(), toolCtx({ screen: "beat" }));
    const { container } = render(<Thread />);
    act(() => void runAskCall({ tool: "click_subdivision", args: { subdivision: 2 } }, ""));
    expect(host.changes()).toEqual([]);
    const card = screen.getByTestId("ask-proposal");
    expect(card).toHaveTextContent("Clicks per beat: 1 → 2");
    expect(screen.getByTestId("ask-proposal-go")).toHaveTextContent(t("coachTools.verb.change"));
    expect(screen.getByTestId("ask-proposal-go")).toHaveClass("btn-tonal");
    expect(container.querySelector(".btn-primary")).toBeNull();
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-not-now")));
    expect(host.changes()).toEqual([]);
    expect(screen.getByTestId("ask-proposal-dismissed")).toBeInTheDocument();
    expect(screen.queryByTestId("ask-proposal-go")).toBeNull();
    // Pressed anyway (a stale handler): nothing.
    act(() => pressProposal(getAskState().turns[0].id));
    expect(host.changes()).toEqual([]);
  });

  it("stale at the press says so and does nothing", () => {
    const host = use(subdivisionHost(), toolCtx({ screen: "beat" }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "click_subdivision", args: { subdivision: 2 } }, ""));
    host.set(3);
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    expect(host.changes()).toEqual([]);
    expect(screen.getByTestId("ask-refusal")).toHaveTextContent(t("coachTools.why.refused.proposal"));
  });

  it("names what stops, and says when it cannot be undone", () => {
    use(fakeHost({ view: "beat", sounding: "click", paths: [ALT] }), toolCtx({ screen: "beat" }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "go_to", args: { screen: "today" } }, ""));
    expect(screen.getByTestId("ask-proposal")).toHaveTextContent("Open Today?");
    expect(screen.getByTestId("ask-proposal-stops")).toHaveTextContent("The click stops.");
    expect(screen.getByTestId("ask-proposal-go")).toHaveTextContent(t("coachTools.verb.go"));

    __resetAskStoreForTests();
    use(
      fakeHost({ view: "paths", paths: [ALT] }, { progress: () => ({ states: [], takes: [], ceilings: [] }), followPath: () => "done" }),
      toolCtx({ screen: "paths" }),
    );
    act(() => void runAskCall({ tool: "follow_path", args: { path: "alternate" } }, ""));
    const body = lastBody();
    if (body.kind !== "proposal") throw new Error(JSON.stringify(body));
    expect(body.proposal.noUndo).toBe(true);
    expect(screen.getByTestId("ask-proposal-noundo")).toHaveTextContent(t("coachTools.ui.noUndo"));
    expect(screen.queryByTestId("ask-proposal-stops")).toBeNull();
  });

  it("not now drops it for good", () => {
    const host = use(subdivisionHost(), toolCtx({ screen: "beat" }));
    act(() => void runAskCall({ tool: "click_subdivision", args: { subdivision: 2 } }, ""));
    const id = getAskState().turns[0].id;
    notNowProposal(id);
    pressProposal(id);
    expect(host.changes()).toEqual([]);
  });
});

describe("Which one?", () => {
  it("draws the tool's choices as chips; a press runs that call", () => {
    const LEGATO = { ...ALT, id: "alt-2", title: "Alternate Sweeps" } as typeof ALT;
    const host = use(fakeHost({ view: "today", paths: [ALT, LEGATO] }));
    render(<Thread />);
    act(() => void runAskCall({ tool: "open_path", args: { path: "alternate" } }, ""));
    expect(screen.getByTestId("ask-refusal")).toHaveTextContent("Which one?");
    const chips = screen.getByTestId("ask-choices").querySelectorAll("button");
    expect([...chips].map((c) => c.textContent)).toEqual(["Alternate Picking", "Alternate Sweeps"]);
    act(() => fireEvent.click(chips[1]));
    expect(host.where()).toEqual({ view: "paths", at: { pathId: "alt-2", stepId: null } });
    expect(screen.getAllByTestId("ask-receipt")[0]).toHaveTextContent("Opened Alternate Sweeps");
  });
});

describe("that one is yours", () => {
  it.each(NEVER_ITEMS)("%s: its line, a show-me that only navigates, and no action", (item) => {
    const entry = NEVER_LIST[item];
    const root = en.coachTools as unknown as Record<string, Record<string, string>>;
    expect(root.yours[entry.line.split(".").pop()!]).toMatch(/^That one is yours\./);
    expect(SHOW_ME_TOOLS.has(entry.show.tool)).toBe(true);
    expect(findTool(entry.show.tool)?.kind).toBe("go");
    const host = use(fakeHost({ view: "today", paths: [ALT] }));
    render(<Thread />);
    act(() => void askYours(item));
    expect(host.calls).toEqual([]);
    expect(screen.getByTestId("ask-yours")).toHaveTextContent(t(entry.line));
    act(() => fireEvent.click(screen.getByTestId("ask-show-me")));
    // Only the view moved: nothing else was called that changes anything.
    expect(host.changes().every((c) => c.member === "setView" || c.member === "openSettingsSection" || c.member === "movePaths")).toBe(true);
    expect(host.changes().length).toBeGreaterThan(0);
  });

  it("show me marks the control for a moment when the app has one", () => {
    vi.useFakeTimers();
    const el = document.createElement("section");
    el.id = "settings-grading";
    document.body.append(el);
    use(fakeHost({ view: "today" }));
    showMeYours("grading", "Show me in Settings");
    vi.advanceTimersByTime(800);
    expect(el.hasAttribute("data-coach-point")).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(el.hasAttribute("data-coach-point")).toBe(false);
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// The English
// ---------------------------------------------------------------------------

function strings(node: unknown, prefix: string): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${prefix}.${k}`));
}
const ALL = strings(en.coachTools, "coachTools");
const has = (key: string) => ALL.some(([k]) => k === key);

describe("the tools' English", () => {
  const dir = join(__dirname, "../../coach/tools");
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  const used = [...new Set([...sources.matchAll(/"(coachTools\.[A-Za-z.]+[A-Za-z])"/g)].map((m) => m[1]))];

  it("finds the keys the tools write", () => {
    expect(used.length).toBeGreaterThan(80);
  });

  it.each(used)("%s has its words (or the templates for its cases)", (key) => {
    const variants = [key, `${key}Slower`, `${key}Level`, `${key}Click`, `${key}.different`, `${key}NoBpm`];
    expect(variants.some(has)).toBe(true);
  });

  it("every case the panel picks has its own template", () => {
    const cases: Array<[string, Record<string, string | number>]> = [
      ["coachTools.receipt.followPath", { path: "P", level: "L" }],
      ["coachTools.propose.followPath", { path: "P", level: "L" }],
      ["coachTools.why.notFound.step", { query: "x" }],
      ["coachTools.why.notNow.tempoEnd", { direction: "faster", bpm: 90 }],
      ["coachTools.propose.nudgeTempo", { direction: "faster", from: 80, to: 90 }],
      ["coachTools.why.notNow.noSwap", { none: "harderWarmUp", part: 2, title: "x" }],
      ["coachTools.propose.findEdge", { bpm: "", path: "P", step: 1, title: "T" }],
      ["coachTools.why.notNow.sounding", { stops: "band" }],
      ["coachTools.propose.setGoal", { from: "a", to: "b" }],
    ];
    for (const [key, values] of cases) expect(has(lineKey({ key, values }))).toBe(true);
  });

  it("ids become the player's words: screens, sections, setting values, the mix", () => {
    expect(lineText(t, { key: "coachTools.receipt.goTo", values: { screen: "beat" } })).toBe("Opened Metronome");
    expect(lineText(t, { key: "coachTools.receipt.openSettings", values: { section: "keepTakes" } })).toBe("Opened Settings · Keeping Takes");
    expect(lineText(t, { key: "coachTools.propose.setSetting", values: { key: "bandVolume", from: "auto", to: 80 } })).toBe(
      "Band volume: not set: the app chooses (off under a graded Take on a microphone) → 80%",
    );
    expect(lineText(t, { key: "coachTools.receipt.setSetting", values: { key: "countIn", from: "off", to: "on" } })).toBe("Count-in: on");
    expect(lineText(t, { key: "coachTools.receipt.setFocus", values: { from: "Legato", to: "mix" } })).toBe("Today comes from your mix of Paths now");
  });

  it.each(ALL)("%s claims nothing the app cannot measure", (_key, text) => {
    expect(bannedClaimsIn(text, true).map((c) => c.name)).toEqual([]);
  });

  it.each(ALL)("%s never calls the threshold \"the bar\"", (_key, text) => {
    expect(text).not.toMatch(/\bthe bar\b|\bpass bar\b/i);
  });
});
