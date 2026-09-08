import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TitleBar } from "./TitleBar";
import { WindowControls } from "./WindowControls";
import { readStylesheet, ruleBlock } from "../test/readStyles";

afterEach(cleanup);

describe("TitleBar", () => {
  it("names the app in its own window", () => {
    const { container } = render(<TitleBar />);
    expect(container.querySelector(".app-wordmark")?.textContent).toBe("yames");
  });

  it("is a drag region wherever the frame is ours", () => {
    // jsdom reports `navigator.platform` as "X11; Win32 x64", so these tests
    // run the Windows branch — decorations off, and nothing but this
    // attribute would move the window. The mac branch is the absence of it,
    // and marking it there would fight the native titlebar rather than help.
    const { container } = render(<TitleBar />);
    const bar = container.querySelector(".app-titlebar")!;
    expect(bar.hasAttribute("data-tauri-drag-region")).toBe(true);
  });

  it("keeps the mark out from under the traffic lights", () => {
    // macOS draws its controls over the webview, so nothing is in the flow to
    // push the wordmark clear of them. Without the gutter the mark renders
    // underneath the close button.
    const css = readStylesheet();
    const gutter = ruleBlock(css, ".main-window.os-mac .app-titlebar .app-mark");
    expect(gutter).toContain("margin-left: 78px");
  });

  it("lets the controls take the strip's height rather than declaring one", () => {
    // They were positioned absolutely against the window and are in the flow
    // now; a leftover fixed height would leave them short of the hairline on
    // one platform and past it on another.
    const controls = ruleBlock(readStylesheet("window-controls.css"), ".window-controls");
    expect(controls).not.toContain("position: absolute");
    expect(controls).not.toContain("height:");
  });

  it("puts the controls last, after the mark and the wordmark", () => {
    // The order in the markup is the order on screen: the app says its name at
    // the left end and the controls take the right. They used to be first,
    // which is what put them at the window's top-left corner.
    const { container } = render(<TitleBar />);
    const children = Array.from(container.querySelector(".app-titlebar")!.children);
    expect(children.map((c) => c.className)).toEqual([
      "app-mark",
      "app-wordmark",
      "window-controls",
    ]);
  });
});

describe("WindowControls", () => {
  it("orders the buttons the way the platform does, close last", () => {
    // Close goes in the corner. It used to come first, at the left end of the
    // strip, which put quit-the-app exactly where Windows and Linux put
    // minimise — the one misclick that loses a practice session.
    const { container } = render(<WindowControls />);
    const labels = Array.from(container.querySelectorAll(".wc-btn")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Minimize", "Maximize", "Close"]);
  });

  it("pushes the controls to the right end of the strip", () => {
    // `margin-left: auto` is the whole mechanism — it eats the slack after the
    // wordmark. Lose it and the controls fall back against the mark.
    const controls = ruleBlock(readStylesheet("window-controls.css"), ".window-controls");
    expect(controls).toContain("margin-left: auto");
  });

  it("drops the strip's right padding so close reaches the corner", () => {
    // A corner is the one target you can throw the pointer at without aiming.
    // 12px of padding would leave close floating short of it.
    // The selector is a group, so ruleBlock (which matches "<selector> {")
    // cannot find it.
    const css = readStylesheet("window-controls.css");
    expect(css).toMatch(
      /\.os-windows \.app-titlebar,\s*\.os-linux \.app-titlebar \{[^}]*padding-right:\s*0/,
    );
  });
});
