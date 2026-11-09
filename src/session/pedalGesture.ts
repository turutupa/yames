/**
 * One pedal, three gestures: tap, double tap, hold.
 *
 * Pure: `press` and `release` are fed from whichever input the pedal arrives on,
 * with the time, and `poll` is called so a hold can fire while still down. The
 * mocks' legend is tap for the big action, double for slower, hold for next.
 *
 * A tap has to wait out the double-tap window, so a tap is `DOUBLE_TAP_MS` late.
 * That is fine between Takes, where this runs, and it is the reason a Take's stop
 * is not behind it: `session-go` and `session-stop` fire on the press.
 *
 * A stray stomp is the mocks' open question 9. Nothing here confirms, because
 * the result of a mistaken tap is one Take that can be stopped.
 */
export type PedalGesture = "tap" | "double" | "hold";

export const DOUBLE_TAP_MS = 280;
export const HOLD_MS = 600;

type Phase =
  | { at: "up" }
  | { at: "down"; since: number }
  /** Released once, and a second press may still come. */
  | { at: "waiting"; since: number }
  /** A second press is down. It is a double whenever it comes back up. */
  | { at: "downAgain" }
  /** A hold fired and the pedal has not come up yet. */
  | { at: "held" };

export type PedalState = { phase: Phase };

export const PEDAL_UP: PedalState = { phase: { at: "up" } };

export type PedalStep = { state: PedalState; gesture: PedalGesture | null };

/**
 * A pedal that has only ever sent presses.
 *
 * Some send no release at all, so "down" never ends and every press would read
 * as a hold. Until a release has been seen, a press still held at `HOLD_MS` is
 * taken as a tap from such a pedal, and every later one is a tap on the press.
 * The cost is one first hold read as a tap; the cost the other way is a pedal
 * that can only ever say "next".
 */
export function pedalPollNoRelease(state: PedalState, now: number): PedalStep {
  const { phase } = state;
  if (phase.at === "down" && now - phase.since >= HOLD_MS) {
    return { state: PEDAL_UP, gesture: "tap" };
  }
  return { state, gesture: null };
}

export function pedalPress(state: PedalState, now: number): PedalStep {
  switch (state.phase.at) {
    case "up":
      return { state: { phase: { at: "down", since: now } }, gesture: null };
    case "waiting":
      return { state: { phase: { at: "downAgain" } }, gesture: "double" };
    // A key's auto-repeat, or a second press with no release between: already down.
    default:
      return { state, gesture: null };
  }
}

export function pedalRelease(state: PedalState, now: number): PedalStep {
  switch (state.phase.at) {
    case "down":
      return { state: { phase: { at: "waiting", since: now } }, gesture: null };
    case "downAgain":
    case "held":
      return { state: PEDAL_UP, gesture: null };
    default:
      return { state, gesture: null };
  }
}

/** Let the clock turn a held press into a hold, and a lone press into a tap. */
export function pedalPoll(state: PedalState, now: number): PedalStep {
  const { phase } = state;
  if (phase.at === "down" && now - phase.since >= HOLD_MS) {
    return { state: { phase: { at: "held" } }, gesture: "hold" };
  }
  if (phase.at === "waiting" && now - phase.since >= DOUBLE_TAP_MS) {
    return { state: PEDAL_UP, gesture: "tap" };
  }
  return { state, gesture: null };
}
