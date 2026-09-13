import { useTranslation } from "react-i18next";
import { meterLabel } from "../../utils/meter";
import { spanLabel, stepSeconds, transitionLabel } from "./format";
import type { SetlistRemaining, Translate } from "./format";
import { JamGlyph } from "../jam/JamGlyph";
import { barInView, formBars, jamHarmony, nextChange } from "../../jam";
import { chordName } from "../../jam/harmony";
import type { Jam } from "../../jam";
import type { BeatEvent, Setlist, SetlistStep } from "../../types";

/**
 * A setlist, playing.
 *
 * Zen's vocabulary brought indoors: the 10rem number, accent-coloured while
 * it runs, and the grouped beat dots under it. What Zen puts above the number
 * for a drill — "step 3 → 120" — carries the step's NAME here, because a
 * setlist step has one and at two metres the name is what you recognise. You
 * know what "Alt picking" means with your hands; "step 3" you would have to
 * count.
 *
 * Not literally Zen. `.fullscreen-view` is `position: fixed; inset: 0` at
 * z-index 9999 and covers the transport, and a setlist needs Pause and Skip
 * reachable at all times — so this is the same reading distance inside the
 * window, with the window's own transport still under your hand.
 *
 * Nothing here is a control except the transport and the way out. That is the
 * point of splitting the room: while you are playing there is nothing to
 * decide, and every affordance on screen is one more thing to not look at.
 */

/** A step with no honest length still needs a slice of the ribbon. */
const MANUAL_SHARE = 0.6;

interface SetlistPlayerProps {
  setlist: Setlist;
  step: SetlistStep;
  stepNumber: number;
  stepCount: number;
  remaining: SetlistRemaining;
  /** Live beat position, straight from the engine. */
  activeBeat: number;
  activeSub: number;
  isDownbeat: boolean;
  isPlaying: boolean;
  /** The engine's live count-in. `beats` of 0 is nothing counting. */
  countIn: { beats: number; done: number };
  /**
   * The jam this step IS, while one is running (JAM_MODE §8.5).
   *
   * A jam step's own clock is the form, not the step: "bar 5 of 12, on the
   * IV" is where you are, and the step's own "bar 9 of 32" is a number about
   * the routine rather than about the music. So it goes in the readout row
   * beside the step's, not instead of it — the routine still has to say when
   * this step is over.
   */
  jam?: Jam | null;
  /** The latest beat, for the jam's place in the form. */
  currentBeat?: BeatEvent | null;
  /** Back to the paragraph. The setlist keeps running. */
  onEdit: () => void;
}

/** How long one bar of this step lasts, in seconds. */
function barSeconds(step: SetlistStep): number {
  const beats = step.beatGroups.reduce((a, b) => a + b, 0) || 4;
  return (beats * 60) / Math.max(1, step.bpm);
}

/** 0..1 through the current step, or 0 when only the player knows. */
function progress(step: SetlistStep, remaining: SetlistRemaining): number {
  if (!remaining || remaining.kind === "manual") return 0;
  if (remaining.kind === "bars" && step.trigger.kind === "bars" && step.trigger.bars > 0) {
    return Math.min(1, Math.max(0, 1 - remaining.bars / step.trigger.bars));
  }
  if (remaining.kind === "seconds" && step.trigger.kind === "seconds" && step.trigger.seconds > 0) {
    return Math.min(1, Math.max(0, 1 - remaining.seconds / step.trigger.seconds));
  }
  return 1;
}

/**
 * The line under the dots: how much of this step is left, in the terms the
 * step was set in, and the bar count either way.
 *
 * A step set in minutes still has bars, and a player counting a phrase wants
 * both — which is why the seconds case says both rather than choosing.
 */
function leftLabel(
  t: Translate,
  step: SetlistStep,
  remaining: SetlistRemaining,
): string {
  if (!remaining) return "";
  if (remaining.kind === "manual") return t("setlist.waitingForYou");

  const perBar = barSeconds(step);
  const totalSeconds = stepSeconds(step);
  const totalBars = totalSeconds !== null && perBar > 0 ? Math.round(totalSeconds / perBar) : 0;

  if (remaining.kind === "bars" && step.trigger.kind === "bars") {
    const done = Math.max(0, step.trigger.bars - remaining.bars);
    return t("setlist.barOf", {
      current: Math.min(step.trigger.bars, done + 1),
      total: step.trigger.bars,
    });
  }
  if (remaining.kind === "seconds") {
    const left = t("setlist.timeLeft", { duration: spanLabel(t, remaining.seconds) });
    if (!totalBars) return left;
    const doneBars = Math.max(0, totalSeconds! - remaining.seconds) / perBar;
    return `${left} · ${t("setlist.barOf", {
      current: Math.min(totalBars, Math.floor(doneBars) + 1),
      total: totalBars,
    })}`;
  }
  return t("setlist.switching");
}

export function SetlistPlayer({
  setlist,
  step,
  stepNumber,
  stepCount,
  remaining,
  activeBeat,
  activeSub,
  isDownbeat,
  isPlaying,
  countIn,
  jam = null,
  currentBeat = null,
  onEdit,
}: SetlistPlayerProps) {
  const { t } = useTranslation();
  const next = setlist.steps[stepNumber] ?? null;
  const done = progress(step, remaining);
  /**
   * Counting you in, at the tempo you are about to play.
   *
   * The big slot carries the count rather than the tempo while this runs.
   * The number is the loudest thing on the screen and during a count-in the
   * only number that matters is how many are left — the tempo is the thing
   * the beats are already telling you.
   */
  const counting = countIn.beats > 0 && countIn.done < countIn.beats;
  const left = Math.max(0, countIn.beats - countIn.done);

  // The ribbon: the whole routine as one wordless bar, each step as wide as
  // it is long. Alternative C from the sketches, stripped of its labels —
  // words at this size would be unreadable from the distance the number is
  // meant for, and the name is already the largest thing on screen.
  const shares = setlist.steps.map((s) => {
    const seconds = stepSeconds(s);
    return seconds === null || seconds <= 0 ? null : seconds;
  });
  const known = shares.filter((s): s is number => s !== null);
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const widths = shares.map((s) => (s === null ? average * MANUAL_SHARE : s));
  const span = widths.reduce((a, b) => a + b, 0) || 1;

  /**
   * The jam's place in its form, and the chord under your hands.
   *
   * The same `jamHarmony` the jam screen and Zen draw from, so the chord on
   * the setlist player and the chord on the jam tab cannot be two different
   * chords. Nothing is computed when the step is not a jam.
   */
  const jamBars = jam ? formBars(jam.form) : 0;
  const jamHarm = jam ? jamHarmony(jam) : null;
  const jamBar = jam ? barInView(jam, currentBeat?.formBar ?? 0, isPlaying) : 0;
  const jamChordAt = jamHarm?.chords[jamBar] ?? null;
  const jamChord = jamHarm && jamChordAt ? chordName(jamChordAt, jamHarm.key) : null;
  const jamNext = jamHarm ? nextChange(jamHarm.chords, jamBar, jamHarm.key) : null;

  const groups = step.beatGroups.length ? step.beatGroups : [4];
  let beatOffset = 0;

  return (
    <div className="setlist-player" data-playing={isPlaying ? "true" : undefined}>
      <button type="button" className="setlist-player-edit" onClick={onEdit}>
        {t("setlist.player.edit")}
      </button>

      <div className="setlist-player-where">
        {t("setlist.transport.stepOf", { number: stepNumber, total: stepCount })}
        {setlist.repeat !== 1 && (
          <span className="setlist-player-repeat">
            {" · "}
            {setlist.repeat === 0 ? t("setlist.repeat.forever") : t("setlist.repeat.times", { count: setlist.repeat })}
          </span>
        )}
      </div>
      <div className="setlist-player-name">{step.name}</div>

      <div className={`setlist-player-bpm${counting ? " counting" : ""}`}>
        {counting ? left : step.bpm}
      </div>
      <div className="setlist-player-bpm-label">
        {counting ? t("setlist.countIn.startingIn") : t("drill.bpmUnit")}
      </div>

      <div className="setlist-player-beats" aria-hidden="true">
        {groups.map((size, groupIndex) => {
          const start = beatOffset;
          beatOffset += size;
          return (
            <div className="setlist-player-group" key={groupIndex}>
              {Array.from({ length: size }, (_, i) => {
                const beat = start + i;
                const live = isPlaying && beat === activeBeat;
                return (
                  <span
                    key={beat}
                    className="setlist-player-dot"
                    data-live={live ? "" : undefined}
                    data-accent={live && (isDownbeat || i === 0) ? "" : undefined}
                    data-sub={live && activeSub > 0 ? activeSub : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="setlist-player-left">{leftLabel(t, step, remaining)}</div>

      {/* Where the band is, when the step is a band. Under the step's own
          countdown because the two answer different questions and a player
          reading from two metres away needs both: the form tells you what to
          play next, the countdown tells you how long you have left to. */}
      {jam && (
        <div className="setlist-player-jam">
          <JamGlyph size={13} />
          <span className="setlist-player-jam-where">
            {t("jam.form.barOf", { current: jamBar + 1, total: jamBars })}
          </span>
          {jamChord && (
            <>
              <span aria-hidden="true">·</span>
              <span className="setlist-player-jam-chord">{jamChord}</span>
            </>
          )}
          {jamNext && (
            <span className="setlist-player-jam-next">
              {t("jam.now.next", { chord: jamNext.name, count: jamNext.inBars })}
            </span>
          )}
        </div>
      )}

      <div className="setlist-player-ribbon" aria-hidden="true">
        {setlist.steps.map((s, index) => (
          <span
            className="setlist-player-seg"
            key={s.id}
            data-state={index < stepNumber - 1 ? "done" : index === stepNumber - 1 ? "now" : undefined}
            style={{ flex: `0 0 ${(widths[index] / span) * 100}%` }}
          >
            {index === stepNumber - 1 && (
              <span className="setlist-player-seg-fill" style={{ width: `${done * 100}%` }} />
            )}
          </span>
        ))}
      </div>

      {/* What comes next and how it arrives. The only thing on this screen
          that is about a step you are not playing — because knowing the change
          is coming is what lets you finish the phrase you are on. */}
      <div className="setlist-player-next">
        {next ? (
          <>
            <span className="setlist-player-next-lead">{t("setlist.player.then")}</span>
            <span className="setlist-player-next-name">{next.name}</span>
            <span className="setlist-player-next-said">
              {t("setlist.said.config", {
                bpm: next.bpm,
                meter: next.freeMode ? t("metronome.free") : meterLabel(next.beatGroups),
                subdivision: t(`subdiv.${next.subdivision}`).toLowerCase(),
                sound: t(`sound.${next.soundType}`).toLowerCase(),
              })}
            </span>
            {/* Only when there is something to say. "cut" is the absence of
                a transition, and naming the absence is noise on a screen
                whose whole argument is that nothing on it is spare. */}
            {step.transition.kind !== "cut" && (
              <>
                <span className="setlist-player-next-said" aria-hidden="true">·</span>
                <span className="setlist-player-next-said">
                  {transitionLabel(t, step.transition).toLowerCase()}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="setlist-player-next-lead">
            {setlist.repeat === 1 ? t("setlist.player.lastStep") : t("setlist.player.roundAgain")}
          </span>
        )}
      </div>
    </div>
  );
}
