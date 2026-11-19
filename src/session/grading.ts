/**
 * Whether Yames listens to the player and grades them (owner, 2026-11-18:
 * "some folks may not wanna opt in input detection").
 *
 * Grading is opt-in. Playing ungraded is a choice of its own, never an error
 * or a fallback:
 *
 * - `on`: the Session turns the input on by itself and grades every Take.
 * - `off`: the Session never mentions the input. The click, the picture and
 *   the minutes, nothing graded, no microphone asked for.
 * - `ask`: not decided yet. With the input off, a Take's ready screen offers
 *   both, side by side, and can remember the answer.
 *
 * New players answer it in the setup wizard. A player from before this
 * setting existed kept a boolean under `session.grade` ("Grade my playing"):
 * one who turned it off keeps it off, one who turned it back on keeps it on,
 * and one who never touched it is asked.
 */

export type GradingChoice = "on" | "off" | "ask";

export const GRADING_CHOICES: readonly GradingChoice[] = ["on", "off", "ask"];

/** Where the choice is kept. */
export const GRADING_KEY = "session.grading";
/**
 * "Grade my playing", the switch this replaced. Still written beside the new
 * key (on → true, off → false) so a build from before it reads the same answer.
 */
export const LEGACY_GRADE_KEY = "session.grade";

export function isGradingChoice(value: unknown): value is GradingChoice {
  return value === "on" || value === "off" || value === "ask";
}

/** The choice from what the store holds: the new key first, then the old switch. */
export function readGradingChoice(saved: unknown, legacy: unknown): GradingChoice {
  if (isGradingChoice(saved)) return saved;
  if (legacy === false) return "off";
  // Only ever written by a press, so true means they turned it back on.
  if (legacy === true) return "on";
  return "ask";
}

/** What the old boolean should say for a choice; null leaves it alone. */
export function legacyGradeFor(choice: GradingChoice): boolean | null {
  return choice === "on" ? true : choice === "off" ? false : null;
}
