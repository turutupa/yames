import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // NOTE: no `define` for `__YAMES_MOBILE__` here, on purpose. Baking the
  // constant in would make `src/platform.ts` a literal `false` at transform
  // time and the mobile composition tests could not flip it. Left undefined,
  // the `typeof` guard resolves against `globalThis` at runtime, so a test
  // does `vi.stubGlobal("__YAMES_MOBILE__", true)` + `vi.resetModules()` and
  // then `await import(...)` the module it wants composed for a phone.
  // Everything else sees `IS_MOBILE === false`, which is the desktop app.
  test: {
    // happy-dom replaces jsdom here purely to dodge the broken
    // `html-encoding-sniffer@6.0.0` → `require('@exodus/bytes')` chain.
    // `@exodus/bytes@1.15.0` flipped to `"type": "module"`, so the CJS
    // `require()` inside html-encoding-sniffer fails with
    // ERR_REQUIRE_ESM. happy-dom is faster, smaller, and gives us the
    // same JSDOM-style globals our React component tests rely on.
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "src-tauri"],
    css: false,
    // Component tests that mount MainWindow / FullscreenView take well
    // under a second on an idle machine but routinely blow the default
    // 5 s limit when the box is busy (parallel cargo builds, cold CI
    // runners, first Vite transform). The limit exists to catch hangs,
    // not slow CPUs; 20 s still catches a hang.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // bun's worker MessagePort lacks `addListener`, which breaks vitest's
    // default `threads` pool. `forks` uses child_process and works fine.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
