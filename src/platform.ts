/**
 * Which app this build is.
 *
 * `__YAMES_MOBILE__` is injected by Vite's `define` from the `YAMES_MOBILE`
 * environment variable (see `vite.config.ts`). It is a build-time constant on
 * purpose: a runtime check (user agent, screen width, a Tauri platform call)
 * would leave every cut module sitting in `dist/`, and the whole point of the
 * mobile cut is that the coach, the mic evaluation, the voice, MIDI, the
 * floating widget, the hotkeys and the window APIs are *not there* —
 * `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1, "gone, not greyed out".
 *
 * Because the value folds to a literal before Rollup runs, every
 * `if (!IS_MOBILE)` branch is dead code on a mobile build and the modules it
 * reached are dropped from the graph, static imports and all.
 * `scripts/check-mobile-bundle.mjs` is the gate that proves it.
 *
 * The same reasoning is why hooks are called as `IS_MOBILE ? inert : useX()`
 * in a few places. That reads like a conditional hook and is not one: the
 * condition is fixed for the lifetime of a build, so the hook order never
 * changes at runtime — and it is the only form Rollup can shake `useX` out of.
 *
 * Tests: `vitest.config.ts` deliberately does NOT define `__YAMES_MOBILE__`,
 * so the `typeof` guard resolves against `globalThis` at runtime and the
 * mobile composition tests can flip it with
 * `vi.stubGlobal("__YAMES_MOBILE__", true)` + `vi.resetModules()` before
 * importing the module under test. With a define in place the constant would
 * already be baked in and the stub would do nothing.
 */
declare const __YAMES_MOBILE__: boolean;

export const IS_MOBILE: boolean =
  typeof __YAMES_MOBILE__ !== "undefined" && __YAMES_MOBILE__;

/**
 * Whether this phone build may be put on a screen from outside itself.
 *
 * Set by nothing except the iPhone simulator job in
 * `.github/workflows/ios.yml`, through `YAMES_MOBILE_DEBUG=1`. A simulator
 * running with no one in front of it cannot tap a tab bar, and every screen
 * the release checklist wants a picture of has to be reached somehow. Three
 * of them already can be: the tab the app was last on is persisted, so
 * writing `activeTab` into the settings store and relaunching lands on the
 * metronome, the drill or the setlist with no app code involved at all.
 *
 * The settings pane and zen are not tabs and are not persisted, so those two
 * get the values below instead — read in exactly two places
 * (`useTabRouting`, `useFullscreenLifecycle`) and only when this constant is
 * true.
 *
 * It folds to `false` in every build that is not that job, which takes the
 * two marker strings out of `dist/` entirely. The workflow greps for them
 * before it archives anything for a real device, so "compiled out" is checked
 * rather than asserted.
 */
declare const __YAMES_MOBILE_DEBUG__: boolean;

export const MOBILE_DEBUG_SCREENS: boolean =
  typeof __YAMES_MOBILE_DEBUG__ !== "undefined" && __YAMES_MOBILE_DEBUG__;

/** Start on the settings pane. Only honoured when `MOBILE_DEBUG_SCREENS`. */
export const DEBUG_SCREEN_SETTINGS = "debug:settings";

/** Start in zen. Only honoured when `MOBILE_DEBUG_SCREENS`. */
export const DEBUG_SCREEN_ZEN = "debug:zen";
