/**
 * Turn this test file into a TEST build (the `beta` channel, desktop).
 * Same rule as `mobileFlag.ts`: `src/platform.ts` reads the global once, so
 * this must be the FIRST import. Import `betaMobileFlag` for the Android beta.
 */
(globalThis as unknown as { __YAMES_BETA__: boolean }).__YAMES_BETA__ = true;

export {};
