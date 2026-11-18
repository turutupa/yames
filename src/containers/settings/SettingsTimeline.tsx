import { useEffect, useRef, useState, useCallback } from "react";
import { IS_MOBILE } from "../../platform";
import "../../styles/settings-timeline.css";

interface Section {
  id: string;
  label: string;
}

interface SettingsTimelineProps {
  sections: Section[];
  containerRef: React.RefObject<HTMLElement | null>;
}

/** Returns true if the accent CSS variable resolves to a light color (needs dark text). */
function useAccentIsLight(): boolean {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = document.documentElement;
      const accent = getComputedStyle(el).getPropertyValue("--accent").trim();
      if (!accent) return;

      let r = 0, g = 0, b = 0;
      if (accent.startsWith("#")) {
        const hex = accent.replace("#", "");
        const full = hex.length === 3
          ? hex.split("").map((c) => c + c).join("")
          : hex;
        r = parseInt(full.slice(0, 2), 16);
        g = parseInt(full.slice(2, 4), 16);
        b = parseInt(full.slice(4, 6), 16);
      } else {
        const m = accent.match(/(\d+)/g);
        if (m && m.length >= 3) {
          r = parseInt(m[0]);
          g = parseInt(m[1]);
          b = parseInt(m[2]);
        }
      }

      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      setLight(lum > 0.55);
    };

    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-group", "style", "class"] });
    return () => obs.disconnect();
  }, []);

  return light;
}

/**
 * The tick rail down the right edge of Settings.
 *
 * Not on a phone. It is a hover-era scroll indicator: the ticks are 14x3px,
 * the label only appears on hover, and the "you are here" popover it shows
 * while scrolling lands on top of the section it is naming when the card is
 * 292px wide. A thumb scrolls the sheet; it does not aim at a 3px tick
 * (M03-GAPS open question 5, decided for M03c).
 *
 * Returned null from inside rather than gated at the call site because that
 * call site is `MainWindow.tsx`, which M03b owns.
 */
export default function SettingsTimeline({ sections, containerRef }: SettingsTimelineProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  // P1-10 (acceptance, 2026-11-18): the "you are here" label sits to the left
  // of its tick, in the gutter between the sheet and the window's edge. At
  // 1024px that gutter is a few pixels wide and the label landed on the rows.
  // So it is measured: a tick whose label does not fit the gutter shows no
  // label, and when the ticks themselves would touch the sheet the whole
  // rail steps aside. It never draws over a row, at any width or language.
  const [labelFits, setLabelFits] = useState<boolean[]>([]);
  const [railFits, setRailFits] = useState(true);
  const accentIsLight = useAccentIsLight();

  const getScrollContainer = useCallback(() => {
    return containerRef.current?.querySelector(".view-transition-wrapper") as HTMLElement | null;
  }, [containerRef]);

  // Scroll listener — active section tracking + visibility
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;

    let rafId = 0;

    const measure = () => {
      const sectionEls = container.querySelectorAll("section.settings-section, section.hotkeys-section");
      const rail = railRef.current;
      if (sectionEls.length === 0 || !rail) return;
      let contentRight = 0;
      sectionEls.forEach((el) => {
        contentRight = Math.max(contentRight, el.getBoundingClientRect().right);
      });
      // The ticks, not the rail's box: the rail is a flex column whose own
      // width is not the ticks'.
      let railLeft = Infinity;
      tickRefs.current.forEach((tick) => {
        if (tick) railLeft = Math.min(railLeft, tick.getBoundingClientRect().left);
      });
      if (!Number.isFinite(railLeft)) railLeft = rail.getBoundingClientRect().left;
      // 8px of air between the sheet and anything the rail draws.
      const gutter = railLeft - contentRight - 8;
      setRailFits(gutter >= 0);
      setLabelFits((prev) => {
        const next = tipRefs.current.map((tip, i) => {
          const tick = tickRefs.current[i];
          if (!tip || !tick) return false;
          // The label's right edge is 10px left of its tick's left edge.
          const labelLeft = tick.getBoundingClientRect().left - 10 - tip.offsetWidth;
          return labelLeft >= contentRight + 8;
        });
        return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
      });
    };

    const update = () => {
      const sectionEls = container.querySelectorAll("section.settings-section, section.hotkeys-section");
      if (sectionEls.length === 0) return;
      measure();

      const containerRect = container.getBoundingClientRect();

      let best = 0;
      let bestOverlap = 0;
      const viewTop = containerRect.top;
      const viewBottom = containerRect.bottom - 56;
      sectionEls.forEach((el, i) => {
        const rect = el.getBoundingClientRect();

        // Visible: any overlap with the usable viewport (excluding bottom fade)
        const tick = tickRefs.current[i];
        const overlapTop = Math.max(rect.top, viewTop);
        const overlapBottom = Math.min(rect.bottom, viewBottom);
        const overlap = Math.max(0, overlapBottom - overlapTop);
        if (tick) {
          if (overlap > 0) {
            tick.classList.add("stl-visible");
          } else {
            tick.classList.remove("stl-visible");
          }
        }

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = i;
        }
      });

      setActiveIdx(best);
    };

    const onScroll = () => {
      setScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setScrolling(false), 1500);

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    // Run initial update after view transition settles
    const initId = requestAnimationFrame(() => requestAnimationFrame(update));
    const initTimer = setTimeout(update, 350);

    container.addEventListener("scroll", onScroll, { passive: true });
    // The sheet's width changes with the window, the rail collapsing and
    // the language; any of them can open or close the gutter.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    ro?.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(initId);
      clearTimeout(initTimer);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [getScrollContainer]);

  const handleClick = useCallback(
    (idx: number) => {
      const container = getScrollContainer();
      if (!container) return;
      const sectionEls = container.querySelectorAll("section.settings-section, section.hotkeys-section");
      if (sectionEls[idx]) {
        sectionEls[idx].scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveIdx(idx);
      }
    },
    [getScrollContainer]
  );

  if (IS_MOBILE || sections.length === 0) return null;

  return (
    <div ref={railRef} className={`settings-timeline${railFits ? "" : " stl-hidden"}`}>
      {sections.map((section, i) => {
        const isActive = i === activeIdx;
        const fits = labelFits[i] ?? false;

        return (
          <div
            key={section.id}
            ref={(el) => { tickRefs.current[i] = el; }}
            className={`stl-tick${isActive ? " stl-active" : ""}${fits ? "" : " stl-no-label"}`}
            onClick={() => handleClick(i)}
            title={fits ? undefined : section.label}
          >
            <div ref={(el) => { tipRefs.current[i] = el; }} className="stl-tooltip">{section.label}</div>
            {isActive && scrolling && fits && (
              <div className={`stl-popover ${accentIsLight ? "stl-dark-text" : "stl-light-text"}`}>{section.label}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
