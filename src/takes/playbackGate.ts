/**
 * Whose ending is this? (card #53)
 *
 * `take-playback-ended` carries the engine's generation for the playback
 * that ran off its end, and `play_take` answers with the generation of the
 * playback it started. The engine already drops endings of anything but the
 * take in its slot, but one it has ALREADY sent can still be in the event
 * queue when the screen starts another take: take A ends, the player presses
 * play on B in the same moment, and A's ending arrives after B's row lit.
 * Believed, it put B's row out while B played on.
 *
 * So a takes list asks this before it clears its row. It holds no React
 * state: the row is the hook's, this only says whether an ending is its.
 *
 * An ending with no generation (an engine or a mock that names none) is
 * believed, as before.
 */
export interface PlaybackGate {
  /** Play was pressed. The token is for `started`, when `play_take` answers. */
  starting(): number;
  /**
   * `play_take` answered. False when that playback's ending has already
   * arrived (a take shorter than the round trip): the row goes out now.
   */
  started(token: number, generation: number | null | undefined): boolean;
  /**
   * `play_take` refused. False when that play has since been replaced or
   * stopped, so the failure is not the lit row's.
   */
  failed(token: number): boolean;
  /** Stopped by hand: nothing of ours is playing. */
  stopped(): void;
  /** An ending arrived. True when it ends the playback the row is lit for. */
  ended(generation?: number): boolean;
}

export function createPlaybackGate(): PlaybackGate {
  /** The last play asked for. */
  let latest = 0;
  /** Asked for, and `play_take` has not answered yet. */
  let waiting = false;
  /** Its generation, once answered; null when nothing names it. */
  let known: number | null = null;
  /** Endings that arrived while waiting: one of them may be ours. */
  const early = new Set<number>();

  return {
    starting() {
      latest += 1;
      waiting = true;
      known = null;
      early.clear();
      return latest;
    },
    started(token, generation) {
      // An answer for a play that has since been replaced or stopped.
      if (token !== latest || !waiting) return true;
      waiting = false;
      const ended = typeof generation === "number" && early.has(generation);
      early.clear();
      known = typeof generation === "number" && !ended ? generation : null;
      return !ended;
    },
    failed(token) {
      if (token !== latest) return false;
      this.stopped();
      return true;
    },
    stopped() {
      latest += 1;
      waiting = false;
      known = null;
      early.clear();
    },
    ended(generation) {
      if (typeof generation !== "number") return true;
      if (waiting) {
        // Not known yet whose it is: the answer settles it.
        early.add(generation);
        return false;
      }
      if (known === null) return true;
      if (generation !== known) return false;
      known = null;
      return true;
    },
  };
}
