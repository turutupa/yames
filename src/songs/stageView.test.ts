/**
 * How you like to read a tab, as arithmetic (W29 item 3).
 *
 * The store is somebody else's problem; what is checked here is that a value
 * off a disk written by an older build, or by a hand, cannot produce a stage
 * drawn at zero or at forty times.
 */
import { describe, expect, it } from "vitest";
import {
  clampZoom,
  DEFAULT_STAGE_VIEW,
  readStageView,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomBy,
} from "./stageView";

describe("the stage view", () => {
  it("opens on the tab, no notation, at the engraver's own size", () => {
    expect(DEFAULT_STAGE_VIEW).toEqual({ notation: false, zoom: 1 });
  });

  it("reads anything at all and never throws", () => {
    expect(readStageView(undefined)).toEqual(DEFAULT_STAGE_VIEW);
    expect(readStageView(null)).toEqual(DEFAULT_STAGE_VIEW);
    expect(readStageView("tab")).toEqual(DEFAULT_STAGE_VIEW);
    expect(readStageView({})).toEqual(DEFAULT_STAGE_VIEW);
    expect(readStageView({ notation: "yes", zoom: "big" })).toEqual(DEFAULT_STAGE_VIEW);
  });

  it("keeps what was actually stored", () => {
    expect(readStageView({ notation: true, zoom: 1.3 })).toEqual({ notation: true, zoom: 1.3 });
  });

  it("holds a zoom from the file inside the range", () => {
    expect(readStageView({ zoom: 0.1 }).zoom).toBe(ZOOM_MIN);
    expect(readStageView({ zoom: 40 }).zoom).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_STAGE_VIEW.zoom);
  });

  it("steps in and out, and stops at the ends", () => {
    const view = DEFAULT_STAGE_VIEW;
    expect(zoomBy(view, 1).zoom).toBe(1.1);
    expect(zoomBy(view, -1).zoom).toBe(0.9);
    expect(zoomBy({ ...view, zoom: ZOOM_MAX }, 1).zoom).toBe(ZOOM_MAX);
    expect(zoomBy({ ...view, zoom: ZOOM_MIN }, -1).zoom).toBe(ZOOM_MIN);
  });

  it("returns the same object when a step changes nothing, so nothing re-renders", () => {
    const top = { notation: false, zoom: ZOOM_MAX };
    expect(zoomBy(top, 1)).toBe(top);
  });

  it("leaves the notation switch alone while zooming", () => {
    expect(zoomBy({ notation: true, zoom: 1 }, 2)).toEqual({ notation: true, zoom: 1.2 });
  });
});
