/**
 * The stage's `?shot=` scenes: the provider on a minimal page with one slot,
 * laid out like the mock's Today (whole) and Theory (zoom) screens.
 *
 * Ready (`__SHOT_READY__`) means: the backend is up (3D, or the fallback with
 * `?nogl=1`), and either the scheduler has gone idle after the last change
 * (whole, zoom: which is also the proof that the stage stops rendering when
 * nothing moves) or, for `pluck`, a string is caught mid-ring.
 *
 * `window.__NECK__` is the live controller, for the layout spec.
 */
import { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { NeckStageProvider, useNeck, type NeckNote } from "../api";
import { stageDebug } from "../controller";

declare global {
  interface Window {
    __NECK__?: typeof stageDebug;
  }
}

const OPEN = [64, 59, 55, 50, 45, 40];
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const pc = (s: number, f: number) => (OPEN[s - 1] + f) % 12;

/** D7's chord tones between frets lo and hi, amber and named, with one landed (green), one clash (red) and one box note, as in the mock's Theory screen. */
export function d7Notes(lo = 4, hi = 10): NeckNote[] {
  const tones = [2, 6, 9, 0];
  const at = new Map<string, NeckNote>();
  for (let s = 1; s <= 6; s++) {
    for (let f = lo; f <= hi; f++) {
      const string = s as NeckNote["string"];
      if (tones.includes(pc(s, f))) at.set(`${s}:${f}`, { string, fret: f, kind: "aim", label: NAMES[pc(s, f)] });
    }
  }
  at.set("3:7", { string: 3, fret: 7, kind: "tone", label: "D" });
  at.set("2:8", { string: 2, fret: 8, kind: "clash", label: "G" });
  at.set("4:5", { string: 4, fret: 5, kind: "box", label: "G" });
  return [...at.values()];
}

function Scene({ kind }: { kind: "whole" | "zoom" | "pluck" }) {
  const neck = useNeck();
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind === "whole") {
      neck.setView({ kind: "whole" }, slot.current, { instant: true });
      neck.setNotes([]);
    } else {
      neck.setView({ kind: "zoom", from: 4, to: 10 }, slot.current, { instant: true });
      neck.setNotes(d7Notes(), { fade: 0 });
    }
    return () => neck.setView({ kind: "hidden" }, null);
  }, [kind, neck]);

  return (
    <div className={`stage-shot stage-shot-${kind}`}>
      <header className="stage-shot-head">
        <span className="stage-shot-kick">{kind === "whole" ? "Sunday" : "Theory · Blues path, step 2"}</span>
        <span className="stage-shot-title">{kind === "whole" ? "Today" : "D7"}</span>
      </header>
      <div className="stage-shot-slot" data-testid="stage-slot" ref={slot} />
    </div>
  );
}

const CSS = `
html,body,#root{margin:0;height:100%;background:transparent;color:#fbf5ea;font-family:Inter,system-ui,sans-serif}
.stage-shot{position:relative;height:100%;display:flex;flex-direction:column;padding:24px 28px;box-sizing:border-box}
.stage-shot-head{display:flex;flex-direction:column;gap:4px;flex:none}
.stage-shot-kick{font:600 13px/1 "Barlow Condensed",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#d6c9b4}
.stage-shot-title{font:700 88px/1 "Barlow Condensed",sans-serif}
.stage-shot-whole{flex-direction:column-reverse;justify-content:flex-end}
.stage-shot-whole .stage-shot-slot{flex:none;height:300px;margin:30px -28px 20px}
.stage-shot-whole .stage-shot-title{font:500 120px/1 Fraunces,Georgia,serif}
.stage-shot-zoom .stage-shot-slot,.stage-shot-pluck .stage-shot-slot{flex:1 1 auto;min-height:0;margin:12px -28px 80px}
`;

async function waitFor(what: string, check: () => boolean, ms = 30000) {
  const t0 = performance.now();
  while (!check()) {
    if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 30));
  }
}

export function mountStageShot(kind: "whole" | "zoom" | "pluck") {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap";
  document.head.appendChild(fonts);
  window.__NECK__ = stageDebug;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <NeckStageProvider>
      <Scene kind={kind} />
    </NeckStageProvider>,
  );

  (async () => {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
    await waitFor("the stage", () => !!stageDebug.current);
    const c = stageDebug.current!;
    await waitFor("a backend", () => c.mode === "3d" || c.mode === "fallback");
    if (c.mode === "3d") {
      await waitFor("the first frame", () => c.frames > 0);
      if (kind === "pluck") {
        await waitFor("the stage to settle", () => !c.scheduler.active);
        const neck = c.facade(true);
        neck.pluck(3, 7, "tone");
        neck.pluck(2, 8, "clash");
        await new Promise((r) => setTimeout(r, 140));
      } else {
        await waitFor("the stage to settle", () => !c.scheduler.active);
      }
    } else if (kind === "pluck") {
      c.facade(false).pluck(3, 7, "tone");
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__SHOT_READY__ = true;
  })().catch((err) => {
    window.__SHOT_ERROR__ = String(err?.message ?? err) + (stageDebug.current?.errors.length ? ` (${stageDebug.current.errors.join("; ")})` : "");
  });
}
