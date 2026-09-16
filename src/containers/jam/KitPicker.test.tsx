/**
 * The kit dropdown, and the folder of your own samples
 * (plans/JAM_UX_DECISIONS.md B3, B7).
 *
 * The case worth pinning is the one the updater got wrong and had to be fixed
 * for: a build whose engine has no `pick_kit_folder` behind it must SAY so,
 * not present a button that does nothing when you press it.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { KitPicker, folderName } from "./KitPicker";

const ipc = vi.hoisted(() => ({
  pick: vi.fn<[], Promise<string | null>>(),
  inspect: vi.fn<[string], Promise<{ voices: string[]; missing: string[] }>>(),
  warm: vi.fn(),
}));

vi.mock("../../ipc", () => ({
  pickKitFolder: () => ipc.pick(),
  inspectKitFolder: (dir: string) => ipc.inspect(dir),
  warmJam: (request: unknown) => ipc.warm(request),
}));

function draw(overrides: Partial<React.ComponentProps<typeof KitPicker>> = {}) {
  const props = {
    kit: "raw",
    onKit: vi.fn(),
    customKit: null,
    onCustomKit: vi.fn(),
    onPreview: vi.fn(),
    previewing: null,
    ...overrides,
  };
  return { ...render(<KitPicker {...props} />), props };
}

/** Open the menu — everything below it is behind one press. */
function open() {
  fireEvent.click(screen.getByRole("button", { name: /Kit/ }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("getting the kits ready", () => {
  it("decodes every kit when the pointer reaches the picker, and only once", () => {
    draw();
    const button = screen.getByRole("button", { name: /Kit/ });
    fireEvent.pointerEnter(button);
    expect(ipc.warm).toHaveBeenCalledWith({ kits: true });
    fireEvent.pointerEnter(button);
    open();
    expect(ipc.warm).toHaveBeenCalledTimes(1);
  });
});

describe("while the kit loads", () => {
  it("shows a spinner and keeps the picker usable", () => {
    draw({ loading: true });
    const button = screen.getByRole("button", { name: /Kit/ });
    expect(button.querySelector(".jam-spinner")).not.toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);
    open();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("shows nothing when there is nothing to wait for", () => {
    draw();
    expect(document.querySelector(".jam-spinner")).toBeNull();
  });
});

describe("the built-in kits", () => {
  it("lists all seven with a line each, recorded first, and marks the loaded one", () => {
    draw({ kit: "room" });
    open();
    const options = screen.getAllByRole("option");
    // Club and Studio lead: they are the two kits with a drummer in them, and
    // the five synthesised ones stay behind them rather than in front.
    expect(options.map((o) => o.querySelector(".jam-dropdown-item-name")?.textContent)).toEqual([
      "Club",
      "Studio",
      "Raw",
      "Tight",
      "Room",
      "Brushes",
      "Electronic",
    ]);
    expect(options.filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(screen.getByText("open, with the room around it")).toBeInTheDocument();
    expect(
      screen.getByText("a jazz house kit, recorded live in a Boston club"),
    ).toBeInTheDocument();
    expect(screen.getByText("a studio kit, from jazz to rock")).toBeInTheDocument();
  });

  it("plays two bars of a kit without choosing it", () => {
    // The button whose absence made the first four kits unauditionable.
    const { props } = draw();
    open();
    fireEvent.click(screen.getAllByRole("button", { name: /Preview/ })[1]);
    expect(props.onPreview).toHaveBeenCalledWith("studio");
    expect(props.onKit).not.toHaveBeenCalled();
  });

  it("says Stop on the kit that is sounding", () => {
    draw({ previewing: "raw" });
    open();
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
  });

  it("forgets a folder of your own when a built-in kit is chosen", () => {
    // Otherwise "Club" would be selected and your samples would still play.
    const { props } = draw({ customKit: { dir: "C:/s/mine", name: "mine" } });
    open();
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(props.onKit).toHaveBeenCalledWith("club");
    expect(props.onCustomKit).toHaveBeenCalledWith(null);
  });
});

describe("a folder of your own", () => {
  it("stores the folder and says which voices were found", async () => {
    ipc.pick.mockResolvedValue("C:\\Users\\you\\Samples\\Studio Kit");
    ipc.inspect.mockResolvedValue({
      voices: ["kick", "snare", "hat"],
      missing: ["ride", "crash"],
    });
    const { props } = draw({ kit: "raw" });
    open();
    fireEvent.click(screen.getByText("A folder of your samples…"));

    await waitFor(() =>
      expect(props.onCustomKit).toHaveBeenCalledWith({
        dir: "C:\\Users\\you\\Samples\\Studio Kit",
        name: "Studio Kit",
      }),
    );
  });

  it("says which voices fall back, and to what", async () => {
    ipc.pick.mockResolvedValue("/home/you/kit");
    ipc.inspect.mockResolvedValue({ voices: ["kick"], missing: ["snare"] });
    draw({ kit: "raw", customKit: { dir: "/home/you/kit", name: "kit" } });
    open();
    fireEvent.click(screen.getByText("A folder of your samples…"));
    // "A folder with a kick and a snare in it is a perfectly good kit, and the
    // user should be able to see that it is."
    await waitFor(() => expect(screen.getByText(/come from Raw/)).toBeInTheDocument());
  });

  it("writes nothing when the dialog is cancelled", async () => {
    ipc.pick.mockResolvedValue(null);
    const { props } = draw();
    open();
    fireEvent.click(screen.getByText("A folder of your samples…"));
    await waitFor(() => expect(ipc.pick).toHaveBeenCalled());
    expect(props.onCustomKit).not.toHaveBeenCalled();
    expect(ipc.inspect).not.toHaveBeenCalled();
  });

  it("turns down a folder with no drums in it", async () => {
    // The inspection only FAILS when the directory cannot be read. A folder
    // of guitar loops comes back happily with an empty voice list, and
    // adopting that wrote a custom kit the engine refuses and a row that said
    // "Found ." — a kit chosen, and silence where the drums were.
    ipc.pick.mockResolvedValue("/home/you/loops");
    ipc.inspect.mockResolvedValue({ voices: [], missing: ["kick", "snare"] });
    const { props } = draw();
    open();
    fireEvent.click(screen.getByText("A folder of your samples…"));

    await waitFor(() => expect(screen.getAllByText(/No drum sounds/).length).toBeGreaterThan(0));
    expect(props.onCustomKit).not.toHaveBeenCalled();
    // The menu stays open, so the answer is next to the button that asked.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("turns down a folder it could not read, rather than swallowing it", async () => {
    // `inspectKitFolder(...).catch(() => null)` used to hand back null and
    // the row adopted the folder anyway, with nothing found and nothing said.
    ipc.pick.mockResolvedValue("/home/you/gone");
    ipc.inspect.mockRejectedValue(new Error("no such directory"));
    const { props } = draw();
    open();
    fireEvent.click(screen.getByText("A folder of your samples…"));

    await waitFor(() => expect(screen.getAllByText(/No drum sounds/).length).toBeGreaterThan(0));
    expect(props.onCustomKit).not.toHaveBeenCalled();
  });

  it("says when the engine will not have the folder it was given", async () => {
    // The band keeps playing the built-in kit under a row that says the
    // folder is chosen. It used to be a `console.warn` and nothing else.
    draw({ customKit: { dir: "C:/s/mine", name: "mine" }, refused: true });
    expect(screen.getByText(/would not load/)).toBeInTheDocument();
  });

  it("says nothing about a refusal there is no folder for", () => {
    draw({ customKit: null, refused: true });
    expect(screen.queryByText(/would not load/)).toBeNull();
  });

  it("closes the menu on Escape, and leaves the sheet behind it alone", () => {
    // The dropdown is on the setup sheet, and the sheet closes on Escape too.
    // Unclaimed, one press put both away and the kit list took the sheet with
    // it — so `JamSelect`'s rule holds here as well: one Escape, one thing.
    const onSheetKey = vi.fn();
    document.addEventListener("keydown", onSheetKey);
    draw();
    open();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSheetKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onSheetKey);
  });

  it("says so on a build that has no such command, rather than looking dead", async () => {
    ipc.pick.mockRejectedValue(new Error("command pick_kit_folder not found"));
    const { props } = draw();
    open();
    fireEvent.click(screen.getByText("A folder of your samples…"));
    // Twice, deliberately: on the row itself, where the hand already is, and
    // under the control, where it survives the menu closing.
    await waitFor(() =>
      expect(screen.getAllByText(/not available in this build/i)).toHaveLength(2),
    );
    expect(props.onCustomKit).not.toHaveBeenCalled();
  });
});

describe("folderName", () => {
  it("calls a folder what a person calls it, on either kind of path", () => {
    expect(folderName("C:\\Users\\you\\Samples\\Studio Kit")).toBe("Studio Kit");
    expect(folderName("/home/you/samples/studio")).toBe("studio");
    // A trailing separator is not a nameless folder.
    expect(folderName("/home/you/samples/studio/")).toBe("studio");
  });
});
