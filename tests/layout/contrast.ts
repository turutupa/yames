import type { Page } from "@playwright/test";

/**
 * Text contrast as a person sees it: every line of visible text under `root`,
 * its colour (the computed colour, faded by its own alpha and every ancestor's
 * opacity) against the background actually painted behind it. The background
 * comes from a screenshot of the page, not from CSS, because on the learning
 * side most text sits over the neck stage's canvas, a scrim or a gradient that
 * no `background-color` describes: it is the most common colour in the line's
 * box, where the glyphs are the minority.
 *
 * WCAG AA: 4.5:1 for body text, 3:1 for large text (24 px, or 18.66 px bold).
 * Disabled controls are exempt, as WCAG has it.
 */
export type ContrastHit = { text: string; ratio: number; need: number; size: number; fg: string; bg: string; where: string };

export async function textContrast(page: Page, root = ".main-content, .session-page"): Promise<ContrastHit[]> {
  const png = await page.screenshot({ type: "png" });
  return page.evaluate(
    async ({ b64, root }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const sx = img.naturalWidth / window.innerWidth;
      const sy = img.naturalHeight / window.innerHeight;

      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const hex = (c: number[]) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
      const parse = (s: string): number[] => {
        const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
        return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
      };
      // The background: the most common colour on a ring just outside the line's box, where
      // there are no glyphs (a big bold numeral can cover most of its own box).
      const bgOf = (x: number, y: number, w: number, h: number): number[] | null => {
        const pad = 3;
        const X = Math.max(0, Math.floor((x - pad) * sx));
        const Y = Math.max(0, Math.floor((y - pad) * sy));
        const W = Math.min(cv.width - X, Math.ceil((w + 2 * pad) * sx));
        const H = Math.min(cv.height - Y, Math.ceil((h + 2 * pad) * sy));
        if (W < 4 || H < 4) return null;
        const all = g.getImageData(X, Y, W, H).data;
        const ring = Math.max(1, Math.round(2 * sx));
        const d: number[] = [];
        for (let yy = 0; yy < H; yy++) {
          for (let xx = 0; xx < W; xx++) {
            if (yy >= ring && yy < H - ring && xx >= ring && xx < W - ring) continue;
            const i = (yy * W + xx) * 4;
            d.push(all[i], all[i + 1], all[i + 2], 255);
          }
        }
        const buckets = new Map<number, number[]>();
        for (let i = 0; i < d.length; i += 4) {
          const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
          const b = buckets.get(k) ?? [0, 0, 0, 0];
          b[0] += d[i];
          b[1] += d[i + 1];
          b[2] += d[i + 2];
          b[3] += 1;
          buckets.set(k, b);
        }
        let best: number[] = [0, 0, 0, 0];
        buckets.forEach((b) => {
          if (b[3] > best[3]) best = b;
        });
        return [best[0] / best[3], best[1] / best[3], best[2] / best[3]];
      };

      const out: Array<{ text: string; ratio: number; need: number; size: number; fg: string; bg: string; where: string }> = [];
      const roots = [...document.querySelectorAll(root)];
      const seen = new Set<Node>();
      for (const r of roots) {
        const walk = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (seen.has(n)) continue;
          seen.add(n);
          const text = (n.textContent ?? "").trim();
          if (text.length < 2 || !/[\p{L}\p{N}]/u.test(text)) continue;
          const el = n.parentElement;
          if (!el || el.closest("[disabled], [aria-disabled='true'], svg, canvas, [hidden]")) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility !== "visible" || cs.display === "none") continue;
          let op = 1;
          for (let a: Element | null = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
          if (op < 0.05) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const fg = parse(cs.color);
          const size = parseFloat(cs.fontSize);
          const bold = Number(cs.fontWeight) >= 700;
          const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
          for (const rc of range.getClientRects()) {
            if (rc.width < 4 || rc.height < 4) continue;
            if (rc.bottom < 0 || rc.top > window.innerHeight || rc.right < 0 || rc.left > window.innerWidth) continue;
            const bg = bgOf(rc.left, rc.top, rc.width, rc.height);
            if (!bg) continue;
            const a = fg[3] * op;
            const seenFg = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
            const k = ratio(seenFg, bg);
            out.push({
              text: text.slice(0, 40),
              ratio: Math.round(k * 100) / 100,
              need,
              size,
              fg: hex(seenFg),
              bg: hex(bg),
              where: el.className && typeof el.className === "string" ? el.className.split(" ")[0] : el.tagName.toLowerCase(),
            });
          }
        }
      }
      return out;
    },
    { b64: png.toString("base64"), root },
  );
}

/** The lines below AA. */
export const belowAA = (hits: ContrastHit[]) => hits.filter((h) => h.ratio < h.need);
