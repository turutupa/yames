/** The coach's line and note: the rules the mocks fix that a unit test can see (DESIGN 3.4, 3.6, 4.4). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import { TAKE_ORDER_MAX, TakeOrder, shortCue } from "./CoachLine";
import { CoachNote, FactLine, NoteBars } from "./CoachNote";
import type { FactItem, NoteStrip } from "../../coach/takeNote";
import { UngradedNote } from "../session/SessionCoach";
import type { SessionRun } from "../session/hooks/useSessionRun";
import type { TakeOutcome } from "../../session/runner";

afterEach(cleanup);

describe("the order during a Take", () => {
  it("is the cue whole, or nothing: never cut mid-sentence", () => {
    expect(shortCue("Count the held E, then come in.")).toBe("Count the held E, then come in.");
    expect(shortCue("x".repeat(TAKE_ORDER_MAX))).toHaveLength(TAKE_ORDER_MAX);
    expect(shortCue("x".repeat(TAKE_ORDER_MAX + 1))).toBeNull();
    expect(shortCue("  ")).toBeNull();
    expect(shortCue(undefined)).toBeNull();
  });

  it("counts characters as read, not UTF-16 units", () => {
    // 48 letters with astral characters among them still fit.
    expect(shortCue("𝄞".repeat(TAKE_ORDER_MAX))).not.toBeNull();
  });

  it("is memoised on its words: the same order does not render again", () => {
    let renders = 0;
    const Spy = ({ text }: { text: string }) => {
      renders += 1;
      return <TakeOrder text={text} />;
    };
    const { rerender } = render(<Spy text="Count the held E." />);
    rerender(<Spy text="Count the held E." />);
    expect(renders).toBe(2);
    expect(screen.getAllByTestId("coach-order")).toHaveLength(1);
    expect(screen.getByTestId("coach-order")).toHaveTextContent("Count the held E.");
  });
});

describe("the note", () => {
  it("says its headline, its source and is read out politely on a result", () => {
    render(<CoachNote headline="Bar 1 of the tune slipped." source={{ kind: "path", step: 2 }} live testId="n" />);
    const note = screen.getByTestId("n");
    expect(note).toHaveAttribute("aria-live", "polite");
    expect(note).toHaveTextContent("Bar 1 of the tune slipped.");
    expect(note).toHaveTextContent("From the Path · Step 2");
  });

  it("marks a fact it could not tell with a dash, never a cross", () => {
    const facts: FactItem[] = [
      { kind: "heard", mark: "check", line: { key: "session.note.fact.heard", values: { heard: 60, expected: 60 } } },
      { kind: "notesUnchecked", mark: "dash", line: { key: "session.note.fact.notesUnchecked.tooFast", values: {} } },
    ];
    render(<FactLine facts={facts} render={(f) => f.line.key} />);
    const dash = document.querySelector('[data-kind="notesUnchecked"]')!;
    expect(dash).toHaveAttribute("data-mark", "dash");
    expect(dash.textContent).toContain("–");
    expect(dash.textContent).not.toContain("✗");
  });

  it("sets rounds of the tune apart, and a slipped bar carries a cross", () => {
    const cells = Array.from({ length: 10 }, (_, i) => ({
      n: i + 1,
      state: (i === 0 || i === 4 ? "missed" : "met") as "missed" | "met",
      round: Math.floor(i / 4) + 1,
      patternBar: (i % 4) + 1,
      spot: i === 0 || i === 4,
    }));
    const strip: NoteStrip = {
      cells,
      patternBars: 4,
      rounds: 3,
      held: null,
      label: { key: "session.note.strip.roundEvery", values: { count: 4 } },
    };
    render(<NoteBars strip={strip} label="the tune comes round every 4" />);
    expect(document.querySelectorAll(".coach-bars-round")).toHaveLength(3);
    const missed = [...document.querySelectorAll('.coach-bar[data-state="missed"]')];
    expect(missed.map((m) => m.textContent)).toEqual(["×1", "×5"]);
  });

  it("given onAsk, its sentence and each bar open Ask about themselves (DESIGN 5.1)", () => {
    const onAsk = vi.fn();
    const strip: NoteStrip = {
      cells: [1, 2, 3].map((n) => ({ n, state: (n === 2 ? "missed" : "met") as "missed" | "met", round: 1, patternBar: n, spot: n === 2 })),
      patternBars: 3,
      rounds: 1,
      held: null,
      label: { key: "session.note.strip.roundEvery", values: { count: 3 } },
    };
    render(
      <CoachNote headline="Bar 2 of the tune slipped." onAsk={onAsk} testId="n">
        <NoteBars strip={strip} label="every 3" onAsk={onAsk} />
      </CoachNote>,
    );
    const say = screen.getByTestId("coach-note-ask");
    fireEvent.click(say);
    expect(onAsk).toHaveBeenLastCalledWith({ about: "Bar 2 of the tune slipped.", from: say });
    const bar = screen.getByTestId("coach-bar-ask-2");
    fireEvent.click(bar);
    expect(onAsk).toHaveBeenLastCalledWith({ about: bar.getAttribute("aria-label"), from: bar });
    expect(bar.getAttribute("aria-label")).toMatch(/2/);
    // No question is put for the player: no "?" chip, nothing asked.
    expect(onAsk.mock.calls.every(([r]) => !("question" in r))).toBe(true);
  });

  it("without onAsk, its words are just words", () => {
    render(<CoachNote headline="Keep it even." testId="n" />);
    expect(screen.queryByTestId("coach-note-ask")).toBeNull();
    expect(screen.getByTestId("n").querySelector("button")).toBeNull();
  });
});

describe("an ungraded Take's question", () => {
  function fake(heardIt?: "yes" | "notYet", selfCheck: string[] = ["Do the eighths stay even through the open Bs?"]) {
    const answerHeardIt = vi.fn();
    const row = { id: "t-u", facts: heardIt ? { heardIt, ungraded: "chosen" } : { ungraded: "chosen" } };
    const session = {
      run: { plan: null, stepIndex: 0, outcomes: [], startedAt: 1 },
      take: { pathId: "p", exercise: { id: "e", selfCheck } },
      exercise: { id: "e", selfCheck },
      progress: { states: [], takes: [row], ceilings: [] },
      actions: { answerHeardIt },
    };
    return { session: session as unknown as SessionRun, answerHeardIt };
  }
  const outcome = { takeId: "t-u", ungraded: "chosen" } as TakeOutcome;

  it("asks the author's question with nothing pre-selected, and keeps the answer with the Take", () => {
    const { session, answerHeardIt } = fake();
    render(<UngradedNote session={session} outcome={outcome} />);
    expect(screen.getByTestId("coach-note")).toHaveTextContent("Do the eighths stay even through the open Bs?");
    expect(screen.getByTestId("coach-heard-yes")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("coach-heard-notYet")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("coach-heard-notYet"));
    expect(answerHeardIt).toHaveBeenCalledWith("t-u", "notYet");
  });

  it("shows the answer once given", () => {
    const { session } = fake("yes");
    render(<UngradedNote session={session} outcome={outcome} />);
    expect(screen.getByTestId("coach-heard-yes")).toHaveAttribute("aria-pressed", "true");
  });

  it("asks nothing where the author wrote no question: no generic quiz", () => {
    const { session } = fake(undefined, []);
    render(<UngradedNote session={session} outcome={outcome} />);
    expect(screen.queryByTestId("coach-note")).toBeNull();
  });

  it("never mentions the microphone or grading", () => {
    const { session } = fake();
    render(<UngradedNote session={session} outcome={outcome} />);
    expect(screen.getByTestId("coach-note").textContent).not.toMatch(/micro|grad/i);
  });
});
