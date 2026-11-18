/**
 * The whole neck, nut to 24, always crisp: real fret spacing, the dots, the
 * notes, and a window over the frets the zoom is showing. Drawn under a zoom
 * view (3D or fallback) at the bottom of the slot.
 *
 * Ported from the mock's `NeckStrip` (mocks-3d-v2/js/widgets.js).
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { NeckKind, NeckNote } from "./api";

const DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const NOTE_FILL: Record<NeckKind, string> = {
  aim: "#ffb454",
  tone: "#4ee08a",
  tens: "#5aa9ff",
  clash: "#ff5d6c",
  box: "#ffe2bd",
  dim: "#7d6a55",
  now: "#ffb454",
  next: "#ffb454",
};
const fx = (n: number) => 1 - Math.pow(2, -n / 12);

export function OverviewStrip({ from, to, notes, height }: { from: number; to: number; notes: readonly NeckNote[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(24, Math.max(from, to));
  const W = width;
  const H = height;
  const pad = 8;
  const X = (f: number) => pad + (fx(f) / fx(24)) * (W - 2 * pad - 7);
  const numH = 15;
  const cy = (H - numH) / 2;
  const hw0 = cy * 0.66;
  const hw1 = cy * 0.94;
  const hw = (x: number) => hw0 + ((hw1 - hw0) * (x - pad)) / Math.max(1, W - 2 * pad);
  const xe = W - pad;
  const winA = X(Math.max(0, lo - 1)) - (lo <= 1 ? 8 : 0);
  const winB = X(hi);

  return (
    <div
      ref={ref}
      className="neck-strip"
      style={{ height: H }}
      role="img"
      aria-label={`Neck overview, nut to fret 24. Showing frets ${lo} to ${hi}.`}
      data-testid="neck-strip"
    >
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id="neck-strip-wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5c3522" />
              <stop offset="1" stopColor="#3a2114" />
            </linearGradient>
          </defs>
          <polygon points={`${pad},${cy - hw0} ${xe},${cy - hw1} ${xe},${cy + hw1} ${pad},${cy + hw0}`} fill="url(#neck-strip-wood)" />
          {Array.from({ length: 24 }, (_, i) => {
            const x = X(i + 1);
            return <line key={i} x1={x} x2={x} y1={cy - hw(x)} y2={cy + hw(x)} stroke="#d9cfbd" strokeOpacity={0.82} strokeWidth={1} />;
          })}
          <rect x={pad - 2} y={cy - hw0 - 0.5} width={3.5} height={hw0 * 2 + 1} fill="#f6eedc" />
          {DOTS.map((f) => {
            const x = (X(f - 1) + X(f)) / 2;
            const d = hw(x) * 0.46;
            const r = Math.min(2.4, hw(x) * 0.2);
            return (
              <g key={f}>
                {(f === 12 || f === 24 ? [-d, d] : [0]).map((dy) => (
                  <circle key={dy} cx={x} cy={cy + dy} r={r} fill="#f4eee0" />
                ))}
                <text x={x} y={H - 2} textAnchor="middle" fontSize={13} fontWeight={600} fill="#d6c9b4" style={{ fontFamily: "var(--font-num, 'Barlow Condensed', 'Arial Narrow', sans-serif)" }}>
                  {f}
                </text>
              </g>
            );
          })}
          {notes
            .filter((n) => n.kind !== "box" && n.kind !== "dim" && n.fret >= 0 && n.fret <= 24)
            .map((n) => {
              const x = X(n.fret) - 3;
              const y = cy + ((n.string - 3.5) / 2.5) * hw(x) * 0.84;
              return <circle key={`${n.string}:${n.fret}`} cx={x} cy={y} r={2.6} fill={NOTE_FILL[n.kind]} />;
            })}
        </svg>
      )}
      {W > 0 && <i className="neck-strip-win" style={{ left: winA, width: winB - winA, height: cy * 2 }} />}
    </div>
  );
}
