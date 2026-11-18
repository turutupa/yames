/**
 * Ladders spaced from the pass tempo (`PathSpec.paceLadders`).
 *
 * The first rung is about 0.6 of the pass, so a player starts somewhere the
 * Exercise is easy but not idle, and a four-minute block can climb to the pass.
 * The top rung is kept as written (it says how far the Exercise goes), the pass
 * is always a rung, no step is more than 25%, and the step size is the multiple
 * of 5 that gives a ladder nearest seven rungs.
 */
const round5 = (bpm: number) => Math.max(5, Math.round(bpm / 5) * 5);

export const PACE_START_SHARE = 0.6;
const TARGET_RUNGS = 7;
const MAX_STEP = 1.25;

export function paceLadder(pass: number, top: number): number[] {
  const start = Math.min(pass, Math.max(20, round5(pass * PACE_START_SHARE)));
  const high = Math.max(top, pass);
  const below = pass - start;
  const above = high - pass;
  const steps = TARGET_RUNGS - 1;
  // Steps shared between the climb to the pass and the stretch above it, by span.
  let under = above === 0 ? steps : Math.min(steps - 1, Math.max(1, Math.round((steps * below) / (below + above))));
  let over = above === 0 ? 0 : steps - under;
  const build = () => {
    const rungs = new Set<number>([start, pass, high]);
    for (let i = 1; i < under; i += 1) rungs.add(round5(start + (i * below) / under));
    for (let j = 1; j < over; j += 1) rungs.add(round5(pass + (j * above) / over));
    return [...rungs].filter((bpm) => bpm >= start && bpm <= high).sort((a, b) => a - b);
  };
  let rungs = build();
  // No step over 25%: add a step to whichever side has one, until none does.
  for (let guard = 0; guard < 12; guard += 1) {
    const jump = rungs.findIndex((bpm, i) => i > 0 && bpm / rungs[i - 1] > MAX_STEP);
    if (jump < 0) break;
    if (rungs[jump] <= pass) under += 1;
    else over += 1;
    rungs = build();
  }
  return rungs;
}
