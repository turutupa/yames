/**
 * The review — what Songs shows when you stop.
 *
 * Four doors, in the order a pass goes through them:
 *
 *   1. `useSongAttempt(...)` — play to stop, one attempt, a verdict.
 *   2. `useSongActions(...)` — the host the verdict's buttons go to.
 *   3. `<SongReview ... />` — the drawing.
 *   4. `useLiveNoteLights(...)` — the only thing that happens DURING a pass.
 *
 * `ReviewTab` is exported on its own because it is also the `tabExcerpt`
 * slot's component (`coach/blocks/slots.tsx`): the coach points at bars, and
 * this is what it points with, wherever it speaks.
 */
export { SongReview, default as SongReviewView } from "./SongReview";
export type { SongReviewProps } from "./SongReview";

export { ReviewTab } from "./ReviewTab";
export type { ReviewTabProps } from "./ReviewTab";

export { useSongAttempt } from "./useSongAttempt";
export type { Pass, SongAttemptInput, SongAttemptReview, SongAttemptState } from "./useSongAttempt";

export { useSongActions, RAMP_STEP_PERCENT } from "./useSongActions";
export type { SongActions, SongActionsInput, SongRamp } from "./useSongActions";

export {
  useLiveNoteLights,
  markFromFeedback,
  markFromOnset,
  onsetsInBeat,
} from "./useLiveNoteLights";
export type { LiveLights } from "./useLiveNoteLights";

export { useSongProgress } from "./useSongProgress";

export { useSongTakePitch, takePitchFor, startOffsetOf } from "./useSongTakePitch";
export type { SongTake } from "./useSongTakePitch";

export { useSongsDue, announceSongsDue, SONGS_DUE_EVENT } from "./useSongsDue";

export {
  MARK_GLYPH,
  MARK_TOKEN,
  accentMissed,
  markFor,
  noteNameOf,
  passesIn,
  pitchMarkFor,
} from "./marks";
export type { PitchMark, TimingMark } from "./marks";
