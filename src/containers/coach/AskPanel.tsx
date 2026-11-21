import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CoachBlocks } from "../../coach/blocks/CoachBlocks";
import { Sheet } from "../../components/Sheet";
import { useCoachModel } from "../../hooks/useCoachModel";
import { IS_MOBILE } from "../../platform";
import { CoachModelSelector } from "../main-window/CoachModelSelector";
import { CoachGlyph } from "./CoachGlyph";
import { askDraft, consumeAskFocus, keepAskDraft, noteAskScreen, setAskTab, useAskState, type AskTab, type AskTurn } from "./askStore";
import { Notebook } from "./Notebook";
import { answerTyped, setAskNextAnswerer } from "./askTyped";
import { modelTurnWanted, stopModelTurn } from "./askModelTurn";
import { AskToolTurn } from "./AskToolTurn";
import { AskCardChips, AskCardTurn } from "./AskCardTurn";
import { pressSource } from "./askSources";
import { askCardChips, askUngradedHere, withinChipCap } from "./askCards";
import { isEnglish, typedRuleAnswerer } from "./askAnswerers";
import { askEmptyKey } from "./askEmpty";
import { askToolChips, noKeyRepeat, onePress, pressChip } from "./askTools";
import { lineText } from "./toolWords";
import "../../styles/ask.css";

/** "Looking at: …", and the key that decides when the thread gets a divider. */
export type AskLookingAt = { text: string; key: string };

type AskPanelProps = {
  /** Where the player is, built by the host from the coach's context. */
  lookingAt: AskLookingAt | null;
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
export const AskPanel = memo(function AskPanel({ lookingAt, onClose }: AskPanelProps) {
  const { t } = useTranslation();
  const { turns, focusPending, about, tab } = useAskState();
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [typing, setTyping] = useState(false);

  // A divider in the thread when the screen changed mid-conversation.
  const lookingText = lookingAt?.text ?? null;
  const lookingKey = lookingAt?.key ?? null;
  useEffect(() => {
    if (lookingKey === null || lookingText === null) return;
    noteAskScreen(lookingKey, t("ask.nowLooking", { place: lookingText }));
  }, [lookingKey, lookingText, t]);

  // A key or a question opened it: the caret goes in the box (never on a
  // phone, where that would raise the keyboard over the answer). The request
  // is consumed here, once: the panel remounts on every open, and a request
  // that outlived its open stole the caret from every later one (review of c2a1).
  useEffect(() => {
    if (!focusPending) return;
    if (!IS_MOBILE) inputRef.current?.focus({ preventScroll: true });
    consumeAskFocus();
  }, [focusPending]);

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
      <AskTabs tab={tab} />
      {tab === "ask" && lookingText && (
        <p className="ask-context" data-testid="ask-context">
          <span className="ask-context-label">{t("ask.lookingAt")}</span> <b>{lookingText}</b>
        </p>
      )}
      {tab === "ask" && about && (
        <p className="ask-about" data-testid="ask-about">
          <q>{about}</q>
        </p>
      )}
    </div>
  );

  // The Notebook is built when its tab opens, and only then (leg c4a2).
  const body =
    tab === "notebook" ? (
      <Notebook />
    ) : (
      <AskConversation turns={turns} inputRef={inputRef} onTyping={setTyping} lookingKey={lookingKey} />
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
          // The keyboard is up and a button in the thread is pressed (leg t2f): the box keeps the
          // focus until the click has landed. A blur on the press brought the context line back
          // above the thread, which moved the button from under the finger before the click, and the
          // press did nothing. The keyboard goes away once the press is made.
          onMouseDown={(e) => {
            if (typing && pressedInThread(e.target)) e.preventDefault();
          }}
          onClick={(e) => {
            if (typing && pressedInThread(e.target)) inputRef.current?.blur();
          }}
        >
          {head}
          {body}
          <AskFooter tab={tab} />
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
        <AskFooter tab={tab} />
      </div>
    </aside>
  );
});

/** A press on a button of the thread or of the chip row under it (not the send button). */
export function pressedInThread(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(".ask-thread button, .ask-chip-row button");
}

/** The thread, its empty state, and the text box. */
function AskConversation({
  turns,
  inputRef,
  onTyping,
  lookingKey,
}: {
  turns: readonly AskTurn[];
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onTyping: (typing: boolean) => void;
  /** Where the panel is looking: the chips are chosen again when it moves. */
  lookingKey: string | null;
}) {
  const { t, i18n } = useTranslation();
  const coachModel = useCoachModel();
  const model = coachModel.state;
  // A build with no model in it is never offered one (leg c2cc, review L10).
  const canRunModel = !coachModel.rows.some((r) => r.why === "noLlm");
  // A question typed and not sent survives a visit to the Notebook's tab (c4a2b, L4).
  const [draft, setDraft] = useState(askDraft);
  useEffect(() => keepAskDraft(draft), [draft]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // After the router, the rule-made answerers (legs c2b1b, c2cb): tuning, the fact cards,
  // the help set, then search of the player's Paths. Plugged into the send path's slot
  // while the panel is mounted, unplugged when it closes.
  useEffect(() => setAskNextAnswerer(typedRuleAnswerer(() => i18n.language)), [i18n]);
  // The panel going stops the model's turn in flight (leg c3b2a); its answer is dropped.
  useEffect(() => () => stopModelTurn(), []);

  // The tools' chips for where the player is (leg t1b1): chosen when the screen or
  // the thread is written (a turn updated in place too: a proposal's press changes
  // what the chips may offer), never per beat (the panel renders from its store alone).
  // The fact cards' question chips (leg c2b1a), chosen the same way, never per beat.
  const cards = useMemo(() => askCardChips(turns.length === 0 ? "askEmpty" : "askAbove", turns), [lookingKey, turns]);
  // At most four chips at once (the tools' own cap): the cards' first, the tools' in the room left (review c2b1a F10).
  const chips = useMemo(() => withinChipCap(cards.length, askToolChips()), [lookingKey, turns, cards]);
  const ungraded = useMemo(() => turns.length === 0 && askUngradedHere(), [lookingKey, turns]);
  const cardRow =
    cards.length > 0 ? (
      <div className="ask-chips ask-card-chips" data-testid="ask-card-chips">
        <AskCardChips chips={cards} />
      </div>
    ) : null;
  const chipRow =
    chips.length > 0 ? (
      <div className="ask-chips" data-testid="ask-tool-chips">
        {chips.map((chip) => {
          const words = lineText(t, chip.label);
          return (
            <button
              key={chip.id}
              type="button"
              className="ask-chip"
              data-chip={chip.id}
              onClick={onePress(() => pressChip(chip.call, words))}
              onKeyDown={noKeyRepeat}
              onKeyUp={noKeyRepeat}
            >
              {words}
            </button>
          );
        })}
      </div>
    ) : null;

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim()) return;
    // A typed command first, then the next answerer, then the model or the plain statement (leg t1b2b).
    answerTyped(draft, i18n.language);
    setDraft("");
  };

  // Without a model, typed questions are still answered by the rules and search (leg c2cb, DESIGN 5.5);
  // outside English, typed text reaches search alone and the chips the rest (leg c2cc).
  const emptyKey = askEmptyKey({ mobile: IS_MOBILE, model, english: isEnglish(i18n.language), canRunModel });
  // "About your last Take:" heads the card chips only when one is about a Take, not "What is this screen for?" alone.
  const takeCards = cards.some((c) => c.shape !== "help");
  const placeholder = !IS_MOBILE && model === "ready" ? t("ask.placeholder") : t("help.ui.placeholder");

  return (
    <>
      <div className="ask-thread" role="log" aria-live="polite" ref={threadRef} data-testid="ask-thread">
        {turns.length === 0 ? (
          <div className="ask-empty" data-testid="ask-empty">
            <p className="ask-empty-title">{t("ask.empty.title")}</p>
            <p className="ask-empty-text">{t(emptyKey)}</p>
            {ungraded && <p className="ask-empty-text" data-testid="ask-card-ungraded">{t("ask.card.canAnswer.ungraded")}</p>}
            {cardRow && takeCards && <p className="ask-empty-text ask-empty-tools">{t("ask.card.chips")}</p>}
            {cardRow}
            {chipRow && <p className="ask-empty-text ask-empty-tools">{t("coachTools.ui.chipsIntro")}</p>}
            {chipRow}
          </div>
        ) : (
          turns.map((turn) => <Turn key={turn.id} turn={turn} />)
        )}
      </div>
      {turns.length > 0 && (cardRow || chipRow) && (
        <div className="ask-chip-row">
          {cardRow}
          {chipRow}
        </div>
      )}
      <form className="ask-compose" onSubmit={send}>
        <textarea
          ref={inputRef}
          className="ask-input"
          rows={1}
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          onKeyDown={(e) => {
            // WebKit's Enter that commits an IME composition comes after compositionend, as keyCode 229 (review t1b2b, finding 3).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) send(e);
          }}
          data-testid="ask-input"
        />
        <button
          type="submit"
          className="ask-send"
          disabled={!draft.trim()}
          aria-label={t("ask.send")}
          data-testid="ask-send"
          // The box keeps the focus: a blur on the press brought the sheet's footer back
          // (`data-typing`), which moved this button from under the pointer before the click (leg t1b2b).
          onMouseDown={(e) => e.preventDefault()}
        >
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
    case "tool":
      return <AskToolTurn id={turn.id} body={turn.body} />;
    case "card":
      return <AskCardTurn card={turn.card} />;
    case "divider":
      return (
        <div className="ask-divider" role="separator">
          <span>{turn.text}</span>
        </div>
      );
    case "model":
      // The model is choosing (mock 11): one line and its Stop.
      return (
        <div className="ask-turn ask-turn-pending ask-model-working" aria-busy="true" data-testid="ask-model-working">
          <span>{t("ask.model.working")}</span>{" "}
          <button type="button" className="ask-tool-quiet" onClick={() => stopModelTurn()} data-testid="ask-model-stop">
            {t("ask.model.stop")}
          </button>
        </div>
      );
    case "coach":
      return turn.pending ? (
        <div className="ask-turn ask-turn-pending" aria-busy="true">
          {t("ask.writing")}
        </div>
      ) : (
        // The model's words are general advice and say so (owner decision 3); the
        // line, pressed, says what that label means (leg c2b2b, `askSources.ts`).
        <CoachBlocks
          className="ask-turn ask-turn-coach"
          blocks={[{ type: "text", text: turn.text, source: { kind: "general" } }]}
          onSource={(source, words) => pressSource(source, words)}
        />
      );
  }
}

/** One line: what this device does with what you type (DESIGN 5.5); on the Notebook, where its lines come from (5.4, guardrail 7). */
function AskFooter({ tab }: { tab: AskTab }) {
  const { t, i18n } = useTranslation();
  const model = useCoachModel().state;
  const key =
    tab === "notebook"
      ? "notebook.ui.footer"
      : IS_MOBILE
        ? "help.ui.footer.phone"
        : model === "ready"
          ? modelTurnWanted(i18n.language)
            ? "ask.footer.choice"
            : "help.ui.footer.model"
          : "help.ui.footer.local";
  return <p className="ask-footer">{t(key)}</p>;
}

/** "Ask | Notebook" (DESIGN 6.7, mocks 10 and 17): a tab strip in the head, in every shape. */
function AskTabs({ tab }: { tab: AskTab }) {
  const { t } = useTranslation();
  const tabs: AskTab[] = ["ask", "notebook"];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div className="ask-tabs" role="tablist" aria-label={t("notebook.ui.tabsLabel")} data-testid="ask-tabs">
      {tabs.map((id, i) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={tab === id}
          tabIndex={tab === id ? 0 : -1}
          className="ask-tab"
          data-tab={id}
          data-testid={`ask-tab-${id}`}
          onClick={() => setAskTab(id)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
            setAskTab(next);
            refs.current[tabs.indexOf(next)]?.focus();
          }}
        >
          {t(id === "ask" ? "notebook.ui.tabAsk" : "notebook.ui.tabNotebook")}
        </button>
      ))}
    </div>
  );
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
