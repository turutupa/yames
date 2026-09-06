import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TitleBar } from "./TitleBar";
import { readStylesheet, ruleBlock } from "../test/readStyles";

afterEach(cleanup);

describe("TitleBar", () => {
  it("names the app in its own window", () => {
    const { container } = render(<TitleBar />);
    expect(container.querySelector(".app-wordmark")?.textContent).toBe("yames");
  });

  it("is a drag region wherever the frame is ours", () => {
    // jsdom is none of the three platforms, so this is the non-mac branch —
    // the one where decorations are off and nothing else would move the
    // window. The mac branch is the absence of the attribute, and marking it
    // there would fight the native titlebar rather than help it.
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
});
