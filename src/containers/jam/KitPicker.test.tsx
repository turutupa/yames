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
}));

vi.mock("../../ipc", () => ({
  pickKitFolder: () => ipc.pick(),
  inspectKitFolder: (dir: string) => ipc.inspect(dir),
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

describe("the built-in kits", () => {
  it("lists all five with a line each, and marks the one that is loaded", () => {
    draw({ kit: "room" });
    open();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.querySelector(".jam-dropdown-item-name")?.textContent)).toEqual([
      "Raw",
      "Tight",
      "Room",
      "Brushes",
      "Electronic",
    ]);
    expect(options.filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(screen.getByText("open, with the room around it")).toBeInTheDocument();
  });

  it("plays two bars of a kit without choosing it", () => {
    // The button whose absence made the first four kits unauditionable.
    const { props } = draw();
    open();
    fireEvent.click(screen.getAllByRole("button", { name: /Preview/ })[1]);
    expect(props.onPreview).toHaveBeenCalledWith("tight");
    expect(props.onKit).not.toHaveBeenCalled();
  });

  it("says Stop on the kit that is sounding", () => {
    draw({ previewing: "raw" });
    open();
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
  });

  it("forgets a folder of your own when a built-in kit is chosen", () => {
    // Otherwise "Raw" would be selected and your samples would still play.
    const { props } = draw({ customKit: { dir: "C:/s/mine", name: "mine" } });
    open();
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(props.onKit).toHaveBeenCalledWith("raw");
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
