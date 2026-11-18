/**
 * Enter on a focused button is the button's (acceptance pass 2, N-P1-1).
 *
 * The skip link lands the keyboard player on Today's Start, and Enter there
 * did nothing: Enter is `session-go`, the window's key handler took it and
 * `preventDefault`ed it, and off a running Session the action is dropped. So
 * the button never heard the key it was focused for. Space only worked because
 * `play` on Today happens to start the Session as well.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import i18n from "../../i18n";
import { setInvokeResponse } from "../../test/mocks";
import { openShell, settle } from "../../test/parity/shell";
import { focusedControlTakesKey, sessionKeyIsInert } from "../../hotkeys";

const t = (key: string) => i18n.t(key);
const testid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function openToday() {
  const now = Date.now();
  setInvokeResponse("list_path_states", () => [
    { pathId: "alternate-picking", startedAt: now - 3 * 86_400_000, updatedAt: now - 86_400_000 },
  ]);
  await openShell();
  const rail = (key: string) => document.querySelector<HTMLElement>(`.rail [aria-label="${t(key)}"]`)!;
  await act(async () => void fireEvent.click(rail("session.nav.progress")));
  await act(async () => void fireEvent.click(rail("session.nav.today")));
  await settle();
  await waitFor(() => {
    const start = testid("today-start") as HTMLButtonElement | null;
    if (!start || start.disabled) throw new Error("no plan on Today yet");
  });
  return testid("today-start")!;
}

function key(target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("Enter on a focused button, through the whole window", () => {
  it("leaves Enter on Today's Start to the button, so the browser activates it", async () => {
    const start = await openToday();
    start.focus();
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.keyDown(start, { key: "Enter", code: "Enter" });
    });
    expect(notPrevented).toBe(true);
    // Still on Today: the window did not start anything itself, the button will.
    expect(testid("today")).not.toBeNull();
  });

  it("leaves Enter alone on Today when nothing is focused, too: no Session key applies there", async () => {
    await openToday();
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
    });
    expect(notPrevented).toBe(true);
  });
});

describe("focusedControlTakesKey", () => {
  const button = () => document.createElement("button");

  it("gives Enter and Space to a focused button on the learning pages", () => {
    for (const view of ["today", "paths", "progress", "tools"]) {
      expect(focusedControlTakesKey(key(button(), "Enter"), view), view).toBe(true);
      expect(focusedControlTakesKey(key(button(), " "), view), view).toBe(true);
    }
  });

  it("keeps every other key, and modified Enter, for the hotkeys", () => {
    expect(focusedControlTakesKey(key(button(), "ArrowUp"), "today")).toBe(false);
    expect(focusedControlTakesKey(key(button(), "Enter", { shiftKey: true }), "today")).toBe(false);
    expect(focusedControlTakesKey(key(document.createElement("div"), "Enter"), "today")).toBe(false);
  });

  it("never hands the Session's big button its key: that key is the Session action", () => {
    const big = button();
    big.className = "session-big";
    expect(focusedControlTakesKey(key(big, " "), "session")).toBe(false);
    expect(focusedControlTakesKey(key(big, "Enter"), "session")).toBe(false);
  });

  it("in the Session, a clicked button keeps Space as the hotkey; a keyboard-focused one takes it", () => {
    const b = button();
    b.matches = ((sel: string) => (sel === ":focus-visible" ? false : Element.prototype.matches.call(b, sel))) as typeof b.matches;
    expect(focusedControlTakesKey(key(b, " "), "session")).toBe(false);
    const kb = button();
    kb.matches = ((sel: string) => (sel === ":focus-visible" ? true : Element.prototype.matches.call(kb, sel))) as typeof kb.matches;
    expect(focusedControlTakesKey(key(kb, " "), "session")).toBe(true);
  });

  it("lets Space toggle a checkbox but keeps Enter there a hotkey", () => {
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(focusedControlTakesKey(key(box, " "), "today")).toBe(true);
    expect(focusedControlTakesKey(key(box, "Enter"), "today")).toBe(false);
  });
});

describe("sessionKeyIsInert", () => {
  it("is every Session key off the Session but the pedal, which is Play there", () => {
    expect(sessionKeyIsInert("session-go", "today")).toBe(true);
    expect(sessionKeyIsInert("session-go", "settings")).toBe(true);
    expect(sessionKeyIsInert("session-go", "session")).toBe(false);
    expect(sessionKeyIsInert("session-pedal", "today")).toBe(false);
    expect(sessionKeyIsInert("play", "today")).toBe(false);
  });
});
