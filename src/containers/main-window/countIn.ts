import { grooveById } from "../../jam";
import type { Jam } from "../../jam";
import type { AppState, Setlist } from "../../types";

/**
 * One count-in, four modes (2026-09-19).
 *
 * The switch is in the transport for every mode now. It used to be the
 * drill's, sitting in the drill's own block beside the ramp's Loop — and so
 * the metronome had none at all, the setlist kept a beat stepper in the
 * panel above its steps, and the jam's was a dropdown you had to open the
 * setup drawer to find. The owner: "I think we should always have this
 * option in the bottom bar, stays consistent across menus and user knows
 * where to find it, plus its not JAM or song specific, its something you may
 * expect from every mode."
 *
 * **One meaning wherever it is**: a bar counted at that mode's own meter,
 * once, before the first beat. Never between setlist steps or jam choruses —
 * "count in at the very beginning and that's it". The per-step count-ins in
 * the setlist's step editor are a different thing and are left alone: those
 * are the shape of the set, not how you start it.
 *
 * Each mode goes on storing it where it already did, and this module is the
 * only place that knows which is which. A count-in written onto a jam or a
 * setlist is part of that saved thing and stays part of it; the switch is
 * one place to reach four settings rather than a fifth copy of the state.
 *
 * **Songs joined on 2026-09-20 (W18).** It had shipped with two: three chips
 * on the stage AND this switch, which in Songs wrote the click's warm-up beats
 * — a setting `load_song` clears, so the one in the bottom bar did nothing at
 * all. Jam solved exactly this by dropping its own dropdown and letting the
 * transport write the jam's stored count-in; Songs does the same, writing the
 * song's `countInBars`. A song counts in BARS rather than beats because that
 * is what the engine's `load_song` takes, and the bar it counts is the bar the
 * chosen range is written in — a passage starting in 3/4 is counted in three.
 *
 * It is a module and not four lines inside `MainWindow` because it is real
 * logic — a meter to read, a ceiling to respect, four stores to tell apart —
 * and `MainWindow` is the one file in this app that no test can render.
 */

/**
 * Which mode's transport is on screen.
 *
 * Wider than the four that draw a transport, because the app's own view type
 * carries Settings too and narrowing it at the call site would mean a cast.
 * Anything that is not the jam or the setlist falls to the click's setting,
 * which is what Settings would want anyway if it ever grew a transport.
 */
export type CountInView = "beat" | "drill" | "setlist" | "jam" | "songs" | "settings";

/**
 * The engine counts at most eight beats (`arm_count_in` clamps to it, and so
 * does every caller). A bar of 12/8 therefore counts four rather than
 * twelve, which is what a drummer would count anyway.
 */
export const MAX_COUNT_IN_BEATS = 8;

export type CountInSubject = {
  view: CountInView;
  jam: Jam | null;
  setlist: Setlist | null;
  /**
   * The song on the stage, in BARS — `countInBars` off its mix setting.
   *
   * Bars and not beats because that is the unit the song engine takes:
   * `load_song` is told how many bars to count and works the meter out from
   * the score itself, which is the only thing that can, since a song may
   * change time signature between the bar you chose and the bar before it.
   */
  song?: { bars: number } | null;
  /** The engine's own state, for the metronome's meter and the drill's ramp. */
  state: Pick<AppState, "beatGroups" | "timeSignature" | "speedRamp">;
};

/** The beats in one bar of whatever this mode is playing. */
function beatsPerBar({ view, jam, setlist, state }: CountInSubject): number {
  if (view === "jam" && jam) return grooveById(jam.grooveId).beatsPerBar;
  // A setlist counts into its FIRST step, at that step's meter — the beats
  // have to be the ones you are about to play.
  if (view === "setlist" && setlist?.steps[0]) {
    const groups = setlist.steps[0].beatGroups;
    if (groups?.length) return groups.reduce((sum, n) => sum + n, 0);
  }
  if (state.beatGroups?.length) return state.beatGroups.reduce((sum, n) => sum + n, 0);
  return state.timeSignature;
}

/** How many beats the switch arms when it is turned on. Never zero. */
export function countInBeats(subject: CountInSubject): number {
  const bar = beatsPerBar(subject);
  return Math.min(MAX_COUNT_IN_BEATS, Math.max(1, Math.round(bar) || 4));
}

/** Whether this mode is currently set to count in. */
export function countInIsOn({ view, jam, setlist, song, state }: CountInSubject): boolean {
  if (view === "jam") return (jam?.countIn ?? 0) > 0;
  if (view === "setlist") return (setlist?.countIn ?? 0) > 0;
  if (view === "songs") return (song?.bars ?? 0) > 0;
  // The metronome and the drill are the same click and share the one setting
  // the drill has always kept.
  return state.speedRamp.warmupBeats > 0;
}

/**
 * What the switch should write, and where.
 *
 * Returned rather than done, so the caller owns the different ways of writing
 * it and this stays a function you can ask a question of. `beats` is beats
 * everywhere except Songs, whose store counts BARS — `store` says which, and
 * for `"songs"` the number is one bar or none.
 */
export function countInToggle(
  subject: CountInSubject,
): { store: "jam" | "setlist" | "songs" | "ramp"; beats: number } {
  if (subject.view === "songs") {
    return { store: "songs", beats: countInIsOn(subject) ? 0 : 1 };
  }
  const beats = countInIsOn(subject) ? 0 : countInBeats(subject);
  const store = subject.view === "jam" ? "jam" : subject.view === "setlist" ? "setlist" : "ramp";
  return { store, beats };
}
