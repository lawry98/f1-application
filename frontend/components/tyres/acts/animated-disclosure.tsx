'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { focusRingOffsetBase, focusRingOffsetBaseWarm } from '@/lib/focus';
import { cn } from '@/lib/utils';

/** The branch's shared expressive ease — the curve the tint, lens and labels animate on. */
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

export interface AnimatedDisclosureProps {
  /** The always-visible label content, rendered inside the toggle button. */
  summary: ReactNode;
  /** The disclosed content. Pass it wrapped in its own spacing element (e.g. `space-y-5`). */
  children: ReactNode;
  /**
   * Which page surface the control sits on. Only affects the focus ring's offset colour, which
   * has to match the real backdrop or the ring paints a visible halo — see `lib/focus.ts`.
   */
  surface?: 'base' | 'base-warm';
  /** Whether the disclosure starts open. Every tyre-page disclosure ships closed. */
  defaultOpen?: boolean;
  /** `start` aligns the toggle icon to the first line of a wrapping summary (the FAQ questions). */
  align?: 'center' | 'start';
  /** `sm` is the FAQ's tighter icon; `md` (default) matches the act disclosures. */
  iconSize?: 'sm' | 'md';
  /**
   * When this value changes the disclosure snaps shut. Only needed where a parent swaps the
   * *content* without remounting; a keyed parent (the strategy panel) resets it for free and
   * needs no key here.
   */
  resetKey?: string | number;
  /** Classes for the outer wrapper — the border/spacing the old `<details>` carried. */
  className?: string;
  /** Extra classes for the toggle button (e.g. the FAQ's `py-1`). */
  summaryClassName?: string;
}

/**
 * A controlled, animated progressive-disclosure control.
 *
 * **Why not a native `<details>`.** `<details>` cannot animate its own close — removing `open`
 * collapses the content in a single frame — so this is the APG Disclosure pattern instead: a real
 * `<button>` carrying `aria-expanded` / `aria-controls` over a region that owns its height.
 *
 * **Why CSS `grid-template-rows`, not Motion.** Height is animated by transitioning the region's
 * single grid row from `0fr` to `1fr`, which resolves to the content's intrinsic height with no
 * measurement, no `height: auto` guesswork, and no dependence on a `requestAnimationFrame` loop
 * that pauses whenever the tab is not visible. Opacity, a short lift and an optional blur ride on
 * a nested element so the content slides *within* the growing window rather than the window
 * jumping. Overflow is released to `visible` only once open and at rest, so a focus ring on the
 * last link is never clipped.
 *
 * **The content stays mounted.** Collapsing to a `0fr` row rather than unmounting keeps every
 * answer and citation in the server-rendered DOM (crawlers, and the archive's contract that a
 * closed FAQ answer is still there) and lets the closing transition finish instead of vanishing.
 * Reachability of that clipped content is handled with `inert`, set imperatively so it behaves as
 * a real boolean across React 18; `inert` is deliberately *not* `display:none` /
 * `visibility:hidden` / `aria-hidden`, none of which a crawler follows and all of which would drop
 * the closed citations out of the accessibility tree.
 *
 * **Reduced motion** removes the height travel (the transition is dropped, so the row snaps), the
 * lift and the blur, and the icon spin, leaving only a short linear opacity fade — driven by
 * `useReducedMotionSafe`, which reports `false` until mounted so the server and first client
 * render agree and never trigger a hydration mismatch.
 */
export function AnimatedDisclosure({
  summary,
  children,
  surface = 'base-warm',
  defaultOpen = false,
  align = 'center',
  iconSize = 'md',
  resetKey,
  className,
  summaryClassName,
}: AnimatedDisclosureProps) {
  const reduced = useReducedMotionSafe();
  const [open, setOpen] = useState(defaultOpen);
  // Overflow is only released once the open transition has settled; during any transition (and
  // whenever closed) the region clips so the collapse reads cleanly and nothing spills.
  const [atRestOpen, setAtRestOpen] = useState(defaultOpen);

  const baseId = useId();
  const buttonId = `${baseId}-summary`;
  const regionId = `${baseId}-content`;
  const contentRef = useRef<HTMLDivElement>(null);

  // Collapsed content must not be keyboard-focusable or announced. `inert` is the only mechanism
  // that does that while leaving the markup in the DOM and out of the tools' "hidden" test.
  useEffect(() => {
    const node = contentRef.current;
    if (node) node.inert = !open;
  }, [open]);

  // Optional external reset, skipping the mount so a default-open disclosure is not slammed shut.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setOpen(false);
    setAtRestOpen(false);
  }, [resetKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (!next) setAtRestOpen(false); // clip the moment a collapse begins
      return next;
    });
  };

  const focusOffset = surface === 'base' ? focusRingOffsetBase : focusRingOffsetBaseWarm;
  // Reduced motion has no transition to end, so it releases overflow immediately.
  const overflowVisible = open && (atRestOpen || reduced);

  return (
    <div className={className}>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={toggle}
        className={cn(
          'flex w-full cursor-pointer justify-between gap-4 rounded text-left text-sm font-semibold text-ink',
          align === 'start' ? 'items-start' : 'items-center',
          focusOffset,
          summaryClassName,
        )}
      >
        {summary}
        <DisclosureIcon open={open} reduced={reduced} size={iconSize} align={align} />
      </button>

      <div
        id={regionId}
        ref={contentRef}
        className="grid"
        style={{
          // An explicit full-width column: a grid with only rows defined collapses its implicit
          // column toward min-content here, which would wrap the content into a sliver. `minmax(0,
          // 1fr)` fills the width and still allows the content to shrink rather than overflow.
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: reduced ? undefined : `grid-template-rows ${open ? 380 : 260}ms ${EXPO}`,
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'grid-template-rows' && open) setAtRestOpen(true);
        }}
      >
        <div className="min-h-0" style={{ overflow: overflowVisible ? 'visible' : 'hidden' }}>
          <div
            style={{
              opacity: open ? 1 : 0,
              transform: reduced || open ? undefined : 'translateY(-6px)',
              filter: reduced || open ? undefined : 'blur(3px)',
              transition: reduced
                ? `opacity ${open ? 140 : 120}ms linear`
                : `opacity ${open ? 280 : 220}ms ${EXPO}, transform ${open ? 280 : 220}ms ${EXPO}, filter ${open ? 280 : 220}ms ${EXPO}`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisclosureIcon({
  open,
  reduced,
  size,
  align,
}: {
  open: boolean;
  reduced: boolean;
  size: 'sm' | 'md';
  align: 'center' | 'start';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-f1-red/50 text-f1-red',
        size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        align === 'start' && 'mt-0.5',
        // Rotation is synchronised with the disclosure and travels only under motion; reduced
        // motion snaps straight to the rotated plus with no spin.
        reduced ? '' : 'transition-transform duration-300 ease-out-expo',
        open && 'rotate-45',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    </span>
  );
}
