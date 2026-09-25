import type { Page } from '@playwright/test';

import { composite, parseCssColor, wcagRatio } from './color';

/**
 * Below this, text is not "low contrast": it is not there. `sm:text-base` resolves to the
 * `base` colour token (#09090B) and paints text at 1.00:1 on the #09090B page. It reads like
 * text that failed to render, and the class string reads correctly.
 *
 * Deliberately far below AA: this sweep is a net for *invisible* text across whole routes, not
 * a contrast audit (axe and `expectContrast` do that). A high floor would drown it in the
 * approximation below.
 */
export const INVISIBLE_BELOW = 1.5;

export interface InvisibleText {
  text: string;
  path: string;
  color: string;
  backdrop: string;
  ratio: number;
}

interface Sample {
  text: string;
  path: string;
  color: string;
  backdrop: string;
}

/**
 * Scrolls the page top to bottom one viewport at a time and, at each stop, records every
 * visible element in the viewport that owns a text node. The backdrop is its nearest *opaque*
 * ancestor background (translucent layers skipped). An element under a `background-image` is
 * skipped, because its backdrop is unknowable from computed style.
 *
 * Sampling per stop, rather than once after a scroll-through, is what catches text inside
 * `BlurFade inView`, which is at opacity 0 whenever it is off screen.
 */
export async function findInvisibleText(page: Page): Promise<InvisibleText[]> {
  const samples = await page.evaluate(async (): Promise<Sample[]> => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const isOpaque = (c: string) => c.startsWith('rgb(');
    // `parseCssColor` cannot cross into the page, so the alpha channel is read here.
    const alphaOf = (c: string): number => {
      const a = /^rgba?\(([^)]+)\)$/.exec(c)?.[1]?.split(/[\s,/]+/).filter(Boolean)[3];
      return a === undefined ? 1 : a.endsWith('%') ? Number.parseFloat(a) / 100 : Number(a);
    };
    const seen = new Map<string, Sample>();

    const pathOf = (el: Element): string => {
      const parts: string[] = [];
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const index = n.parentElement ? Array.from(n.parentElement.children).indexOf(n) + 1 : 1;
        parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${index})`);
      }
      return parts.join(' > ');
    };

    const backdropOf = (el: Element): string | null => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const style = getComputedStyle(n);
        if (style.backgroundImage !== 'none') return null;
        if (isOpaque(style.backgroundColor)) return style.backgroundColor;
      }
      return 'rgb(255, 255, 255)'; // the canvas default
    };

    const sampleViewport = () => {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const ownsText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        if (!ownsText) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue; // sr-only copies
        if (rect.bottom <= 0 || rect.top >= innerHeight) continue;
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const color = getComputedStyle(el).color;
        // Transparent text (e.g. `bg-clip-text`) paints its glyphs from a background, not
        // `color`. Skipped on alpha alone: a string test like `endsWith(', 0)')` also drops every
        // opaque colour whose blue channel is 0, f1-red `rgb(225, 6, 0)` among them.
        if (alphaOf(color) === 0) continue;
        const backdrop = backdropOf(el);
        if (backdrop === null) continue;
        const path = pathOf(el);
        if (!seen.has(path)) {
          seen.set(path, { text: (el.textContent ?? '').trim().slice(0, 60), path, color, backdrop });
        }
      }
    };

    const step = Math.max(200, Math.round(innerHeight * 0.8));
    for (let y = 0; ; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await frame();
      await frame();
      sampleViewport();
      if (y + innerHeight >= document.documentElement.scrollHeight) break;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return Array.from(seen.values());
  });

  return samples
    .map((s) => {
      const backdrop = parseCssColor(s.backdrop);
      const ratio = wcagRatio(composite(parseCssColor(s.color), backdrop), backdrop);
      return { ...s, ratio };
    })
    .filter((s) => s.ratio < INVISIBLE_BELOW);
}
