/**
 * The neck without WebGL2: the same flat neck the 3D stage draws (art
 * direction "A, graphic", 2026-11-17), as SVG, in the same theme colours
 * (`neckTheme.ts`). A is literally drawable as SVG, so the fallback is not a
 * downgrade: a flat board, crisp frets, solid strings heavier toward low E,
 * flat inlays, bold marker fret numbers with an accent dot, the notes in the
 * same looks as the 3D markers, and one soft shadow on a dark theme.
 *
 * Each marker is a `[data-testid="fret-dot"]` circle carrying `data-string`
 * (0 = low E, as the app's `Fretboard` numbers them), `data-fret` and
 * `data-kind`: the controller's `project` finds a place's centre through it,
 * and the flash on a pluck is a class on it.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import { GUITAR_STANDARD_TUNING } from "../components/fretboard";
import type { NeckKind, NeckNote, NeckView } from "./api";
import type { StageSnapshot } from "./controller";
import { noteLook, useNeckPalette, type NeckPalette } from "./neckTheme";

/** An open string's token, as a share of a marker: the 3D neck's `OPEN_K` (engine/guitar.ts, not imported: it brings three.js). */
const OPEN_K = 0.66;

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

const MARK = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE = (f: number) => f === 12 || f === 24;
/** String widths as a fraction of the string spacing, high e to low E (the 3D neck's progression). */
const STR_K = [0.04, 0.05, 0.064, 0.082, 0.1, 0.118];
/** NOW and NEXT are larger, as on the 3D neck. */
const SCALE: Partial<Record<NeckKind, number>> = { now: 1.45, next: 1.15 };
const fx = (n: number) => 1 - Math.pow(2, -n / 12);


export function FallbackNeck({
  view,
  notes,
  pluck,
  palette,
}: {
  view: NeckView;
  notes: readonly NeckNote[];
  pluck: StageSnapshot["pluck"];
  /** Paint in this palette rather than the live theme's (the wizard's theme preview). */
  palette?: NeckPalette;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useNeckPalette();
  const P = palette ?? live;
  const uid = useId().replace(/:/g, "");
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const whole = view.kind !== "zoom";
  const range = fallbackRange(view);
  const a = range.startFret === 0 ? 0 : range.startFret - 1;
  const b = a + range.frets;
  // happy-dom lays nothing out: draw at a nominal size there, the viewBox scales it.
  const W = size.w || 800;
  const H = size.h || 300;
  const numH = Math.max(18, Math.min(46, H * 0.16));
  const pad = 4;
  const bh = Math.max(24, Math.min(H - numH - 2 * pad, W * (whole ? 0.115 : 0.45)));
  const bT = pad + Math.max(0, (H - numH - 2 * pad - bh) / 2);
  const bB = bT + bh;
  // The outer strings sit far enough in that NOW's marker on them stays on
  // the board, as the 3D neck's do (acceptance P1-3).
  const sp = bh / 6.3;
  const inset = sp * 0.65;
  const S = (s: number) => bT + inset + (s - 1) * sp;
  const R = sp * 0.46;
  const mL = whole || a === 0 ? Math.max(14, R * 2.6) : 0;
  const mR = whole ? 14 + W * 0.012 : 0;
  const X = (f: number) => mL + ((fx(f) - fx(a)) / (fx(b) - fx(a))) * (W - mL - mR);
  // A stub of board before the nut, just room for an open string's token
  // (the 3D neck's OPEN_K: two thirds of a marker, "0", by the nut; acceptance 2, P1-3).
  const xL = a === 0 ? Math.max(0, X(0) - R * 2.3) : 0;
  const xR = whole ? X(24) + (X(24) - X(23)) * 0.6 : W;
  const fretW = Math.max(1, sp * 0.065);
  const nutW = Math.max(3, sp * 0.16);
  const noteX = (f: number) => (f <= 0 ? X(0) - nutW - R * 1.45 * OPEN_K - 2 : X(f) - Math.min(0.3 * (X(f) - X(f - 1)), R * 1.5));
  const kOf = (f: number) => (f <= 0 ? OPEN_K : 1);
  const fsMark = Math.max(12, Math.min(30, sp * 0.62));
  const fsOther = fsMark * 0.68;
  const numY = bB + numH * 0.62;

  const frets: number[] = [];
  for (let f = Math.max(1, a); f <= b; f++) frets.push(f);
  const cells: number[] = [];
  for (let f = Math.max(1, a + 1); f <= b; f++) cells.push(f);
  const shown = notes.filter((n) => n.string >= 1 && n.string <= 6 && n.fret >= Math.max(0, a) && n.fret <= b);

  return (
    <div ref={ref} className="neck-fallback" data-testid="neck-fallback" data-view={view.kind}>
      <svg
        className="neck-fallback-svg"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={whole ? "Fretboard, the whole neck" : `Fretboard, frets ${range.startFret} to ${range.startFret + range.frets}`}
        // Where any place would be, for the controller's `project` when no dot
        // stands there (a NEXT tag looks for the strings either side of its note).
        data-geom={JSON.stringify({ a, top: bT + inset, sp, r: R, xs: Array.from({ length: b - a + 1 }, (_u, i) => Math.round(noteX(a + i) * 10) / 10) })}
      >
        <defs>
          {P.shadowA > 0 && (
            <filter id={`${uid}sh`} x="-10%" y="-40%" width="120%" height="180%">
              <feDropShadow dx="0" dy={bh * 0.055} stdDeviation={bh * 0.06} floodColor="#000" floodOpacity={P.shadowA} />
            </filter>
          )}
          <radialGradient id={`${uid}glow`}>
            <stop offset="0" stopColor={P.accent} stopOpacity={P.glowA} />
            <stop offset="1" stopColor={P.accent} stopOpacity={0} />
          </radialGradient>
        </defs>
        {/* Board, its edges, the inlays and the frets. */}
        <rect x={xL} y={bT} width={xR - xL} height={bh} rx={whole ? 3 : 0} fill={P.board} filter={P.shadowA > 0 ? `url(#${uid}sh)` : undefined} />
        <line x1={xL} x2={xR} y1={bT + 0.5} y2={bT + 0.5} stroke={P.edge} />
        <line x1={xL} x2={xR} y1={bB - 0.5} y2={bB - 0.5} stroke={P.edge} />
        {cells
          .filter((f) => MARK.includes(f))
          .map((f) => {
            const c = (X(f) + X(f - 1)) / 2;
            const ys = DOUBLE(f) ? [(S(2) + S(3)) / 2, (S(4) + S(5)) / 2] : [(S(3) + S(4)) / 2];
            // Small, and not drawn where a note stands on or beside it, as on
            // the 3D neck: an inlay is a landmark, never a second dot.
            const ri = sp * 0.17;
            return ys
              .filter((y) => !shown.some((n) => Math.hypot(noteX(n.fret) - c, S(n.string) - y) < R * 1.45 + ri + 3))
              .map((y) => <circle key={`${f}:${y}`} data-testid="neck-inlay" cx={c} cy={y} r={ri} fill={P.inlay} />);
          })}
        {frets.map((f) => (
          <rect key={f} x={X(f) - fretW / 2} y={bT} width={fretW} height={bh} fill={P.fret} />
        ))}
        {a === 0 && <rect x={X(0) - nutW} y={bT} width={nutW} height={bh} fill={P.nut} />}
        {/* Strings. */}
        {[1, 2, 3, 4, 5, 6].map((s) => {
          const w = Math.max(0.8, sp * STR_K[s - 1]);
          return <rect key={s} x={xL} y={S(s) - w / 2} width={xR - xL} height={w} fill={s >= 4 ? P.wound : P.string} />;
        })}
        {/* Fret numbers: the marker frets bold in the ink with an accent dot, the rest quiet. */}
        {cells.map((f) => {
          const m = MARK.includes(f);
          if (whole && !m && f > 12) return null;
          const c = (X(f) + X(f - 1)) / 2;
          return (
            <g key={f} className="neck-fallback-num">
              <text x={c} y={numY} textAnchor="middle" fontFamily={P.numFont} fontWeight={m ? 700 : 500} fontSize={m ? fsMark : fsOther} fill={m ? P.num : P.numFaint} opacity={m ? 1 : 0.8}>
                {f}
              </text>
              {m && <circle cx={c} cy={numY + fsMark * 0.32} r={Math.max(1.6, fsMark * 0.085)} fill={P.accent} />}
            </g>
          );
        })}
        {/* NOW's glow, under the markers. */}
        {shown
          .filter((n) => n.kind === "now")
          .map((n) => (
            <circle key={`g${n.string}:${n.fret}`} cx={noteX(n.fret)} cy={S(n.string)} r={R * kOf(n.fret) * 1.45 * 2.4} fill={`url(#${uid}glow)`} pointerEvents="none" />
          ))}
        {/* The markers. */}
        {shown.map((n) => {
          const look = noteLook(n.kind, P);
          const r = R * kOf(n.fret) * (SCALE[n.kind] ?? 1) * look.size;
          const lw = look.stroke ? r * look.strokeW : 0;
          return (
            <circle
              key={`${n.string}:${n.fret}`}
              data-testid="fret-dot"
              data-string={stringIndex(n.string)}
              data-fret={Math.round(n.fret)}
              data-kind={n.kind}
              className="neck-fallback-dot"
              cx={noteX(n.fret)}
              cy={S(n.string)}
              r={r - lw / 2}
              fill={look.fill}
              stroke={look.stroke ?? "none"}
              strokeWidth={lw}
            />
          );
        })}
        <g data-neck-labels="" pointerEvents="none">
          {shown
            .filter((n) => n.label)
            .map((n) => {
              const look = noteLook(n.kind, P);
              const r = R * kOf(n.fret) * (SCALE[n.kind] ?? 1);
              return (
                <text
                  key={`${n.string}:${n.fret}`}
                  className="neck-fallback-label"
                  data-kind={n.kind}
                  x={noteX(n.fret)}
                  y={S(n.string)}
                  fontSize={r * 1.25}
                  fontFamily={P.numFont}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={look.ink}
                >
                  {n.label}
                </text>
              );
            })}
        </g>
      </svg>
    </div>
  );
}
