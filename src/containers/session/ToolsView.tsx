/**
 * Tools: the door to the five tools.
 *
 * Each card opens its tool exactly as the tool's hotkey does (`setView` with the
 * same id), so the tool behind it is the one it always was. Their order is the
 * order `tab-1` to `tab-5` count, and that is not an accident.
 *
 * The owner, on the cards before these: "these massive tall cards look awful
 * too — at least have some cool render for each one", and "the fonts used
 * inside the stage area do not match the currently selected theme". So each
 * card is sized to what it holds, carries a small render of its tool
 * (`tools/ToolRenders.tsx`), and the page takes its type AND its colour from the
 * theme (`tools-page.css`), not from the learning side's fixed palette.
 *
 * Under the description, a line of the player's own state where there is one:
 * TEMPO for the metronome (what it is set to), RAMP for the drill (the ramp as
 * set, not a run), LAST for the setlist, jam and song loaded last. No data, no
 * line: nothing on this page is made up.
 */
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MODES, RAIL_KEYS } from "../main-window/Rail";
import type { PlayTab } from "../main-window/hooks/useTabRouting";
import { platformKey } from "../../hotkeys";
import { IS_MOBILE } from "../../platform";
import { meterLabel } from "../../utils/meter";
import { DrillRender, JamRender, MetronomeRender, SetlistRender, SongsRender } from "./tools/ToolRenders";
import "../../styles/tools-page.css";

/** What the cards can say about the player's own state. All of it optional. */
export interface ToolsInfo {
  bpm?: number;
  /** The metronome's grouping (`beatGroups`, or `[timeSignature]`). */
  groups?: number[];
  /** Free mode: the bar has no meter to name. */
  freeMode?: boolean;
  ramp?: { startBpm: number; targetBpm: number };
  setlist?: { name: string; steps: number } | null;
  jam?: string | null;
  song?: string | null;
}

export function ToolsView({
  onOpen,
  keyBindings,
  info = {},
}: {
  onOpen: (tool: PlayTab) => void;
  /** The player's bindings, as the rail reads them; absent, no keycaps. */
  keyBindings?: Readonly<Record<string, string>>;
  info?: ToolsInfo;
}) {
  const { t } = useTranslation();
  const groups = info.groups && info.groups.length ? info.groups : [4];
  const meter = info.freeMode ? null : meterLabel(groups);

  const render = (id: PlayTab): ReactNode => {
    switch (id) {
      case "beat":
        return <MetronomeRender bpm={info.bpm ?? 120} groups={groups} meter={info.bpm ? meter : null} />;
      case "setlist":
        return <SetlistRender />;
      case "drill":
        return (
          <DrillRender
            startBpm={info.ramp?.startBpm ?? 60}
            targetBpm={info.ramp?.targetBpm ?? 120}
            targetLabel={t("session.tools.target")}
          />
        );
      case "jam":
        return <JamRender />;
      case "songs":
        return <SongsRender />;
      default:
        return null;
    }
  };

  /** [label, value] for the card's state line, or null for none. */
  const detail = (id: PlayTab): [string, string] | null => {
    switch (id) {
      case "beat":
        return info.bpm
          ? [t("session.tools.tempo"), meter ? `${Math.round(info.bpm)} BPM · ${meter}` : `${Math.round(info.bpm)} BPM`]
          : null;
      case "drill":
        return info.ramp
          ? [
              t("session.tools.ramp"),
              t("session.today.bpmRange", {
                from: Math.round(info.ramp.startBpm),
                to: Math.round(info.ramp.targetBpm),
              }),
            ]
          : null;
      case "setlist":
        return info.setlist
          ? [
              t("session.tools.last"),
              `${info.setlist.name} · ${t("session.tools.steps", { count: info.setlist.steps })}`,
            ]
          : null;
      case "jam":
        return info.jam ? [t("session.tools.last"), info.jam] : null;
      case "songs":
        return info.song ? [t("session.tools.last"), info.song] : null;
      default:
        return null;
    }
  };

  return (
    <div className="tools-page" data-testid="tools">
      <header className="tools-head tools-rise">
        <h1 className="tools-h1">{t("session.nav.tools")}</h1>
        <p className="tools-intro">{t("session.tools.intro")}</p>
      </header>
      <div className="tools-grid">
        {MODES.map((mode, i) => {
          const combo = keyBindings?.[RAIL_KEYS[mode.id]];
          const line = detail(mode.id);
          return (
            <button
              key={mode.id}
              type="button"
              className="tools-card tools-rise"
              style={{ "--i": i } as CSSProperties}
              onClick={() => onOpen(mode.id)}
              data-testid={`tool-card-${mode.id}`}
              data-tool={mode.id}
            >
              <span className="tools-stage" aria-hidden="true">
                {render(mode.id)}
              </span>
              <span className="tools-meta">
                <span className="tools-name-row">
                  <b className="tools-name">{t(mode.labelKey)}</b>
                  {mode.id === "jam" && <span className="tools-beta">{t("rail.beta")}</span>}
                  {!IS_MOBILE && combo && (
                    <kbd className="tools-key" aria-hidden="true" data-testid={`tool-key-${mode.id}`}>
                      {platformKey(combo)}
                    </kbd>
                  )}
                </span>
                <span className="tools-desc">{t(`session.tools.${mode.id}`)}</span>
                {line && (
                  <span className="tools-last" data-testid={`tool-last-${mode.id}`}>
                    <span>{line[0]}</span>
                    <b>{line[1]}</b>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
