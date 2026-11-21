import { describe, expect, it } from "vitest";
import { askPrompt } from "./askContext";
import type { AskTurn } from "./askStore";
import type { ToolBody } from "./askTools";

const receipt: ToolBody = { kind: "receipt", receipt: { key: "coachTools.receipt.goTo", values: { screen: "paths" } }, undo: null };

describe("askPrompt", () => {
  it("drops a player's turn a tool answered, keeps the ones the model answered", () => {
    const turns: AskTurn[] = [
      { id: "1", kind: "user", text: "why was I late?" },
      { id: "2", kind: "coach", text: "You pushed the downbeats." },
      { id: "3", kind: "user", text: "Slower" },
      { id: "4", kind: "tool", body: receipt },
      { id: "5", kind: "user", text: "open paths" },
      { id: "6", kind: "divider", text: "Now looking at: Paths" },
      { id: "7", kind: "tool", body: receipt },
    ];
    const prompt = askPrompt("screen: today", turns, "what next?");
    expect(prompt).toContain("User: why was I late?");
    expect(prompt).toContain("Coach: You pushed the downbeats.");
    expect(prompt).not.toContain("User: Slower");
    expect(prompt).not.toContain("User: open paths");
    expect(prompt).toContain("User asks: what next?");
  });

  it("keeps a player's turn still waiting for the model, and one with nothing after it", () => {
    const turns: AskTurn[] = [
      { id: "1", kind: "user", text: "how do I mute?" },
      { id: "2", kind: "app", text: "No model is on." },
      { id: "3", kind: "user", text: "and now?" },
    ];
    const prompt = askPrompt("screen: today", turns, "hello");
    expect(prompt).toContain("User: how do I mute?");
    expect(prompt).toContain("User: and now?");
  });
});
