import type { Line } from "../../session/coachWords";

/** A coach's line, in the player's language. */
export function lineText(
  t: (key: string, values?: Record<string, string | number>) => string,
  line: Line,
): string {
  return t(line.key, line.values);
}
