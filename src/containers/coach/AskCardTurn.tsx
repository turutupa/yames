/**
 * A fact card in Ask's thread, and the question chips that ask one (leg
 * c2b1a; DESIGN 3.6, mocks 08 and 15).
 *
 * The card is drawn with the existing blocks (`CoachBlocks`) and the source
 * line the app attached; a text block that came out without a source is not
 * drawn (`askCardBlocks`, guardrail 2). A question chip is the neutral 1 px
 * outline with a leading "?", the same look as the note's.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { askCardBlocks, cardAnswer, type FactCard } from "../../coach/ask/cards";
import type { ChipChoice } from "../../coach/ask/suggest";
import { CoachBlocks } from "../../coach/blocks/CoachBlocks";
import type { Line } from "../../coach/tools/types";
import { askCard, type CardBody } from "./askCards";
import { onePress } from "./askTools";

/** A card body as a card: "why there is none" is one line the app's rule wrote. */
function asCard(body: CardBody): FactCard {
  return body.shape === null ? { shape: "why_not_counted", lines: [body.line], source: { kind: "app" }, uncertain: true } : body;
}

export const AskCardTurn = memo(function AskCardTurn({ card }: { card: CardBody }) {
  const { t } = useTranslation();
  const word = (l: Line) => t(l.key, l.values);
  const blocks = askCardBlocks(cardAnswer(asCard(card), word));
  if (blocks.length === 0) return null;
  return (
    <div className="ask-turn ask-turn-card" data-testid="ask-card" data-card={card.shape ?? "none"}>
      <CoachBlocks className="ask-card-blocks" blocks={blocks} />
    </div>
  );
});

/** The card chips: each asks its card in the thread. */
export function AskCardChips({ chips }: { chips: ReadonlyArray<ChipChoice & { kind: "card" }> }) {
  const { t } = useTranslation();
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((chip) => {
        const words = t(chip.label.key, chip.label.values);
        return (
          <button
            key={chip.shape}
            type="button"
            className="ask-chip ask-chip-question"
            data-chip={chip.shape}
            data-testid={`ask-card-chip-${chip.shape}`}
            onClick={onePress(() => askCard(chip.call, words))}
          >
            <span className="ask-chip-lead" aria-hidden="true">
              ?
            </span>
            {words}
          </button>
        );
      })}
    </>
  );
}
