import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { focusPagePrimary } from "./hooks/usePageFocus";

/**
 * The window's first Tab stop (acceptance P2-8, 2026-11-18): from it, Enter
 * lands on the page's primary control — Today's Start, a tool's Play, the
 * Session's big button — or its heading. Before it, Start on Today was
 * fifteen Tabs away, behind the title bar, the rail and the context chips.
 *
 * Out of sight until it has keyboard focus, so it costs a mouse user nothing.
 */
export function SkipLink({ root, view }: { root: RefObject<HTMLElement>; view: string }) {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="skip-link"
      data-testid="skip-link"
      onClick={(e) => {
        e.preventDefault();
        focusPagePrimary(root.current, view);
      }}
      // Enter is a hotkey on some pages (the window's dispatcher listens on
      // the document), and here it must follow the link: handled before it
      // gets there.
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        focusPagePrimary(root.current, view);
      }}
    >
      {t("skipLink")}
    </a>
  );
}
