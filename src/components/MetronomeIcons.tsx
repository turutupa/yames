/**
 * Pure SVG icon helpers used across the metronome UI.
 *
 * `SubdivisionIcon` renders the appropriate musical-note glyph for a
 * subdivision value (1..6). `INSTRUMENT_ICONS` is a static map keyed by
 * the instrument id used in the Practice Coach settings dropdown.
 *
 * Extracted from MainWindow.tsx — these have no React state and no
 * dependencies on MainWindow's component scope, so they live here for
 * reuse and to keep MainWindow.tsx leaner.
 */
import type { JSX } from "react";
import type { Subdivision } from "../types";

// SVG subdivision icons — clean musical note representations
export function SubdivisionIcon({
  sub,
  size = 20,
}: {
  sub: Subdivision;
  size?: number;
}) {
  const h = size;
  const w = Math.round(size * 0.9);
  const noteColor = "currentColor";
  switch (sub) {
    case 1: // Quarter note — single stem + filled head
      return (
        <svg width={w} height={h} viewBox="0 0 18 24" fill={noteColor}>
          <ellipse cx="7" cy="20" rx="5" ry="3.5" transform="rotate(-15 7 20)" />
          <rect x="11" y="2" width="1.8" height="18" rx="0.9" />
        </svg>
      );
    case 2: // Eighth notes — two beamed
      return (
        <svg width={w} height={h} viewBox="0 0 22 24" fill={noteColor}>
          <ellipse cx="5" cy="20" rx="4.5" ry="3.2" transform="rotate(-15 5 20)" />
          <ellipse cx="17" cy="20" rx="4.5" ry="3.2" transform="rotate(-15 17 20)" />
          <rect x="8.5" y="3" width="1.8" height="17" rx="0.9" />
          <rect x="20" y="3" width="1.8" height="17" rx="0.9" />
          <rect x="8.5" y="3" width="13.3" height="2.5" rx="1" />
        </svg>
      );
    case 3: // Triplet — three beamed under a 3
      return (
        <svg width={Math.round(size * 1.28)} height={h} viewBox="0 0 30.8 24" fill={noteColor}>
          <ellipse cx="3" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 3 20.5)" /><ellipse cx="13" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 13 20.5)" /><ellipse cx="23" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 23 20.5)" /><rect x="6.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="16.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="26.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="6.2" y="6.5" width="21.6" height="2.2" rx="1" /><text x="17.0" y="4.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={noteColor}>3</text>
        </svg>
      );
    case 4: // 16ths — four stems under a double beam
      return (
        <svg width={Math.round(size * 1.45)} height={h} viewBox="0 0 34.8 24" fill={noteColor}>
          <ellipse cx="3" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 3 20.5)" /><ellipse cx="11" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 11 20.5)" /><ellipse cx="19" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 19 20.5)" /><ellipse cx="27" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 27 20.5)" /><rect x="6.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="14.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="22.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="30.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="6.2" y="6.5" width="25.6" height="2.2" rx="1" /><rect x="6.2" y="10.9" width="25.6" height="2.2" rx="1" />
        </svg>
      );
    case 5: // Quintuplet — five stems, double beam, under a 5
      return (
        <svg width={Math.round(size * 1.78)} height={h} viewBox="0 0 42.800000000000004 24" fill={noteColor}>
          <ellipse cx="3" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 3 20.5)" /><ellipse cx="11" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 11 20.5)" /><ellipse cx="19" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 19 20.5)" /><ellipse cx="27" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 27 20.5)" /><ellipse cx="35" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 35 20.5)" /><rect x="6.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="14.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="22.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="30.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="38.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="6.2" y="6.5" width="33.6" height="2.2" rx="1" /><rect x="6.2" y="10.9" width="33.6" height="2.2" rx="1" /><text x="23.0" y="4.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={noteColor}>5</text>
        </svg>
      );
    case 6: // Sextuplet — six stems, double beam, under a 6
      return (
        <svg width={Math.round(size * 2.12)} height={h} viewBox="0 0 50.800000000000004 24" fill={noteColor}>
          <ellipse cx="3" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 3 20.5)" /><ellipse cx="11" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 11 20.5)" /><ellipse cx="19" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 19 20.5)" /><ellipse cx="27" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 27 20.5)" /><ellipse cx="35" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 35 20.5)" /><ellipse cx="43" cy="20.5" rx="3.6" ry="2.9" transform="rotate(-15 43 20.5)" /><rect x="6.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="14.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="22.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="30.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="38.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="46.2" y="6.5" width="1.6" height="14" rx="0.8" /><rect x="6.2" y="6.5" width="41.6" height="2.2" rx="1" /><rect x="6.2" y="10.9" width="41.6" height="2.2" rx="1" /><text x="27.0" y="4.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={noteColor}>6</text>
        </svg>
      );
  }
}

export const INSTRUMENT_ICONS: Record<string, JSX.Element> = {
  drums: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="14" rx="10" ry="5" />
      <ellipse cx="12" cy="14" rx="10" ry="5" fill="currentColor" opacity="0.08" />
      <path d="M2 14v-4c0-2.76 4.48-5 10-5s10 2.24 10 5v4" />
      <ellipse cx="12" cy="10" rx="10" ry="5" />
      <line x1="6" y1="3" x2="10" y2="10" />
      <line x1="18" y1="3" x2="14" y2="10" />
      <circle cx="6" cy="2.5" r="1.5" fill="currentColor" />
      <circle cx="18" cy="2.5" r="1.5" fill="currentColor" />
    </svg>
  ),
  "electric-guitar": (
    // Upright, like a guitar on a stand: a double-cutaway body with two
    // horns, a neck, a six-tuner headstock and two pickups. The diagonal
    // drawing this replaced shrank the body to a blob under a long stick and
    // read as a shovel or a key at card size (owner, 2026-11-17).
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Headstock */}
      <path d="M10.6 1.2h2.8l-.4 3.3h-2z" />
      {/* Neck */}
      <path d="M11 4.5v7.6M13 4.5v7.6" />
      {/* Body: the bass-side horn reaches higher than the treble side */}
      <path d="M11 12.1C10.2 11.4 9.4 9.4 8 9.3 6.7 9.2 6.4 10.6 6.9 12c.5 1.4-.3 2.3-.9 3.6-1.3 3 .2 6.9 4.4 7h3.2c4.2-.1 5.7-4 4.4-7-.6-1.3-1.3-2.1-1-3.3.3-1.1-.3-1.9-1.3-1.7-1 .2-1.6 1.3-2.7 1.5" />
      {/* Pickups and bridge */}
      <path d="M10 14.6h4M10 16.8h4M10.2 19.4h3.6" />
    </svg>
  ),
  "acoustic-guitar": (
    // Upright too: a figure-eight body, the sound hole just under the neck
    // (the clearest "acoustic" cue) and the bridge below it.
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Headstock */}
      <path d="M10.6 1.2h2.8l-.4 3.3h-2z" />
      {/* Neck */}
      <path d="M11 4.5v6M13 4.5v6" />
      {/* Body: smaller upper bout, waist, wider lower bout */}
      <path d="M12 10.5c-3 0-4.6 1-4.6 3 0 1.5 1.2 2.1 1.2 2.8S6.4 17.8 6.4 20c0 2 2.6 3 5.6 3s5.6-1 5.6-3c0-2.2-2.2-3-2.2-3.7s1.2-1.3 1.2-2.8c0-2-1.6-3-4.6-3z" />
      {/* Sound hole and bridge */}
      <circle cx="12" cy="15" r="1.7" />
      <path d="M10.3 19.8h3.4" />
    </svg>
  ),
  bass: (
    // P-Bass / J-Bass style silhouette: similar to electric but with a
    // longer, slimmer neck and a single offset horn. Distinguishing
    // touches: visible string passing across the body to suggest the
    // characteristic bass scale length.
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Headstock (longer, narrower than guitar) */}
      <path d="M20 2 L22.5 3 L21.5 6 L19 5 Z" />
      {/* Tuners */}
      <circle cx="19.7" cy="3.4" r="0.4" fill="currentColor" stroke="none" />
      <circle cx="21.5" cy="4.4" r="0.4" fill="currentColor" stroke="none" />
      {/* Long neck */}
      <line x1="19" y1="5.5" x2="11" y2="13.5" />
      {/* Offset body — single sharper horn at top, wide lower bout */}
      <path d="M11 13.5 Q13 12.5 14.5 14 L15.5 15 Q18 14.5 19 17 Q19.5 20 17 21.5 Q14 22.5 11.5 20.5 L10 19 Q8 22 5 21 Q2.5 19 3.5 16 Q5 13.5 8 13.5 Q9.5 13.5 11 13.5 Z" />
      {/* Pickup */}
      <rect x="11" y="17" width="3" height="1.1" rx="0.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  piano: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="2" y="4" width="20" height="16" rx="2" fill="currentColor" opacity="0.05" />
      <line x1="6" y1="4" x2="6" y2="20" />
      <line x1="10" y1="4" x2="10" y2="20" />
      <line x1="14" y1="4" x2="14" y2="20" />
      <line x1="18" y1="4" x2="18" y2="20" />
      <rect x="5" y="4" width="2.5" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="8.5" y="4" width="2.5" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="13" y="4" width="2.5" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="16.5" y="4" width="2.5" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
    </svg>
  ),
  // "Other" — generic musical-note icon for the neutral fallback.
  other: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="18" cy="16" r="3" fill="currentColor" />
    </svg>
  ),
};
