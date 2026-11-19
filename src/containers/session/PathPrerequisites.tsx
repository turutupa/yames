/**
 * What a Path builds on, said on the Paths screen (plans/paths/NEW_PATHS.md,
 * "UI spec for prerequisites"). Guidance only: nothing here locks a Path,
 * hides one, or stands in for Start or Subscribe.
 *
 * - `BuildsOnLine`: one quiet line, "Builds on: Rhythm Foundations
 *   (Beginner)", each name a link to that Path's page.
 * - `StartFirstLine`: "Start with Rhythm Foundations first, or start anyway.",
 *   only while the player has not started this Path and has not reached what
 *   it builds on. Never instead of Start.
 * - `SubscribeOffer`: after Subscribe, the prerequisites not started yet,
 *   offered as one press. The Path is already subscribed whatever the answer.
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LevelId, PathDoc } from "../../paths/format";
import { buildsOnPaths, startFirstSuggestion } from "../../session/prerequisites";
import { isSubscribed } from "../../session/progress";
import { SUBSCRIPTION_CAP } from "../../session/rotation";
import type { SessionRun } from "./hooks/useSessionRun";

type ListPart = { type: "element" | "literal"; value: string };
type ListFormatCtor = new (
  locale?: string,
  options?: { type?: "conjunction" | "unit"; style?: "long" | "short" | "narrow" },
) => { formatToParts(list: string[]): ListPart[] };

/**
 * Items joined the way this language joins a list, each one its own node.
 * `Intl.ListFormat` is reached through a narrow declaration, as in `JamView`:
 * it is not in the ES2020 lib the project compiles against. Without it, commas.
 */
export function joinNodes(nodes: ReactNode[], language: string, type: "conjunction" | "unit" = "conjunction"): ReactNode {
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
  const marks = nodes.map((_, i) => `\u0001${i}\u0001`);
  let parts: ListPart[] | null = null;
  if (ListFormat) {
    try {
      parts = new ListFormat(language, { type, style: type === "unit" ? "short" : "long" }).formatToParts(marks);
    } catch {
      parts = null;
    }
  }
  if (!parts) {
    parts = marks.flatMap((m, i): ListPart[] =>
      i === 0 ? [{ type: "element", value: m }] : [{ type: "literal", value: ", " }, { type: "element", value: m }],
    );
  }
  // Each item keeps the punctuation after it ("Legato (Beginner),"), so a
  // line never starts with a comma: the break comes at the space after it.
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.type === "element") {
      const at = marks.indexOf(part.value);
      out.push(<Fragment key={i}>{at < 0 ? part.value : nodes[at]}</Fragment>);
      return;
    }
    const glued = part.value.trimEnd();
    const space = part.value.slice(glued.length);
    const prev = out.pop();
    out.push(
      prev === undefined ? (
        <Fragment key={i}>{glued}</Fragment>
      ) : (
        <span key={i} className="session-list-item">
          {prev}
          {glued}
        </span>
      ),
    );
    if (space) out.push(<Fragment key={`${i}s`}>{space}</Fragment>);
  });
  return out;
}

/** A translated line with one slot in it (`{{slot}}`) that is a node, not text. */
function withSlot(text: string, node: ReactNode): ReactNode {
  const [before, after = ""] = text.split("\u0002");
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}
const SLOT = "\u0002";

/** A Path's name as a link to its page. */
function PathLink({
  path,
  level,
  onOpen,
  testId,
}: {
  path: PathDoc;
  level?: LevelId;
  onOpen: (path: PathDoc) => void;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="session-prereq-link"
      onClick={(e) => {
        // On a card, the card's own click would open the card's Path.
        e.stopPropagation();
        onOpen(path);
      }}
      data-testid={testId}
    >
      {level
        ? t("session.paths.buildsOnLevel", { path: path.title, level: t(`session.paths.levelName.${level}`) })
        : path.title}
    </button>
  );
}

/** "Builds on: …", or nothing for a Path that builds on nothing. */
export function BuildsOnLine({
  session,
  path,
  onOpenPath,
  where,
}: {
  session: SessionRun;
  path: PathDoc;
  onOpenPath: (path: PathDoc) => void;
  /** "card" on the list, "page" on the Path's own page: test ids and styling. */
  where: "card" | "page";
}) {
  const { t, i18n } = useTranslation();
  const shown = buildsOnPaths(session.paths, path);
  if (shown.length === 0) return null;
  const links = shown.map((s) => (
    <PathLink
      key={s.path.id}
      path={s.path}
      level={s.level}
      onOpen={onOpenPath}
      testId={`builds-on-${where}-${path.id}-${s.path.id}`}
    />
  ));
  return (
    <span
      className="session-prereq-line session-quiet"
      data-where={where}
      data-testid={`builds-on-${where}-${path.id}`}
    >
      {withSlot(t("session.paths.buildsOn", { list: SLOT }), joinNodes(links, i18n.language, "unit"))}
    </span>
  );
}

/** "Start with X first, or start anyway." above Start, while it applies. */
export function StartFirstLine({
  session,
  path,
  onOpenPath,
}: {
  session: SessionRun;
  path: PathDoc;
  onOpenPath: (path: PathDoc) => void;
}) {
  const { t } = useTranslation();
  const first = startFirstSuggestion(session.progress, session.paths, path);
  if (!first) return null;
  return (
    <div className="session-prereq-first" data-testid="path-start-first">
      {withSlot(
        t("session.paths.startFirst", { path: SLOT }),
        <PathLink path={first} onOpen={onOpenPath} testId={`path-start-first-${first.id}`} />,
      )}
    </div>
  );
}

/**
 * After Subscribe: "Rhythm Foundations comes before this one. Add it to your
 * Paths too?" One press adds them (as many as the cap leaves room for, and it
 * says so when it could not add them all); "Not now" closes it.
 */
export function SubscribeOffer({
  session,
  offer,
  onClose,
}: {
  session: SessionRun;
  offer: PathDoc[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState<{ added: PathDoc[]; capped: boolean } | null>(null);
  if (offer.length === 0) return null;
  const names = (list: PathDoc[]) => joinNodes(list.map((p) => <b key={p.id}>{p.title}</b>), i18n.language);
  if (result) {
    return (
      <div className="session-prereq-offer" role="status" data-testid="path-offer-result">
        {result.added.length > 0 && <div>{withSlot(t("session.paths.offerAdded", { list: SLOT }), names(result.added))}</div>}
        {result.capped && (
          <div className="session-bad" data-testid="path-offer-cap">
            {t("session.paths.subscribeCap", { cap: SUBSCRIPTION_CAP })}
          </div>
        )}
      </div>
    );
  }
  const add = () => {
    const { progress, actions } = session;
    // Room left under the cap, counted here: two subscribes in one press both
    // read the progress of before the press.
    const following = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
    const room = Math.max(0, SUBSCRIPTION_CAP - following);
    const added: PathDoc[] = [];
    for (const p of offer.slice(0, room)) {
      if (actions.subscribe(p) === null) added.push(p);
    }
    setResult({ added, capped: added.length < offer.length });
  };
  const one = offer.length === 1;
  return (
    <div className="session-prereq-offer" role="status" data-testid="path-offer">
      <div>
        {withSlot(t(one ? "session.paths.offerOne" : "session.paths.offerMany", { list: SLOT }), names(offer))}
      </div>
      <div className="session-row" data-wrap="" style={{ gap: 6 }}>
        <button type="button" className="session-secondary" onClick={add} data-testid="path-offer-add">
          {one ? t("session.paths.offerAddOne", { path: offer[0].title }) : t("session.paths.offerAddMany")}
        </button>
        <button type="button" className="session-link" onClick={onClose} data-testid="path-offer-no">
          {t("session.paths.offerNo")}
        </button>
      </div>
    </div>
  );
}
