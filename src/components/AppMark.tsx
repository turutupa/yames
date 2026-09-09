/**
 * The ember: the app's mark, the same one the website and the icon use.
 *
 * An amber tile with the Y knocked through it in ink rather than left
 * transparent, so it reads the same on light chrome and dark. The Y doubles
 * as a metronome pendulum — the fork is the swing, the stem is the rod.
 *
 * Kept in sync with `docs/favicon.svg` and `src-tauri/icons/*` BY HAND, which
 * is worth saying out loud: there is no build step generating one from the
 * other, and the geometry below is a copy. `AppMark.test.tsx` compares it
 * against the favicon so the copy cannot drift silently.
 *
 * It does not follow the theme. The window's own icon, one strip below this
 * in the taskbar, cannot — so a mark that recoloured itself would only ever
 * match the icon beside it by accident. This is the brand, not a swatch.
 */
export function AppMark() {
  return (
    <svg
      className="app-mark"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Yames"
      focusable="false"
    >
      <defs>
        <linearGradient id="app-mark-tile" gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="58" y2="64">
          <stop offset="0%" stopColor="#FFC24D" />
          <stop offset="100%" stopColor="#E8760C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#app-mark-tile)" />
      <g
        fill="none"
        stroke="#0B0A14"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 17 L32 37 L46 17" />
        <path d="M32 37 L32 48" />
      </g>
    </svg>
  );
}
