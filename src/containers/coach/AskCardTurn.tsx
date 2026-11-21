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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { askCardBlocks, cardAnswer, type FactCard } from "../../coach/ask/cards";
import type { ChipChoice } from "../../coach/ask/suggest";
import { CoachBlocks } from "../../coach/blocks/CoachBlocks";
import type { Line } from "../../coach/tools/types";
import { SCALES, type ScaleId } from "../../jam/scales";
import { askCard, type CardBody } from "./askCards";
import { pressSource } from "./askSources";
import { onePress } from "./askTools";

/** A card body as a card: "why there is none" is one line the app's rule wrote (or what a source line opened, leg c2b2b). */
function asCard(body: CardBody): FactCard {
  return body.shape === null
    ? { shape: "why_not_counted", lines: [body.line, ...(body.more ?? [])], source: body.source ?? { kind: "app" }, uncertain: true }
    : body;
}

/**
 * A card's line in the player's words. A scale named by its id (`scale`) is
 * said by the Jam screen's own name for it (`SCALES[id].labelKey`), never
 * translated a second time (leg c2b2b).
 */
export function cardLineText(t: TFunction, l: Line): string {
  const id = l.values.scale;
  if (typeof id !== "string" || !(id in SCALES)) return t(l.key, l.values);
  const english = typeof l.values.name === "string" ? l.values.name : id;
  return t(l.key, { ...l.values, name: t(SCALES[id as ScaleId].labelKey, { defaultValue: english }) });
}

export const AskCardTurn = memo(function AskCardTurn({ card }: { card: CardBody }) {
  const { t } = useTranslation();
  const word = (l: Line) => cardLineText(t, l);
  const blocks = askCardBlocks(cardAnswer(asCard(card), word));
  if (blocks.length === 0) return null;
  // Its source line opens what it cites (leg c2b2b): the Take this card read, when it read one.
  const cites = card.shape !== null ? card.cites : undefined;
  return (
    <div className="ask-turn ask-turn-card" data-testid="ask-card" data-card={card.shape ?? "none"}>
      <CoachBlocks className="ask-card-blocks" blocks={blocks} onSource={(source, words) => pressSource(source, words, cites)} />
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
