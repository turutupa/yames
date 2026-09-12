import { useTranslation } from "react-i18next";
import { formBars, formSectionNames, formSections } from "../../jam/forms";
import type { JamBandState, JamForm } from "../../jam/types";

interface FormTimelineProps {
  form: JamForm;
  /** A fill lands on the last bar of the chorus, so the timeline marks it. */
  fills: boolean;
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
   */
  bandStates?: JamBandState[] | null;
}

/**
 * Where you are in the form.
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
 */
export function FormTimeline({
  form,
  fills,
  formBar,
  chorus,
  beat,
  beatsPerBar,
  isPlaying,
  chords = null,
  bandStates = null,
}: FormTimelineProps) {
  const { t } = useTranslation();
  const total = formBars(form);
  const sections = formSections(form);
  const names = formSectionNames(form);
  const current = isPlaying ? Math.min(Math.max(formBar, 0), total - 1) : 0;
  /** How far through the current bar, 0..1 — the lit cell's fill. */
  const through = isPlaying && beatsPerBar > 0 ? Math.min(1, (beat + 1) / beatsPerBar) : 0;

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
        </span>
      </div>
      <div className="jam-timeline" data-playing={isPlaying ? "" : undefined}>
        {sections.map((length, s) => (
          <div className="jam-timeline-group" key={s}>
            {names[s] && (
              <span className="jam-timeline-name" title={t("jam.form.section", { name: names[s] })}>
                {names[s]}
              </span>
            )}
            <div className="jam-timeline-cells">
              {Array.from({ length }, () => {
                const index = bar++;
                const lit = index === current;
                const isFill = fills && index === total - 1;
                const chord = chords?.[index] ?? null;
                // "full" is the absence of a mark, not a mark of its own: a
                // timeline where every cell says something says nothing.
                const state = bandStates?.[index] ?? "full";
                return (
                  <span
                    className="jam-timeline-cell"
                    key={index}
                    data-current={lit ? "" : undefined}
                    data-fill={isFill ? "" : undefined}
                    data-band={state === "full" ? undefined : state}
                    aria-hidden="true"
                  >
                    <span className="jam-timeline-number">{index + 1}</span>
                    {chord && <span className="jam-timeline-chord">{chord}</span>}
                    {lit && isPlaying && (
                      <span
                        className="jam-timeline-progress"
                        style={{ transform: `scaleX(${through})` }}
                      />
                    )}
                    {isFill && <span className="jam-timeline-fill">{t("jam.form.fillMark")}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
