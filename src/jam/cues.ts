/**
 * Spoken cues: the count, the trade, and the section you just walked into.
 *
 * Your eyes are on the neck (JAM_MODE §4.7). Every cue this mode already draws
 * — the count-in, "your four", the section name — is drawn in a place a player
 * mid-solo is not looking at, and the whole reason the app has a voice is that
 * some things have to be said rather than shown.
 *
 * ## Silent unless there is a voice, and honest about it
 *
 * Yames's voice is Piper, downloaded on purpose in Settings and absent on a
 * fresh install. So the toggle decides whether cues are WANTED and
 * `voiceReady` decides whether they are possible, and `shouldSpeak` is the
 * only place the two meet. With no voice the jam is exactly as it was: no
 * error, no nagging, and a caption on the toggle saying where the voice comes
 * from. Speaking is never a requirement of the mode — every cue here is also
 * on the screen.
 *
 * ## What gets said
 *
 * A cue is an i18n key and its parameters rather than a sentence, because the
 * thing that ends up spoken has to be the user's language and this module
 * knows nothing about languages. The caller translates and hands the result to
 * `ttsSpeak`.
 */

/** Something to say: an i18n key, and what to fill into it. */
export type JamCue = { key: string; params?: Record<string, string | number> };

/** The most beats a count-in can be — `arm_count_in`'s own limit. */
const MAX_COUNT = 8;

/**
 * Do we speak at all?
 *
 * Both halves, in one place. The toggle being on with no voice installed is
 * the ordinary case on a fresh machine, not a misconfiguration, and it comes
 * out of here as `false` rather than as an error anybody has to handle.
 */
export function shouldSpeak(args: { cues?: boolean; voiceReady: boolean }): boolean {
  return !!args.cues && !!args.voiceReady;
}

/**
 * The number to say on a count-in beat, 0-based.
 *
 * "one, two, three, four" — the numbers a person counts a band in with, in
 * the language the app is in. Beats past the eighth are not spoken because
 * the engine cannot count more than eight of them.
 */
export function countInCue(beat: number): JamCue | null {
  const n = Math.trunc(beat) + 1;
  if (n < 1 || n > MAX_COUNT) return null;
  return { key: `jam.cues.n${n}` };
}

/**
 * The whole count as ONE sentence, for a machine that cannot say the beats
 * one at a time.
 *
 * Measured, not assumed: see the report and `jamSpeechLatency`. Piper
 * synthesises before it plays, so a per-beat cue is only a cue if the
 * synthesis fits inside a beat — at 100 BPM that is 600 ms, and a machine
 * that takes longer would say "two" over the downbeat of bar one. This is the
 * fallback, and it is a real fallback rather than a worse version of the same
 * thing: one utterance starting on beat one, at the tempo the count is going
 * to be read at anyway.
 *
 * The NUMBERS, for the caller to translate and join, rather than a sentence
 * of its own: "one two three four" is four words this app already has in
 * fifteen languages, and a separate `countPhrase` string would be a second
 * place for a translator to write them — differently.
 */
export function countInPhraseCues(beats: number): JamCue[] {
  const total = Math.min(MAX_COUNT, Math.max(0, Math.trunc(beats)));
  const out: JamCue[] = [];
  for (let beat = 0; beat < total; beat++) {
    const cue = countInCue(beat);
    if (cue) out.push(cue);
  }
  return out;
}

/**
 * Whether the count can be spoken beat by beat at this tempo.
 *
 * One utterance has to be synthesised, started and finished inside one beat,
 * or the count walks over itself. `speechMs` is what the machine measured for
 * the last one it said; with nothing measured yet the answer is yes, because
 * the first cue is how it gets measured and refusing to try would mean never
 * finding out.
 *
 * The margin is deliberate: a count that lands 90% of the way through the beat
 * is not a count, it is a stumble.
 */
export function perBeatCountFits(args: { bpm: number; speechMs: number | null }): boolean {
  const { bpm, speechMs } = args;
  if (speechMs === null) return true;
  if (!Number.isFinite(bpm) || bpm <= 0) return false;
  const beatMs = 60000 / bpm;
  return speechMs <= beatMs * 0.7;
}

/**
 * What to say when the band hands the bars over, or takes them back.
 *
 * Only on the CHANGE, which is why this takes both states: "your four" said
 * on every bar of your four is not a cue, it is a heckle. The words are the
 * ones already on the screen (`TradeCue` draws the same two), so what you hear
 * and what you see are one string.
 */
export function tradeCue(args: {
  previous: "full" | "hatsOnly" | "silent" | null;
  current: "full" | "hatsOnly" | "silent";
}): JamCue | null {
  const { previous, current } = args;
  if (previous === null || previous === current) return null;
  if (current === "full") return { key: "jam.cue.back" };
  if (previous === "full") return { key: current === "silent" ? "jam.cue.silent" : "jam.cue.yours" };
  return null;
}

/**
 * The section you have just walked into, when it has a name.
 *
 * Only AABA names its sections (`formSectionNames`), and only the FIRST bar of
 * one is a moment worth talking over. An unnamed section says nothing rather
 * than saying "section" — the seam is on the timeline, and a voice that
 * announced every four bars of a blues would be the first thing anybody turned
 * off.
 */
export function sectionCue(args: {
  /** 0-based bar within the chorus. */
  bar: number;
  /** The 0-based bar each section starts on. */
  starts: readonly number[];
  /** What each section is called, "" for the unnamed ones. */
  names: readonly string[];
}): JamCue | null {
  const { bar, starts, names } = args;
  const at = starts.indexOf(bar);
  if (at === -1) return null;
  const name = names[at];
  if (!name) return null;
  return { key: "jam.form.section", params: { name } };
}
