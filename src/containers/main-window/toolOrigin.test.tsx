/**
 * Escape in a tool goes back where the tool was opened from (acceptance
 * pass 2, P2-8): Ctrl+5 on Today opened the Metronome, and Escape then landed
 * on Tools, a page the player had not been on.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import i18n from "../../i18n";
import { openShell, settle } from "../../test/parity/shell";

const t = (key: string) => i18n.t(key);
const on = (id: string) => document.querySelector(`[data-testid="${id}"]`) !== null;

async function key(init: KeyboardEventInit) {
  await act(async () => {
    fireEvent.keyDown(document.body, init);
  });
  await settle();
}

async function rail(labelKey: string) {
  const button = document.querySelector<HTMLElement>(`.rail [aria-label="${t(labelKey)}"]`)!;
  await act(async () => void fireEvent.click(button));
  await settle();
}

describe("Escape in a tool", () => {
  it("opened by Ctrl+5 from Today: back to Today", async () => {
    await openShell();
    await rail("session.nav.progress");
    await rail("session.nav.today");
    expect(on("today")).toBe(true);
    await key({ key: "5", code: "Digit5", ...(navigator.platform.toUpperCase().includes("MAC") ? { metaKey: true } : { ctrlKey: true }) });
    expect(on("today")).toBe(false);
    await key({ key: "Escape", code: "Escape" });
    expect(on("today")).toBe(true);
  });

  it("opened from Tools: back to Tools", async () => {
    await openShell();
    await rail("session.nav.tools");
    await key({ key: "5", code: "Digit5", ...(navigator.platform.toUpperCase().includes("MAC") ? { metaKey: true } : { ctrlKey: true }) });
    await key({ key: "Escape", code: "Escape" });
    expect(on("today")).toBe(false);
    expect(document.querySelector('[data-testid="tools"], .tools-view')).not.toBeNull();
  });
});
