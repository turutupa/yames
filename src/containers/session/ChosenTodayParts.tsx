/**
 * Builds the exercises chosen for today ("Add to today", leg t2e) outside the
 * Session runner, and hands them in (`actions.setChosenParts`). Renders
 * nothing. With nothing chosen it loads neither the list nor the generator.
 *
 * Mounted once in the shell. Memoised on a stable callback, so the shell's
 * per-beat renders never reach it: it re-runs only when the stored choice,
 * the list or the language changes, none of which can happen during a Take.
 */
import { memo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NO_CHOSEN_PARTS, useChosenTodayStored } from "../../session/chosenToday";
import type { ChosenParts } from "../../session/chosenToday";
import { useMyExercises } from "../../session/myExercises";

type Props = { onParts: (parts: ChosenParts) => void };

function ChosenTodayPartsImpl({ onParts }: Props) {
  const stored = useChosenTodayStored();
  const keys = stored?.keys ?? [];
  useEffect(() => {
    if (keys.length === 0) onParts(NO_CHOSEN_PARTS);
  }, [keys.length, onParts]);
  return keys.length > 0 ? <Build keys={keys} onParts={onParts} /> : null;
}

function Build({ keys, onParts }: Props & { keys: readonly string[] }) {
  const { t, i18n } = useTranslation();
  const list = useMyExercises();
  const joined = keys.join("\n");
  useEffect(() => {
    let live = true;
    import("./chosenTodayBuild").then(
      ({ buildChosenParts }) => {
        if (live) onParts(buildChosenParts(t, list, joined.split("\n")));
      },
      (err) => {
        // No builder, no documents: every one is left out, and Today says so.
        console.warn("[yames] could not load the exercise builder", err);
        if (live) onParts({ parts: [], unbuiltKeys: joined.split("\n") });
      },
    );
    return () => {
      live = false;
    };
    // `t` follows the language; `joined` is the keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, list, i18n.language, onParts]);
  return null;
}

export const ChosenTodayParts = memo(ChosenTodayPartsImpl);
