import { useTranslation } from "react-i18next";
import {
  barHasFill,
  formBars,
  formSectionNames,
  formSections,
  sectionRanges,
} from "../../jam/forms";
import type { BarRange } from "../../jam/forms";
import type { JamBandState, JamForm } from "../../jam/types";

interface FormTimelineProps {
  form: JamForm;
  /** A fill lands on the last bar of the chorus, so the timeline marks it. */
  fills: boolean;
  /** Also a fill every N bars within the chorus. 0 or absent: the end only. */
  fillEvery?: number;
  /** 0-based bar within the chorus, from the latest beat event. */
  formBar: number;
  /** 1-based chorus count. */
  chorus: number;
  /** Bar-local beat, for the progress line inside the lit cell. */
  beat: number;
  beatsPerBar: number;
  isPlaying: boolean;
  /**
   * The chord of each bar, already spelled and transposed, or null when the
   * jam is not showing chords. Exactly one entry per bar of the chorus.
   */
  chords?: (string | null)[] | null;
  /**
   * What the band will be doing on each bar of this chorus, worked out ahead
   * of the bar line by `bandStatesForChorus`. Drawn BEFORE it happens, which
   * is the whole point: a silence you can see coming is one you can count
   * into, and a silence that arrives unannounced is one you fall out of.
   *
   * These are phase-locked to the CHORUS, not to the loop: a loop does not
   * start a new chorus, so bar 6 of a looped section is still bar 6 and still
   * carries whatever the practice tools say bar 6 carries.
   */
  bandStates?: JamBandState[] | null;
  /** The bars the form is looping, inclusive, or null. */
  loop?: BarRange | null;
  /** A bar asked for that the form has not reached yet, or null. */
  pendingJump?: number | null;
  /** Click a bar to go there at the next bar line. Absent: cells are inert. */
  onJumpTo?: ((bar: number) => void) | null;
  /** Toggle the loop on a section. Absent: no loop affordance is drawn. */
  onToggleSectionLoop?: ((range: BarRange) => void) | null;
}

/** Two ranges are the same loop when both ends agree. */
function sameRange(a: BarRange | null | undefined, b: BarRange): boolean {
  return !!a && a.start === b.start && a.end === b.end;
}

/**
 * Where you are in the form, and where you are telling it to go.
 *
 * This is the headline of the whole mode (JAM_MODE §4.2): losing your place is
 * the number one bedroom improv problem, and no metronome addresses it. One
 * cell per bar, grouped into the form's sections, the current bar lit and
 * filling as the bar goes by.
 *
 * The grouping is what makes it readable — twelve cells in a row are twelve of
 * something, and three fours are a blues. The seam between sections does that
 * work; the letters are only drawn where they are the form's own name (AABA).
 *
 * At rest the first bar is marked rather than nothing: you are always about to
 * play bar one, and an unlit timeline reads as a picture rather than a
 * readout. The progress line is the part that waits for playback.
 *
 * ## Clicking it
 *
 * A cell is a button, because the timeline is the only place on the screen
 * that knows what bar 7 is. Clicking one asks the engine to be there at the
 * NEXT BAR LINE, never now — a form that jumped mid-bar would be a glitch
 * rather than a move, and the engine is the one holding the bar. So the cell
 * you asked for is marked as pending until a beat event arrives on it, and
 * while the transport is stopped the marker is the whole answer: the readout
 * says the take starts there.
 */
export function FormTimeline({
  form,
  fills,
  fillEvery = 0,
  formBar,
  chorus,
  beat,
  beatsPerBar,
  isPlaying,
  chords = null,
  bandStates = null,
  loop = null,
  pendingJump = null,
  onJumpTo = null,
  onToggleSectionLoop = null,
}: FormTimelineProps) {
  const { t } = useTranslation();
  const total = formBars(form);
  const sections = formSections(form);
  const ranges = sectionRanges(form);
  const names = formSectionNames(form);
  const current = isPlaying ? Math.min(Math.max(formBar, 0), total - 1) : 0;
  /** How far through the current bar, 0..1 — the lit cell's fill. */
  const through = isPlaying && beatsPerBar > 0 ? Math.min(1, (beat + 1) / beatsPerBar) : 0;
  /** The pending bar, only while it is a bar this form has. */
  const pending =
    pendingJump !== null && pendingJump >= 0 && pendingJump < total ? pendingJump : null;

  let bar = 0;
  return (
    <section className="jam-timeline-section" aria-label={t("jam.form.label")}>
      <div className="jam-timeline-head">
        {/* No FORM heading here: the cards above already carry one, and two of
            them on one screen made it look like two different settings. The
            row of numbered bars under the form cards needs no introduction —
            what it needs is the sentence.

            One sentence, live, so the place in the form is readable without
            counting cells, and so a screen reader gets it at all. */}
        <span className="jam-timeline-where" role="status">
          {t("jam.form.chorus", { count: chorus })}
          {" · "}
          {t("jam.form.barOf", { current: current + 1, total })}
          {chords?.[current] ? ` · ${chords[current]}` : ""}
          {/* Where the next press of play will start. Only while stopped: with
              the band running the pending cell says it, and the sentence has
              the bar you are ON to report. */}
          {!isPlaying && pending !== null
            ? ` · ${t("jam.form.startsAt", { bar: pending + 1 })}`
            : ""}
        </span>
        {loop && (
          <span className="jam-timeline-loop-note">
            {t("jam.form.looping", { start: loop.start + 1, end: loop.end + 1 })}
          </span>
        )}
      </div>
      <div className="jam-timeline" data-playing={isPlaying ? "" : undefined}>
        {sections.map((length, s) => {
          const range = ranges[s];
          const looped = sameRange(loop, range);
          return (
            <div className="jam-timeline-group" key={s} data-looped={looped ? "" : undefined}>
              <div className="jam-timeline-group-head">
                {names[s] && (
                  <span
                    className="jam-timeline-name"
                    title={t("jam.form.section", { name: names[s] })}
                  >
                    {names[s]}
                  </span>
                )}
                {onToggleSectionLoop && (
                  /* Small, and on the section rather than on a bar: a loop is
                     a section-shaped thing in every music this mode plays, and
                     a start-and-end pair of drags would be a worse way to say
                     "again" than one button that already knows the answer. */
                  <button
                    type="button"
                    className={`jam-timeline-loop${looped ? " active" : ""}`}
                    aria-pressed={looped}
                    title={
                      looped
                        ? t("jam.form.loopOff")
                        : t("jam.form.loopSection", {
                            start: range.start + 1,
                            end: range.end + 1,
                          })
                    }
                    aria-label={
                      looped
                        ? t("jam.form.loopOff")
                        : t("jam.form.loopSection", {
                            start: range.start + 1,
                            end: range.end + 1,
                          })
                    }
                    onClick={() => onToggleSectionLoop(range)}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17 2l4 4-4 4" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <path d="M7 22l-4-4 4-4" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="jam-timeline-cells">
                {Array.from({ length }, () => {
                  const index = bar++;
                  const lit = index === current;
                  const isFill = barHasFill({ index, total, fills, fillEvery });
                  const chord = chords?.[index] ?? null;
                  // "full" is the absence of a mark, not a mark of its own: a
                  // timeline where every cell says something says nothing.
                  const state = bandStates?.[index] ?? "full";
                  const isPending = pending === index;
                  const inLoop = !!loop && index >= loop.start && index <= loop.end;
                  const label = t("jam.form.jumpTo", { bar: index + 1 });
                  return (
                    <button
                      type="button"
                      className="jam-timeline-cell"
                      key={index}
                      data-current={lit ? "" : undefined}
                      data-fill={isFill ? "" : undefined}
                      data-band={state === "full" ? undefined : state}
                      data-pending={isPending ? "" : undefined}
                      data-looped={inLoop ? "" : undefined}
                      disabled={!onJumpTo}
                      aria-label={label}
                      title={label}
                      onClick={onJumpTo ? () => onJumpTo(index) : undefined}
                    >
                      <span className="jam-timeline-number">{index + 1}</span>
                      {chord && <span className="jam-timeline-chord">{chord}</span>}
                      {lit && isPlaying && (
                        <span
                          className="jam-timeline-progress"
                          style={{ transform: `scaleX(${through})` }}
                        />
                      )}
                      {isFill && (
                        <span className="jam-timeline-fill">{t("jam.form.fillMark")}</span>
                      )}
                      {/* The bar the form is on its way to. A mark rather than
                          a light: the cell is not playing yet, and lighting it
                          would make two bars look current at once. */}
                      {isPending && (
                        <span
                          className="jam-timeline-next"
                          title={t("jam.form.jumpPending")}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
