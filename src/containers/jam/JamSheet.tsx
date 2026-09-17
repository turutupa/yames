import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { MotionProps } from "../../components/Presence";

/**
 * The width at which the sheet stops covering the stage and stands beside it
 * (JAM_UX_DECISIONS A12).
 *
 * 1400px of content region: the sheet is 640, which leaves 760 for the stage —
 * enough for the timeline to still read as a timeline rather than as a column
 * of bar numbers. Below it, covering the stage is the honest thing to do.
 */
export const JAM_PUSH_WIDTH = 1400;

/** The classes the stylesheet reads off `.main-content`. */
const SHEET_CLASS = "has-jam-sheet";
const PUSH_CLASS = "jam-sheet-wide";

/**
 * How many sheets are on the screen inside a given content region.
 *
 * Both can be down at once — the chord sheet over a jam whose setup is also
 * open — and the layout must survive the first of them leaving.
 */
const sheetCount = new WeakMap<HTMLElement, number>();

function addSheet(host: HTMLElement) {
  sheetCount.set(host, (sheetCount.get(host) ?? 0) + 1);
  host.classList.add(SHEET_CLASS);
}

function removeSheet(host: HTMLElement) {
  const left = Math.max(0, (sheetCount.get(host) ?? 1) - 1);
  sheetCount.set(host, left);
  if (left > 0) return;
  host.classList.remove(SHEET_CLASS);
  host.classList.remove(PUSH_CLASS);
}

/** True while the content region is wide enough to hold a stage AND a sheet. */
function usePushLayout(host: HTMLElement | null): boolean {
  const [push, setPush] = useState(false);
  useEffect(() => {
    if (!host) return;
    // Measured once on the way in, then watched: the rail collapses and the
    // window resizes, and neither of those is a re-render of this component.
    const measure = () => setPush(host.clientWidth >= JAM_PUSH_WIDTH);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);
  return push;
}

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
  /**
   * Close when a press lands on the stage outside the sheet
   * (JAM_UX_DECISIONS A12).
   *
   * True for setup and false for the chord sheet: the cheat sheet is a page
   * you keep open WHILE you play, and putting it away because you tapped the
   * timeline would be the opposite of what it is for.
   *
   * It applies to the overlay only. In push mode the stage is a live column
   * beside the sheet rather than something behind it — the whole point of the
   * wide layout is doing both at once, and a sheet that shut every time you
   * touched the timeline would take that back.
   */
  closeOnOutside?: boolean;
  /**
   * The arrival, from the `Presence` that owns whether this sheet is mounted
   * (JAM_UX_DECISIONS A11). Absent in a test that renders the sheet directly,
   * and then it is simply there, as it was before.
   */
  motion?: MotionProps;
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
export function JamSheet({
  title,
  subtitle,
  onClose,
  dim = false,
  kind,
  motion,
  closeOnOutside = false,
  children,
}: JamSheetProps) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

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
   * Beside the stage, or over it (JAM_UX_DECISIONS A12).
   *
   * The owner: "maybe if the window is wide enough the drawer should push the
   * stage content to the left instead of rendering on top, that way it'd be
   * easier to do everything at the same time." Above the threshold the sheet
   * takes a column of its own and the stage lives beside it; below it, the
   * sheet is the docked overlay it has always been.
   *
   * Measured on `.main-content`, not on the window: the rail collapses, and a
   * window wide enough for both is not the same fact as a content region wide
   * enough for both.
   */
  const push = usePushLayout(host);

  /**
   * The two classes the stylesheet reads, written onto the host while this
   * sheet is on the screen.
   *
   * Counted rather than set, because both sheets can be down at once and the
   * first one to leave must not take the layout away from the other.
   */
  useEffect(() => {
    if (!host) return;
    addSheet(host);
    return () => removeSheet(host);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    host.classList.toggle(PUSH_CLASS, push);
  }, [host, push]);

  /**
   * A press on the stage puts the setup sheet away.
   *
   * `pointerdown` rather than `click` so it happens at the moment you decide
   * rather than at the moment you let go, and on the host rather than the
   * document so the rail and the window's chrome are not "outside" — they are
   * somewhere else entirely, and clicking the rail is already going somewhere.
   *
   * The context bar's own buttons are excepted: they toggle the sheet from
   * whatever state it is in, so letting this close it first would have the
   * click that followed open it straight back up.
   *
   * And the transport and the header are not the stage (2026-09-16). Both
   * live inside the content region, so pressing Play — or nudging the volume
   * — counted as "outside" and put the sheet away, which is exactly when the
   * owner was using it: shaping the band and pressing Play to hear it.
   */
  useEffect(() => {
    if (!closeOnOutside || !host || push) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (sheetRef.current?.contains(target)) return;
      if (target.closest?.(".jam-sheet-btn, .transport, .main-header")) return;
      onClose();
    };
    host.addEventListener("pointerdown", onDown);
    return () => host.removeEventListener("pointerdown", onDown);
  }, [closeOnOutside, host, push, onClose]);

  /**
   * Focus lands inside the sheet when it opens, and again when its contents
   * are swapped for the other sheet's.
   *
   * Not a focus trap: the sheet is docked, the screen behind it is live, and
   * tabbing out of it into the transport is a reasonable thing to want. What
   * it must not do is leave focus on the button in the header that opened it,
   * where the next Space press would close the sheet again — or, after a
   * switch from Set up to Chords, on a control that is no longer on the page.
   *
   * On `kind`, not on mount: the frame stays put through the switch (A11), so
   * mounting is no longer the only moment new content appears in it.
   */
  useEffect(() => {
    const first = bodyRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus({ preventScroll: true });
  }, [kind]);

  /**
   * The scrim moves with the sheet but does not report back.
   *
   * Both wear the same state so they fade and slide together, and only the
   * sheet carries `onAnimationEnd` — two elements answering for one arrival
   * would have the second one's exit unmount a surface the first had already
   * taken care of.
   */
  const { onAnimationEnd: _sheetOnly, ...marks } = motion ?? {};

  const sheet = (
    <>
      {/* No scrim in push mode: there is nothing behind the sheet to dim,
          because the stage is beside it and still yours to use (A12). */}
      {dim && !push && (
        <div className="jam-sheet-scrim motion-scrim" aria-hidden="true" {...marks} />
      )}
      <aside
        ref={sheetRef}
        className="jam-sheet motion-sheet"
        data-sheet={kind}
        data-layout={push ? "push" : "overlay"}
        role="region"
        aria-label={title}
        {...motion}
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
        {/* Keyed on `kind` so switching sheets replaces the body outright —
            a scroll position and a half-open MORE belong to the sheet that
            had them — and so the fade below plays for the new content. The
            FRAME does not move: that is the whole of A11's rule for the
            switch. */}
        <div key={kind} className="jam-sheet-body motion-swap" ref={bodyRef}>
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
