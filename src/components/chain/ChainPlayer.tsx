import { useTranslation } from "react-i18next";
import { meterLabel } from "../../utils/meter";
import { durationLabel, stepSeconds, transitionLabel } from "./format";
import type { ChainRemaining, Translate } from "./format";
import type { Chain, ChainStep } from "../../types";

/**
 * A chain, playing.
 *
 * Zen's vocabulary brought indoors: the 10rem number, accent-coloured while
 * it runs, and the grouped beat dots under it. What Zen puts above the number
 * for a drill — "step 3 → 120" — carries the step's NAME here, because a
 * chain step has one and at two metres the name is what you recognise. You
 * know what "Alt picking" means with your hands; "step 3" you would have to
 * count.
 *
 * Not literally Zen. `.fullscreen-view` is `position: fixed; inset: 0` at
 * z-index 9999 and covers the transport, and a chain needs Pause and Skip
 * reachable at all times — so this is the same reading distance inside the
 * window, with the window's own transport still under your hand.
 *
 * Nothing here is a control except the transport and the way out. That is the
 * point of splitting the room: while you are playing there is nothing to
 * decide, and every affordance on screen is one more thing to not look at.
 */

/** A step with no honest length still needs a slice of the ribbon. */
const MANUAL_SHARE = 0.6;

interface ChainPlayerProps {
  chain: Chain;
  step: ChainStep;
  stepNumber: number;
  stepCount: number;
  remaining: ChainRemaining;
  /** Live beat position, straight from the engine. */
  activeBeat: number;
  activeSub: number;
  isDownbeat: boolean;
  isPlaying: boolean;
  /** The engine's live count-in. `beats` of 0 is nothing counting. */
  countIn: { beats: number; done: number };
  /** Back to the paragraph. The chain keeps running. */
  onEdit: () => void;
}

/** How long one bar of this step lasts, in seconds. */
function barSeconds(step: ChainStep): number {
  const beats = step.beatGroups.reduce((a, b) => a + b, 0) || 4;
  return (beats * 60) / Math.max(1, step.bpm);
}

/** 0..1 through the current step, or 0 when only the player knows. */
function progress(step: ChainStep, remaining: ChainRemaining): number {
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
  step: ChainStep,
  remaining: ChainRemaining,
): string {
  if (!remaining) return "";
  if (remaining.kind === "manual") return t("chain.waitingForYou");

  const perBar = barSeconds(step);
  const totalSeconds = stepSeconds(step);
  const totalBars = totalSeconds !== null && perBar > 0 ? Math.round(totalSeconds / perBar) : 0;

  if (remaining.kind === "bars" && step.trigger.kind === "bars") {
    const done = Math.max(0, step.trigger.bars - remaining.bars);
    return t("chain.barOf", {
      current: Math.min(step.trigger.bars, done + 1),
      total: step.trigger.bars,
    });
  }
  if (remaining.kind === "seconds") {
    const left = t("chain.timeLeft", { duration: durationLabel(t, remaining.seconds) });
    if (!totalBars) return left;
    const doneBars = Math.max(0, totalSeconds! - remaining.seconds) / perBar;
    return `${left} · ${t("chain.barOf", {
      current: Math.min(totalBars, Math.floor(doneBars) + 1),
      total: totalBars,
    })}`;
  }
  return t("chain.switching");
}

export function ChainPlayer({
  chain,
  step,
  stepNumber,
  stepCount,
  remaining,
  activeBeat,
  activeSub,
  isDownbeat,
  isPlaying,
  countIn,
  onEdit,
}: ChainPlayerProps) {
  const { t } = useTranslation();
  const next = chain.steps[stepNumber] ?? null;
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
  const shares = chain.steps.map((s) => {
    const seconds = stepSeconds(s);
    return seconds === null || seconds <= 0 ? null : seconds;
  });
  const known = shares.filter((s): s is number => s !== null);
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const widths = shares.map((s) => (s === null ? average * MANUAL_SHARE : s));
  const span = widths.reduce((a, b) => a + b, 0) || 1;

  const groups = step.beatGroups.length ? step.beatGroups : [4];
  let beatOffset = 0;

  return (
    <div className="chain-player" data-playing={isPlaying ? "true" : undefined}>
      <button type="button" className="chain-player-edit" onClick={onEdit}>
        {t("chain.player.edit")}
      </button>

      <div className="chain-player-where">
        {t("chain.transport.stepOf", { number: stepNumber, total: stepCount })}
        {chain.repeat !== 1 && (
          <span className="chain-player-repeat">
            {" · "}
            {chain.repeat === 0 ? t("chain.repeat.forever") : t("chain.repeat.times", { count: chain.repeat })}
          </span>
        )}
      </div>
      <div className="chain-player-name">{step.name}</div>

      <div className={`chain-player-bpm${counting ? " counting" : ""}`}>
        {counting ? left : step.bpm}
      </div>
      <div className="chain-player-bpm-label">
        {counting ? t("chain.countIn.startingIn") : t("drill.bpmUnit")}
      </div>

      <div className="chain-player-beats" aria-hidden="true">
        {groups.map((size, groupIndex) => {
          const start = beatOffset;
          beatOffset += size;
          return (
            <div className="chain-player-group" key={groupIndex}>
              {Array.from({ length: size }, (_, i) => {
                const beat = start + i;
                const live = isPlaying && beat === activeBeat;
                return (
                  <span
                    key={beat}
                    className="chain-player-dot"
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

      <div className="chain-player-left">{leftLabel(t, step, remaining)}</div>

      <div className="chain-player-ribbon" aria-hidden="true">
        {chain.steps.map((s, index) => (
          <span
            className="chain-player-seg"
            key={s.id}
            data-state={index < stepNumber - 1 ? "done" : index === stepNumber - 1 ? "now" : undefined}
            style={{ flex: `0 0 ${(widths[index] / span) * 100}%` }}
          >
            {index === stepNumber - 1 && (
              <span className="chain-player-seg-fill" style={{ width: `${done * 100}%` }} />
            )}
          </span>
        ))}
      </div>

      {/* What comes next and how it arrives. The only thing on this screen
          that is about a step you are not playing — because knowing the change
          is coming is what lets you finish the phrase you are on. */}
      <div className="chain-player-next">
        {next ? (
          <>
            <span className="chain-player-next-lead">{t("chain.player.then")}</span>
            <span className="chain-player-next-name">{next.name}</span>
            <span className="chain-player-next-said">
              {t("chain.said.config", {
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
                <span className="chain-player-next-said" aria-hidden="true">·</span>
                <span className="chain-player-next-said">
                  {transitionLabel(t, step.transition).toLowerCase()}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="chain-player-next-lead">
            {chain.repeat === 1 ? t("chain.player.lastStep") : t("chain.player.roundAgain")}
          </span>
        )}
      </div>
    </div>
  );
}
