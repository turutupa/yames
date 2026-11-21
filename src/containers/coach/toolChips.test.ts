/**
 * The chips Ask offers per screen (leg t1b1): a table, one row per screen,
 * from the pure chooser; then the real tools' `when` on top, and every chip's
 * call checked by the runner's own shape check.
 */
import { describe, expect, it } from "vitest";
import { checkCall } from "../../coach/tools/run";
import { COACH_TOOLS } from "../../coach/tools/registry";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { runIn } from "../../coach/tools/testPaths";
import type { MainView } from "../main-window/MainHeader";
import { MAX_CHIPS, chooseToolChips, toolChipsFor, type ChipFacts } from "./toolChips";

const BASE: ChipFacts = {
  view: "today",
  take: false,
  hasPlan: true,
  nextStep: { path: "Alternate Picking", step: 7 },
  stepPage: null,
  nudges: null,
  subdivision: null,
  song: false,
};

const ids = (over: Partial<ChipFacts>) => chooseToolChips({ ...BASE, ...over }).map((c) => c.id);

describe("the chips per screen", () => {
  it.each<[string, Partial<ChipFacts>, string[]]>([
    ["Today", { view: "today" }, ["start-today", "next-step", "go-paths", "settings-practice"]],
    ["Today, no plan yet", { view: "today", hasPlan: false, nextStep: null }, ["go-paths", "settings-practice"]],
    ["Paths, the list", { view: "paths" }, ["next-step", "start-today", "go-today"]],
    ["Paths, a Step page", { view: "paths", stepPage: { path: "Alternate Picking", exercise: "Outside, two notes" } }, ["play-first", "start-today", "go-today"]],
    ["Progress", { view: "progress" }, ["start-today", "go-paths", "go-today"]],
    ["Tools", { view: "tools" }, ["go-beat", "go-drill", "go-jam", "go-songs"]],
    ["Metronome", { view: "beat", subdivision: 1 }, ["slower", "faster", "subdivision", "go-today"]],
    ["Drill", { view: "drill", subdivision: 2 }, ["slower", "faster", "subdivision", "go-today"]],
    ["Jam", { view: "jam" }, ["slower", "faster", "go-today"]],
    ["Setlist", { view: "setlist" }, ["go-today", "settings-practice"]],
    ["Songs, a song open", { view: "songs", song: true }, ["bars", "go-today"]],
    ["Songs, none", { view: "songs" }, ["go-today"]],
    ["a Session, between Takes", { view: "session", nudges: { slower: true, faster: true } }, ["slower", "faster", "settings-practice"]],
    ["a Session, a Test out (locked)", { view: "session", nudges: { slower: false, faster: false } }, ["settings-practice"]],
    ["during a Take", { view: "session", take: true, nudges: { slower: true, faster: true } }, []],
  ])("%s", (_name, over, expected) => {
    expect(ids(over)).toEqual(expected);
  });

  it("never more than a handful, and every call passes the runner's shape check", () => {
    const views: MainView[] = ["today", "paths", "progress", "tools", "beat", "drill", "jam", "setlist", "songs", "session"];
    for (const view of views) {
      const chips = chooseToolChips({ ...BASE, view, song: true, subdivision: 1, nudges: { slower: true, faster: true }, stepPage: { path: "A", exercise: "B" } });
      expect(chips.length).toBeLessThanOrEqual(MAX_CHIPS);
      for (const chip of chips) expect(checkCall(chip.call, COACH_TOOLS, "player").ok).toBe(true);
    }
  });

  it("the two clicks chip names the change it makes", () => {
    expect(chooseToolChips({ ...BASE, view: "beat", subdivision: 1 }).find((c) => c.id === "subdivision")?.call.args).toEqual({ subdivision: 2 });
    expect(chooseToolChips({ ...BASE, view: "beat", subdivision: 2 }).find((c) => c.id === "subdivision")?.label.key).toBe("coachTools.chip.oneClick");
  });

  it("a chip whose tool says no here is not offered (the real `when`)", () => {
    // Inside a Session, `go_to` refuses: a Session screen offers no navigation chip at all.
    const host = fakeHost({ view: "session", session: true }, { nudges: () => ({ slower: true, faster: false }) });
    const chips = toolChipsFor(host, toolCtx({ screen: "session", run: runIn("ready") }));
    expect(chips.map((c) => c.id)).toEqual(["slower", "settings-practice"]);
    // During a Take: none.
    expect(toolChipsFor(host, toolCtx({ screen: "session", run: runIn("playing") }))).toEqual([]);
  });
});
