/**
 * How fast the screen may move while a Take runs (rule 1: the click is
 * sacred).
 *
 * Until 2026-11-19 there were two answers, in two places: the 3D neck drew
 * 30 frames a second at most, everywhere, and the runway's lane and the tab's
 * cursor moved on every frame the display gave them (30 only on WebKitGTK).
 * This is the one place now, a governor (`takeRate`) the three read:
 *
 * - **The lane and the cursor follow the display**, up to `TAKE_FPS_MAX`,
 *   as they did.
 * - **The neck follows the display too where that is switched on**
 *   (`NECK_FOLLOWS_DISPLAY`, or `stage.takeFps: "display"` in the store), and
 *   is otherwise held to `TAKE_FPS_LOW` as before. See the constant for why
 *   it is a switch.
 * - **Everything starts at 30 where the machine says it should**
 *   (`takeCeiling`): a webview that likely composites on the CPU (WebKitGTK),
 *   the stage's lowest quality tier (a software renderer, an old phone GPU),
 *   few cores, little memory, the player's reduced-motion or data-saver
 *   setting, a battery that is running down. There is no web API for an OS
 *   battery-saver switch; the battery's level while discharging is the
 *   nearest thing a webview has.
 * - **And falls back to 30 during the Take on what the frames do**
 *   (`TakeRate.sample`): when a quarter of a window of frames came late, or
 *   drawing them took over half their budget on the main thread, the rest of
 *   the Take runs at 30. Twice, and it stays there until the app is
 *   restarted: a machine that could not hold the rate in two Takes is not
 *   asked a third time.
 *
 * `stage.takeFps` in the settings store, as a number, forces a rate for all
 * three past the hints and the fallback: a forced 60 stays 60. It is how the
 * e2e probe measures a rate the machine would not pick
 * (`npm run test:e2e:probe -- --take-fps 60`), and a way out for a player on
 * a machine the hints misjudge.
 */

/**
 * Whether the 3D neck is drawn at the display's rate during a Take, or held
 * to 30 as it has been since it was built.
 *
 * Off, on purpose, on 2026-11-19. Everything it needs is here and tested, but
 * the one thing that may turn it on is the click's gate with the neck at the
 * display's rate (`AGENTS.md`, "Frame rate during a Take"): no missed beat,
 * jitter inside the gate, on a quiet machine. That day the machine was never
 * quiet (load 8 to 96 from other work), so the runs that were made say
 * nothing either way and are recorded as such in `plans/HANDOFF-smooth.md`.
 * When the gate has passed, this becomes `true` and nothing else changes.
 * To try it on one machine before then, put `"stage.takeFps": "display"` in
 * its settings store.
 */
export const NECK_FOLLOWS_DISPLAY = false;

/** A Take on a machine that should not be asked for more. */
export const TAKE_FPS_LOW = 30;
/**
 * As fast as a Take is ever drawn. A display a little over it is drawn in
 * full (144 and 165 Hz: every frame, since half of those is slower than 120
 * and uneven spacing is worse than either); a 240 Hz one every other frame.
 */
export const TAKE_FPS_MAX = 120;

/** Frames judged at a time. */
export const RATE_WINDOW = 30;
/** A frame this many display frames late is a miss. */
const LATE = 1.6;
/** A window with this share of misses trips the fallback. */
const MISS_SHARE = 0.25;
/** Drawing may take this share of a frame's budget on the main thread. */
const WORK_SHARE = 0.5;
/** Windows tripped before the low rate is kept for good. */
export const STRIKES_OUT = 2;

/**
 * A webview that is likely to paint transforms on the CPU: WebKitGTK (Linux,
 * no Chrome in the agent).
 */
export function likelyCpuCompositing(ua: string): boolean {
  return /Linux/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
}

export type RateHints = {
  ua: string;
  reducedMotion: boolean;
  /** `navigator.hardwareConcurrency`, where the webview says. */
  cores?: number;
  /** `navigator.deviceMemory` in GB (Chromium only). */
  memoryGb?: number;
  /** `navigator.connection.saveData` (Android's data saver). */
  saveData?: boolean;
  /** The battery, where the webview has one to report (Chromium only). */
  battery?: { charging: boolean; level: number } | null;
  /** The stage's quality tier (`quality.ts`); 0 is a software renderer or an old phone GPU. */
  tier?: number | null;
  /** `stage.takeFps` from the store: a number forces the rate. */
  override?: number | null;
  /** `stage.takeFps: "display"`: the neck follows the display on this machine, whatever `NECK_FOLLOWS_DISPLAY` says. */
  neckFollowsDisplay?: boolean;
};

export type Ceiling = { fps: number; why: string };

/** The rate a Take starts at on this machine, and why. */
export function takeCeiling(h: RateHints): Ceiling {
  if (typeof h.override === "number" && Number.isFinite(h.override) && h.override > 0) {
    return { fps: Math.max(1, Math.min(240, Math.round(h.override))), why: "override" };
  }
  const low = (why: string): Ceiling => ({ fps: TAKE_FPS_LOW, why });
  if (likelyCpuCompositing(h.ua)) return low("cpu-compositing");
  if (h.tier === 0) return low("low-tier");
  if (h.reducedMotion) return low("reduced-motion");
  if (h.saveData) return low("save-data");
  if (typeof h.cores === "number" && h.cores > 0 && h.cores <= 4) return low("few-cores");
  if (typeof h.memoryGb === "number" && h.memoryGb > 0 && h.memoryGb <= 2) return low("low-memory");
  if (h.battery && !h.battery.charging && h.battery.level <= 0.2) return low("battery");
  return { fps: TAKE_FPS_MAX, why: "display" };
}

export class TakeRate {
  private ceiling: Ceiling = { fps: TAKE_FPS_MAX, why: "display" };
  private tripped = false;
  private strikes = 0;
  private n = 0;
  private misses = 0;
  private work = 0;
  private budget = 0;
  private begun = false;
  private follow: boolean;
  /** Why the rate last read is what it is, for the debug readout and the tests. */
  why = "display";

  constructor(
    private readonly hints: () => RateHints,
    /** The neck follows the display (the app's switch, unless a test says otherwise). */
    private readonly neckFollows: boolean = NECK_FOLLOWS_DISPLAY,
  ) {
    this.follow = neckFollows;
  }

  /** A Take starts: read the machine again, forgive this Take's trip (not the strikes). Returns the neck's rate. */
  begin(extra: Partial<RateHints> = {}): number {
    this.begun = true;
    const hints = { ...this.hints(), ...extra };
    this.ceiling = takeCeiling(hints);
    this.follow = hints.neckFollowsDisplay ?? this.neckFollows;
    this.tripped = false;
    this.clear();
    return this.fps;
  }

  /** Frames a second for the 3D neck now. */
  get fps(): number {
    const lane = this.laneFps;
    if (this.ceiling.why === "override" || this.follow || lane <= TAKE_FPS_LOW) return lane;
    this.why = "neck-held";
    return TAKE_FPS_LOW;
  }

  /** Frames a second for the runway's lane and the tab's cursor now. */
  get laneFps(): number {
    // Read before any Take began (a warm-up's tab, a Watch): the machine's hints, as a Take would.
    if (!this.begun) this.begin();
    if (this.ceiling.why === "override") {
      this.why = "override";
      return this.ceiling.fps;
    }
    if (this.strikes >= STRIKES_OUT) {
      this.why = "slow-frames-kept";
      return TAKE_FPS_LOW;
    }
    if (this.tripped) {
      this.why = "slow-frames";
      return TAKE_FPS_LOW;
    }
    this.why = this.ceiling.why;
    return this.ceiling.fps;
  }

  /**
   * One frame drawn back to back with the last at the full rate: `gapMs`
   * since that one, `expectedMs` the gap it was meant to have (the display's
   * frame, or the cap's), `workMs` what drawing it took on the main thread.
   * Returns true when this frame tripped the fallback.
   */
  sample(gapMs: number, expectedMs: number, workMs = 0): boolean {
    if (this.tripped || this.strikes >= STRIKES_OUT || this.ceiling.why === "override") return false;
    if (this.ceiling.fps <= TAKE_FPS_LOW || !(expectedMs > 0)) return false;
    this.n += 1;
    if (gapMs > expectedMs * LATE) this.misses += 1;
    this.work += workMs;
    this.budget += expectedMs;
    if (this.n < RATE_WINDOW) return false;
    const slow = this.misses >= RATE_WINDOW * MISS_SHARE || this.work > this.budget * WORK_SHARE;
    this.clear();
    if (!slow) return false;
    this.tripped = true;
    this.strikes += 1;
    return true;
  }

  /** A run of frames ended (the neck went idle): a partial window says nothing. */
  clear(): void {
    this.n = 0;
    this.misses = 0;
    this.work = 0;
    this.budget = 0;
  }

  /** For tests. */
  reset(): void {
    this.begun = false;
    this.tripped = false;
    this.strikes = 0;
    this.clear();
  }
}

// ─── The browser's hints ───

let battery: { charging: boolean; level: number } | null = null;
let batteryAsked = false;
let override: number | null = null;
let followFromStore: boolean | undefined;

/** `stage.takeFps` from the store (`prefs.ts`): a number forces the rate, `"display"` lets the neck follow the display. */
export function setTakeFpsOverride(fps: number | string | null | undefined): void {
  override = typeof fps === "number" && Number.isFinite(fps) && fps > 0 ? fps : null;
  followFromStore = fps === "display" ? true : undefined;
}

function askBattery(): void {
  if (batteryAsked || typeof navigator === "undefined") return;
  batteryAsked = true;
  type Battery = { charging: boolean; level: number; addEventListener: (t: string, fn: () => void) => void };
  const get = (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery;
  if (typeof get !== "function") return;
  try {
    void get
      .call(navigator)
      .then((b) => {
        const read = () => {
          battery = { charging: b.charging, level: b.level };
        };
        read();
        b.addEventListener("chargingchange", read);
        b.addEventListener("levelchange", read);
      })
      .catch(() => {});
  } catch {
    /* no battery to ask */
  }
}

export function browserHints(): RateHints {
  if (typeof navigator === "undefined" || typeof window === "undefined") return { ua: "", reducedMotion: false, override };
  askBattery();
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let reducedMotion = false;
  let query: number | null = null;
  let follow = followFromStore;
  try {
    reducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // `?takefps=60`, `?takefps=display`: the same two, on the page (the shot harness).
    const asked = new URLSearchParams(window.location.search).get("takefps");
    const q = Number(asked);
    if (Number.isFinite(q) && q > 0) query = q;
    if (asked === "display") follow = true;
  } catch {
    /* no media queries, no location */
  }
  return {
    ua: nav.userAgent ?? "",
    reducedMotion,
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    saveData: !!nav.connection?.saveData,
    battery,
    override: query ?? override,
    neckFollowsDisplay: follow,
  };
}

/** The Take's governor: the neck (`fps`), the runway and the tab strip (`laneFps`) all read this one. */
export const takeRate = new TakeRate(browserHints);

/**
 * At `fps` on a display whose frame is `displayMs`, is every display frame
 * drawn? Yes when the cap's spacing is within about a third of the display's
 * (120 on 144 or 165 Hz, 60 on 60 or 75), so a cap never produces an uneven
 * two-then-one cadence.
 */
export function everyFrame(fps: number, displayMs: number): boolean {
  return displayMs >= (1000 / Math.max(1, fps)) * 0.72;
}

/**
 * For a DOM frame loop (the runway, the tab's cursor) on the display's own
 * animation frames: should the frame at `now` be drawn, given the last one
 * drawn at `last` and the display's frame time? Skips frames to hold `fps`
 * without ever asking for less than a display frame.
 */
export function dueAt(now: number, last: number, fps: number, displayMs: number): boolean {
  if (everyFrame(fps, displayMs)) return true;
  // Within half a display frame of the cap's spacing counts: stamps are a vsync apart, give or take.
  return now - last >= 1000 / Math.max(1, fps) - displayMs * 0.5;
}

/**
 * The display's frame time, learned from animation-frame stamps that were
 * asked for back to back: the smallest of the last few gaps, so a dropped
 * frame (a gap of two) does not pass for a slower display.
 */
export class DisplayClock {
  private gaps: number[] = [];
  /** 60 Hz until the stamps say otherwise. */
  ms = 1000 / 60;

  sample(gapMs: number): void {
    if (!(gapMs > 2) || gapMs > 120) return;
    this.gaps.push(gapMs);
    if (this.gaps.length > 12) this.gaps.shift();
    if (this.gaps.length >= 4) this.ms = Math.min(...this.gaps);
  }
}
