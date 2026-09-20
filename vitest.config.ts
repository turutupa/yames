import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
        /*
         * More heap than a fork gets by default.
         *
         * The cheat sheet's chart is twelve roots by twenty-seven chord
         * types, and every cell is an inline SVG — three hundred-odd of them
         * per render, and `JamView.test.tsx` renders the sheet a few dozen
         * times. A real browser draws that without noticing; happy-dom
         * builds a full object tree for every node and the worker ran out of
         * memory. The limit was the test environment's, not the product's.
         *
         * `ChordDiagram` was made lighter at the same time and for the same
         * reading — its twelve ruled `<line>`s became two `<path>`s — which
         * is worth more to the app than to the tests. Do not raise this
         * number again without first asking what is drawing so much.
         */
        execArgv: ["--max-old-space-size=6144"],
      },
    },
  },
});
