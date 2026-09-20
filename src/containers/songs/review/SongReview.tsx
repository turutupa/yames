/**
 * You stopped, and the coach says one thing.
 *
 * `COACH_UX.md` A4: the single most useful finding, in a sentence a teacher
 * would say, with the fix as a button. Everything else is there if you open
 * it, and is **never** pushed. A3 is the other half of that — nothing appears
 * here until the transport stops, and it goes away again the moment you start.
 *
 * ## It is the same blocks the model would have chosen
 *
 * The headline is a `CoachAnswer`, resolved by `resolve.ts` and drawn by
 * `CoachBlocks` — the same renderer, the same catalogue, the same drop rules
 * (D3 rule 3). There is no model in any of it: `findings.rs` decided, and
 * `verdict.ts` narrated by template. When one is loaded the coach will say
 * the same thing in different words and this file will not change.
 *
 * ## The two things drawn that are not blocks
 *
 * The coloured tab of the whole pass, and the pass stepper over it. They are
 * the review, not the answer — the answer POINTS at bars, and what is pointed
 * at is the excerpt inside the `tabExcerpt` block. The full-pass tab is here
 * because a player wants to see the whole thing they just played, and no
 * block in the catalogue means that.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CoachBlocks, resolveCoachAnswer } from "../../../coach/blocks";
import type { CoachAction, CoachBlockContext, TabExcerptSlotProps } from "../../../coach/blocks";
import { createShuffleState } from "../../../coach/templates";
import { ReviewTab } from "./ReviewTab";
import { passesIn } from "./marks";
import type { SongAttemptReview } from "./useSongAttempt";
import { blocksFor } from "../../../songs/verdict";
import { printedBarNumber } from "../../../songs/position";
import type { Finding, NoteVerdict } from "../../../songs/types";
import "../../../styles/songs-review.css";


export type SongReviewProps = {
  review: SongAttemptReview;
  /** What the ear said about the notes, when a take was listened to. */
  pitch?: readonly NoteVerdict[];
  /**
   * Load the bars and the tempo a fix names, ready to play.
   *
   * The finding travels with the action because the two say different things
   * about the same fix: a `CoachAction` carries what a BUTTON needs — bars
   * counted from 1, a tempo in BPM — and the host needs what the TRANSPORT
   * takes, which is played-bar indices and a percentage. Both are on the
   * finding's `Fix`, and nothing has to be converted back.
   */
  onAction: (action: CoachAction, finding: Finding) => void;
  onDismiss: () => void;
  /** How this passage has gone before, for the `progress` block (C3). */
  progressFor?: CoachBlockContext["progressFor"];
};

export function SongReview({ review, pitch, onAction, onDismiss, progressFor }: SongReviewProps) {
  const { t } = useTranslation();
  const { score, schedule, facts, bands, findings, range } = review;

  const passes = useMemo(() => passesIn(facts.results, facts.extras), [facts]);
  const [pass, setPass] = useState(() => passes[passes.length - 1]);
  // The last go is the one you have in your hands. A new attempt starts there
  // again rather than on whichever go you were reading a minute ago.
  useEffect(() => {
    setPass(passes[passes.length - 1]);
  }, [review.attemptId, passes]);

  /**
   * The bag that stops the coach repeating itself.
   *
   * One per mounted review screen rather than one per finding: the point of
   * the bag is variety ACROSS sentences, and a bag made fresh for each one
   * would draw the same first variant every time. Held in a ref so a re-render
   * — stepping through the passes, say — does not reshuffle mid-read.
   */
  const bag = useRef(createShuffleState());

  const headline = findings[0] ?? null;
  const rest = findings.slice(1);
  const [showRest, setShowRest] = useState(false);
  useEffect(() => {
    setShowRest(false);
  }, [review.attemptId]);

  /**
   * What the blocks are allowed to point at.
   *
   * One song and one attempt, because that is what this review is about, and
   * the attempt is named by its OWN id — the UUID the store gave it. The
   * catalogue used to number attempts from one on the strength of a comment
   * saying the store numbered its rows, which it never did; a block naming
   * any other id resolves to nothing, which is correct, and one naming this
   * id now resolves against the row that is actually on disk.
   *
   * `printedBars` is what the page calls each played bar. It travels on the
   * score so the renderer can show printed numbers while the blocks and the
   * transport go on working in played ones — a song whose first eight bars
   * repeat otherwise has a heading and a sentence pointing at two different
   * bar 9s.
   */
  const context = useMemo<CoachBlockContext>(
    () => ({
      scores: [
        {
          id: review.scoreId,
          title: score.title,
          bars: score.bars.length,
          printedBars: score.bars.map((bar) => bar.printedBar + 1),
        },
      ],
      attempts: [
        {
          id: review.attemptId,
          scoreId: review.scoreId,
          playedAt: new Date(review.startedAt).toISOString(),
        },
      ],
      ...(progressFor ? { progressFor } : {}),
    }),
    [review.scoreId, review.attemptId, review.startedAt, score, progressFor],
  );

  /** The `tabExcerpt` slot's real component, at last (`slots.tsx`). */
  const TabExcerpt = useCallback(
    (props: TabExcerptSlotProps) => (
      <ReviewTab
        score={score}
        scheduleRange={range}
        schedule={schedule}
        // A block's bars are played bars counted from 1; a range is counted
        // from 0. The block was built from this very finding, so the range is
        // always inside the pass.
        showRange={{ startBar: props.fromBar - 1, endBar: props.toBar - 1 }}
        results={facts.results}
        extras={facts.extras}
        bands={bands}
        pass={pass}
        pitch={pitch}
        className="songs-review-excerpt"
      />
    ),
    [score, range, schedule, facts, bands, pass, pitch],
  );

  const answer = useMemo(() => {
    if (!headline) return null;
    return resolveCoachAnswer(
      {
        blocks: blocksFor(
          t,
          headline,
          score,
          {
            scoreId: review.scoreId || null,
            attemptId: review.attemptId,
            withProgress: progressFor !== undefined,
          },
          bag.current,
        ),
      },
      context,
    );
    // `t` is stable per language and the bag is a ref; re-resolving on every
    // render would draw a different variant of the same sentence each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headline, score, review.scoreId, context, progressFor, t]);

  const others = useMemo(
    () =>
      rest.map((finding) => ({
        finding,
        answer: resolveCoachAnswer(
          {
            blocks: blocksFor(
              t,
              finding,
              score,
              { scoreId: review.scoreId || null, attemptId: review.attemptId },
              bag.current,
            ),
          },
          context,
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest, score, review.scoreId, context, t],
  );

  /**
   * Every button, back to the host with the finding that produced it.
   *
   * One handler per answer rather than one for the screen: `CoachBlocks`
   * hands back the action and nothing else, which is right — it is a renderer
   * and knows nothing about findings — so the finding is closed over at the
   * point the blocks were built.
   */
  const handlerFor = useCallback(
    (finding: Finding) => (action: CoachAction) => {
      onAction(action, finding);
    },
    [onAction],
  );

  /**
   * The honesty line (`COACH_UX.md` B2), said once and only when it applies.
   *
   * A chord is several notes at one tick and the tracker is monophonic, so
   * the review knows when a chord was on time and never which notes were in
   * it. That is worth one sentence where it matters, and worth nothing at all
   * on a passage of single notes — a coach that apologises for a limit that
   * did not bite is a coach nobody reads.
   */
  const hasChords = useMemo(
    () => schedule.onsets.some((onset) => onset.noteIds.length > 1),
    [schedule],
  );

  const bars = `${String(printedBarNumber(score, range.startBar))}–${String(printedBarNumber(score, range.endBar))}`;

  return (
    <section className="songs-review" data-testid="songs-review" aria-label={t("songs.review.title")}>
      <header className="songs-review-head">
        <div className="songs-review-titles">
          <h3 className="songs-review-title">{t("songs.review.title")}</h3>
          <p className="songs-review-sub">
            {t("songs.review.summary", {
              bars,
              percent: review.tempoPercent,
              hits: facts.hits,
              of: facts.scoredOnsets,
            })}
          </p>
        </div>
        <button type="button" className="songs-btn" onClick={onDismiss}>
          {t("songs.review.again")}
        </button>
      </header>

      {answer && headline && answer.blocks.length > 0 && (
        <CoachBlocks
          blocks={answer.blocks}
          onAction={handlerFor(headline)}
          slots={{ tabExcerpt: TabExcerpt }}
          className="songs-review-answer"
        />
      )}

      {!headline && <p className="songs-review-quiet">{t("songs.review.nothingToSay")}</p>}

      {passes.length > 1 && (
        <div className="songs-review-passes" role="group" aria-label={t("songs.review.passes")}>
          {passes.map((n) => (
            <button
              key={n}
              type="button"
              className="songs-chip"
              data-active={n === pass ? "" : undefined}
              aria-pressed={n === pass}
              onClick={() => setPass(n)}
            >
              {t("songs.review.pass", { n: n + 1 })}
            </button>
          ))}
        </div>
      )}

      <ReviewTab
        score={score}
        scheduleRange={range}
        schedule={schedule}
        results={facts.results}
        extras={facts.extras}
        bands={bands}
        pass={pass}
        pitch={pitch}
      />

      <ul className="songs-review-key">
        {(["onTime", "slightlyEarly", "early", "slightlyLate", "late", "missed", "notAssessed"] as const).map(
          (mark) => (
            <li key={mark} className="songs-review-key-item" data-mark={mark}>
              <span className="songs-review-key-mark">{t(`songs.review.mark.${mark}`)}</span>
            </li>
          ),
        )}
      </ul>

      {hasChords && <p className="songs-review-honest">{t("songs.review.chordsHonesty")}</p>}
      {!review.saved && <p className="songs-review-honest">{t("songs.review.notSaved")}</p>}

      {rest.length > 0 && (
        <div className="songs-review-more">
          <button
            type="button"
            className="songs-link"
            aria-expanded={showRest}
            onClick={() => setShowRest((open) => !open)}
          >
            {showRest ? t("songs.review.lessLabel") : t("songs.review.moreLabel", { count: rest.length })}
          </button>
          {showRest && (
            <div className="songs-review-others">
              {others.map((other, i) =>
                other.answer.blocks.length === 0 ? null : (
                  <CoachBlocks
                    key={i}
                    blocks={other.answer.blocks}
                    onAction={handlerFor(other.finding)}
                    slots={{ tabExcerpt: TabExcerpt }}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default SongReview;
