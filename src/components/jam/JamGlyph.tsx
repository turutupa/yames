/**
 * The band's lanes, at row size — the mark that says "this is a jam".
 *
 * Four bars of different heights, which is the rail's jam icon and the same
 * drawing the library rows carry. It is here rather than inlined in each
 * because a setlist step can be a jam now (JAM_MODE §8.5), and a jam step in
 * a routine has to be recognisable as the same kind of thing as the row in
 * the library it came from. Two hand-copied SVGs would drift.
 */
export function JamGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 9v6" />
      <path d="M10 5v14" />
      <path d="M15 8v8" />
      <path d="M20 11v2" />
    </svg>
  );
}
