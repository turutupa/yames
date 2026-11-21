import { describe, expect, it } from "vitest";
import { finding, fixture } from "../../coach/ask/cardFixtures";
import { buildCoachContext, contextForModel, type CoachSources } from "../../coach/context";
import type { SongAttemptReview } from "../songs/review/useSongAttempt";
import { askModelContext, askPrompt } from "./askContext";
import type { AskTurn } from "./askStore";
import type { ToolBody } from "./askTools";

const receipt: ToolBody = { kind: "receipt", receipt: { key: "coachTools.receipt.goTo", values: { screen: "paths" } }, undo: null };

describe("askModelContext (review c2b1a F5)", () => {
  // A Take not caught, whose analysis still says "rushing" over the whole Take.
  const f = fixture({ verdict: "notCaught", findings: [finding("rushing", [0, 9])] });
  const sources: CoachSources = {
    screen: () => "session",
    locale: () => "en",
    grading: () => "on",
    input: () => ({ listening: true, direct: false }),
    brain: () => ({ llmCompiled: true, choice: "off", resident: false, fastEnough: false }),
    progress: () => f.ctx.progress,
    lastTake: () => f.outcome,
    review: () => f.review as unknown as SongAttemptReview,
  };

  it("the getters carry the review (the cards read it), and the plain context would print its findings", () => {
    expect(buildCoachContext(sources).review).toBeDefined();
    expect(contextForModel(buildCoachContext(sources))).toContain("findings: rushing");
  });

  it("the model's context leaves the raw findings out, and keeps the Take's own line", () => {
    const text = askModelContext(sources);
    expect(text).not.toMatch(/findings|rushing/);
    expect(text).toContain("last take 2 at 90 bpm: notCaught");
  });
});

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
