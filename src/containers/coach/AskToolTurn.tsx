/**
 * What a tool did, would do, could not do, or will not do, drawn in Ask's
 * thread (DESIGN 13, 3.6; mock 16; leg t1b1). The words are the runner's
 * `Line`s through `toolWords.ts`; every press is `askTools.ts`'s.
 *
 * The look: a receipt is quiet (a record, not a celebration): a check, one
 * line, its way back as a small tonal button, and its source in the app's
 * words. A proposal is an outlined card with one tonal button with a verb and
 * "Not now". Choices and "show me" are the neutral outline chips Ask uses
 * everywhere. Theme tokens only; no solid button, no coach colour (that is
 * the glyph's, in the head); text wraps.
 */
import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CoachBlocks } from "../../coach/blocks/CoachBlocks";
import type { SessionPlan } from "../../session/planner";
import type { ToolChoice } from "../../coach/tools/types";
import { MakeExercisePreview } from "./MakeExercisePreview";
import { lineText, stopsKey } from "./toolWords";
import { NEVER_LIST } from "./neverList";
import { laterDecidesUndo, noKeyRepeat, notNowProposal, onePress, pressProposal, pressUndo, runAskCall, showMeYours, undoLive, type ToolBody, type UndoState } from "./askTools";

/** The proposal's verb: what its one button says. */
const VERBS: Readonly<Record<string, string>> = {
  start_today: "start",
  play_exercise: "play",
  find_edge: "findEdge",
  test_out: "testOut",
  set_tempo: "setTempo",
  swap_part: "swap",
  restore_part: "putBack",
  set_minutes: "change",
  set_focus: "change",
  follow_path: "follow",
  load_jam: "load",
  load_preset: "load",
  click_subdivision: "change",
  set_setting: "change",
  set_goal: "keep",
  go_to: "go",
  open_path: "open",
  open_step: "open",
  open_settings: "open",
  loop_bars: "loop",
  make_exercise: "add",
};

function Source({ words }: { words: string }) {
  return (
    <p className="coach-block-source ask-tool-source" data-source="app">
      <svg className="coach-block-source-mark" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16" />
        <line x1="12" y1="8" x2="12" y2="8" />
      </svg>
      <span>{words}</span>
    </p>
  );
}

function Mark({ kind }: { kind: "done" | "none" }) {
  return (
    <svg className="ask-tool-mark" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "done" ? <polyline points="5 12.5 10 17.5 19 7.5" /> : <line x1="6" y1="12" x2="18" y2="12" />}
    </svg>
  );
}

/** The undo shows while it is good: a way back until the player moves; an Undo for a few seconds. */
function useUndoClock(undo: UndoState | null): number {
  const [now, setNow] = useState(() => Date.now());
  const until = undo?.state === "live" ? undo.until : null;
  useEffect(() => {
    if (until === null) return;
    const left = until - Date.now();
    if (left <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), left + 20);
    return () => window.clearTimeout(timer);
  }, [until]);
  return now;
}

function Receipt({ id, body }: { id: string; body: ToolBody & { kind: "receipt" } }) {
  const { t } = useTranslation();
  const { undo } = body;
  const now = useUndoClock(undo);
  // An add's Undo waits for the store to say it kept the add (review t2c, finding 4).
  const live = undoLive(undo, Math.max(now, Date.now())) && !(body.settling && laterDecidesUndo(undo));
  return (
    <div className="ask-tool ask-receipt" data-testid="ask-receipt" data-undo={undo?.state ?? "none"}>
      <div className="ask-receipt-row">
        <Mark kind="done" />
        <p className="ask-receipt-text" aria-busy={body.settling ? "true" : undefined}>
          {lineText(t, body.receipt)}
        </p>
        {live && undo && (
          <button type="button" className="btn-tonal ask-tool-btn ask-undo" onClick={onePress(() => pressUndo(id))} onKeyDown={noKeyRepeat} onKeyUp={noKeyRepeat} data-testid="ask-undo">
            {lineText(t, undo.label)}
          </button>
        )}
      </div>
      {undo?.state === "done" && (
        <p className="ask-tool-note" data-testid="ask-undone">
          {t("coachTools.ui.undone")} {undo.note ? lineText(t, undo.note) : null}
        </p>
      )}
      {undo && undo.state !== "done" && undo.note && (
        <p className="ask-tool-note" data-testid="ask-undo-note">
          {lineText(t, undo.note)}
        </p>
      )}
      {body.blocks && body.blocks.length > 0 && <CoachBlocks className="ask-tool-blocks" blocks={body.blocks} />}
      {body.next && body.next.length > 0 && !body.settling && <Choices choices={body.next} testId="ask-receipt-next" />}
      <Source words={t("coachTools.source.did")} />
    </div>
  );
}

function PlanList({ plan }: { plan: SessionPlan }) {
  const { t } = useTranslation();
  return (
    <ol className="ask-proposal-plan" data-testid="ask-proposal-plan">
      {plan.steps.map((step) => (
        <li key={step.id}>{t("coachTools.ui.planRow", { title: step.title, minutes: step.minutes })}</li>
      ))}
    </ol>
  );
}

function ProposalCard({ id, body }: { id: string; body: ToolBody & { kind: "proposal" } }) {
  const { t } = useTranslation();
  const { proposal, state } = body;
  const stops = stopsKey(proposal.line);
  const open = state === "open";
  return (
    <div className="ask-tool ask-proposal" data-testid="ask-proposal" data-state={state} data-via={body.via}>
      {body.via === "model" && (
        <p className="ask-proposal-fact" data-testid="ask-proposal-model">
          {t("ask.model.reading")}
        </p>
      )}
      {proposal.preview && <MakeExercisePreview preview={proposal.preview} />}
      <p className="ask-proposal-line">{lineText(t, proposal.line)}</p>
      {proposal.preview && (
        <p className="ask-proposal-fact" data-testid="ask-make-graded">
          {t("coachTools.make.graded", { bpm: proposal.preview.summary.startBpm })}
        </p>
      )}
      {proposal.plan && <PlanList plan={proposal.plan} />}
      {stops && <p className="ask-proposal-fact" data-testid="ask-proposal-stops">{t(stops)}</p>}
      {proposal.noUndo && <p className="ask-proposal-fact" data-testid="ask-proposal-noundo">{t("coachTools.ui.noUndo")}</p>}
      {open && body.note && (
        <p className="ask-tool-note" data-testid="ask-proposal-note">
          {lineText(t, body.note)}
        </p>
      )}
      {open ? (
        <div className="ask-proposal-actions">
          <button type="button" className="btn-tonal ask-tool-btn" onClick={onePress(() => pressProposal(id))} onKeyDown={noKeyRepeat} onKeyUp={noKeyRepeat} data-testid="ask-proposal-go">
            {t(`coachTools.verb.${VERBS[proposal.tool] ?? "go"}`)}
          </button>
          <button type="button" className="ask-tool-quiet" onClick={onePress(() => notNowProposal(id))} onKeyDown={noKeyRepeat} onKeyUp={noKeyRepeat} data-testid="ask-proposal-not-now">
            {t("coachTools.ui.notNow")}
          </button>
        </div>
      ) : null}
      {open && proposal.preview && proposal.preview.variants.length > 0 && <Choices choices={proposal.preview.variants} testId="ask-make-variants" />}
      {open ? null : state === "expired" ? (
        <p className="ask-tool-note" data-testid="ask-proposal-expired">{t("coachTools.why.refused.proposal")}</p>
      ) : (
        <p className="ask-tool-note" data-testid="ask-proposal-dismissed">{t("coachTools.ui.leftAsIs")}</p>
      )}
    </div>
  );
}

/** Chips that each make a full call (a "Which one?" choice, a variant, where to go next). */
function Choices({ choices, testId }: { choices: readonly ToolChoice[]; testId: string }) {
  const { t } = useTranslation();
  return (
    <div className="ask-chips" data-testid={testId}>
      {choices.map((choice, i) => {
        const words = lineText(t, choice.label);
        return (
          <button key={i} type="button" className="ask-chip" onClick={onePress(() => runAskCall(choice.call, words))} onKeyDown={noKeyRepeat} onKeyUp={noKeyRepeat}>
            {words}
          </button>
        );
      })}
    </div>
  );
}

function Refusal({ body }: { body: ToolBody & { kind: "refusal" } }) {
  const { t } = useTranslation();
  return (
    <div className="ask-tool ask-refusal" data-testid="ask-refusal">
      <div className="ask-receipt-row">
        <Mark kind="none" />
        <p className="ask-receipt-text">{lineText(t, body.line)}</p>
      </div>
      {body.choices.length > 0 && <Choices choices={body.choices} testId="ask-choices" />}
      <Source words={t("coachTools.source.app")} />
    </div>
  );
}

function Yours({ body }: { body: ToolBody & { kind: "yours" } }) {
  const { t } = useTranslation();
  const entry = NEVER_LIST[body.item];
  const show = t(entry.showLabel);
  return (
    <div className="ask-tool ask-yours" data-testid="ask-yours" data-item={body.item}>
      <div className="ask-receipt-row">
        <Mark kind="none" />
        <p className="ask-receipt-text ask-yours-text">{t(entry.line)}</p>
      </div>
      <div className="ask-chips">
        <button type="button" className="ask-chip" onClick={onePress(() => showMeYours(body.item, show))} data-testid="ask-show-me">
          {show}
        </button>
      </div>
      <Source words={t("coachTools.source.app")} />
    </div>
  );
}

export const AskToolTurn = memo(function AskToolTurn({ id, body }: { id: string; body: ToolBody }) {
  switch (body.kind) {
    case "receipt":
      return <Receipt id={id} body={body} />;
    case "proposal":
      return <ProposalCard id={id} body={body} />;
    case "refusal":
      return <Refusal body={body} />;
    case "yours":
      return <Yours body={body} />;
  }
});
