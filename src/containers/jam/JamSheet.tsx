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
   * Offer to fill the content region rather than the sheet's own column.
   *
   * For the chord sheet, which is a cheat sheet: a page of chord shapes and
   * seventeen frets of neck in a 640px column is a page you squint at, and
   * the owner asked for "an optional maximize button that opens a dialog so
   * that users can easily see the cheatsheet". Not a dialog in the end — the
   * sheet it already is, widened, which keeps the scroll position, the
   * choices and the Done button rather than building a second copy of the
   * page that has to be kept in step with the first.
   */
  canMaximize?: boolean;
  /** Start wide. The cheat sheet does; the setup drawer does not. */
  openMaximized?: boolean;
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
  canMaximize = false,
  openMaximized = false,
  children,
}: JamSheetProps) {
  const { t } = useTranslation();
  /**
   * The cheat sheet opens wide, and the setup sheet does not.
   *
   * A chord chart is twelve roots by sixteen types — the printed thing is a
   * page you pin to a wall, and in a 600px drawer it is four columns and a
   * sideways scroll, which is not a cheat sheet. The setup sheet is a column
   * of controls over a stage you are watching, and belongs in the drawer.
   *
   * It is a starting point rather than a lock: the button in the header
   * shrinks it, and does so for the rest of the session.
   */
  const [maximized, setMaximized] = useState(openMaximized);
  /*
   * While a sheet is maximized the rail is not there.
   *
   * A maximized sheet is fixed over the whole window down to the transport,
   * so the only part of the rail still showing was the seventy-six pixels
   * under it — which is the middle of a row, and it looked exactly like a
   * bug: "on the bottom left you can see the Settings label on the left
   * sidebar is partially visible". It was.
   *
   * Hiding it is the honest answer rather than nudging the rail's padding
   * until nothing straddles the edge: the sheet already covers the rail on
   * purpose (you are reading, not navigating), and a sliver of a thing you
   * cannot reach is worse than none of it.
   */
  useEffect(() => {
    if (!canMaximize || !maximized) return;
    document.body.dataset.sheetMaximized = "";
    return () => {
      delete document.body.dataset.sheetMaximized;
    };
  }, [canMaximize, maximized]);

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
        data-maximized={canMaximize && maximized ? "" : undefined}
        role="region"
        aria-label={title}
        {...motion}
      >
        <header className="jam-sheet-head">
          <div className="jam-sheet-titles">
            <span className="jam-sheet-title">{title}</span>
            {subtitle && <span className="jam-sheet-sub">{subtitle}</span>}
          </div>
          {canMaximize && (
            <button
              type="button"
              className="jam-sheet-grow"
              aria-pressed={maximized}
              aria-label={t(maximized ? "jam.sheet.shrink" : "jam.sheet.grow")}
              data-explain={t(maximized ? "jam.sheet.shrink" : "jam.sheet.grow")}
              onClick={() => setMaximized((m) => !m)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {maximized ? (
                  <path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5" />
                ) : (
                  <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
                )}
              </svg>
            </button>
          )}
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
  player,
  control,
  children,
}: {
  label: string;
  /** The one line under the heading that says what the group is for. */
  lead?: string;
  /** A link on the heading's right — "Edit changes", "Edit the groove". */
  action?: React.ReactNode;
  /**
   * Whose settings these are (2026-09-16). A player's group wears that
   * player's mark and colour, and the song's wears the band's, so a control
   * never has to be read to know who it belongs to — the owner's ask: "the
   * UI clearly shows what setting you are modifying".
   */
  player?: "vibe" | "form" | "changes" | "takes" | "drums" | "bass" | "keys" | "perc";
  /** The player's on/off switch, on the heading's right. */
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="jam-sheet-group" aria-label={label} data-player={player}>
      <div className="jam-sheet-group-head">
        {player && <PlayerMark player={player} />}
        <span className="stage-label">{label}</span>
        {lead && <span className="jam-sheet-lead">{lead}</span>}
        {action}
        {control && <span className="jam-sheet-group-control">{control}</span>}
      </div>
      {children}
    </section>
  );
}

/** A small glyph per player, drawn in the player's colour. */
function PlayerMark({ player }: { player: NonNullable<Parameters<typeof JamSheetGroup>[0]["player"]> }) {
  const paths: Record<typeof player, React.ReactNode> = {
    /* The vibe: a dial, because that is what the row of tiles is — one
       control with nine positions, not nine controls. It has a rail like
       everybody else now: without one the tiles and their variation row read
       as something parked above the sheet rather than the first section of
       it. */
    vibe: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5" />
      </>
    ),
    /* The form: a repeat sign. How long one time round is and what the band
       does the second time round. */
    form: (
      <>
        <path d="M5 4v16M9 4v16" />
        <circle cx="14" cy="9.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="14" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
        <path d="M19 4v16" />
      </>
    ),
    /* The changes: the staff and the notes on it — what everybody plays
       over. This was the "song" mark, and it keeps the job it was drawn
       for; the form took the half of that section that is about time. */
    changes: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="16" r="2.5" />
      </>
    ),
    /* Takes: a circle, the way a record button has always been drawn. */
    takes: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </>
    ),
    // A drum.
    drums: (
      <>
        <ellipse cx="12" cy="8" rx="8" ry="3" />
        <path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8" />
      </>
    ),
    // Four strings.
    bass: (
      <>
        <path d="M5 4v16M10 4v16M14 4v16M19 4v16" />
      </>
    ),
    // Keys.
    keys: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="M8 5v8M12 5v8M16 5v8" />
      </>
    ),
    // A shaker.
    perc: (
      <>
        <ellipse cx="12" cy="9" rx="5" ry="6" />
        <path d="M12 15v6" />
      </>
    ),
  };
  return (
    <span className="jam-player-mark" data-player={player} aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {paths[player]}
      </svg>
    </span>
  );
}
