/**
 * One quiet link: "Find a tab for this song."
 *
 * `plans/SONGS.md` S0.9. It opens the player's OWN browser on an ordinary web
 * search for what they typed. Yames names no tab site, embeds nothing,
 * fetches nothing and reads nothing back — `songs/findTab.ts` is where that
 * is a test rather than a sentence.
 *
 * Two shapes, because there are two places it belongs and they know different
 * amounts:
 *
 *   no `query`   the import screen, where nothing has been chosen yet: a box
 *                to type the song's name into, and the link beside it
 *   a `query`    the track picker, where the file already has a title: just
 *                the link, searching for that
 *
 * The wording is checked against `plans/WEBSITE_DECISIONS.md`'s audience
 * rule: a musician reads this, not a developer. Nothing here says "query",
 * "search engine", "external" or "browser integration" — it says what the
 * player gets, which is a search for a tab, in the browser they already use.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "../../ipc";
import { tabSearchUrl } from "../../songs/findTab";
import "../../styles/songs-import.css";

export function FindATab({ query, folded = false }: { query?: string; folded?: boolean }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  // `folded` is the import screen's shape since 2026-09-21: the box and its
  // caption were two more things on a screen with one job. Somebody who has
  // the file never opens this; somebody who has not reads one question.
  const [open, setOpen] = useState(!folded);

  const words = query ?? typed;
  const url = tabSearchUrl(words);
  const go = () => {
    if (url) void openUrl(url).catch(() => {});
  };

  if (query !== undefined) {
    return (
      <button type="button" className="songs-find-tab-go" disabled={!url} onClick={go}>
        {t("songs.findTab.link")}
      </button>
    );
  }

  if (!open) {
    return (
      <p className="songs-find-tab-ask">
        {t("songs.findTab.ask")}{" "}
        <button type="button" className="songs-find-tab-go" onClick={() => setOpen(true)}>
          {t("songs.findTab.link")}
        </button>
      </p>
    );
  }

  return (
    <form
      className="songs-find-tab"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <input
        type="text"
        className="songs-find-tab-field"
        value={typed}
        // The label is on the input rather than beside it: this sits in an
        // empty state that is already three lines of prose, and a fourth
        // would bury the Import button it is meant to stand next to.
        aria-label={t("songs.findTab.what")}
        placeholder={t("songs.findTab.what")}
        maxLength={120}
        // Opened by a press, so the next thing the player does is type.
        autoFocus={folded}
        onChange={(e) => setTyped(e.target.value)}
      />
      <button type="submit" className="songs-find-tab-go" disabled={!url}>
        {t("songs.findTab.link")}
      </button>
      <p className="songs-find-tab-note">{t("songs.findTab.note")}</p>
    </form>
  );
}
