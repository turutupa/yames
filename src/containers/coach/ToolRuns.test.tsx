/**
 * Progress → Tool runs: the old coach card's History, moved (DESIGN 7; COA-44
 * to COA-51). Read against rows of the shape v1.2.2 stored, oldest included
 * (no segments, no component scores, no grid correlation), so a player's old
 * history reads as it always did.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "../../i18n";
import { ToolRuns, rescoreHistory } from "./ToolRuns";
import { mockInvoke, resetTauriMocks, setInvokeResponse } from "../../test/mocks";
import rows from "../../test/parity/fixtures/sessions.v1.2.2.json";
import type { SavedSession } from "../../types";

const stored = rows as unknown as SavedSession[];

beforeEach(() => {
  resetTauriMocks();
  setInvokeResponse("get_session_history", () => structuredClone(stored));
});
afterEach(cleanup);

describe("Tool runs", () => {
  it("lists every stored run, grouped by day, with the note-spacing trend over them", async () => {
    render(<ToolRuns />);
    await waitFor(() => expect(screen.getAllByTestId("tool-run")).toHaveLength(stored.length));
    // Three rows carry note spacing: the trend shows (COA-46).
    expect(screen.getByTestId("tool-runs-trend")).toBeInTheDocument();
    expect(screen.getByText("Funk sixteenths")).toBeInTheDocument();
    expect(screen.getByText("Waltz")).toBeInTheDocument();
  });

  it("re-scores an old row on read, as the card did (COA-51)", () => {
    const oldest = stored[stored.length - 1];
    const [read] = rescoreHistory([oldest]);
    // No `onsetEfficiency`: the legacy formula decides, as it always has.
    expect(read.report.score).not.toBe(oldest.report.score);
    // A row from the segment pipeline keeps its stored score.
    expect(rescoreHistory([stored[0]])[0].report.score).toBe(stored[0].report.score);
  });

  it("opens a run: its summary, its timeline (a jam stretch included), the breakdown", async () => {
    render(<ToolRuns />);
    const first = (await screen.findAllByTestId("tool-run"))[0];
    fireEvent.click(first);
    const detail = await screen.findByTestId("tool-run-detail");
    expect(within(detail).getByText("Session Score")).toBeInTheDocument();
    expect(within(detail).getAllByText(/Beats hit: \d+%/)).toHaveLength(2);
    expect(within(detail).getByText("Breakdown")).toBeInTheDocument();
    expect(within(detail).getByText("Note spacing")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tool-runs-back"));
    expect(screen.queryByTestId("tool-run-detail")).toBeNull();
  });

  it("opens the oldest row too, which has none of the newer fields", async () => {
    render(<ToolRuns />);
    const all = await screen.findAllByTestId("tool-run");
    fireEvent.click(all[all.length - 1]);
    const detail = await screen.findByTestId("tool-run-detail");
    expect(within(detail).getByText("Session Score")).toBeInTheDocument();
    expect(within(detail).queryByText("Note spacing")).toBeNull();
  });

  it("deletes one run by the player's press (COA-47), from the list or the detail", async () => {
    render(<ToolRuns />);
    const rowsShown = await screen.findAllByTestId("tool-run");
    fireEvent.click(within(rowsShown[1]).getByTestId("tool-run-delete-row"));
    await waitFor(() => expect(screen.getAllByTestId("tool-run")).toHaveLength(stored.length - 1));
    expect(mockInvoke).toHaveBeenCalledWith("delete_session", { id: stored[1].id });

    fireEvent.click(screen.getAllByTestId("tool-run")[0]);
    fireEvent.click(await screen.findByTestId("tool-run-delete"));
    await waitFor(() => expect(screen.getAllByTestId("tool-run")).toHaveLength(stored.length - 2));
    expect(mockInvoke).toHaveBeenCalledWith("delete_session", { id: stored[0].id });
  });

  it("clears all only after asking once more (COA-48)", async () => {
    render(<ToolRuns />);
    await screen.findAllByTestId("tool-run");
    fireEvent.click(screen.getByTestId("tool-runs-clear"));
    expect(screen.getByTestId("tool-runs-confirm")).toHaveTextContent("Delete all sessions? This can't be undone.");
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "clear_all_sessions")).toBe(false);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("tool-runs-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("tool-runs-clear"));
    fireEvent.click(screen.getByTestId("tool-runs-clear-confirm"));
    await waitFor(() => expect(screen.getByTestId("tool-runs-empty")).toBeInTheDocument());
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "clear_all_sessions")).toBe(true);
  });

  it("says what will be here when nothing is (COA-49)", async () => {
    setInvokeResponse("get_session_history", () => []);
    render(<ToolRuns />);
    expect(await screen.findByTestId("tool-runs-empty")).toHaveTextContent("Turn on Listen");
    expect(screen.queryByTestId("tool-runs-clear")).toBeNull();
  });
});
