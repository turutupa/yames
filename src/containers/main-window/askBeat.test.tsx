/**
 * The window re-renders at every beat (AGENTS.md, "Frame rate during a Take").
 * Two things that must not follow it (review of leg c2a1):
 *
 * - the action dispatcher: an inline handler in its deps rebuilt
 *   `dispatchAction` per beat, which removed and re-added the window's keydown
 *   listener nine times a second (and changed listener order, which Settings'
 *   Escape handling depends on);
 * - the open Ask panel on a tool screen: its tools section was a new element
 *   per render, so the panel's `memo` did nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { memo } from "react";
import type { ComponentProps } from "react";
import { onTool, openShell } from "../../test/parity/shell";
import { emitEvent } from "../../test/parity/store";
import { TOOLS } from "../../test/parity/tools";
import { __resetAskStoreForTests, openAsk } from "../coach/askStore";
import type { BeatEvent } from "../../types";

const renders = vi.hoisted(() => ({ panel: 0 }));

vi.mock("../coach/AskPanel", async (importOriginal) => {
  const real = await importOriginal<typeof import("../coach/AskPanel")>();
  const Real = real.AskPanel;
  // The real panel, behind a memo of the same props: it renders exactly when
  // MainWindow hands it new props.
  const Counted = memo(function Counted(props: ComponentProps<typeof Real>) {
    renders.panel += 1;
    return <Real {...props} />;
  });
  return { ...real, AskPanel: Counted };
});

function beat(n: number): BeatEvent {
  return {
    beat: n,
    measureBeat: n % 4,
    subdivision: 0,
    isDownbeat: n % 4 === 0,
    accentLevel: n % 4 === 0 ? 2 : 0,
    isAccent: n % 4 === 0,
    formBar: 0,
    chorus: 1,
    bandState: "full",
  } as BeatEvent;
}

async function beats(from: number, count: number) {
  for (let n = from; n < from + count; n++) {
    await act(async () => emitEvent("beat", beat(n)));
  }
}

afterEach(() => {
  __resetAskStoreForTests();
});

describe("across a beat", () => {
  it("dispatchAction keeps its identity: the window's keydown listener is not re-registered", async () => {
    await openShell({ isPlaying: true });
    await onTool(TOOLS[0]);
    await beats(0, 2);
    const removed = vi.spyOn(document, "removeEventListener");
    const added = vi.spyOn(document, "addEventListener");
    await beats(2, 8);
    const keydown = (calls: unknown[][]) =>
      calls.filter(([type]) => type === "keydown").map(([, fn]) => String(fn).slice(0, 160));
    const gone = keydown(removed.mock.calls);
    const back = keydown(added.mock.calls);
    removed.mockRestore();
    added.mockRestore();
    expect(gone).toEqual([]);
    expect(back).toEqual([]);
  });

  it("the open Ask panel, with the tools' coach in it, does not re-render", async () => {
    await openShell({ isPlaying: true });
    await onTool(TOOLS[0]);
    await act(async () => openAsk());
    await beats(0, 2);
    const before = renders.panel;
    expect(before).toBeGreaterThan(0);
    await beats(2, 8);
    expect(renders.panel).toBe(before);
  });
});
