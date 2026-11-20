/**
 * The coach's mark: the rail's "Ask the coach" glyph, the one place the
 * coach's colour goes (DESIGN 3.6). Callers colour it with `currentColor`;
 * Ask's stylesheet gives `.ask-glyph` the coach's colour and nothing else.
 */
export function CoachGlyph({ size = 18, className = "ask-glyph" }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 1 0-3.1 6.3L21 19z" />
      <line x1="9" y1="10" x2="9" y2="14" />
      <line x1="12.5" y1="8.5" x2="12.5" y2="15.5" />
      <line x1="16" y1="11" x2="16" y2="13" />
    </svg>
  );
}
