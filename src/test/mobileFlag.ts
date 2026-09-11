/**
 * Turn this test file into a phone.
 *
 * `src/platform.ts` reads `__YAMES_MOBILE__` once, when it is first
 * evaluated, and `vitest.config.ts` deliberately does not `define` it — so
 * setting the global is enough, PROVIDED it happens before anything imports
 * the module under test. ES modules are evaluated in import order, so this
 * file must be the FIRST import in any test that wants the mobile
 * composition:
 *
 *     import "../test/mobileFlag";       // ← first, always
 *     import { MainWindow } from "...";
 *
 * That ordering is the whole mechanism; `vi.stubGlobal` in a `beforeEach`
 * runs far too late. Vitest isolates each test file's module registry, so a
 * file that imports this is mobile and nothing else is affected.
 */
(globalThis as unknown as { __YAMES_MOBILE__: boolean }).__YAMES_MOBILE__ = true;

export {};
