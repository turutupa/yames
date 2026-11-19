import { act, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOOP_STAGE, useNeck, type NeckNote, type NeckStage, type NeckView } from "./api";
import { CALM_FPS, HIDE_DELAY_MS, LOST_GRACE_MS, StageController, stripHeight } from "./controller";
import { TAKE_FPS_LOW, TAKE_FPS_MAX, TakeRate } from "./takeRate";
import type { EngineModule, EngineOptions, StageEngine } from "./engineTypes";
import { fallbackRange, pitchOf } from "./FallbackNeck";
import { NeckStageHost, NeckStageProvider } from "./NeckStageProvider";
import { getStagePrefs, resetStagePrefsForTest, setForceFlat, setNeck3d, subscribeStagePrefs, wantsFlat } from "./prefs";
import { webgl2Available } from "./webgl";

type FakeEngine = StageEngine & { calls: string[]; opts: EngineOptions; busyFrames: number; disposed: boolean };

function fakeEngineModule(probeTimes: number[] = [6, 1, 1, 1, 1]): { mod: EngineModule; engines: FakeEngine[] } {
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
        setPalette: () => e.calls.push("palette"),
        resize: () => e.calls.push("resize"),
        frame: () => {
          e.calls.push("frame");
          return e.busyFrames-- > 0;
        },
        lowerQuality: () => false,
        probe: (n) => {
          e.calls.push(`probe:${n}`);
          return probeTimes.slice();
        },
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

  it("prewarm builds the engine with nothing on screen, draws no frame, and the first view uses it", async () => {
    const c = controller();
    render(<NeckStageHost controllerFactory={() => c}>{null}</NeckStageHost>);
    await flush();
    act(() => c.prewarm());
    // The engine is made in one task and handed on in the next.
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    await flush();
    expect(loads).toBe(1);
    expect(c.mode).toBe("3d");
    expect(c.getSnapshot().view.kind).toBe("hidden");
    const e = fake.engines[0];
    expect(e.calls).not.toContain("frame");
    expect(e.calls.some((x) => x.startsWith("view:"))).toBe(false);
    expect(c.scheduler.active).toBe(false);
    expect(screen.getByTestId("neck-stage").dataset.on).toBe("false");
    // Asked twice, it does nothing more.
    act(() => c.prewarm());
    await flush();
    expect(loads).toBe(1);
    // And the Session's first view is a cut on the engine already there.
    act(() => c.setView({ kind: "zoom", from: 3, to: 8 }, null));
    await flush();
    expect(fake.engines.length).toBe(1);
    expect(e.calls).toContain("view:zoom:cut");
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

  it("tells an engine that arrives after a window resize the size it missed", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const c = new StageController({
      loadEngine: async () => {
        await gate;
        return fake.mod;
      },
      webgl2: () => true,
    });
    render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "whole" }} notes={D7} />
      </NeckStageHost>,
    );
    await flush();
    expect(c.mode).toBe("loading");
    // The window is restored or maximised while the engine loads.
    act(() => void window.dispatchEvent(new Event("resize")));
    release();
    await flush();
    expect(c.mode).toBe("3d");
    const calls = fake.engines[0].calls;
    expect(calls).toContain("resize");
    expect(calls.indexOf("resize")).toBeLessThan(calls.indexOf("view:whole:cut"));
  });

  it("does not resize an engine that missed nothing", async () => {
    const c = controller();
    render(
      <NeckStageHost controllerFactory={() => c}>
        <Screen view={{ kind: "whole" }} notes={D7} />
      </NeckStageHost>,
    );
    await flush();
    expect(fake.engines[0].calls).not.toContain("resize");
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

  it("a Take follows the display where the machine holds it (the neck's switch on), and is capped at 30 where it should not be asked", () => {
    const rate = (ua: string) => new TakeRate(() => ({ ua, reducedMotion: false, cores: 8 }), true);
    const fast = new StageController({ loadEngine: async () => fake.mod, webgl2: () => true, takeRate: rate("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Edg/130") });
    expect(fast.fpsCap).toBe(CALM_FPS);
    fast.setTakeRunning(true);
    expect(fast.fpsCap).toBe(TAKE_FPS_MAX);
    expect(fast.takeRateWhy).toBe("display");
    fast.setTakeRunning(false);
    expect(fast.fpsCap).toBe(CALM_FPS);

    // WebKitGTK: transforms are likely painted on the CPU.
    const slow = new StageController({ loadEngine: async () => fake.mod, webgl2: () => true, takeRate: rate("Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15") });
    slow.setTakeRunning(true);
    expect(slow.fpsCap).toBe(TAKE_FPS_LOW);
    expect(slow.takeRateWhy).toBe("cpu-compositing");
    slow.setTakeRunning(false);
    expect(slow.fpsCap).toBe(CALM_FPS);
  });

  it("with the neck's switch off, a Take holds the neck to 30 whatever the machine", () => {
    const held = new StageController({
      loadEngine: async () => fake.mod,
      webgl2: () => true,
      takeRate: new TakeRate(() => ({ ua: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130", reducedMotion: false, cores: 8 }), false),
    });
    held.setTakeRunning(true);
    expect(held.fpsCap).toBe(TAKE_FPS_LOW);
    expect(held.takeRateWhy).toBe("neck-held");
    held.setTakeRunning(false);
    expect(held.fpsCap).toBe(CALM_FPS);
  });

  it("a machine that cannot draw the 3D neck is held to 30 for a Take; a player who chose the flat neck is not", () => {
    const rate = () => new TakeRate(() => ({ ua: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130", reducedMotion: false, cores: 8 }), true);
    const cannot = new StageController({ loadEngine: async () => fake.mod, webgl2: () => false, slow: () => true, takeRate: rate() });
    cannot.setTakeRunning(true);
    expect(cannot.fpsCap).toBe(TAKE_FPS_LOW);
    expect(cannot.takeRateWhy).toBe("low-tier");
    const chose = new StageController({ loadEngine: async () => fake.mod, webgl2: () => true, flat: () => true, slow: () => false, takeRate: rate() });
    chose.setTakeRunning(true);
    expect(chose.fpsCap).toBe(TAKE_FPS_MAX);
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

  it("keeps the strip out of any slot it would cost the neck's legibility", () => {
    expect(stripHeight(120)).toBe(0);
    expect(stripHeight(200)).toBe(0);
    expect(stripHeight(299)).toBe(0);
    expect(stripHeight(400)).toBe(34);
  });
});

describe("the frame-time guard and the 3D fretboard setting", () => {
  afterEach(() => resetStagePrefsForTest());

  /** A controller wired to the real prefs, the way the provider wires it. */
  function wired(probeTimes: number[]) {
    const fake = fakeEngineModule(probeTimes);
    const slow: number[] = [];
    const c = new StageController({
      loadEngine: async () => fake.mod,
      webgl2: () => true,
      ready: async () => {},
      flat: () => wantsFlat(),
      probe: true,
      onSlow: (v) => {
        slow.push(v.medianMs);
        setForceFlat(true);
      },
    });
    const host = document.createElement("div");
    c.attach(host);
    const unsub = subscribeStagePrefs(() => c.prefsChanged());
    return { c, fake, slow, host, done: () => (unsub(), c.detach()) };
  }

  it("keeps the 3D neck when the probe's frames are GPU-fast", async () => {
    const w = wired([40, 2, 2, 3, 2]);
    w.c.setView({ kind: "whole" }, null);
    await flush();
    expect(w.c.mode).toBe("3d");
    expect(w.fake.engines[0].calls).toContain("probe:5");
    expect(w.c.lastProbe!.slow).toBe(false);
    expect(getStagePrefs().forceFlat).toBe(false);
    w.done();
  });

  it("drops to the SVG neck for good when the frames are too slow, and Settings can try again", async () => {
    const w = wired([2500, 60, 70, 55, 65]);
    w.c.setView({ kind: "whole" }, null);
    await flush();
    expect(w.c.mode).toBe("fallback");
    expect(w.fake.engines[0].disposed).toBe(true);
    expect(w.slow).toEqual([62.5]);
    expect(getStagePrefs().forceFlat).toBe(true);
    // A fresh canvas for whatever comes next: the old one's context is gone.
    expect(w.host.querySelectorAll("canvas").length).toBe(1);

    // "Try the 3D neck again": the probe runs again on a new engine.
    setForceFlat(false);
    await flush();
    expect(w.fake.engines.length).toBe(2);
    expect(w.c.mode).toBe("fallback"); // still too slow, and remembered again
    expect(getStagePrefs().forceFlat).toBe(true);
    w.done();
  });

  it("Off draws the SVG neck without loading three.js, and Auto brings the 3D neck back", async () => {
    resetStagePrefsForTest({ neck3d: "off" });
    const w = wired([5, 1, 1, 1, 1]);
    w.c.setView({ kind: "zoom", from: 3, to: 7 }, null);
    await flush();
    expect(w.c.mode).toBe("fallback");
    expect(w.fake.engines.length).toBe(0);
    setNeck3d("auto");
    await flush();
    expect(w.c.mode).toBe("3d");
    setNeck3d("off");
    await flush();
    expect(w.c.mode).toBe("fallback");
    expect(w.fake.engines[0].disposed).toBe(true);
    w.done();
  });

  it("an Off that arrives while the engine loads wins", async () => {
    const w = wired([5, 1, 1, 1, 1]);
    w.c.setView({ kind: "whole" }, null);
    expect(w.c.mode).toBe("loading");
    setNeck3d("off");
    await flush();
    expect(w.c.mode).toBe("fallback");
    expect(w.fake.engines.every((e) => e.disposed)).toBe(true);
    w.done();
  });

  it("does not probe when the caller did not ask (the shots harness on SwiftShader)", async () => {
    const fake = fakeEngineModule([2500, 400, 400, 400, 400]);
    const c = new StageController({ loadEngine: async () => fake.mod, webgl2: () => true });
    c.attach(document.createElement("div"));
    c.setView({ kind: "whole" }, null);
    await flush();
    expect(c.mode).toBe("3d");
    expect(fake.engines[0].calls.some((x) => x.startsWith("probe"))).toBe(false);
    c.detach();
  });
});
