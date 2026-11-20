/**
 * "Send my test sessions to my computer" (card #123): test builds only
 * (`inboxOffered`), off by default. The switch, the pairing (an address and a
 * one-time code, or one pasted link carrying both), and one line saying how
 * the last session went. The logic is `src/settings/testInbox.ts`.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  InboxError,
  forgetInbox,
  inboxNow,
  onInbox,
  pairInbox,
  parseInboxInput,
  setInboxOn,
  syncInbox,
} from "../../settings/testInbox";
import type { InboxState } from "../../settings/testInbox";
import { SwitchFace } from "./SwitchFace";

const REASONS = [
  "offline",
  "notPaired",
  "token",
  "tooBig",
  "refused",
  "server",
  "full",
  "tooMany",
  "zip",
  "badAddress",
  "badCode",
  "noCode",
] as const;

function reasonKey(reason: string | undefined): (typeof REASONS)[number] {
  if (reason === "zipChanged") return "zip";
  return (REASONS as readonly string[]).includes(reason ?? "") ? (reason as (typeof REASONS)[number]) : "server";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function TestInboxRow() {
  const { t } = useTranslation();
  const [s, setS] = useState<InboxState>(inboxNow);
  const [address, setAddress] = useState(() => inboxNow().url);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => onInbox(setS), []);

  const why = (reason: string | undefined) => t(`settings.testInbox.reasons.${reasonKey(reason)}`);
  const pair = () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    void pairInbox(address, code)
      .then((next) => {
        setS(next);
        setCode("");
        setAddress(next.url);
      })
      .catch((e) => setNote(t("settings.testInbox.pairFailed", { why: why(e instanceof InboxError ? e.message : "server") })))
      .finally(() => setBusy(false));
  };
  const onAddress = (v: string) => {
    // a pasted pairing link fills both fields
    const parsed = parseInboxInput(v);
    if (parsed?.code) {
      setAddress(parsed.base);
      setCode(parsed.code);
    } else {
      setAddress(v);
    }
  };

  const last = s.last ? s.items[s.last] : undefined;
  let status = t("settings.testInbox.status.none");
  if (s.last && last) {
    if (last.state === "sending") status = t("settings.testInbox.status.sending", { id: s.last, pct: Math.round((last.progress ?? 0) * 100) });
    else if (last.state === "uploaded") status = t("settings.testInbox.status.uploaded", { id: s.last });
    else status = t(`settings.testInbox.status.${last.state}`, { id: s.last, why: why(last.reason) });
  }

  return (
    <div className="test-inbox" data-testid="settings-test-inbox">
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.testInbox.title")}</label>
          <span className="setting-hint">{t("settings.testInbox.hint")}</span>
          {s.on && (
            <span className={`setting-hint test-inbox-status test-inbox-${last?.state ?? "none"}`} data-testid="test-inbox-status">
              {status}
            </span>
          )}
        </div>
        <button
          className={`toggle-btn setting-switch ${s.on ? "active" : ""}`}
          aria-pressed={s.on}
          data-testid="test-inbox-switch"
          onClick={() => setS(setInboxOn(!s.on))}
        >
          <SwitchFace label={s.on ? t("common.on") : t("common.off")} />
        </button>
      </div>
      {s.on && !s.paired && (
        <div className="test-inbox-pair">
          <label className="test-inbox-field">
            <span className="setting-hint">{t("settings.testInbox.address")}</span>
            <input
              className="test-inbox-input"
              data-testid="test-inbox-address"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://…:8646"
              value={address}
              onChange={(e) => onAddress(e.target.value)}
            />
          </label>
          <label className="test-inbox-field test-inbox-code-field">
            <span className="setting-hint">{t("settings.testInbox.code")}</span>
            <input
              className="test-inbox-input"
              data-testid="test-inbox-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ABCDE-12345"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="toggle-btn" data-testid="test-inbox-pair" disabled={busy || !address.trim()} onClick={pair}>
            {busy ? t("settings.testInbox.pairing") : t("settings.testInbox.pair")}
          </button>
        </div>
      )}
      {s.on && s.paired && (
        <div className="recording-session-actions">
          <span className="setting-hint test-inbox-host">{t("settings.testInbox.paired", { host: hostOf(s.url) })}</span>
          <button className="toggle-btn" data-testid="test-inbox-send" onClick={() => void syncInbox(true)}>
            {t("settings.testInbox.sendNow")}
          </button>
          <button className="toggle-btn" data-testid="test-inbox-forget" onClick={() => setS(forgetInbox())}>
            {t("settings.testInbox.forget")}
          </button>
        </div>
      )}
      {note && <p className="setting-hint recording-session-note">{note}</p>}
    </div>
  );
}
