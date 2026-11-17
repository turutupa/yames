import { act, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOOP_STAGE, useNeck, type NeckNote, type NeckStage, type NeckView } from "./api";
import { CALM_FPS, HIDE_DELAY_MS, LOST_GRACE_MS, StageController, TAKE_FPS, stripHeight } from "./controller";
import type { EngineModule, EngineOptions, StageEngine } from "./engineTypes";
import { fallbackRange, pitchOf } from "./FallbackNeck";
import { NeckStageHost, NeckStageProvider } from "./NeckStageProvider";
import { webgl2Available } from "./webgl";

type FakeEngine = StageEngine & { calls: string[]; opts: EngineOptions; busyFrames: number; disposed: boolean };

function fakeEngineModule(): { mod: EngineModule; engines: FakeEngine[] } {
  const engines: FakeEngine[] = [];
  const mod: EngineModule = {
    createEngine: async (opts) => {
      const e: FakeEngine = {
        tier: 2,
        calls: [],
        opts,
        busyFrames: 0,
        disposed: false,
        setView: (v, _r, instant) => e.calls.push(`view:${v.kind}:${instant ? "cut" : "fly"}`),
        refit: () => e.calls.push("refit"),
        setNotes: (n, fade) => e.calls.push(`notes:${n.length}:${fade}`),
        pluck: (s, f, k) => e.calls.push(`pluck:${s}:${f}:${k}`),
        sweep: () => e.calls.push("sweep"),
        resize: () => e.calls.push("resize"),
        frame: () => {
          e.calls.push("frame");
          return e.busyFrames-- > 0;
        },
        lowerQuality: () => false,
        dispose: () => {
          e.disposed = true;
        },
      };
      engines.push(e);
      return e;
    },
  };
  return { mod, engines };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};

/** A screen that frames the neck into its slot, the way W5's screens will. */
function Screen({ view, notes = [], onStage }: { view: NeckView; notes?: NeckNote[]; onStage?: (s: NeckStage) => void }) {
  const neck = useNeck();
  const slot = useRef<HTMLDivElement>(null);
  onStage?.(neck);
  useEffect(() => {
    neck.setView(view, slot.current);
    return () => neck.setView({ kind: "hidden" }, null);
  }, [neck, view]);
  useEffect(() => {
    neck.setNotes(notes, { fade: 0 });
  }, [neck, notes]);
  return <div data-testid="slot" ref={slot} style={{ height: 300 }} />;
}

const D7: NeckNote[] = [
  { string: 1, fret: 5, kind: "aim", label: "A" },
  { string: 2, fret: 8, kind: "clash", label: "G" },
  { string: 3, fret: 7, kind: "tone", label: "D" },
];

describe("useNeck without a provider", () => {
  it("is the no-op stage, and every call is harmless", () => {
    let got: NeckStage | null = null;
    function Probe() {
      got = useNeck();
      return null;
    }
    render(<Probe />);
    expect(got).toBe(NOOP_STAGE);
    expect(got!.is3d).toBe(false);
    expect(() => {
      got!.setView({ kind: "whole" }, document.body);
      got!.setNotes(D7, { fade: 1 });
      got!.pluck(1, 5, "aim");
      got!.sweep();
      got!.setTakeRunning(true);
      got!.setView({ kind: "hidden" }, null);
    }).not.toThrow();
  });
});

describe("the fallback (no WebGL2)", () => {
  it("happy-dom has no WebGL2, so the real provider takes the fallback", async () => {
    expect(webgl2Available()).toBe(false);
    let stage: NeckStage | null = null;
    render(
      <NeckStageProvider>
        <Screen view={{ kind: "zoom", from: 4, to: 9 }} notes={D7} onStage={(s) => (stage = s)} />
      </NeckStageProvider>,
    );
    await flush();
    expect(stage!.is3d).toBe(false);
    const slot = screen.getByTestId("slot");
    expect(slot.querySelector('[data-testid="neck-fallback"]')).not.toBeNull();
    expect(screen.getByTestId("neck-stage").dataset.mode).toBe("fallback");
    // No canvas work at all: the 3D layer stays off.
    expect(screen.getByTestId("neck-stage").dataset.on).toBe("false");
  });

  it("draws Fretboard in the slot with exactly the stage's notes, coloured by kind", async () => {
    // happy-dom lays nothing out; the strip needs a slot with a height.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 300, width: 800, height: 300, toJSON: () => ({}) } as DOMRect);
    const c = new StageController({ loadEngine: () => Promise.reject(new Error("unused")), webgl2: () => false });
    render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "zoom", from: 4, to: 9 }} notes={D7} />
      </NeckStageHost>,
    );
    await flush();
    const slot = screen.getByTestId("slot");
    const shown = [...slot.querySelectorAll<SVGCircleElement>('[data-testid="fret-dot"]')].filter((d) => d.style.display !== "none");
    const at = shown.map((d) => `${6 - Number(d.dataset.string)}:${d.dataset.fret}:${d.getAttribute("data-kind")}`).sort();
    expect(at).toEqual(["1:5:aim", "2:8:clash", "3:7:tone"]);
    const labels = [...slot.querySelectorAll(".neck-fallback-label")].map((t) => t.textContent).sort();
    expect(labels).toEqual(["A", "D", "G"]);
    // The overview strip comes with a zoom.
    expect(slot.querySelector('[data-testid="neck-strip"]')).not.toBeNull();
    rect.mockRestore();
  });

  it("follows the view: the whole neck from the nut, a zoom from its first fret", () => {
    expect(fallbackRange({ kind: "whole" })).toEqual({ startFret: 0, frets: 24 });
    expect(fallbackRange({ kind: "zoom", from: 4, to: 9 })).toEqual({ startFret: 4, frets: 6 });
    expect(fallbackRange({ kind: "zoom", from: 0, to: 5 })).toEqual({ startFret: 0, frets: 5 });
    expect(pitchOf(1, 5)).toBe(9); // A on the high E string
    expect(pitchOf(6, 3)).toBe(7); // G on the low E string
  });

  it("draws nothing once the screen asks for hidden", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const c = new StageController({ loadEngine: () => Promise.reject(new Error("unused")), webgl2: () => false });
      const { rerender } = render(
        <NeckStageHost controllerFactory={() => c}>
          <Screen view={{ kind: "whole" }} />
        </NeckStageHost>,
      );
      await flush();
      expect(document.querySelector('[data-testid="neck-fallback"]')).not.toBeNull();
      rerender(<NeckStageHost controllerFactory={() => c}>{null}</NeckStageHost>);
      await act(async () => {
        vi.advanceTimersByTime(HIDE_DELAY_MS + 10);
      });
      expect(c.getSnapshot().view.kind).toBe("hidden");
      expect(document.querySelector('[data-testid="neck-fallback"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the stage with an engine", () => {
  let fake: ReturnType<typeof fakeEngineModule>;
  let loads: number;
  beforeEach(() => {
    fake = fakeEngineModule();
    loads = 0;
  });
  afterEach(() => vi.useRealTimers());
  const controller = () =>
    new StageController({
      loadEngine: async () => {
        loads += 1;
        return fake.mod;
      },
      webgl2: () => true,
    });

  it("loads nothing until a visible view is asked for", async () => {
    const c = controller();
    render(<NeckStageHost controllerFactory={() => c}>{null}</NeckStageHost>);
    await flush();
    expect(loads).toBe(0);
    expect(c.mode).toBe("idle");
    act(() => c.setView({ kind: "hidden" }, null));
    await flush();
    expect(loads).toBe(0);
  });

  it("loads on the first view, reports is3d, and hands over the state asked for while loading", async () => {
    const c = controller();
    let stage: NeckStage | null = null;
    render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "whole" }} notes={D7} onStage={(s) => (stage = s)} />
      </NeckStageHost>,
    );
    await flush();
    expect(loads).toBe(1);
    expect(c.mode).toBe("3d");
    expect(stage!.is3d).toBe(true);
    const e = fake.engines[0];
    expect(e.calls).toContain("notes:3:0");
    expect(e.calls).toContain("view:whole:cut");
    expect(screen.getByTestId("neck-stage").dataset.on).toBe("true");
    expect(screen.getByTestId("neck-stage").querySelector("canvas")).not.toBeNull();
  });

  it("passes changes through and flies between views on the same screen", async () => {
    const c = controller();
    const { rerender } = render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "whole" }} />
      </NeckStageHost>,
    );
    await flush();
    const e = fake.engines[0];
    e.calls.length = 0;
    act(() => {
      c.setView({ kind: "zoom", from: 5, to: 9 }, null);
      c.pluck(2, 7, "tone");
      c.sweep();
    });
    expect(e.calls).toEqual(expect.arrayContaining(["view:zoom:fly", "pluck:2:7:tone", "sweep"]));
    rerender(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "zoom", from: 7, to: 12 }} />
      </NeckStageHost>,
    );
    await flush();
    // Unmount (hidden) then mount (zoom) in one commit: no blink, the camera flies.
    expect(e.calls.filter((x) => x.startsWith("view:")).pop()).toBe("view:zoom:fly");
    expect(c.getSnapshot().view.kind).toBe("zoom");
  });

  it("caps at 30 fps while a Take runs", () => {
    const c = controller();
    expect(c.fpsCap).toBe(CALM_FPS);
    c.setTakeRunning(true);
    expect(c.fpsCap).toBe(TAKE_FPS);
    c.setTakeRunning(false);
    expect(c.fpsCap).toBe(CALM_FPS);
  });

  it("stops rendering when the view goes hidden, and cuts (no flight) when it comes back", async () => {
    const c = controller();
    const host = document.createElement("div");
    document.body.appendChild(host);
    c.attach(host);
    c.setView({ kind: "whole" }, null);
    await flush();
    const e = fake.engines[0];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    c.setView({ kind: "hidden" }, null);
    vi.advanceTimersByTime(HIDE_DELAY_MS + 10);
    expect(c.getSnapshot().view.kind).toBe("hidden");
    e.calls.length = 0;
    c.pluck(1, 1, "aim");
    c.sweep();
    expect(e.calls).toEqual([]);
    expect(c.scheduler.active).toBe(false);
    c.setView({ kind: "zoom", from: 1, to: 5 }, null);
    expect(e.calls).toContain("view:zoom:cut");
    c.detach();
  });

  it("frees the engine when the provider unmounts", async () => {
    const c = controller();
    const { unmount } = render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "whole" }} />
      </NeckStageHost>,
    );
    await flush();
    expect(fake.engines[0].disposed).toBe(false);
    unmount();
    expect(fake.engines[0].disposed).toBe(true);
    expect(document.querySelector("canvas.neck-stage-canvas")).toBeNull();
  });

  it("throws away an engine that finishes loading after the provider went away", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const c = new StageController({
      loadEngine: async () => {
        await gate;
        return fake.mod;
      },
      webgl2: () => true,
    });
    const host = document.createElement("div");
    c.attach(host);
    c.setView({ kind: "whole" }, null);
    c.detach();
    release();
    await flush();
    expect(fake.engines.length).toBe(0);
    expect(c.mode).toBe("idle");
  });

  it("falls back to the SVG neck when the engine cannot load", async () => {
    const c = new StageController({ loadEngine: () => Promise.reject(new Error("no chunk")), webgl2: () => true });
    let stage: NeckStage | null = null;
    render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "whole" }} onStage={(s) => (stage = s)} />
      </NeckStageHost>,
    );
    await flush();
    expect(c.mode).toBe("fallback");
    expect(stage!.is3d).toBe(false);
    expect(c.errors[0]).toContain("no chunk");
    expect(screen.getByTestId("slot").querySelector('[data-testid="neck-fallback"]')).not.toBeNull();
  });

  it("waits out a lost context, and falls back if it is not restored", async () => {
    const c = controller();
    const host = document.createElement("div");
    c.attach(host);
    c.setView({ kind: "whole" }, null);
    await flush();
    const e = fake.engines[0];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    e.opts.onLost();
    vi.advanceTimersByTime(LOST_GRACE_MS - 100);
    expect(c.mode).toBe("3d");
    e.opts.onRestored();
    vi.advanceTimersByTime(LOST_GRACE_MS);
    expect(c.mode).toBe("3d");
    e.opts.onLost();
    vi.advanceTimersByTime(LOST_GRACE_MS + 10);
    expect(c.mode).toBe("fallback");
    expect(e.disposed).toBe(true);
    c.detach();
  });

  it("keeps the strip out of short slots", () => {
    expect(stripHeight(120)).toBe(0);
    expect(stripHeight(200)).toBe(42);
    expect(stripHeight(400)).toBe(54);
  });
});
