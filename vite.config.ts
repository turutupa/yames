import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  // Build-time platform flag — see src/platform.ts. `YAMES_MOBILE=1` makes
  // every `if (!IS_MOBILE)` branch fold away, so the coach, evaluation,
  // voice, MIDI, widget, hotkey and window-management subtrees never reach
  // dist/. scripts/check-mobile-bundle.mjs is the gate.
  define: {
    __YAMES_MOBILE__: JSON.stringify(process.env.YAMES_MOBILE === "1"),
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
