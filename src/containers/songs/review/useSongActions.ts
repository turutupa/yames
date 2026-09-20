/**
 * The buttons, wired to what the app does (`COACH_UX.md` A5).
 *
 * "Guidance nobody can act on is commentary": every correction the coach
 * makes resolves to something set up in one tap. The catalogue's side of that
 * is `coach/blocks/actions.ts`, which routes an action to a host; this is the
 * Songs host. Four of the six mean something here.
 *
 * | action | what happens |
 * |---|---|
 * | `loopBars` | the range, the repeat and the tempo percentage are set, and the transport is left ready to press |
 * | `ramp` | the same, at the LOWER percentage, and a climb is armed — see below |
 * | `clickSubdivision` | straight through to the engine, the way every other door to that setting goes |
 * | `comeBack` | a promise written down, and a quiet mark on the song in the library |
 *
 * **Nothing here presses play** (U4.3: the coach never acts on its own). The
 * screen is set up and the player starts it.
 *
 * ## The ramp is by pass, in the frontend, on purpose
 *
 * The engine has a speed ramp and it climbs by BARS, against the metronome's
 * own tempo, with no idea what a song is. A climb through a passage of a song
 * has to advance when the PASS was clean, not when eight bars went by — a
 * player who is still missing bar 19 must not be moved to 90 % because time
 * passed. So the step lives here, keyed to the review: a pass with no
 * correction in it moves the percentage up one step, anything else leaves it
 * where it is, and reaching the top disarms the climb. When the engine grows
 * a ramp that understands a score, this hook is what it replaces.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { setSubdivision } from "../../../ipc";
import type { Subdivision } from "../../../types";
import type { CoachAction } from "../../../coach/blocks";
import { comeBackDays, rangeForFix, tempoPercentForFix } from "../../../songs/verdict";
import { dayOf, promiseToComeBack } from "../../../songs/due";
import { announceSongsDue } from "./useSongsDue";
import type { BarRange } from "../../../songs/schedule";
import type { Finding } from "../../../songs/types";
import type { SongAttemptReview } from "./useSongAttempt";

/** How far a frontend ramp climbs per clean pass. `findings.rs`'s own step. */
export const RAMP_STEP_PERCENT = 10;

export type SongActionsInput = {
  /** Null when the song is not in the library — nothing can be promised. */
  scoreId: string | null;
  setRange: (range: BarRange) => void;
  setLoop: (loop: boolean) => void;
  setTempoPercent: (percent: number) => void;
  /** The finished review, so a clean pass can move a ramp on. */
  review: SongAttemptReview | null;
};

/** A climb the player armed, or null. */
export type SongRamp = { fromPercent: number; toPercent: number; range: BarRange } | null;

export type SongActions = {
  /** Hand this to `SongReview`. */
  run: (action: CoachAction, finding: Finding) => void;
  ramp: SongRamp;
  /** The song ids with something promised and due. */
  due: Set<string>;
};

export function useSongActions(input: SongActionsInput): SongActions {
  const [ramp, setRamp] = useState<SongRamp>(null);
  const [due, setDue] = useState<Set<string>>(() => new Set());

  const latest = useRef(input);
  latest.current = input;

  const run = useCallback((action: CoachAction, finding: Finding) => {
    const { scoreId, setRange, setLoop, setTempoPercent } = latest.current;
    const fix = finding.fix;

    switch (action.kind) {
      case "loopBars": {
        // The FINDING's bars, not the action's: a block counts bars from 1 so
        // the catalogue can check them against the song's length, and a range
        // counts from 0 because that is what the schedule and the cursor use.
        const range = rangeForFix(fix);
        if (range) setRange(range);
        setLoop(true);
        const percent = tempoPercentForFix(fix);
        if (percent !== null) setTempoPercent(percent);
        setRamp(null);
        return;
      }

      case "ramp": {
        const range = rangeForFix(fix) ?? latest.current.review?.range ?? null;
        if (range) setRange(range);
        setLoop(true);
        if (fix?.type !== "ramp") return;
        setTempoPercent(fix.fromPercent);
        // A climb that starts where it ends is not a climb.
        setRamp(
          fix.toPercent > fix.fromPercent && range
            ? { fromPercent: fix.fromPercent, toPercent: fix.toPercent, range }
            : null,
        );
        return;
      }

      case "clickSubdivision":
        void setSubdivision(action.subdivision as Subdivision);
        return;

      case "comeBack": {
        if (!scoreId) return;
        const range = rangeForFix(fix) ?? latest.current.review?.range;
        if (!range) return;
        void promiseToComeBack({
          scoreId,
          startBar: range.startBar,
          endBar: range.endBar,
          // The action carries an occasion and the fix carries the days.
          // `findings.rs` only ever asks for two or three, and both survive
          // the round trip (`verdict.ts`).
          dueDay: dayOf() + (fix?.type === "comeBack" ? fix.days : comeBackDays(action.when)),
        }).then((all) => {
          setDue(new Set(all.filter((d) => d.dueDay <= dayOf()).map((d) => d.scoreId)));
          // The rail is not below this screen and does not take a prop from
          // it; it reads the store when it is told something moved.
          announceSongsDue();
        });
        return;
      }

      // Nothing in Songs loads a preset or a jam. The catalogue carries them
      // because the coach is one voice in every mode; here they are not ours,
      // and the host says so by doing nothing rather than by guessing.
      case "loadPreset":
      case "loadJam":
        return;
    }
  }, []);

  /**
   * A clean pass moves the climb on.
   *
   * "Clean" is the judgement's own word for it: a review with no CORRECTION
   * in it. Praise is allowed and silence is allowed — a passage the rules
   * found nothing wrong with is a passage that held together. Anything else
   * and the tempo stays where it is, which is the whole difference between
   * this and a ramp that climbs on a timer.
   */
  const reviewId = input.review?.attemptId;
  useEffect(() => {
    const review = latest.current.review;
    const current = ramp;
    if (!review || !current) return;
    if (review.range.startBar !== current.range.startBar) return;
    if (review.range.endBar !== current.range.endBar) return;
    const clean = review.findings.every(
      (f) => f.kind === "improved" || f.kind === "clean",
    );
    if (!clean) return;
    const next = Math.min(current.toPercent, review.tempoPercent + RAMP_STEP_PERCENT);
    latest.current.setTempoPercent(next);
    if (next >= current.toPercent) setRamp(null);
    // Once per finished review, and only when one arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  return { run, ramp, due };
}
