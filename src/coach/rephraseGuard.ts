/**
 * The model narrates; it does not decide. A rephrase may change the words of
 * a line the template engine already filled, never its facts.
 *
 * The prompts ask for that ("Preserve every number"), and a small local model
 * does not always listen: given "Welcome back. Let's keep building on this
 * week's reps." it handed back "...this week's 120 BPM reps." 120 is the
 * metronome's default and the stock tempo of every metronome app, so it is the
 * number a model reaches for when it wants one. The player had never practised
 * at 120 and the coach said they had.
 *
 * So the check is done here, deterministically, after the model has spoken:
 * every number in the rephrase must be a number of the original (as many times
 * as it appears there, at most), and a unit the original never mentioned (BPM,
 * %, ms, reps) may not appear either. A rephrase that fails ships the original
 * instead, which is always accurate on its own.
 */

/** Numbers as written: "120", "7.5", "85%" gives "85". */
function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/**
 * Units that make a claim about what the player did. "rep" is in the list
 * because "this week's reps" with a number in front of it is the exact shape
 * the owner was shown.
 */
const FACT_UNITS: RegExp[] = [/\bbpm\b/i, /%|\bper ?cent\b/i, /\d\s*ms\b|\bmillisecond/i, /\breps?\b/i];

/**
 * True when `rephrased` states no number and no unit `original` did not
 * already state. Wording is free; facts are not.
 */
export function keepsFacts(original: string, rephrased: string): boolean {
  const pool = numbersIn(original);
  for (const n of numbersIn(rephrased)) {
    const at = pool.indexOf(n);
    if (at < 0) return false;
    pool.splice(at, 1);
  }
  for (const unit of FACT_UNITS) {
    if (unit.test(rephrased) && !unit.test(original)) return false;
  }
  return true;
}

/**
 * What to ship: the model's rephrase when it kept the facts, else the
 * original. Blank or missing rephrases also give the original.
 */
export function safeRephrase(original: string, rephrased: string | null | undefined): string {
  const r = rephrased?.trim();
  if (!r) return original;
  return keepsFacts(original, r) ? r : original;
}
