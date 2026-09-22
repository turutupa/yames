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
 *
 * ## Where it appears, and how it goes away (2026-09-20, W18)
 *
 * It arrives where the player was already looking: it takes the tab's place
 * inside the same frame, rather than under it. It used to be drawn below the
 * stage controls and the takes shelf, which at 1400×900 put its first line
 * 175 px past the bottom of the window — so a player who stopped saw nothing
 * happen at all.
 *
 * The frame is the host's (`SongsView`). What is this file's is the three ways
 * out of it and where the eye and the caret go:
 *
 * - **Out**: the button, Escape, or simply pressing play — the host's
 *   `onDismiss`, the key handler here, and `useSongAttempt` clearing the
 *   review on the transport's rising edge.
 * - **Focus** moves to the heading when it opens, so a screen reader is told
 *   what appeared and the keyboard starts inside the thing that just arrived;
 *   the host puts focus back on Play when it closes.
 * - **Reduced motion**: the entrance is a stylesheet animation and
 *   `songs.css` turns it off under `prefers-reduced-motion`. Nothing here
 *   animates in JavaScript, which is what makes that possible.
 *
 * ## The one thing is PINNED, and the rest scrolls (2026-09-20, W25)
 *
 * A4 says the verdict is one sentence with its fix as a button. That was true
 * of the words and not of the screen: the sentence was the first of the
 * headline's blocks inside the body, under the picture — so at the smallest
 * window the app opens (480×780) the player saw a sliver of their own hands
 * and had to scroll to find out what the coach had said.
 *
 * So the headline answer is split where A4 splits it. The `text` and the
 * `action` — what a teacher SAYS and what they hand you to press — go in the
 * pinned head. The bars it is about, the tape and the picture stay in the
 * body, which is A4's "everything else is there if you open it". Both halves
 * are drawn by `CoachBlocks` from the same resolved answer, so there is still
 * one renderer and one catalogue, and a model that one day writes the answer
 * changes neither half.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CoachBlocks, resolveCoachAnswer } from "../../../coach/blocks";
import type {
  CoachAction,
  CoachBlockContext,
  CompareSlotProps,
  TabExcerptSlotProps,
  TakeSlotProps,
} from "../../../coach/blocks";
// W21 — the picture, when the pass was filmed. Lazy inside the review's own
// chunk: a review with sound alone must not pay for a video player.
import { TakeVideoView } from "../camera/TakeVideoView";
import type { ReviewTakeVideo } from "../camera/TakeVideoView";
// W25 — "Save as a video" (`plans/ECHORA.md` D4). In the review's chunk with
// everything else here: a player who never stops a pass never downloads a
// canvas compositor.
import { SaveAsVideo } from "../../../takes/SaveAsVideo";
// W25 — then and now (addendum 11). Same chunk, same reason.
import { CompareTakes } from "../camera/CompareTakes";
import type { SongCompare } from "./useSongCompare";
import { buildTape } from "../../../songs/camera/tape";
import { songStrip, songWindowMs } from "../../../songs/camera/songStrip";
// W31 — the tab itself, scrolling under a playhead, which is what the owner
// asked a shared clip to show. Third renderer behind the compositor's seam.
import { tabStrip } from "../../../takes/tabPainter";
import { buildTabTape } from "../../../takes/tabTape";
import { blankStrip } from "../../../takes/clipStrip";
import type { ClipBandChoice } from "../../../takes/clipStrip";
import { CLIP_BAND_KEY } from "../../../takes/keys";
import { storeLoad, storeSave } from "../../../ipc";
import { captionAt, clipSpan } from "../../../songs/camera/songClip";
import { createShuffleState } from "../../../coach/templates";
import { ReviewTab } from "./ReviewTab";
import { passesIn } from "./marks";
import type { SongAttemptReview } from "./useSongAttempt";
import { blocksFor } from "../../../songs/verdict";
import { beatAtMs, passLengthMs } from "../../../takes/offset";
import { rangeTempoSteps } from "../../../songs/schedule";
import type { BarRange } from "../../../songs/schedule";
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
  /**
   * W21 — the recording of this pass, when there was one.
   *
   * `videoPath` is what says whether the camera was on. With it null the
   * watching half of this screen is not drawn at all and the review is
   * exactly what it was before the camera existed, which is A9's condition —
   * but the take is still a take, and W25's "Save as a video" makes a clip
   * out of it: the excerpt and the marks over a plain ground.
   *
   * Absent altogether is a pass that was not recorded, and then neither half
   * appears.
   */
  video?: ReviewTakeVideo;
  /**
   * W25 — an older recording of these bars, and this one, ready to play side
   * by side (addendum 11, `plans/ECHORA.md` A2).
   *
   * `undefined` is the normal case and stays the normal case: it needs two
   * kept recordings of the same passage, which a player only has after coming
   * back to something. `useSongCompare` is what decides there is a pair;
   * `blocksFor` only emits the block when there is one and the coach has just
   * said the passage improved.
   */
  compare?: SongCompare;
};

export function SongReview({
  review,
  pitch,
  onAction,
  onDismiss,
  progressFor,
  video,
  compare,
}: SongReviewProps) {
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

  /**
   * W21 — where the tape is, in transport milliseconds, or null when nothing
   * is playing. One number, held here, so the excerpt and the coach's own
   * clip are reading the same clock.
   */
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const clock = useMemo(
    () => ({
      steps: rangeTempoSteps(score, range, review.tempoPercent),
      passMs: passLengthMs(score, range, review.tempoPercent),
    }),
    [score, range, review.tempoPercent],
  );
  /** ...as a beat of the schedule, which is what the excerpt marks by. */
  const playheadBeat = useMemo(() => {
    if (playheadMs === null) return null;
    const within = clock.passMs > 0 ? playheadMs % clock.passMs : playheadMs;
    return beatAtMs(clock.steps, within);
  }, [playheadMs, clock]);

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
        // W25 — and the older run of these bars, when there is one, so a
        // `compare` block naming it resolves rather than being dropped as
        // "no attempt numbered …".
        ...(compare
          ? [
              {
                id: compare.older.attemptId,
                scoreId: review.scoreId,
                playedAt: new Date(compare.older.startedAt).toISOString(),
              },
            ]
          : []),
      ],
      ...(progressFor ? { progressFor } : {}),
    }),
    [review.scoreId, review.attemptId, review.startedAt, score, progressFor, compare],
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
        playheadBeat={playheadBeat}
        className="songs-review-excerpt"
      />
    ),
    [score, range, schedule, facts, bands, pass, pitch, playheadBeat],
  );

  /**
   * W21 — what the coach's "Watch it" is pointing at, and how many times it
   * has been pressed.
   *
   * The nonce IS the press: the same finding pressed twice has to rewind and
   * play again, and a value that did not change would do nothing the second
   * time.
   */
  const [watch, setWatch] = useState<{ bars: BarRange | null; nonce: number } | null>(null);
  useEffect(() => {
    setWatch(null);
  }, [review.attemptId]);

  /**
   * W25 — the pass laid out in time, built once here.
   *
   * Two things read it now: the tape under the picture, and the clip the
   * player saves out of it. One `buildTape` and one object, so the marks on a
   * shared clip are the same marks that are on the screen it was made from —
   * not a second, equal, computation that a later change could make unequal.
   */
  const tape = useMemo(
    () =>
      buildTape({
        score,
        schedule,
        range,
        tempoPercent: review.tempoPercent,
        results: facts.results,
        extras: facts.extras,
        bands,
      }),
    [score, schedule, range, review.tempoPercent, facts, bands],
  );

  /** "Save as a video" wants the take to itself while it plays it through. */
  const [pauseNonce, setPauseNonce] = useState(0);

  /**
   * W31 — what a saved clip carries under the picture.
   *
   * The TAB by default: the owner asked for "the notes it's playing so its
   * kinda in sync", and a scrolling tab is what every play-along video on the
   * internet is. The dots stay as a choice because they are what a shared
   * clip looked like until now, and "nothing" because a player showing a
   * friend how a passage sounds does not always want it marked.
   */
  const [clipBand, setClipBand] = useState<ClipBandChoice>("tab");
  useEffect(() => {
    let alive = true;
    void storeLoad<ClipBandChoice>(CLIP_BAND_KEY)
      .then((saved) => {
        if (alive && (saved === "tab" || saved === "marks" || saved === "none")) setClipBand(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const chooseClipBand = useCallback((next: ClipBandChoice) => {
    setClipBand(next);
    void storeSave(CLIP_BAND_KEY, next).catch(() => {});
  }, []);

  /**
   * The tab of this attempt, laid out in time.
   *
   * Built from the same `tape` the review is drawn from, so a clip's colours
   * are the screen's colours rather than a second judgement of the same pass.
   * Only when the tab is what the player has asked for: an attempt at a long
   * piece is a few thousand notes, and nobody should pay for them to pick
   * "Nothing".
   */
  const tabTape = useMemo(
    () =>
      clipBand === "tab"
        ? buildTabTape({ score, schedule, tape, range, tempoPercent: review.tempoPercent })
        : null,
    [clipBand, score, schedule, tape, range, review.tempoPercent],
  );

  /** What scrolls across the clip, for the answer the player chose. */
  const clipStrip = useMemo(() => {
    const args = { tape, score, range, tempoPercent: review.tempoPercent };
    if (clipBand === "none") {
      return blankStrip((nowMs) => captionAt(tape, score, range, review.tempoPercent, nowMs));
    }
    if (clipBand === "tab" && tabTape) return tabStrip({ ...args, tab: tabTape });
    return songStrip(args);
  }, [clipBand, tabTape, tape, score, range, review.tempoPercent]);

  /**
   * Which bars a clip starts out being of.
   *
   * The ones the coach has just pointed at, when it pointed at any — a player
   * saving a clip a moment after being told about bars 17–20 means those
   * bars, and "the whole take" is one press away. With no headline, or a
   * finding about the passage as a whole, it is the whole attempt.
   */
  const clipBars = useMemo<BarRange | null>(() => {
    const at = headline?.bars;
    if (!at) return null;
    return { startBar: at[0], endBar: at[1] };
  }, [headline]);

  /**
   * W21 — the `take` slot's real component (`slots.tsx`), at last.
   *
   * A BUTTON, and not a second video pane. The catalogue's `take` block means
   * "play these bars of that take", and the tempting reading is to draw a
   * player wherever it appears — but a review that has a picture already has
   * one, at the top of this panel, and two transports on one screen is two
   * things a person has to keep in step by hand. So the block POINTS the
   * player that is already there: the finding's bars, looped, at seventy per
   * cent — the same number every "slow it down" fix in `useSongActions` uses.
   * A teacher rewinding to the spot, rather than opening a second television.
   *
   * With no picture it draws nothing, which is exactly what `resolve.ts` does
   * with a reference to something that is not there.
   */
  const TakeSlot = useCallback(
    (props: TakeSlotProps) => {
      // No picture, no player to point at: "Watch it" is a button that moves
      // the tape, and with sound alone there is no tape on screen to move.
      if (!video || video.videoPath === null) return null;
      const bars =
        props.fromBar !== null && props.toBar !== null
          ? { startBar: props.fromBar - 1, endBar: props.toBar - 1 }
          : null;
      return (
        <button
          type="button"
          className="songs-btn songs-review-watch"
          onClick={() => setWatch((current) => ({ bars, nonce: (current?.nonce ?? 0) + 1 }))}
        >
          {t("songs.camera.watchIt")}
        </button>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [video],
  );

  /**
   * W25 — the `compare` slot's real component, at last (`slots.tsx`).
   *
   * The block carries two attempt IDS and nothing else (D3 rule 1: blocks
   * carry references, never content), so this is where they become two
   * passes: the host has already fetched them, and the ids are matched rather
   * than assumed in order — an answer that named them the other way round
   * would otherwise play tonight against March labelled "then".
   */
  const CompareSlot = useCallback(
    (props: CompareSlotProps) => {
      if (!compare) return null;
      const byId = (id: string) =>
        compare.older.attemptId === id
          ? compare.older
          : compare.newer.attemptId === id
            ? compare.newer
            : null;
      const older = byId(props.older.id);
      const newer = byId(props.newer.id);
      if (!older || !newer || older === newer) return null;
      return <CompareTakes older={older} newer={newer} score={score} />;
    },
    [compare, score],
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
            withTake: video?.videoPath != null,
            // W25 — and, on an `improved` finding, the older run of these
            // bars to hold this one against. Only the headline gets it: one
            // then-and-now is the evidence, two is a slideshow.
            ...(compare ? { olderAttemptId: compare.older.attemptId } : {}),
          },
          bag.current,
        ),
      },
      context,
    );
    // `t` is stable per language and the bag is a ref; re-resolving on every
    // render would draw a different variant of the same sentence each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headline, score, review.scoreId, context, progressFor, video, compare, t]);

  /**
   * The headline, split where A4 splits it.
   *
   * `said` is the sentence and the button — the verdict, pinned in the head.
   * `shown` is everything the sentence POINTS at: the bars, the excerpt, the
   * tape button, the progress line. They are one resolved answer and one
   * renderer; only the box they are drawn in differs, and the order inside
   * each half is the order `blocksFor` chose.
   *
   * A `filter` rather than a second resolve: re-resolving would draw a
   * different variant of the same sentence, and the bag exists to stop that.
   */
  const said = useMemo(
    () => (answer?.blocks ?? []).filter((b) => b.type === "text" || b.type === "action"),
    [answer],
  );
  const shown = useMemo(
    () => (answer?.blocks ?? []).filter((b) => b.type !== "text" && b.type !== "action"),
    [answer],
  );

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
              {
                scoreId: review.scoreId || null,
                attemptId: review.attemptId,
                // W21 — the other findings point at the tape as well, so
                // "what else" is also something you can watch rather than
                // only read about.
                withTake: video?.videoPath != null,
              },
              bag.current,
            ),
          },
          context,
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest, score, review.scoreId, context, video, t],
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

  /**
   * The heading takes the caret when the verdict arrives.
   *
   * `tabIndex={-1}` so it can be focused without joining the tab order, and
   * `preventScroll` because the review is already the whole frame — there is
   * nothing to scroll it into, and asking the browser to try scrolls the tab
   * underneath instead.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [review.attemptId]);

  /** Escape puts it away, the way every sheet in this app closes. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <section className="songs-review" data-testid="songs-review" aria-label={t("songs.review.title")}>
      <header className="songs-review-head">
        <div className="songs-review-titles">
          <h3 className="songs-review-title" tabIndex={-1} ref={headingRef}>
            {t("songs.review.title")}
          </h3>
          <p className="songs-review-sub">
            {t("songs.review.summary", {
              bars,
              percent: review.tempoPercent,
              hits: facts.hits,
              of: facts.scoredOnsets,
            })}
          </p>
        </div>
        {/* What the button does is go back to the tab; "Go again" was what it
            meant when the tab was still on screen above it and the press was
            only clearing a panel. It is the review's one action and it says
            where you land. */}
        <button type="button" className="songs-btn songs-review-back" onClick={onDismiss}>
          {t("songs.stage.backToTab")}
        </button>

        {/* The one thing, and the thing to press (A4/A5), on a row of their
            own inside the pinned head. On screen at every window height the
            app opens — which is what it means for the coach to have said it. */}
        {headline && said.length > 0 && (
          <CoachBlocks
            blocks={said}
            onAction={handlerFor(headline)}
            className="songs-review-said"
          />
        )}
      </header>

      {/* The head is pinned and the rest scrolls under it.

          The sentence and the button are the verdict (A4); the coloured tab,
          the goes and "what else" are what you look at afterwards. Pinning the
          head is what makes "the heading and its action are on screen without
          scrolling" true at every window height, rather than true at 900 and a
          scroll away at 720. */}
      <div className="songs-review-body">
      {/* W21 — the pass as it happened, with the verdict painted on the tape
          under it. FIRST in the body, because it is the thing the player came
          back for (`plans/ECHORA.md` E0.7) and a reward you have to scroll to
          is not one — and because the coach's sentence is pinned in the head
          above it, so A4 still has the first word. The coach's "Watch it"
          points this player rather than opening a second. With no picture none
          of it exists and the panel is exactly what it was. */}
      {video && video.videoPath !== null && (
        <TakeVideoView
          review={review}
          take={video}
          tape={tape}
          loopBars={watch?.bars ?? null}
          watchNonce={watch?.nonce ?? 0}
          pauseNonce={pauseNonce}
          pass={pass}
          onPass={setPass}
          onPosition={setPlayheadMs}
        />
      )}

      {/* W25 — a take you can send to somebody (`plans/ECHORA.md` D4). Under
          the picture where there is one, and on its own where there is not:
          a player with no camera still gets a clip, which is the excerpt and
          the marks over a plain ground. Nothing is uploaded — they save a
          file and decide where it goes. */}
      {video && (
        <SaveAsVideo
          // What scrolls across the clip: the tab, the dots or nothing (W30
          // lifted this behind an interface so a jam can put its bar grid
          // there instead; W31 made the tab the third thing behind it).
          strip={clipStrip}
          windowMs={songWindowMs(score, range, review.tempoPercent)}
          band={{ value: clipBand, onChange: chooseClipBand }}
          spanFor={(wholeTake) =>
            clipSpan({
              tape,
              score,
              range,
              tempoPercent: review.tempoPercent,
              bars: wholeTake ? null : (watch?.bars ?? clipBars),
              pass: wholeTake ? null : pass,
            })
          }
          canChooseBars={Boolean(watch?.bars ?? clipBars)}
          mixSrc={video.path}
          videoSrc={video.videoPath}
          startOffsetMs={video.startOffsetMs ?? 0}
          videoOffsetMs={video.videoOffsetMs ?? 0}
          title={score.title}
          onBeforeSave={() => setPauseNonce((n) => n + 1)}
        />
      )}

      {/* What the sentence in the head is pointing AT. The sentence and its
          button are up there; these are the bars, and the way to watch them. */}
      {headline && shown.length > 0 && (
        <CoachBlocks
          blocks={shown}
          onAction={handlerFor(headline)}
          slots={{ tabExcerpt: TabExcerpt, take: TakeSlot, compare: CompareSlot }}
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
        playheadBeat={playheadBeat}
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
                    slots={{ tabExcerpt: TabExcerpt, take: TakeSlot, compare: CompareSlot }}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </section>
  );
}

export default SongReview;
