/**
 * The stage, mounted once around the learning screens (see api.ts).
 *
 * Renders a fixed, full-window layer behind its children (z-index -1, so it
 * paints under everything in normal flow: the screens above it must have
 * transparent backgrounds where the neck should show). The canvas inside it
 * is created by the controller on attach and taken away on unmount, with the
 * GPU resources. three.js is `import()`ed the first time a screen asks for a
 * view other than `hidden`; until then this costs one empty div.
 *
 * What it draws into the screen's slot, through a portal, is HTML: the
 * overview strip under a zoom, and the whole SVG neck when WebGL2 is not
 * there.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NeckStageContext } from "./context";
import { StageController, footReserve, stripHeight } from "./controller";
import { FallbackNeck } from "./FallbackNeck";
import { OverviewStrip } from "./OverviewStrip";
import { setForceFlat, stagePrefsReady, subscribeStagePrefs, wantsFlat } from "./prefs";
import { webgl2Available } from "./webgl";
import "./stage.css";

function forcedTier(): number | null {
  try {
    const q = new URLSearchParams(window.location.search).get("neckq");
    return q === "0" || q === "1" || q === "2" ? Number(q) : null;
  } catch {
    return null;
  }
}

function reducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The prefs, or the defaults if the store has not answered in this long. */
const PREFS_WAIT_MS = 1500;

function prefsReady(): Promise<void> {
  return Promise.race([stagePrefsReady(), new Promise<void>((r) => setTimeout(r, PREFS_WAIT_MS))]);
}

/** For tests: build the controller with other dependencies. */
export function createStageController(): StageController {
  return new StageController({
    loadEngine: () => import("./engine/engine"),
    webgl2: () => new URLSearchParams(window.location.search).get("nogl") !== "1" && webgl2Available(),
    reduced: reducedMotion(),
    forcedTier: forcedTier(),
    ready: prefsReady,
    flat: () => wantsFlat(),
    // The `?shot=` harness and the layout suite run on SwiftShader on purpose; `?probe=1` puts the
    // guard back there, which is a WebKitGTK machine exactly: a renderer whose name says nothing.
    probe: !window.__YAMES_ALLOW_SOFTWARE_GL__ || new URLSearchParams(window.location.search).get("probe") === "1",
    onSlow: (v) => {
      console.warn(`[stage] ${v.medianMs.toFixed(0)} ms a frame (a GPU takes under ${v.budgetMs.toFixed(0)}): the flat neck from now on`);
      setForceFlat(true);
    },
  });
}

export function NeckStageProvider(props: { children: ReactNode }): JSX.Element {
  return <NeckStageHost controllerFactory={createStageController}>{props.children}</NeckStageHost>;
}

/** The provider, with the controller injectable (tests). */
export function NeckStageHost({ children, controllerFactory }: { children: ReactNode; controllerFactory: () => StageController }) {
  const [controller] = useState(controllerFactory);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const is3d = snap.mode === "3d";
  const stage = useMemo(() => controller.facade(is3d), [controller, is3d]);
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    controller.attach(hostRef.current!);
    return () => controller.detach();
  }, [controller]);
  useEffect(() => subscribeStagePrefs(() => controller.prefsChanged()), [controller]);

  const visible = snap.view.kind !== "hidden";
  const fallback = visible && snap.mode === "fallback";
  const zoom = snap.view.kind === "zoom" ? snap.view : null;
  const showStrip = !!zoom && (snap.mode === "3d" || snap.mode === "fallback");
  const target = useSlotLayer(snap.slot, visible && (fallback || showStrip));
  const slotH = useSlotHeight(snap.slot, showStrip);
  const sH = zoom ? stripHeight(slotH - footReserve(snap.slot)) : 0;

  return (
    <NeckStageContext.Provider value={stage}>
      <div
        ref={hostRef}
        className="neck-stage"
        data-mode={snap.mode}
        data-on={visible && is3d ? "true" : "false"}
        data-testid="neck-stage"
        aria-hidden="true"
      />
      {children}
      {target &&
        createPortal(
          <div className="neck-slot-layer" data-testid="neck-slot-layer">
            {fallback && (
              <div className="neck-fallback-area" style={{ bottom: (sH ? sH + 6 : 0) + (zoom ? footReserve(snap.slot) : 0) }}>
                <FallbackNeck view={snap.view} notes={snap.notes} pluck={snap.pluck} />
              </div>
            )}
            {showStrip && sH > 0 && zoom && <OverviewStrip from={zoom.from} to={zoom.to} notes={snap.notes} height={sH} numbers={false} />}
          </div>,
          target,
        )}
    </NeckStageContext.Provider>
  );
}

/**
 * Where the slot's HTML goes: the slot itself (made `position: relative` if it
 * was static, and put back after), or a full-window layer when the view has no
 * slot.
 */
function useSlotLayer(slot: HTMLElement | null, wanted: boolean): HTMLElement | null {
  const [full, setFull] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!wanted || slot) return;
    const el = document.createElement("div");
    el.className = "neck-full-layer";
    document.body.appendChild(el);
    setFull(el);
    return () => {
      el.remove();
      setFull(null);
    };
  }, [wanted, slot]);
  useLayoutEffect(() => {
    if (!wanted || !slot) return;
    if (getComputedStyle(slot).position !== "static") return;
    const before = slot.style.position;
    slot.style.position = "relative";
    return () => {
      slot.style.position = before;
    };
  }, [wanted, slot]);
  if (!wanted) return null;
  return slot ?? full;
}

function useSlotHeight(slot: HTMLElement | null, on: boolean): number {
  const [h, setH] = useState(() => (slot ? slot.getBoundingClientRect().height : window.innerHeight));
  useLayoutEffect(() => {
    if (!on) return;
    const measure = () => setH(slot ? slot.getBoundingClientRect().height : window.innerHeight);
    measure();
    if (!slot || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [slot, on]);
  return h;
}
