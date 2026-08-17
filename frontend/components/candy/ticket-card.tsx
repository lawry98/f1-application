'use client';

import { TopoBackground } from '@/components/candy/topo-background';
import { cn } from '@/lib/utils';

/**
 * Divider treatment for the main content slot.
 *
 * `'x'` is a flex row so `divide-x` actually has adjacent siblings to draw a rule between —
 * Tailwind's `divide-*` utilities style the border of every child but the first, which only
 * reads as a grid of hairlines if the children sit next to each other. `'y'` needs no layout
 * change: block-level children already stack vertically, so `divide-y` alone is enough.
 * `'none'` adds nothing, on purpose — some call sites (a single paragraph, a custom grid) want
 * no layout opinion at all.
 */
const DIVIDE_CLASS: Record<'x' | 'y' | 'none', string> = {
  x: 'flex divide-x divide-white/10',
  y: 'divide-y divide-white/10',
  none: '',
};

export interface TicketCardProps {
  children: React.ReactNode;
  /** Small-caps label row along the top. */
  kicker?: React.ReactNode;
  /** Footer strip below the main content. */
  footer?: React.ReactNode;
  /** Which corner carries the 22px ticket-stub notch. */
  notch?: 'bottom-right' | 'none';
  /** Hairline dividers between the main content's children. 'x' lays them out as columns. */
  divide?: 'x' | 'y' | 'none';
  className?: string;
}

/**
 * Editorial ticket-stub card: a hairline-bordered panel with one clipped corner, a faint
 * topographic texture, and optional kicker/footer strips.
 *
 * **The notch and the border are in tension, and this component picks the honest option.**
 * `.notch-card`'s `clip-path` cuts through everything painted on the element it's applied to —
 * including its own `border` — so the notched corner loses its 1px hairline right at the cut and
 * reads as torn rather than drawn. The alternative (a pseudo-element redrawing two short border
 * segments across the notch) was rejected: it has to know the border colour, width and the host's
 * `border-radius` well enough to line up sub-pixel, and gets it wrong the moment either changes.
 * Keeping the border on the clipped element instead means the corner is genuinely cut with no
 * hairline across it — which, for a *ticket stub*, is the point: a real stub is torn, not
 * mitred. Whether that reads correctly on this app's dark background is a call for whoever wires
 * this into a real page to eyeball; the trade-off is deliberate, not an oversight.
 *
 * **`TopoBackground` and the content are siblings, and both need to be positioned for the DOM
 * order to control paint order.** CSS's stacking rules paint "positioned, z-index:auto" elements
 * *after* plain in-flow boxes regardless of source order, so an absolutely-positioned texture
 * would sit on top of an ordinary content `<div>` even though the texture is written first in
 * this file. Making the content wrapper `relative` moves it into the same "positioned,
 * z-index:auto" bucket as the texture, and *within* that bucket tree order decides — so the
 * content, written second, paints on top. Drop the `relative` and the texture reappears over the
 * text on every real browser despite looking identical here in the editor.
 */
export function TicketCard({
  children,
  kicker,
  footer,
  notch = 'bottom-right',
  divide = 'none',
  className,
}: TicketCardProps) {
  return (
    <div
      className={cn(
        // `overflow-hidden` is for the texture, not the notch: `clip-path` clips regardless of
        // overflow, but the SVG's `inset-0 h-full w-full` rectangle would otherwise square off
        // the three *rounded* corners `rounded-xl` is asking for.
        'relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]',
        'transition-[border-color,transform] duration-300 ease-out-expo',
        'hover:-translate-y-0.5 hover:border-white/25',
        notch === 'bottom-right' && 'notch-card',
        className,
      )}
    >
      <TopoBackground className="text-ink opacity-[0.04]" />
      <div className="relative">
        {kicker !== undefined && (
          <div className="border-b border-white/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
            {kicker}
          </div>
        )}
        <div className={cn(DIVIDE_CLASS[divide])}>{children}</div>
        {footer !== undefined && (
          <div className="border-t border-white/10 px-4 py-2.5">{footer}</div>
        )}
      </div>
    </div>
  );
}
