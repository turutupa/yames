import { memo, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CoachBlocks } from "../../coach/blocks/CoachBlocks";
import { Sheet } from "../../components/Sheet";
import { useCoachModel } from "../../hooks/useCoachModel";
import { IS_MOBILE } from "../../platform";
import { CoachModelSelector } from "../main-window/CoachModelSelector";
import { CoachGlyph } from "./CoachGlyph";
import { noteAskScreen, sendAsk, setAskSection, useAskState, type AskTurn } from "./askStore";
import "../../styles/ask.css";

/** "Looking at: …", and the key that decides when the thread gets a divider. */
export type AskLookingAt = { text: string; key: string };

type AskPanelProps = {
  /** Where the player is, built by the host from the coach's context. */
  lookingAt: AskLookingAt | null;
  /**
   * The tools' coach (Start, End, Feed, History), shown as a second section
   * until leg c2a2 gives the tools their own Listen. Absent: no sections.
   */
  toolsCoach?: ReactNode;
  onClose: () => void;
};

/**
 * Ask: the one coach panel (DESIGN 3.2, 3.3, 5.5; mocks 02, 08, 11, 15).
 *
 * One width (380 px, 320 under 720 px of window), three shapes. Which of the
 * first two it is, dock or drawer, is the stylesheet's to say from the
 * window's width and the screen under it (`ask.css`); on a phone it is a
 * modal sheet. It holds no solid button: the page keeps its one.
 *
 * The model selector sits at its foot (owner, 2026-11-20), its menu opening
 * upward inside the panel and under its head; on a phone, in the sheet's
 * head, opening downward, because the foot is under the keyboard.
 *
 * The panel renders only from its own store and these props, so the shell
 * re-rendering at every beat does not render it (it is not mounted at all
 * while a Take runs).
 */
export const AskPanel = memo(function AskPanel({ lookingAt, toolsCoach, onClose }: AskPanelProps) {
  const { t } = useTranslation();
  const { section, turns, focusSeq } = useAskState();
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [typing, setTyping] = useState(false);
  const showTools = !IS_MOBILE && !!toolsCoach && section === "tools";

  // A divider in the thread when the screen changed mid-conversation.
  const lookingText = lookingAt?.text ?? null;
  const lookingKey = lookingAt?.key ?? null;
  useEffect(() => {
    if (lookingKey === null || lookingText === null) return;
    noteAskScreen(lookingKey, t("ask.nowLooking", { place: lookingText }));
  }, [lookingKey, lookingText, t]);

  // A key or a question opened it: the caret goes in the box (never on a
  // phone, where that would raise the keyboard over the answer).
  useEffect(() => {
    if (focusSeq === 0 || IS_MOBILE) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [focusSeq]);

  const head = (
    <div className="ask-head" data-coach-model-ceiling="">
      <div className="ask-title-row">
        <CoachGlyph />
        <h2 className="ask-title" id={titleId}>
          {t("ask.title")}
        </h2>
        {/* The sheet draws its own close button over its corner. */}
        {!IS_MOBILE && (
          <button type="button" className="ask-close" onClick={onClose} aria-label={t("ask.close")} data-testid="ask-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {IS_MOBILE && (
        <div className="ask-head-model">
          <CoachModelSelector placement="down" />
        </div>
      )}
      {!IS_MOBILE && toolsCoach && (
        <div className="ask-sections" role="tablist" aria-label={t("ask.title")}>
          {(["ask", "tools"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              className="ask-section"
              aria-selected={(s === "tools") === showTools}
              onClick={() => setAskSection(s)}
              data-testid={`ask-section-${s}`}
            >
              {t(`ask.sections.${s}`)}
            </button>
          ))}
        </div>
      )}
      {!showTools && lookingText && (
        <p className="ask-context" data-testid="ask-context">
          <span className="ask-context-label">{t("ask.lookingAt")}</span> <b>{lookingText}</b>
        </p>
      )}
    </div>
  );

  const body = showTools ? (
    <div className="ask-tools" role="tabpanel" data-testid="ask-tools">
      {toolsCoach}
    </div>
  ) : (
    <AskConversation turns={turns} inputRef={inputRef} onTyping={setTyping} />
  );

  if (IS_MOBILE) {
    return (
      <Sheet open onClose={onClose} title={t("ask.title")} ownHeader className="sheet--ask">
        <PhoneTrap />
        <div
          className="ask-panel ask-sheet"
          data-ask-panel=""
          data-coach-model-bounds=""
          data-typing={typing ? "" : undefined}
          data-testid="ask-panel"
        >
          {head}
          {body}
          <AskFooter />
        </div>
      </Sheet>
    );
  }

  return (
    <aside
      className="ask-panel"
      role="complementary"
      aria-labelledby={titleId}
      data-ask-panel=""
      data-coach-model-bounds=""
      data-testid="ask-panel"
      onKeyDown={(e: ReactKeyboardEvent) => {
        // While focus is in the panel the screen's keys are off: Esc closes
        // it, everything else is the panel's own (Enter sends, ? is typed).
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        e.stopPropagation();
      }}
    >
      {head}
      {body}
      <div className="ask-foot">
        <CoachModelSelector />
        {!showTools && <AskFooter />}
      </div>
    </aside>
  );
});

/** The thread, its empty state, and the text box. */
function AskConversation({
  turns,
  inputRef,
  onTyping,
}: {
  turns: readonly AskTurn[];
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onTyping: (typing: boolean) => void;
}) {
  const { t } = useTranslation();
  const model = useCoachModel().state;
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim()) return;
    sendAsk(draft);
    setDraft("");
  };

  const emptyKey = IS_MOBILE
    ? "ask.empty.phone"
    : model === "ready"
      ? "ask.empty.model"
      : model === "loading" || model === "waiting"
        ? "ask.empty.loading"
        : "ask.empty.noModel";

  return (
    <>
      <div className="ask-thread" role="log" aria-live="polite" ref={threadRef} data-testid="ask-thread">
        {turns.length === 0 ? (
          <div className="ask-empty" data-testid="ask-empty">
            <p className="ask-empty-title">{t("ask.empty.title")}</p>
            <p className="ask-empty-text">{t(emptyKey)}</p>
          </div>
        ) : (
          turns.map((turn) => <Turn key={turn.id} turn={turn} />)
        )}
      </div>
      <form className="ask-compose" onSubmit={send}>
        <textarea
          ref={inputRef}
          className="ask-input"
          rows={1}
          value={draft}
          placeholder={t("ask.placeholder")}
          aria-label={t("ask.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
          }}
          data-testid="ask-input"
        />
        <button type="submit" className="ask-send" disabled={!draft.trim()} aria-label={t("ask.send")} data-testid="ask-send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </form>
    </>
  );
}

function Turn({ turn }: { turn: AskTurn }) {
  const { t } = useTranslation();
  switch (turn.kind) {
    case "user":
      return <div className="ask-turn ask-turn-user">{turn.text}</div>;
    case "app":
      return <div className="ask-turn ask-turn-app">{turn.text}</div>;
    case "divider":
      return (
        <div className="ask-divider" role="separator">
          <span>{turn.text}</span>
        </div>
      );
    case "coach":
      return turn.pending ? (
        <div className="ask-turn ask-turn-pending" aria-busy="true">
          {t("ask.writing")}
        </div>
      ) : (
        // The model's words are general advice and say so (owner decision 3).
        <CoachBlocks className="ask-turn ask-turn-coach" blocks={[{ type: "text", text: turn.text, source: { kind: "general" } }]} />
      );
  }
}

/** One line: what this device does with what you type (DESIGN 5.5). */
function AskFooter() {
  const { t } = useTranslation();
  const model = useCoachModel().state;
  const key = IS_MOBILE ? "ask.footer.phone" : model === "ready" ? "ask.footer.model" : "ask.footer.local";
  return <p className="ask-footer">{t(key)}</p>;
}

/** The sheet is modal: Tab and Shift+Tab stay inside it. */
function PhoneTrap() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const sheet = document.querySelector<HTMLElement>(".sheet--ask");
      if (!sheet) return;
      const items = Array.from(
        sheet.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = sheet.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
