/**
 * CoachDownloadConfirmDialog feature preservation tests.
 *
 * Locks in the two bugs fixed in this file:
 *
 * 1. Exactly one card is ever highlighted, and only while the pointer is on
 *    it. The dialog used to paint an accent border on whichever tier button
 *    opened it (`download-confirm-model-selected`), which looked like a
 *    selection the user never made; adding a hover rule on top of that lit
 *    both cards at once. The DOM half of that guarantee is asserted here
 *    (no card carries a persistent accent class); the CSS half — hover is
 *    the only accent rule left — is asserted by reading the stylesheet,
 *    since vitest runs with `css: false` and happy-dom cannot match
 *    `:hover`.
 *
 * 2. Escape closes the dialog and does NOT reach MainWindow's document-level
 *    hotkey dispatcher, which maps Escape in the settings view to "leave
 *    settings". Before the fix the settings page navigated away while the
 *    dialog stayed up.
 *
 * Also locks in the surviving per-card state (the "Installed" badge and its
 * dimming class) and the existing cancel affordances.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { CoachDownloadConfirmDialog } from "./CoachDownloadStatus";
import type { ModelStatus } from "../../ipc";

const NOTHING_INSTALLED: ModelStatus = {
  brainReady: false,
  brainTier: null,
  brainFamily: null,
  brainSizeBytes: 0,
  voiceReady: false,
  voiceSizeBytes: 0,
  studioRecommended: true,
  standardRecommended: true,
  brainUpdateRecommended: false,
};

const STANDARD_INSTALLED: ModelStatus = {
  ...NOTHING_INSTALLED,
  brainReady: true,
  brainTier: "standard",
};

const baseProps = {
  modelStatus: NOTHING_INSTALLED,
  studioAvailable: true,
  onCancel: vi.fn(),
  onUseInstalled: vi.fn(),
  onStartDownload: vi.fn(),
};

const cards = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".download-confirm-model"));

describe("CoachDownloadConfirmDialog — card highlighting", () => {
  it("renders both tiers", () => {
    const { container } = render(<CoachDownloadConfirmDialog {...baseProps} />);
    expect(cards(container)).toHaveLength(2);
  });

  it("gives no card a persistent accent class, so only :hover can highlight one", () => {
    const { container } = render(<CoachDownloadConfirmDialog {...baseProps} />);
    for (const card of cards(container)) {
      expect(card.className).not.toMatch(/selected/);
    }
  });

  it("still gives no card an accent class when a tier is already installed", () => {
    // `brainTier` used to double as "the tier you clicked", which is how the
    // permanent highlight got in. Installation must not resurrect it.
    const { container } = render(
      <CoachDownloadConfirmDialog {...baseProps} modelStatus={STANDARD_INSTALLED} />,
    );
    for (const card of cards(container)) {
      expect(card.className).not.toMatch(/selected/);
    }
  });

  it("marks only the installed tier with the badge and the dimming class", () => {
    const { container } = render(
      <CoachDownloadConfirmDialog {...baseProps} modelStatus={STANDARD_INSTALLED} />,
    );
    const [standard, studio] = cards(container);
    expect(standard.className).toContain("download-confirm-model-installed");
    expect(studio.className).not.toContain("download-confirm-model-installed");
    expect(container.querySelectorAll(".download-confirm-installed-badge")).toHaveLength(1);
    expect(standard.querySelector(".download-confirm-installed-badge")).not.toBeNull();
  });

  it("shows no installed badge when nothing is downloaded", () => {
    const { container } = render(<CoachDownloadConfirmDialog {...baseProps} />);
    expect(container.querySelector(".download-confirm-installed-badge")).toBeNull();
  });
});

describe("download-confirm card styling", () => {
  // Comments are stripped so these assertions are about rules, not about the
  // prose explaining them (the fix's comment names the class it removed).
  const css = fs
    .readFileSync(path.join(process.cwd(), "src/styles/main-window.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("has no persistent -selected accent rule left", () => {
    expect(css).not.toContain("download-confirm-model-selected");
  });

  it("accents the card on hover", () => {
    expect(css).toMatch(/\.download-confirm-model:hover\s*\{/);
  });

  it("lifts the dimmed installed card on hover, after the rule that dims it", () => {
    const dim = css.indexOf(".download-confirm-model-installed {");
    const lift = css.indexOf(".download-confirm-model-installed:hover {");
    expect(dim).toBeGreaterThan(-1);
    expect(lift).toBeGreaterThan(dim);
  });
});

describe("CoachDownloadConfirmDialog — Escape handling", () => {
  // Stands in for MainWindow's unified hotkey dispatcher: a bubble-phase
  // listener on `document` that, in the settings view, leaves settings on
  // Escape. If the dialog lets Escape through, this fires — which is exactly
  // the bug ("escape exits the settings page without closing the modal").
  let ancestorEscape: ReturnType<typeof vi.fn>;
  let ancestor: (e: KeyboardEvent) => void;

  beforeEach(() => {
    ancestorEscape = vi.fn();
    ancestor = (e: KeyboardEvent) => {
      if (e.key === "Escape") ancestorEscape();
    };
    document.addEventListener("keydown", ancestor);
  });

  afterEach(() => {
    document.removeEventListener("keydown", ancestor);
  });

  it("closes the dialog and stops Escape from reaching the settings page", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CoachDownloadConfirmDialog {...baseProps} onCancel={onCancel} />,
    );
    // Fire on a real element inside the dialog, the way a focused button
    // does: the dialog's capture listener on `document` must run before the
    // ancestor's bubble listener on `document`.
    const cancelBtn = container.querySelector(".download-confirm-cancel") as HTMLElement;
    fireEvent.keyDown(cancelBtn, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(ancestorEscape).not.toHaveBeenCalled();
  });

  it("stops Escape pressed anywhere in the app while the dialog is open", () => {
    const onCancel = vi.fn();
    render(<CoachDownloadConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(ancestorEscape).not.toHaveBeenCalled();
  });

  it("lets every other key through, so app hotkeys still work behind it", () => {
    const other = vi.fn();
    const otherHandler = () => other();
    document.addEventListener("keydown", otherHandler);
    render(<CoachDownloadConfirmDialog {...baseProps} />);
    fireEvent.keyDown(document.body, { key: " " });
    document.removeEventListener("keydown", otherHandler);
    expect(other).toHaveBeenCalled();
  });

  it("releases Escape once the dialog unmounts", () => {
    const onCancel = vi.fn();
    const { unmount } = render(
      <CoachDownloadConfirmDialog {...baseProps} onCancel={onCancel} />,
    );
    unmount();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    // With the dialog gone, Escape belongs to the settings page again.
    expect(ancestorEscape).toHaveBeenCalledTimes(1);
  });
});

describe("CoachDownloadConfirmDialog — actions", () => {
  it("cancel button and overlay click both dismiss", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CoachDownloadConfirmDialog {...baseProps} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector(".download-confirm-cancel") as HTMLElement);
    fireEvent.click(container.querySelector(".download-confirm-overlay") as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("each card starts a download for its own tier", () => {
    const onStartDownload = vi.fn();
    const { container } = render(
      <CoachDownloadConfirmDialog {...baseProps} onStartDownload={onStartDownload} />,
    );
    const [standard, studio] = cards(container);
    fireEvent.click(standard.querySelector(".download-confirm-go") as HTMLElement);
    fireEvent.click(studio.querySelector(".download-confirm-go") as HTMLElement);
    expect(onStartDownload).toHaveBeenNthCalledWith(1, "standard");
    expect(onStartDownload).toHaveBeenNthCalledWith(2, "full");
  });

  it("the installed tier offers 'use' instead of a download", () => {
    const onUseInstalled = vi.fn();
    const { container } = render(
      <CoachDownloadConfirmDialog
        {...baseProps}
        modelStatus={STANDARD_INSTALLED}
        onUseInstalled={onUseInstalled}
      />,
    );
    const [standard] = cards(container);
    const btn = standard.querySelector(".download-confirm-go") as HTMLElement;
    expect(btn.className).toContain("download-confirm-go-installed");
    fireEvent.click(btn);
    expect(onUseInstalled).toHaveBeenCalledWith("standard");
  });

  it("disables the Studio button on a machine below the RAM gate", () => {
    const { container } = render(
      <CoachDownloadConfirmDialog {...baseProps} studioAvailable={false} />,
    );
    const [, studio] = cards(container);
    const btn = studio.querySelector(".download-confirm-go") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
