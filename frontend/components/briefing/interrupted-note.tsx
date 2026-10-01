'use client';

import { Button } from '@/components/ui/button';
import { formatCountdown } from '@/lib/briefing-notice';
import { INTERRUPTED_BEFORE_PROSE, INTERRUPTED_WITH_PROSE } from '@/lib/constants';
import { focusRing } from '@/lib/focus';
import { cn } from '@/lib/utils';

interface InterruptedNoteProps {
  /** Whether any prose arrived before the stream was cut — it decides what the note says. */
  hasProse: boolean;
  onRetry: () => void;
  /** A retry is already on its way to the server. */
  loading: boolean;
  /** Seconds left on a pending refusal's wait, or `null` when there is none. */
  waitSeconds: number | null;
  className?: string;
}

/**
 * The stream ended before its terminal event: the connection dropped. Rendered below the kept
 * prose, or in its place when none had arrived.
 *
 * The same neutral, **opaque** box as the cost guard's notice in `briefing-chat.tsx`, for the same
 * reasons: nothing on the page is broken — the prose above is real — so it is not the red alert
 * box, and an opaque `bg-zinc-900` makes the composite behind the glyphs that one colour whatever
 * the topo backdrop does underneath. `zinc-300` there is 11.99:1; the button's `ink` is 13.48:1 on its
 * `bg-zinc-800` fill (9.45:1 on the `zinc-700` hover), and its flush red ring lands on the box's
 * `zinc-900`, the 3.57:1 the circuit field's ring already measures on the same fill. `browser/briefing-interrupted.spec.ts`
 * measures all of it on the real page.
 *
 * `role="status"` sits on the sentence alone, so the live region announces what happened and not
 * the button's label a second time. Body size is inherited, never a breakpoint `text-base` — that
 * is this theme's colour token and paints the text `#09090b` (see CLAUDE.md).
 */
export function InterruptedNote({
  hasProse,
  onRetry,
  loading,
  waitSeconds,
  className,
}: InterruptedNoteProps) {
  return (
    <div className={cn('rounded-lg border border-zinc-700 bg-zinc-900 p-4', className)}>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="flex items-start gap-3 text-zinc-300">
          <span className="mt-1.5 h-4 w-0.5 shrink-0 rounded-full bg-zinc-500" aria-hidden="true" />
          {hasProse ? INTERRUPTED_WITH_PROSE : INTERRUPTED_BEFORE_PROSE}
        </p>
        <Button
          onClick={onRetry}
          disabled={loading || waitSeconds !== null}
          className={cn(
            'shrink-0 border border-zinc-600 bg-zinc-800 font-semibold text-ink hover:bg-zinc-700',
            focusRing,
          )}
        >
          {loading
            ? 'Generating...'
            : waitSeconds !== null
              ? `Retry in ${formatCountdown(waitSeconds)}`
              : 'Try again'}
        </Button>
      </div>
    </div>
  );
}
