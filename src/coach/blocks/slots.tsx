/**
 * The three blocks whose drawings are still being built.
 *
 * `tabExcerpt` needs the tab, which arrives with Songs (W4). `take` and
 * `compare` need recorded takes and the review screen, which arrive in the
 * wave after. All three are in the catalogue NOW, fully described and fully
 * resolved, because a catalogue that grows a block later is a grammar, a
 * schema and a model prompt that all change later — and D3's whole point is
 * that a bigger model "only chooses better, never differently shaped".
 *
 * So each of them renders through a slot. The renderer knows the heading and
 * the frame; the drawing inside is a component handed in. Until the real one
 * exists a placeholder says, in one line, what will be there — which is also
 * what the owner sees in the gallery tonight.
 *
 * Plugging the real component in is one prop. Nothing in `CoachBlocks.tsx`
 * changes, and nothing about the block, the schema or the grammar changes
 * either.
 */

import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { AttemptRef, ScoreRef } from "./resolve";

export type TabExcerptSlotProps = {
  score: ScoreRef;
  fromBar: number;
  toBar: number;
  /** The run to colour the notes by, or null for the notes as written. */
  attempt: AttemptRef | null;
};

export type TakeSlotProps = {
  attempt: AttemptRef;
  /** The song, when it is loaded. A take of a song that is not open has none. */
  score: ScoreRef | null;
  fromBar: number | null;
  toBar: number | null;
};

export type CompareSlotProps = {
  older: AttemptRef;
  newer: AttemptRef;
  score: ScoreRef | null;
};

export type CoachBlockSlots = {
  tabExcerpt: ComponentType<TabExcerptSlotProps>;
  take: ComponentType<TakeSlotProps>;
  compare: ComponentType<CompareSlotProps>;
};

/**
 * A quiet line where a drawing will be.
 *
 * Not an error and not a warning: the block resolved, the reference is real,
 * the picture is simply not built. So it reads as a note rather than as a
 * failure, and it never pretends to show notes it does not have.
 */
function ComingSoon({ line }: { line: string }) {
  return <p className="coach-block-soon">{line}</p>;
}

export function TabExcerptPlaceholder(_props: TabExcerptSlotProps) {
  const { t } = useTranslation();
  return <ComingSoon line={t("coachBlocks.tab.soon")} />;
}

export function TakePlaceholder(_props: TakeSlotProps) {
  const { t } = useTranslation();
  return <ComingSoon line={t("coachBlocks.take.soon")} />;
}

export function ComparePlaceholder(_props: CompareSlotProps) {
  const { t } = useTranslation();
  return <ComingSoon line={t("coachBlocks.compare.soon")} />;
}

/** What the renderer uses when the caller hands it nothing. */
export const PLACEHOLDER_SLOTS: CoachBlockSlots = {
  tabExcerpt: TabExcerptPlaceholder,
  take: TakePlaceholder,
  compare: ComparePlaceholder,
};
