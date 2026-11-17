/**
 * The kit dropdown ON A PHONE (M10).
 *
 * A desktop decodes every kit the app ships the moment the pointer reaches
 * the picker, so the one you click plays at once. That is about 97 MB, and on
 * a phone 97 MB of drums nobody asked to hear is what gets a backgrounded app
 * killed. So the phone decodes the kit that is CHOSEN, when it is chosen —
 * and the dropdown still works exactly the same way, which is what this file
 * pins.
 *
 * Its own file rather than a case in `KitPicker.test.tsx`: `IS_MOBILE` folds
 * to a constant at import time, so a build's worth of it is one module graph.
 */
import { describe, expect, it, vi, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const ipc = vi.hoisted(() => ({ warm: vi.fn() }));

vi.mock("../../ipc", () => ({
  warmJam: (request: unknown) => ipc.warm(request),
}));

// `platform.ts` reads this off `globalThis` when Vite has not baked it in,
// which is exactly what `vitest.config.ts` arranges. See `src/platform.ts`.
vi.stubGlobal("__YAMES_MOBILE__", true);

let KitPicker: typeof import("./KitPicker").KitPicker;

beforeAll(async () => {
  vi.resetModules();
  ({ KitPicker } = await import("./KitPicker"));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function draw() {
  const props = {
    kit: "raw",
    onKit: vi.fn(),
    customKit: null,
    onCustomKit: vi.fn(),
    onPreview: vi.fn(),
    previewing: null,
  };
  return { ...render(<KitPicker {...props} />), props };
}

describe("the kit picker on a phone", () => {
  it("decodes nothing just because the picker was opened", () => {
    draw();
    const button = screen.getByRole("button", { name: /Kit/ });
    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(ipc.warm).not.toHaveBeenCalled();
  });

  it("still opens, and still chooses", () => {
    const { props } = draw();
    fireEvent.click(screen.getByRole("button", { name: /Kit/ }));
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    fireEvent.click(options[1]);
    expect(props.onKit).toHaveBeenCalled();
    // The chosen kit is decoded by the `set_jam` the edit sends, not here.
    expect(ipc.warm).not.toHaveBeenCalled();
  });
});
