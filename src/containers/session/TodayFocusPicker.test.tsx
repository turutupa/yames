/** "Paths:" on Today and "In my daily mix" on Paths (owner, 2026-11-18). */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import type { PathDoc } from "../../paths/format";
import { MIX, todayPaths } from "../../session/focus";
import { TodayFocusPicker } from "./TodayFocusPicker";
import { TodayView } from "./TodayView";
import { PathsView } from "./PathsView";
import type { SessionRun } from "./hooks/useSessionRun";
import { ALT, SWEEP, progress, state } from "../../session/testKit";

const BLUES_PACK = import.meta.glob("../../paths/packs/blues-pentatonics.json", { eager: true });
const BLUES = (Object.values(BLUES_PACK)[0] as { default: unknown }).default as PathDoc;

afterEach(cleanup);

describe("the picker", () => {
  it("two Paths: a segmented row, the mix first, the choice pressed", () => {
    const onChange = vi.fn();
    render(<TodayFocusPicker paths={[ALT, SWEEP]} focus={MIX} onChange={onChange} />);
    const group = screen.getByRole("group", { name: i18n.t("session.today.focus.label") });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual([i18n.t("session.today.focus.mix"), ALT.title, SWEEP.title]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    fireEvent.click(buttons[2]);
    expect(onChange).toHaveBeenCalledWith(SWEEP.id);
  });

  it("more than three choices: a menu, labelled, keyboard and screen reader friendly", () => {
    const onChange = vi.fn();
    render(<TodayFocusPicker paths={[ALT, SWEEP, BLUES]} focus={SWEEP.id} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: i18n.t("session.today.focus.label") }) as HTMLSelectElement;
    expect(select.value).toBe(SWEEP.id);
    expect(Array.from(select.options).map((o) => o.value)).toEqual([MIX, ALT.id, SWEEP.id, BLUES.id]);
    fireEvent.change(select, { target: { value: MIX } });
    expect(onChange).toHaveBeenCalledWith(MIX);
  });
});

function todaySession(mine: PathDoc[], offMix: string[], focus: string, steps: unknown[] = []): SessionRun {
  return {
    plan: { mood: "returning", steps, daysAway: 1, minutes: 15 },
    minutes: 15,
    setMinutes: vi.fn(),
    paths: mine,
    myPaths: mine,
    today: todayPaths(mine, offMix, focus),
    offMix,
    setTodayFocus: vi.fn(),
    progress: { states: [], takes: [], ceilings: [] },
    actions: { startToday: vi.fn(), startTodayAt: vi.fn() },
  } as unknown as SessionRun;
}

describe("Today with the picker", () => {
  it("is not there with one Path", () => {
    render(<TodayView session={todaySession([ALT], [], MIX)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(screen.queryByTestId("today-focus")).toBeNull();
  });

  it("is there with two, and choosing rebuilds through the session", () => {
    const session = todaySession([ALT, SWEEP], [], MIX);
    render(<TodayView session={session} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    fireEvent.click(screen.getByTestId(`today-focus-${ALT.id}`));
    expect(session.setTodayFocus).toHaveBeenCalledWith(ALT.id);
  });

  it("an empty mix says so in one line, with the picker beside it", () => {
    render(
      <TodayView session={todaySession([ALT, SWEEP], [ALT.id, SWEEP.id], MIX)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />,
    );
    expect(screen.getByTestId("today-nothing-why").textContent).toBe(i18n.t("session.today.focus.emptyMix"));
    expect(screen.getByTestId("today-focus")).toBeTruthy();
  });

  it("a chosen Path with nothing to play says which, plainly", () => {
    render(<TodayView session={todaySession([ALT, SWEEP], [], SWEEP.id)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(screen.getByTestId("today-nothing-why").textContent).toBe(
      i18n.t("session.today.focus.nothingIn", { path: SWEEP.title }),
    );
  });
});

describe("In my daily mix, on a Path card", () => {
  function pathsSession(offMix: string[]) {
    const p = progress({ states: [state(), state({ pathId: SWEEP.id })] });
    return {
      paths: [ALT, SWEEP],
      myPaths: [ALT, SWEEP],
      offMix,
      setInMix: vi.fn(),
      setTodayFocus: vi.fn(),
      progress: p,
      actions: {},
    } as unknown as SessionRun;
  }

  it("a switch, on by default, that turns the Path out of the mix without opening it", () => {
    const session = pathsSession([]);
    render(<PathsView session={session} />);
    const sw = screen.getByTestId(`path-mix-${SWEEP.id}`);
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.textContent).toBe(i18n.t("session.paths.inMix"));
    fireEvent.click(sw);
    expect(session.setInMix).toHaveBeenCalledWith(SWEEP.id, false);
    // Still the list: the switch did not open the Path.
    expect(screen.getByTestId("paths")).toBeTruthy();
  });

  it("off reads off, and turns back on", () => {
    const session = pathsSession([SWEEP.id]);
    render(<PathsView session={session} />);
    const sw = screen.getByTestId(`path-mix-${SWEEP.id}`);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(session.setInMix).toHaveBeenCalledWith(SWEEP.id, true);
  });

  it("Practise only this today hands the Path to the window", () => {
    const onFocusToday = vi.fn();
    render(<PathsView session={pathsSession([])} onFocusToday={onFocusToday} />);
    fireEvent.click(screen.getByTestId(`path-focus-${ALT.id}`));
    expect(onFocusToday).toHaveBeenCalledWith(ALT);
  });

  it("a Path not subscribed has neither", () => {
    render(<PathsView session={pathsSession([])} onFocusToday={vi.fn()} />);
    expect(screen.queryByTestId(`path-mix-${BLUES.id}`)).toBeNull();
  });
});
