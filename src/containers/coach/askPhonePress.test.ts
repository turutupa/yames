/**
 * Leg t2f: on a phone, a press on the thread while the keyboard is up keeps the
 * box's focus until the click lands (`AskPanel`'s sheet). Which presses count:
 * a button in the thread or in the chip row, never the send button (it keeps
 * the focus on its own and the keyboard must stay up after a send), never the
 * text of a turn (a press there selects text, as before). The press itself is
 * measured in a real browser: `tests/layout/ask-make-phone.spec.ts`.
 */
import { describe, expect, it } from "vitest";
import { pressedInThread } from "./AskPanel";

function sheet(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <div class="ask-thread">
      <div class="ask-tool ask-proposal">
        <p class="ask-proposal-line">Add this?</p>
        <button type="button" class="ask-tool-btn" data-testid="go"><span class="label">Add it</span></button>
      </div>
    </div>
    <div class="ask-chip-row"><button type="button" class="ask-chip" data-testid="chip">Go to Paths</button></div>
    <form class="ask-compose"><textarea data-testid="input"></textarea><button type="submit" data-testid="send"></button></form>
    <div class="ask-head"><button type="button" data-testid="tab">Notebook</button></div>`;
  return root;
}

describe("pressedInThread", () => {
  it("counts a button in the thread, or anything inside one, and a chip under the thread", () => {
    const root = sheet();
    expect(pressedInThread(root.querySelector("[data-testid=go]"))).toBe(true);
    expect(pressedInThread(root.querySelector("[data-testid=go] .label"))).toBe(true);
    expect(pressedInThread(root.querySelector("[data-testid=chip]"))).toBe(true);
  });

  it("does not count the send button, the box, the head or a turn's text", () => {
    const root = sheet();
    expect(pressedInThread(root.querySelector("[data-testid=send]"))).toBe(false);
    expect(pressedInThread(root.querySelector("[data-testid=input]"))).toBe(false);
    expect(pressedInThread(root.querySelector("[data-testid=tab]"))).toBe(false);
    expect(pressedInThread(root.querySelector(".ask-proposal-line"))).toBe(false);
    expect(pressedInThread(root.querySelector(".ask-proposal"))).toBe(false);
    expect(pressedInThread(null)).toBe(false);
  });
});
