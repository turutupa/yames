import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface JamSheetProps {
  /** "Hard rock in E — started from the Hard rock vibe". */
  title: string;
  /** A quieter second line under it, when there is one. */
  subtitle?: string;
  onClose: () => void;
  /**
   * Dim the playing screen behind the sheet.
   *
   * True for setup, which is a decision you make instead of playing; false for
   * the chord sheet, which is a page you glance at WHILE playing (A8).
   */
  dim?: boolean;
  /** For the stylesheet and for tests: `setup` or `chords`. */
  kind: "setup" | "chords";
  children: React.ReactNode;
}

/**
 * A sheet docked to the right of the jam, under the header and above the
 * transport (JAM_UX_DECISIONS A1).
 *
 * Docked rather than modal, and that is the whole design. The playing screen
 * stays where it is — the timeline keeps moving, the chord keeps changing, the
 * band keeps playing — so every choice on the sheet is made against the thing
 * it changes rather than against a memory of it. A modal would have you set a
 * groove, close the dialog, listen, and open it again.
 *
 * 640px because the widest thing it holds is the groove grid at six columns,
 * and the narrowest window the app supports still leaves the timeline readable
 * beside it.
 */
export function JamSheet({ title, subtitle, onClose, dim = false, kind, children }: JamSheetProps) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);

  /**
   * Where the sheet is drawn: the content region, not the stage.
   *
   * "Under the header, above the transport" is a fact about the WINDOW, and
   * the stage it would otherwise live in is a scrolling column capped at
   * 1176px — a sheet inside it would scroll away with the timeline and stop
   * short of the right edge. `.main-content` is the box that holds the header,
   * the stage and the transport, and it is already `position: relative`, so
   * one portal is the whole answer.
   *
   * Null in a test that renders the stage on its own, and then the sheet is
   * drawn in place. It reads the same; only the geometry is the window's.
   */
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".main-content"));
  }, []);

  /**
   * Focus lands inside the sheet when it opens.
   *
   * Not a focus trap: the sheet is docked, the screen behind it is live, and
   * tabbing out of it into the transport is a reasonable thing to want. What
   * it must not do is leave focus on the button in the header that opened it,
   * where the next Space press would close the sheet again.
   */
  useEffect(() => {
    const first = bodyRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus({ preventScroll: true });
  }, []);

  const sheet = (
    <>
      {dim && <div className="jam-sheet-scrim" aria-hidden="true" />}
      <aside
        className="jam-sheet"
        data-sheet={kind}
        role="region"
        aria-label={title}
      >
        <header className="jam-sheet-head">
          <div className="jam-sheet-titles">
            <span className="jam-sheet-title">{title}</span>
            {subtitle && <span className="jam-sheet-sub">{subtitle}</span>}
          </div>
          <button type="button" className="jam-sheet-done" onClick={onClose}>
            {t("jam.sheet.done")}
          </button>
        </header>
        <div className="jam-sheet-body" ref={bodyRef}>
          {children}
        </div>
      </aside>
    </>
  );

  return host ? createPortal(sheet, host) : sheet;
}

/** One titled group inside a sheet — VIBE, THE DRUMMER, THE FORM, THE BAND. */
export function JamSheetGroup({
  label,
  lead,
  action,
  children,
}: {
  label: string;
  /** The one line under the heading that says what the group is for. */
  lead?: string;
  /** A link on the heading's right — "Edit changes", "Edit the groove". */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="jam-sheet-group" aria-label={label}>
      <div className="jam-sheet-group-head">
        <span className="stage-label">{label}</span>
        {lead && <span className="jam-sheet-lead">{lead}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}
