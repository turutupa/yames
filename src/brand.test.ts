import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_NAME } from "./brand";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

/** The window's name, everywhere the OS reads one, is `APP_NAME` as written (owner, 2026-11-17). */
describe("the app's name", () => {
  it("is capitalised", () => {
    expect(APP_NAME[0]).toBe(APP_NAME[0].toUpperCase());
  });

  for (const file of [
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.windows.conf.json",
    "src-tauri/tauri.android.conf.json",
    "src-tauri/tauri.ios.conf.json",
  ]) {
    it(`titles the main window in ${file}`, () => {
      const conf = JSON.parse(read(file)) as {
        productName?: string;
        app?: { windows?: Array<{ label?: string; title?: string }> };
      };
      const main = conf.app?.windows?.find((w) => (w.label ?? "main") === "main");
      if (main?.title !== undefined) expect(main.title).toBe(APP_NAME);
      if (conf.productName !== undefined) expect(conf.productName).toBe(APP_NAME);
    });
  }

  it("is the page's <title>", () => {
    expect(read("index.html")).toContain(`<title>${APP_NAME}</title>`);
  });

  it("is the titlebar's wordmark, from the one constant", () => {
    const bar = read("src/components/TitleBar.tsx");
    expect(bar).toContain("{APP_NAME}");
    expect(bar).not.toMatch(/>\s*yames\s*</i);
  });
});
