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
