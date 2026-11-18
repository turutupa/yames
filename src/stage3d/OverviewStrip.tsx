/**
 * The whole neck, nut to 24, always crisp: real fret spacing, the dots, the
 * notes, and a window over the frets the zoom is showing. Drawn under a zoom
 * view (3D or fallback) at the bottom of the slot.
 *
 * Ported from the mock's `NeckStrip` (mocks-3d-v2/js/widgets.js); painted, like
 * the neck, in the theme's colours (`neckTheme.ts`, art direction "A, graphic"):
 * a flat board with crisp frets, the inlays, the notes in their kinds' colours,
 * and the window in the accent.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { NeckNote } from "./api";
import { noteLook, useNeckPalette } from "./neckTheme";

const DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const fx = (n: number) => 1 - Math.pow(2, -n / 12);

export function OverviewStrip({ from, to, notes, height }: { from: number; to: number; notes: readonly NeckNote[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const P = useNeckPalette();
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
  // A flat bar, as in the mock: the same half-height nut to 24.
  const hw0 = cy * 0.8;
  const hw = (_x: number) => hw0;
  const xe = W - pad;
  const winA = X(Math.max(0, lo - 1)) - (lo <= 1 ? 8 : 0);
  const winB = X(hi);

  return (
    <div
      ref={ref}
      className="neck-strip"
      style={{ height: H, ["--neck-strip-bg" as string]: P.bg }}
      role="img"
      aria-label={`Neck overview, nut to fret 24. Showing frets ${lo} to ${hi}.`}
      data-testid="neck-strip"
    >
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {P.shadowA > 0 && (
            <defs>
              <filter id="neck-strip-shadow" x="-5%" y="-60%" width="110%" height="260%">
                <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000" floodOpacity={P.shadowA} />
              </filter>
            </defs>
          )}
          <rect
            x={pad}
            y={cy - hw0}
            width={xe - pad}
            height={hw0 * 2}
            rx={2}
            fill={P.board}
            filter={P.shadowA > 0 ? "url(#neck-strip-shadow)" : undefined}
          />
          <line x1={pad} x2={xe} y1={cy - hw0 + 0.5} y2={cy - hw0 + 0.5} stroke={P.edge} />
          <line x1={pad} x2={xe} y1={cy + hw0 - 0.5} y2={cy + hw0 - 0.5} stroke={P.edge} />
          {Array.from({ length: 24 }, (_, i) => {
            const x = X(i + 1);
            return <rect key={i} x={x - 0.9} y={cy - hw(x)} width={1.8} height={hw(x) * 2} fill={P.fret} />;
          })}
          <rect x={pad} y={cy - hw0} width={3.5} height={hw0 * 2} fill={P.nut} />
          {DOTS.map((f) => {
            const x = (X(f - 1) + X(f)) / 2;
            const d = hw(x) * 0.46;
            const r = Math.min(2.4, hw(x) * 0.2);
            return (
              <g key={f}>
                {(f === 12 || f === 24 ? [-d, d] : [0]).map((dy) => (
                  <circle key={dy} cx={x} cy={cy + dy} r={r} fill={P.inlay} />
                ))}
                <text x={x} y={H - 2} textAnchor="middle" fontSize={12} fontWeight={600} fill={P.numFaint} style={{ fontFamily: "var(--font-num, 'Barlow Condensed', 'Arial Narrow', sans-serif)" }}>
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
              const look = noteLook(n.kind, P);
              return n.kind === "next" ? (
                <circle key={`${n.string}:${n.fret}`} cx={x} cy={y} r={2.2} fill={P.board} stroke={P.accent} strokeWidth={1.2} />
              ) : (
                <circle key={`${n.string}:${n.fret}`} cx={x} cy={y} r={2.6} fill={look.fill} />
              );
            })}
        </svg>
      )}
      {W > 0 && <i className="neck-strip-win" style={{ left: winA, width: winB - winA, height: cy * 2 }} />}
    </div>
  );
}
