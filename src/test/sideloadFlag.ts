/**
 * Turn this test file into the phone build people download from yames.app.
 *
 * Same mechanism and same rule as `mobileFlag.ts`, which this also does:
 * `src/platform.ts` reads both globals once, when it is first evaluated, and
 * `vitest.config.ts` defines neither — so this file must be the FIRST import
 * in any test that wants the sideload composition.
 *
 *     import "../test/sideloadFlag";     // ← first, always
 *     import { AboutSection } from "...";
 *
 * A test file that imports `mobileFlag` instead IS the store build, which is
 * the other half of every assertion here.
 */
(globalThis as unknown as { __YAMES_MOBILE__: boolean }).__YAMES_MOBILE__ = true;
(globalThis as unknown as { __YAMES_SIDELOAD__: boolean }).__YAMES_SIDELOAD__ = true;

export {};
