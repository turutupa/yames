/** The Android test build: `betaFlag` plus `mobileFlag`. FIRST import. */
(globalThis as unknown as { __YAMES_MOBILE__: boolean }).__YAMES_MOBILE__ = true;
(globalThis as unknown as { __YAMES_BETA__: boolean }).__YAMES_BETA__ = true;

export {};
