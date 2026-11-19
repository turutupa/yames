import { describe, expect, it } from "vitest";
import { DisplayClock, NECK_FOLLOWS_DISPLAY, RATE_WINDOW, STRIKES_OUT, TAKE_FPS_LOW, TAKE_FPS_MAX, TakeRate, dueAt, everyFrame, likelyCpuCompositing, takeCeiling, type RateHints } from "./takeRate";

const EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const GTK = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const hints = (h: Partial<RateHints> = {}): RateHints => ({ ua: EDGE, reducedMotion: false, cores: 8, ...h });

describe("takeCeiling: the rate a Take starts at", () => {
  it("follows the display on Windows, macOS and Android", () => {
    for (const ua of [EDGE, MAC, ANDROID]) expect(takeCeiling(hints({ ua }))).toEqual({ fps: TAKE_FPS_MAX, why: "display" });
  });

  it("is 30 where the machine says it should not be asked for more", () => {
    expect(likelyCpuCompositing(GTK)).toBe(true);
    expect(likelyCpuCompositing(ANDROID)).toBe(false);
    expect(takeCeiling(hints({ ua: GTK }))).toEqual({ fps: TAKE_FPS_LOW, why: "cpu-compositing" });
    expect(takeCeiling(hints({ tier: 0 })).why).toBe("low-tier");
    expect(takeCeiling(hints({ reducedMotion: true })).why).toBe("reduced-motion");
    expect(takeCeiling(hints({ saveData: true })).why).toBe("save-data");
    expect(takeCeiling(hints({ cores: 4 })).why).toBe("few-cores");
    expect(takeCeiling(hints({ memoryGb: 2 })).why).toBe("low-memory");
    expect(takeCeiling(hints({ battery: { charging: false, level: 0.15 } })).why).toBe("battery");
    for (const h of [{ tier: 0 }, { cores: 2 }, { battery: { charging: false, level: 0.2 } }]) expect(takeCeiling(hints(h)).fps).toBe(TAKE_FPS_LOW);
  });

  it("a charging or healthy battery, and a machine that says nothing, ask for the display", () => {
    expect(takeCeiling(hints({ battery: { charging: true, level: 0.05 } })).fps).toBe(TAKE_FPS_MAX);
    expect(takeCeiling(hints({ battery: { charging: false, level: 0.8 } })).fps).toBe(TAKE_FPS_MAX);
    expect(takeCeiling({ ua: MAC, reducedMotion: false }).fps).toBe(TAKE_FPS_MAX);
  });

  it("an override wins over every hint", () => {
    expect(takeCeiling(hints({ ua: GTK, override: 60 }))).toEqual({ fps: 60, why: "override" });
    expect(takeCeiling(hints({ override: 30 }))).toEqual({ fps: 30, why: "override" });
  });
});

describe("TakeRate: the fallback during a Take", () => {
  const D = 1000 / 60;

  it("holds the rate while frames come on time", () => {
    const r = new TakeRate(() => hints(), true);
    expect(r.begin()).toBe(TAKE_FPS_MAX);
    for (let i = 0; i < RATE_WINDOW * 10; i++) expect(r.sample(D, D, 2)).toBe(false);
    expect(r.fps).toBe(TAKE_FPS_MAX);
  });

  it("an odd late frame is not a slow machine", () => {
    const r = new TakeRate(() => hints(), true);
    r.begin();
    for (let i = 0; i < RATE_WINDOW * 10; i++) r.sample(i % 10 === 0 ? D * 2 : D, D, 2);
    expect(r.fps).toBe(TAKE_FPS_MAX);
  });

  it("drops to 30 for the rest of the Take when a quarter of a window came late", () => {
    const r = new TakeRate(() => hints(), true);
    r.begin();
    let tripped = false;
    for (let i = 0; i < RATE_WINDOW; i++) tripped = r.sample(i % 3 === 0 ? D * 2 : D, D, 2) || tripped;
    expect(tripped).toBe(true);
    expect(r.fps).toBe(TAKE_FPS_LOW);
    expect(r.why).toBe("slow-frames");
    // And says nothing more this Take.
    expect(r.sample(D * 3, D, 2)).toBe(false);
  });

  it("drops when drawing takes over half the frame on the main thread, on time or not", () => {
    const r = new TakeRate(() => hints(), true);
    r.begin();
    for (let i = 0; i < RATE_WINDOW; i++) r.sample(D, D, D * 0.6);
    expect(r.fps).toBe(TAKE_FPS_LOW);
  });

  it("the next Take tries again, once; after the second trip the low rate is kept", () => {
    const r = new TakeRate(() => hints(), true);
    for (let take = 0; take < STRIKES_OUT; take++) {
      expect(r.begin()).toBe(TAKE_FPS_MAX);
      for (let i = 0; i < RATE_WINDOW; i++) r.sample(D * 2, D, 2);
      expect(r.fps).toBe(TAKE_FPS_LOW);
    }
    expect(r.begin()).toBe(TAKE_FPS_LOW);
    expect(r.why).toBe("slow-frames-kept");
  });

  it("an override is never second-guessed", () => {
    const r = new TakeRate(() => hints({ override: 60 }), true);
    expect(r.begin()).toBe(60);
    for (let i = 0; i < RATE_WINDOW * 3; i++) r.sample(D * 3, D, D);
    expect(r.fps).toBe(60);
  });

  it("at 30 there is nothing to fall back to", () => {
    const r = new TakeRate(() => hints({ ua: GTK }), true);
    expect(r.begin()).toBe(TAKE_FPS_LOW);
    for (let i = 0; i < RATE_WINDOW * 3; i++) expect(r.sample(100, 33, 30)).toBe(false);
    r.begin();
    expect(r.why).toBe("cpu-compositing");
  });

  it("read before any Take, it answers from the hints", () => {
    expect(new TakeRate(() => hints({ ua: GTK }), true).fps).toBe(TAKE_FPS_LOW);
    expect(new TakeRate(() => hints(), true).fps).toBe(TAKE_FPS_MAX);
  });
});

describe("TakeRate: the neck and the lane", () => {
  const D = 1000 / 60;

  it("with the neck's switch off, the neck is held to 30 and the lane follows the display", () => {
    const r = new TakeRate(() => hints(), false);
    expect(r.begin()).toBe(TAKE_FPS_LOW);
    expect(r.fps).toBe(TAKE_FPS_LOW);
    expect(r.why).toBe("neck-held");
    expect(r.laneFps).toBe(TAKE_FPS_MAX);
    expect(r.why).toBe("display");
  });

  it("the switch as shipped is the constant", () => {
    const r = new TakeRate(() => hints());
    r.begin();
    expect(r.fps).toBe(NECK_FOLLOWS_DISPLAY ? TAKE_FPS_MAX : TAKE_FPS_LOW);
    expect(r.laneFps).toBe(TAKE_FPS_MAX);
  });

  it(`"display" in the store turns the neck's switch on for this machine`, () => {
    const r = new TakeRate(() => hints({ neckFollowsDisplay: true }), false);
    expect(r.begin()).toBe(TAKE_FPS_MAX);
    // And the hints still hold it where they would hold the lane.
    const gtk = new TakeRate(() => hints({ ua: GTK, neckFollowsDisplay: true }), false);
    expect(gtk.begin()).toBe(TAKE_FPS_LOW);
    expect(gtk.why).toBe("cpu-compositing");
  });

  it("a forced rate is the neck's and the lane's, switch or no switch", () => {
    const r = new TakeRate(() => hints({ override: 60 }), false);
    expect(r.begin()).toBe(60);
    expect(r.laneFps).toBe(60);
  });

  it("the lane falls back on slow frames with the neck held", () => {
    const r = new TakeRate(() => hints(), false);
    r.begin();
    for (let i = 0; i < RATE_WINDOW; i++) r.sample(D * 2, D, 1);
    expect(r.laneFps).toBe(TAKE_FPS_LOW);
    expect(r.why).toBe("slow-frames");
    expect(r.fps).toBe(TAKE_FPS_LOW);
  });
});

describe("the display's beat", () => {
  it("everyFrame: a cap near the display's rate draws every frame", () => {
    expect(everyFrame(120, 1000 / 60)).toBe(true);
    expect(everyFrame(120, 1000 / 120)).toBe(true);
    expect(everyFrame(120, 1000 / 144)).toBe(true);
    expect(everyFrame(120, 1000 / 165)).toBe(true);
    expect(everyFrame(120, 1000 / 240)).toBe(false);
    expect(everyFrame(30, 1000 / 60)).toBe(false);
    expect(everyFrame(60, 1000 / 120)).toBe(false);
    expect(everyFrame(60, 1000 / 75)).toBe(true);
  });

  it("dueAt holds a DOM loop to the cap by skipping display frames", () => {
    const count = (hz: number, fps: number) => {
      const d = 1000 / hz;
      let last = -Infinity;
      let n = 0;
      for (let i = 0; i < hz; i++) {
        const now = i * d;
        if (dueAt(now, last, fps, d)) {
          last = now;
          n += 1;
        }
      }
      return n;
    };
    expect(count(60, 30)).toBe(30);
    expect(count(60, 120)).toBe(60);
    expect(count(120, 120)).toBe(120);
    expect(count(120, 30)).toBe(30);
    expect(count(144, 30)).toBeGreaterThanOrEqual(28);
    expect(count(144, 30)).toBeLessThanOrEqual(36);
    expect(count(240, 120)).toBe(120);
  });

  it("DisplayClock learns the rate from the smallest of the last gaps", () => {
    const c = new DisplayClock();
    expect(c.ms).toBeCloseTo(16.67, 1);
    for (const g of [8.3, 16.7, 8.4, 8.3, 25, 8.3]) c.sample(g);
    expect(c.ms).toBeCloseTo(8.3, 1);
    // A pause between frames is not a gap.
    c.sample(900);
    expect(c.ms).toBeCloseTo(8.3, 1);
  });
});
