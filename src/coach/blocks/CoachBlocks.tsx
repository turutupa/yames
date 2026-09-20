/**
 * One renderer, wherever the coach speaks.
 *
 * The card, the review screen and the arrival line all draw the same blocks
 * through this, which is the point of D3: the coach looks identical with no
 * model loaded, because the rule-computed verdict is emitted as the same
 * blocks a model would have chosen.
 *
 * ## Nothing is drawn twice
 *
 * The chord boxes are `components/chords/ChordDiagram` and the neck is
 * `components/fretboard/Fretboard` — the same two the Jam cheat sheet uses,
 * unforked. Where a block cannot drive their props as they stand, the
 * adapter is here and is three lines; neither component learned anything
 * about blocks. `resolve.ts` has already turned every reference into the
 * facts they take, so this file holds no theory at all.
 *
 * ## Nothing is drawn from a guess
 *
 * `resolve.ts` dropped whatever did not resolve, so everything reaching here
 * is real. An answer that resolved to nothing renders as nothing — not as an
 * empty frame, not as an apology.
 *
 * ## One callback
 *
 * Every button in every block goes to `onAction`. The host decides what an
 * action does (`actions.ts` wires the three that work today); the coach
 * never acts on its own (U4.3).
 */

import { useTranslation } from "react-i18next";
import { ChordDiagram } from "../../components/chords";
import Fretboard from "../../components/fretboard/Fretboard";
import { noteName, type PitchClass } from "../../jam/harmony";
import { SCALES } from "../../jam/scales";
import type {
  ActionLabel,
  ProgressPoint,
  ResolvedBlock,
  ResolvedChordShape,
  ResolvedFretboard,
  ScoreRef,
} from "./resolve";
import { PLACEHOLDER_SLOTS, type CoachBlockSlots } from "./slots";
import type { CoachAction } from "./types";
import "../../styles/coach-blocks.css";

type Translate = ReturnType<typeof useTranslation>["t"];

export type CoachBlocksProps = {
  /** Already through `resolveCoachAnswer`. Nothing unresolved reaches here. */
  blocks: readonly ResolvedBlock[];
  /** Every button in every block. Absent, the buttons are not drawn at all. */
  onAction?: (action: CoachAction) => void;
  /** The three drawings still being built elsewhere. */
  slots?: Partial<CoachBlockSlots>;
  className?: string;
};

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

/**
 * Sharps or flats, read off the name the block used.
 *
 * A block that said "Bb" is talking about a flat key, and a neck full of
 * sharps beside it reads as a different piece of music. There is no key here
 * to consult — an answer is not a jam — so the spelling the reference was
 * written in is the best evidence there is.
 *
 * Only the accidental on the ROOT counts. "Am7b5" has a flat in it and is
 * not a flat chord; reading the whole name would spell a neck of A minor
 * seven flat five in flats for the sake of the five.
 */
function spellingOf(name: string): "sharp" | "flat" {
  return name[1] === "b" ? "flat" : "sharp";
}

function passageTitle(t: Translate, score: ScoreRef, fromBar: number, toBar: number): string {
  return t("coachBlocks.passage.bars", { from: fromBar, to: toBar, title: score.title });
}

function BlockHeading({ title, note }: { title: string; note?: string | null }) {
  return (
    <p className="coach-block-heading">
      <span className="coach-block-title">{title}</span>
      {note ? <span className="coach-block-note">{note}</span> : null}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The two drawings that already exist
// ---------------------------------------------------------------------------

/** A block's neck, through the cheat sheet's own `Fretboard`. */
function NeckBlock({ block }: { block: ResolvedFretboard }) {
  const { t } = useTranslation();
  const name =
    block.subject.of === "scale"
      ? `${block.subject.rootName} ${t(SCALES[block.subject.scale].labelKey, {
          defaultValue: block.subject.scale,
        })}`
      : block.subject.chordLabel;
  const spelling = spellingOf(
    block.subject.of === "scale" ? block.subject.rootName : block.subject.chordLabel,
  );

  return (
    <>
      <BlockHeading
        title={name}
        note={block.position ? t(`coachBlocks.position.${block.position}`) : null}
      />
      <Fretboard
        tuning={block.tuning}
        frets={block.frets}
        startFret={block.startFret}
        highlight={{ pitchClasses: block.pitchClasses, rootPitchClass: block.rootPitchClass }}
        nameNote={(pc: PitchClass) => noteName(pc, spelling)}
        size="small"
        className="coach-block-neck"
        ariaLabel={t("coachBlocks.fretboard.aria", { what: name })}
      />
    </>
  );
}

/** A block's grip, through the cheat sheet's own `ChordDiagram`. */
function GripBlock({ block }: { block: ResolvedChordShape }) {
  const { t } = useTranslation();
  return (
    <>
      <BlockHeading
        title={block.chordLabel}
        note={t("coachBlocks.shape.which", { index: block.index + 1, count: block.count })}
      />
      <span className="coach-block-grip">
        <ChordDiagram shape={block.shape} size="md" label={block.chordLabel} showName={false} />
        <span className="coach-block-grip-name">{block.shape.name}</span>
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const CHART = { width: 220, height: 48, pad: 4 };

/**
 * One passage over the days it has been played (C3).
 *
 * Drawn here rather than through a chart component because there is no chart
 * component and this is a line with a dot on each end — the same reasoning
 * `ChordDiagram` was written under. Every colour is a custom property, so it
 * follows the theme like everything else.
 */
function ProgressChart({ points, label }: { points: readonly ProgressPoint[]; label: string }) {
  const inner = { w: CHART.width - CHART.pad * 2, h: CHART.height - CHART.pad * 2 };
  const step = points.length > 1 ? inner.w / (points.length - 1) : 0;
  const x = (index: number) => CHART.pad + index * step;
  // 0 % at the floor, 100 % at the ceiling, whatever the readings are — a
  // chart rescaled to its own range makes 71 → 73 look like a breakthrough.
  const y = (percent: number) =>
    CHART.pad + inner.h - (Math.max(0, Math.min(100, percent)) / 100) * inner.h;
  const path = points.map((point, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(point.percent)}`).join("");

  return (
    <svg
      className="coach-block-progress"
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      width={CHART.width}
      height={CHART.height}
      role="img"
      aria-label={label}
      data-testid="coach-progress"
    >
      <line
        className="coach-block-progress-floor"
        x1={CHART.pad}
        y1={y(0)}
        x2={CHART.width - CHART.pad}
        y2={y(0)}
      />
      <path className="coach-block-progress-line" d={path} />
      {points.map((point, i) => (
        <circle
          key={`${point.at}-${String(i)}`}
          className="coach-block-progress-dot"
          cx={x(i)}
          cy={y(point.percent)}
          r={i === points.length - 1 ? 3.4 : 2.2}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  action,
  onAction,
}: {
  label: ActionLabel;
  action: CoachAction;
  onAction: (action: CoachAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="coach-block-button"
      data-action={action.kind}
      onClick={() => onAction(action)}
    >
      {t(label.key, label.values)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// One block
// ---------------------------------------------------------------------------

function Block({
  block,
  slots,
  onAction,
}: {
  block: ResolvedBlock;
  slots: CoachBlockSlots;
  onAction?: (action: CoachAction) => void;
}) {
  const { t } = useTranslation();

  switch (block.type) {
    case "text":
      // `coach-block-sentence`, not `coach-block-text`: the wrapper around
      // every block already wears `coach-block-<type>`, so a paragraph named
      // after its own type would share a class with the box it sits in — and
      // the box's rules would land on the paragraph and the paragraph's on
      // the box. The layout suite caught exactly that.
      return <p className="coach-block-sentence">{block.text}</p>;

    case "fretboard":
      return <NeckBlock block={block} />;

    case "chordShape":
      return <GripBlock block={block} />;

    case "tabExcerpt": {
      const Tab = slots.tabExcerpt;
      return (
        <>
          <BlockHeading
            title={passageTitle(t, block.score, block.fromBar, block.toBar)}
            note={block.attempt ? t("coachBlocks.tab.attempt") : t("coachBlocks.tab.plain")}
          />
          <Tab
            score={block.score}
            fromBar={block.fromBar}
            toBar={block.toBar}
            attempt={block.attempt}
          />
        </>
      );
    }

    case "progress": {
      const first = block.points[0];
      const last = block.points[block.points.length - 1];
      return (
        <>
          <BlockHeading title={passageTitle(t, block.score, block.fromBar, block.toBar)} />
          <ProgressChart
            points={block.points}
            label={t("coachBlocks.progress.aria", { from: block.fromBar, to: block.toBar })}
          />
          <p className="coach-block-caption">
            {t("coachBlocks.progress.caption", {
              first: Math.round(first.percent),
              last: Math.round(last.percent),
              goes: block.points.length,
            })}
          </p>
        </>
      );
    }

    case "take": {
      const Take = slots.take;
      // With the song not loaded there is no title, and its id is not one —
      // "wish-you-were-here" is a filename, not something a player reads.
      const title =
        block.score === null
          ? t("coachBlocks.take.any")
          : block.fromBar === null || block.toBar === null
            ? t("coachBlocks.take.whole", { title: block.score.title })
            : passageTitle(t, block.score, block.fromBar, block.toBar);
      return (
        <>
          <BlockHeading title={title} />
          <Take
            attempt={block.attempt}
            score={block.score}
            fromBar={block.fromBar}
            toBar={block.toBar}
          />
        </>
      );
    }

    case "compare": {
      const Compare = slots.compare;
      return (
        <>
          <BlockHeading
            title={
              block.score
                ? t("coachBlocks.compare.title", { title: block.score.title })
                : t("coachBlocks.compare.any")
            }
          />
          <Compare older={block.older} newer={block.newer} score={block.score} />
        </>
      );
    }

    case "action":
      // No handler, no button: a button that does nothing is worse than no
      // button, and the coach never acts on its own anyway (U4.3).
      if (!onAction) return null;
      return <ActionButton label={block.label} action={block.action} onAction={onAction} />;
  }
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

export function CoachBlocks({ blocks, onAction, slots, className }: CoachBlocksProps) {
  if (blocks.length === 0) return null;
  const filled: CoachBlockSlots = { ...PLACEHOLDER_SLOTS, ...slots };

  return (
    <div className={className ? `coach-blocks ${className}` : "coach-blocks"} data-testid="coach-blocks">
      {blocks.map((block, index) => (
        <div
          key={`${block.type}-${String(index)}`}
          className={`coach-block coach-block-${block.type}`}
          data-block={block.type}
        >
          <Block block={block} slots={filled} onAction={onAction} />
        </div>
      ))}
    </div>
  );
}

export default CoachBlocks;
