/**
 * The neck without WebGL2: the app's SVG `Fretboard`, drawn into the slot,
 * with the stage's notes on it in the stage's colours.
 *
 * `Fretboard` lights every place a pitch class falls; the stage names exact
 * places. So it is given the notes' pitch classes, and then every dot that is
 * not one of the stage's notes is hidden and the rest are coloured by kind
 * (`data-kind`, see stage.css) and labelled. Labels go in a group of our own
 * at the end of the SVG, positioned from the dots' own centres, so nothing
 * React rendered is rewritten.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { Fretboard, GUITAR_STANDARD_TUNING } from "../components/fretboard";
import type { NeckNote, NeckView } from "./api";
import type { StageSnapshot } from "./controller";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Stage string (1 = high E) to Fretboard's index (0 = lowest string). */
export const stringIndex = (s: number) => 6 - s;
export const pitchOf = (s: number, fret: number) => (GUITAR_STANDARD_TUNING[stringIndex(s)] + fret) % 12;

/** Which frets the fallback draws for a view. */
export function fallbackRange(view: NeckView): { startFret: number; frets: number } {
  if (view.kind !== "zoom") return { startFret: 0, frets: 24 };
  const lo = Math.max(0, Math.min(24, Math.round(Math.min(view.from, view.to))));
  const hi = Math.max(lo + 1, Math.min(24, Math.round(Math.max(view.from, view.to))));
  return lo <= 1 ? { startFret: 0, frets: hi } : { startFret: lo, frets: hi - lo + 1 };
}

export function FallbackNeck({ view, notes, pluck }: { view: NeckView; notes: readonly NeckNote[]; pluck: StageSnapshot["pluck"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const range = fallbackRange(view);
  const pcs = useMemo(() => [...new Set(notes.map((n) => pitchOf(n.string, n.fret)))], [notes]);

  useLayoutEffect(() => {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const byPlace = new Map(notes.map((n) => [`${stringIndex(n.string)}:${Math.round(n.fret)}`, n]));
    let labels = svg.querySelector<SVGGElement>("g[data-neck-labels]");
    if (!labels) {
      labels = document.createElementNS(SVG_NS, "g") as SVGGElement;
      labels.setAttribute("data-neck-labels", "");
      labels.setAttribute("pointer-events", "none");
    }
    svg.appendChild(labels); // Always last, so labels sit above every dot.
    labels.replaceChildren();
    svg.querySelectorAll<SVGCircleElement>('[data-testid="fret-dot"]').forEach((dot) => {
      const n = byPlace.get(`${dot.dataset.string}:${dot.dataset.fret}`);
      if (!n) {
        dot.style.display = "none";
        dot.removeAttribute("data-kind");
        return;
      }
      dot.style.display = "";
      dot.setAttribute("data-kind", n.kind);
      if (n.label) {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", dot.getAttribute("cx") ?? "0");
        t.setAttribute("y", dot.getAttribute("cy") ?? "0");
        t.setAttribute("font-size", String(Number(dot.getAttribute("r") ?? 6) * 1.15));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "central");
        t.setAttribute("class", "neck-fallback-label");
        t.setAttribute("data-kind", n.kind);
        t.textContent = n.label;
        labels!.appendChild(t);
      }
    });
  });

  // A heard note: flash its dot.
  useLayoutEffect(() => {
    if (!pluck) return;
    const dot = ref.current?.querySelector<SVGCircleElement>(
      `[data-testid="fret-dot"][data-string="${stringIndex(pluck.string)}"][data-fret="${Math.round(pluck.fret)}"]`,
    );
    if (!dot) return;
    dot.classList.remove("neck-flash");
    void dot.getBoundingClientRect();
    dot.classList.add("neck-flash");
  }, [pluck]);

  return (
    <div ref={ref} className="neck-fallback" data-testid="neck-fallback" data-view={view.kind}>
      <Fretboard
        startFret={range.startFret}
        frets={range.frets}
        size={view.kind === "zoom" ? "large" : "sheet"}
        highlight={{ pitchClasses: pcs }}
        ariaLabel={view.kind === "zoom" ? `Fretboard, frets ${range.startFret} to ${range.startFret + range.frets}` : "Fretboard, the whole neck"}
      />
    </div>
  );
}
