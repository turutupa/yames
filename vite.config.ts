import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  // Build-time platform flag — see src/platform.ts. `YAMES_MOBILE=1` makes
  // every `if (!IS_MOBILE)` branch fold away, so the coach, evaluation,
  // voice, MIDI, widget, hotkey and window-management subtrees never reach
  // dist/. scripts/check-mobile-bundle.mjs is the gate.
  // `YAMES_MOBILE_DEBUG=1` is a second, narrower flag, set by nothing but the
  // iPhone simulator job in .github/workflows/ios.yml. It lets that job put
  // the app on the settings screen or in zen by writing one value into the
  // settings store between two launches — a headless simulator cannot tap a
  // tab bar. Off, the branches fold away and the marker strings they compare
  // against are not in dist/ at all, which is what the workflow checks before
  // it archives a build for a device.
  define: {
    __YAMES_MOBILE__: JSON.stringify(process.env.YAMES_MOBILE === "1"),
    __YAMES_MOBILE_DEBUG__: JSON.stringify(
      process.env.YAMES_MOBILE === "1" && process.env.YAMES_MOBILE_DEBUG === "1",
    ),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
