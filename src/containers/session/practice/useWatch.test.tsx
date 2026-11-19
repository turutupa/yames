import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { buildTake } from "../../../session/take";
import { ALT } from "../../../session/testKit";
import { PracticeTab } from "./PracticeTab";
import { silentWatchPosition, useWatch } from "./useWatch";
import type { WatchControl } from "./useWatch";
import { WatchControls } from "./WatchControls";
import { toggleWatch } from "./watchBus";
import type { ListenDemoControl } from "../hooks/useListenDemo";
import "../../../i18n";

const MODEL = { barTicks: [3840, 7680, 11520], countInTicks: 0, endTick: 11520, onsets: [{ tick: 3840 }, { tick: 4800 }] };

describe("the silent preview's clock (acceptance 5, P1-1)", () => {
  it("counts a bar in, then the pattern, looping with its pass", () => {
    expect(silentWatchPosition(MODEL, 0)).toMatchObject({ songCountIn: true, songTick: 0, songPass: 0 });
    expect(silentWatchPosition(MODEL, 1000)).toMatchObject({ songCountIn: true });
    expect(silentWatchPosition(MODEL, 3840)).toMatchObject({ songCountIn: false, songTick: 3840, songPass: 0 });
    expect(silentWatchPosition(MODEL, 3840 + 1000)).toMatchObject({ songTick: 4840, songPass: 0 });
    // Two bars of pattern, then round again.
    expect(silentWatchPosition(MODEL, 3840 + 7680 + 10)).toMatchObject({ songTick: 3850, songPass: 1 });
  });
});

function demo(over: Partial<ListenDemoControl> = {}): ListenDemoControl {
  return {
    sound: true,
    setSound: vi.fn(),
    active: false,
    playing: false,
    heard: 0,
    start: vi.fn(),
    stop: vi.fn(),
    ...over,
  };
}

const TAKE = buildTake(ALT, ALT.steps[0].exercises[0], 80, null);
type Props = Parameters<typeof useWatch>[0];
const base: Props = { take: TAKE, running: false, listen: undefined, beat: null, isPlaying: false, view: "tab" };

describe("Watch on every view (acceptance 5, P1-1)", () => {
  it("Sound off: the silent preview, with a position any view can follow", () => {
    vi.useFakeTimers();
    const { result } = renderHook((p: Props) => useWatch(p), { initialProps: { ...base, listen: demo({ sound: false }) } });
    expect(result.current.canWatch).toBe(true);
    expect(result.current.showing).toBe(false);
    expect(result.current.beat).toBeNull();
    act(() => result.current.toggle());
    expect(result.current.showing).toBe(true);
    expect(result.current.playing).toBe(true);
    expect(result.current.beat?.songCountIn).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.showing).toBe(false);
    vi.useRealTimers();
  });

  it("Sound on: Watch starts the demo, and the views follow the engine's position", () => {
    const listen = demo();
    const { result, rerender } = renderHook((p: Props) => useWatch(p), { initialProps: { ...base, listen } });
    act(() => result.current.toggle());
    expect(listen.start).toHaveBeenCalledTimes(1);
    const beat = { songBar: 0, songTick: 960, songPass: 0, songCountIn: false };
    const playing = demo({ active: true, playing: true });
    rerender({ ...base, listen: playing, beat, isPlaying: true });
    expect(result.current.showing).toBe(true);
    expect(result.current.beat).toBe(beat);
    expect(result.current.playing).toBe(true);
    act(() => result.current.toggle());
    expect(playing.stop).toHaveBeenCalled();
  });

  it("the hotkey reaches whichever view is on", () => {
    const listen = demo();
    renderHook((p: Props) => useWatch(p), { initialProps: { ...base, listen, view: "runway" } });
    act(() => toggleWatch());
    expect(listen.start).toHaveBeenCalledTimes(1);
  });

  it("another view stops it, as it always has; a running Take has no Watch", () => {
    const playing = demo({ active: true, playing: true });
    const { result, rerender } = renderHook((p: Props) => useWatch(p), { initialProps: { ...base, listen: playing, view: "neck" } });
    rerender({ ...base, listen: playing, view: "tab" });
    expect(playing.stop).toHaveBeenCalled();
    rerender({ ...base, listen: demo(), running: true, view: "tab" });
    expect(result.current.canWatch).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.showing).toBe(false);
  });

  it("leaving the screen stops the demo it started", () => {
    const playing = demo({ active: true, playing: true });
    const { unmount } = renderHook((p: Props) => useWatch(p), { initialProps: { ...base, listen: playing } });
    unmount();
    expect(playing.stop).toHaveBeenCalled();
  });
});

function control(over: Partial<WatchControl> = {}): WatchControl {
  return {
    canWatch: true,
    hasSound: true,
    soundOn: true,
    showing: false,
    again: false,
    beat: null,
    playing: false,
    loopTicks: 7680,
    toggle: vi.fn(),
    toggleSound: vi.fn(),
    ...over,
  };
}

describe("the Watch and Sound buttons", () => {
  it("say Sound in words and in their state (acceptance 5, P2-7)", () => {
    const { getByTestId, rerender } = render(<WatchControls watch={control()} />);
    const sound = getByTestId("practice-sound");
    expect(sound).toHaveAttribute("aria-pressed", "true");
    expect(sound).toHaveAttribute("aria-label", "Sound");
    expect(sound.textContent).toContain("Sound");
    rerender(<WatchControls watch={control({ soundOn: false })} />);
    expect(getByTestId("practice-sound")).toHaveAttribute("aria-pressed", "false");
  });

  it("Watch says Stop while it shows, and again after a demo", () => {
    const { getByTestId, rerender } = render(<WatchControls watch={control({ showing: true })} />);
    expect(getByTestId("practice-watch").textContent).toContain("Stop");
    rerender(<WatchControls watch={control({ again: true })} />);
    expect(getByTestId("practice-watch").textContent).toContain("Watch again");
  });

  it("nothing to watch, nothing drawn", () => {
    const { container } = render(<WatchControls watch={control({ canWatch: false })} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("the Tab view while Watch shows", () => {
  it("follows Watch's position rather than showing the overview", () => {
    const beat = { songBar: 0, songTick: TAKE.score.bars[TAKE.range.startBar].startTick + 960, songPass: 0, songCountIn: false };
    const { getByTestId } = render(
      <PracticeTab take={TAKE} running={false} beat={null} playing={false} watch={{ beat, playing: true, loopTicks: 7680 }} />,
    );
    expect(getByTestId("practice-tab")).toHaveAttribute("data-watching", "");
    expect(getByTestId("practice-tab").querySelector('[data-mode="follow"]')).not.toBeNull();
  });
});
