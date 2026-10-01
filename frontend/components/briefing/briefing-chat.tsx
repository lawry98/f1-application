'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircuitGlow } from '@/components/candy/circuit-glow';
import { RedactedReveal } from '@/components/candy/redacted-reveal';
import {
  calendarYearOf,
  exampleForFailure,
  exampleHref,
  featuredExample,
} from '@/lib/briefing-examples';
import { focusRing, focusRingInk, focusRingOnRedFill } from '@/lib/focus';
import { useBriefing } from '@/hooks/use-briefing';
import { useRaces, roundFor } from '@/hooks/use-races';
import { formatCountdown, noticeAnnouncement, noticeMessage } from '@/lib/briefing-notice';
import { toPoints } from '@/lib/circuit-geometry';
import { cn } from '@/lib/utils';
import monaco from '@/data/circuits/mc-1929.json';
import { BriefingCard } from './briefing-card';
import { BriefingCircuitBand } from './briefing-circuit-band';
import { BriefingExampleView, SavedExampleOffer } from './briefing-example';
import { BriefingLoader } from './briefing-loader';
import { InterruptedNote } from './interrupted-note';
import { ToolTrace } from './tool-trace';
import { RaceSelector } from './race-selector';

/**
 * Monaco, statically imported rather than loaded through `loadCircuitByLocation`.
 *
 * The empty state's circuit is fixed at build time, so the dynamic path buys nothing and costs a
 * chunk request on a screen whose whole job is to appear instantly. `circuit-geometry.ts`'s module
 * docstring names this as the intended static-caller path, and `toPoints` exists so the static and
 * dynamic paths agree on the JSON↔`Point` boundary instead of each re-deriving it.
 *
 * Module scope, not render: `CircuitGlow` memoises its scaling and its path string on the `points`
 * array's identity, so a fresh array per render would defeat both.
 */
const MONACO_POINTS = toPoints(monaco.points);

export interface BriefingChatProps {
  /**
   * The saved example to show instead of a live briefing — `/briefing?example=<id>`. Read from
   * the URL by {@link BriefingChatFromUrl}, never seeded into state: the URL is the one source,
   * the rule `/standings` learnt the hard way (see CLAUDE.md).
   */
  exampleId?: string | null;
}

/** The example the page links to from under the input; `null` when none is committed. */
const FEATURED_EXAMPLE = featuredExample();

export function BriefingChat({ exampleId = null }: BriefingChatProps) {
  const {
    query,
    lastQuery,
    loading,
    race,
    raceInfo,
    briefing,
    truncated,
    interrupted,
    toolTrace,
    toolPlan,
    error,
    statusMessage,
    step,
    startedAt,
    notice,
    retryInSeconds,
    setQuery,
    submit,
    retry,
  } = useBriefing();
  // A refusal is waiting out its Retry-After: nothing that could start a briefing is live, and
  // the hook clears `notice` itself when the wait is over, which is what unlocks them again.
  const waiting = notice !== null;
  // `races` is the whole calendar and `upcoming` the six the chip row shows. They are separate
  // because the slice is a layout decision: joining the round against it made ROUND — the band's
  // headline row — exist only when the requested race happened to be one of the next six events.
  const { races, upcoming, loading: racesLoading } = useRaces();

  // The saved example replaces every live block below the form while the URL names one.
  const live = exampleId === null;

  /*
   * A run that could not finish — refused, out of time, failed, cut before any prose, or never
   * reached the backend — offers the saved example for its race, so the demo never dead-ends.
   * Once, in the first of its boxes on screen: a refused retry shows the notice and the
   * interrupted note together. A truncated briefing offers nothing: it finished, with what it
   * had (ADR-0002), and so does an interrupted one that kept prose.
   */
  const cutBeforeProse = interrupted && !briefing;
  const offer =
    !loading && (error !== '' || notice !== null || cutBeforeProse)
      ? exampleForFailure(raceInfo, lastQuery, calendarYearOf(startedAt))
      : null;
  const offerIn = !offer ? null : error ? 'error' : notice ? 'notice' : 'interrupted';

  /**
   * Starting a live run leaves the example view. The URL is the only write, as on `/standings`:
   * `useSearchParams()` follows Next's patched `replaceState`, so the view goes with it.
   */
  const start = (searchQuery?: string): void => {
    if (!live) window.history.replaceState(null, '', '/briefing');
    void submit(searchQuery);
  };

  const handleRaceSelect = (raceName: string): void => {
    setQuery(raceName);
    start(raceName);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <RaceSelector
          races={upcoming}
          loading={racesLoading}
          onSelectRace={handleRaceSelect}
          disabled={loading || waiting}
          activeRace={query}
        />

        <div className="flex gap-2">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder="Enter a circuit name (e.g., 'Monaco', 'Silverstone', 'Spa')"
            /*
             * `placeholder:text-zinc-400`, measured against the field's **own** `bg-zinc-800`
             * fill rather than against the page: 5.81:1, where `zinc-500` was 3.08:1 — the worst
             * resting run this page had. It survived a whole phase of contrast work because no
             * sweep could see it: a placeholder is an attribute, not a text node, and its colour
             * is a variant class, so `restingTextNeutrals` reports nothing about it.
             * `placeholderNeutrals` in `tests/zinc.ts` exists for exactly this run.
             */
            className={cn(
              'flex-1 border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-400',
              /*
               * The branch's shared ring, from `lib/focus.ts` — this line used to name the colour
               * and inherit `components/ui/input.tsx`'s `ring-1`, which was the only 1px ring left
               * on the branch. `cn()` is what makes the swap work: the token restates `ring-2`, so
               * twMerge drops the vendored `ring-1` on order rather than needing the vendored file
               * edited.
               *
               * Flush, no offset, for the same measured reason as the quick-select chips directly
               * above: a ring is an outer box-shadow, so it is painted outside the field's border
               * box and lands not on the field's own `bg-zinc-800` fill but on the `bg-zinc-900`
               * form card holding both controls — 3.57:1, over WCAG 2.4.11's 3:1 non-text bar.
               * Neither offset token names `zinc-900`, and a band of some other colour there is a
               * halo rather than a separator.
               */
              focusRing,
            )}
            disabled={loading}
            aria-label="Circuit name"
          />
          <Button
            onClick={() => start()}
            disabled={loading || waiting || !query.trim()}
            className={cn(
              'bg-f1-red font-semibold text-white hover:bg-red-700 disabled:bg-zinc-700',
              /*
               * The inverse ring, because this control is **filled with `f1-red`**: a red ring on
               * a red fill is 1.00:1, an absent indicator rather than a weak one, where `ink` on
               * that fill is 4.50:1. It replaces `components/ui/button.tsx`'s vendored
               * `ring-1 ring-ring`, which resolves to a light grey — visible, but the only
               * off-branch ring left on the page.
               *
               * The offset colour has to name what is really behind the button, and here that is
               * neither `base` nor `base-warm` but the form card's own `bg-zinc-900`, so it is
               * named at the call site — the same thing `/credits` does with `ring-offset-base`.
               * `focusRingOnRedFill` ships without an offset colour precisely so this cannot be
               * inherited wrong; leaving it unset would fall back to Tailwind's default white.
               */
              focusRingOnRedFill,
              'focus-visible:ring-offset-zinc-900',
            )}
          >
            {loading
              ? 'Generating...'
              : waiting
                ? `Retry in ${formatCountdown(retryInSeconds)}`
                : 'Generate'}
          </Button>
        </div>

        {FEATURED_EXAMPLE && (
          /*
           * For a visitor who only wants to look. `zinc-300` on the form card's `bg-zinc-900` is
           * 12:1; the ring is the flush red one, painted on that same card at 3.57:1, as for the
           * field and the chips above. A fixed 13px, never a breakpoint `text-base` (CLAUDE.md).
           */
          <p className="mt-3 text-[13px]">
            <Link
              href={exampleHref(FEATURED_EXAMPLE.id)}
              className={cn(
                'rounded-sm text-zinc-300 underline decoration-zinc-500 underline-offset-4 hover:text-ink',
                focusRing,
              )}
            >
              See an example briefing
            </Link>
            <span className="text-zinc-300" aria-hidden="true">
              {' '}
              →
            </span>
          </p>
        )}
      </div>

      {!live && <BriefingExampleView id={exampleId} />}

      {/*
        **Mounted from the moment the run starts, not from the moment `race_info` lands.** The
        band fills in *during* a run — `race_info` arrives 2–4 s in, several seconds before the
        first word of prose — and mounting it then inserted a block above a loader the user was
        already watching, shifting the whole page down by the band's height. Measured on a real
        stream: 0.05393 of layout shift, on a page whose spec success criterion is CLS 0. So the
        band claims its box at submit and renders no rows until it has fields to put in them.

        `round` is joined here rather than inside the band because the calendar is the parent's to
        fetch: `RaceInfo` carries no round and `Race` does, and giving the band its own fetch would
        put the same list on the wire twice. The join takes `raceInfo.year` because a Grand Prix
        keeps its name for decades — without it, "Monaco 1988" is handed this season's round.
      */}
      {live && (loading || raceInfo) && (
        <BriefingCircuitBand
          raceInfo={raceInfo}
          round={raceInfo ? roundFor(races, raceInfo.name, raceInfo.year) : null}
          className="mb-8"
        />
      )}

      {/* Not over an interrupted run: a retry keeps its note on screen until the server admits it. */}
      {live && loading && !briefing && !interrupted && (
        <BriefingLoader
          race={race}
          step={step}
          statusMessage={statusMessage}
          tools={toolTrace}
          toolPlan={toolPlan}
          startedAt={startedAt}
        />
      )}

      {live && error && (
        <div className="mb-8 rounded-lg border border-red-800 bg-red-900/20 p-4">
          {/* The emoji is gone across this page — the empty state's car, the trace's wrench and
              the card's flag all went with it. A 2px red rule carries the same "this is the bad
              one" signal at any font size and does not read as a different voice from the rest of
              the page. `text-red-400` stays: measured at 5.49:1 over `bg-red-900/20` composited on
              this page's topo backdrop, it clears AA with room, so there was nothing to fix. */}
          <p className="flex items-start gap-3 text-red-400" role="alert">
            <span className="mt-1.5 h-4 w-0.5 shrink-0 rounded-full bg-f1-red" aria-hidden="true" />
            {error}
          </p>
          {/* Outside the alert, so the alert says what went wrong and nothing else. The ink ring,
              because the red one is 3.07:1 on this red-tinted box (`lib/focus.ts`). */}
          {offer && offerIn === 'error' && (
            <SavedExampleOffer example={offer} ringClassName={focusRingInk} className="ml-3.5 mt-3" />
          )}
        </div>
      )}

      {live && notice && (
        /*
         * The cost guard's refusal — busy, or a limit spent. Not a failure, so it is neither the
         * red box above nor `role="alert"`: `role="status"` is a polite live region, and the copy
         * is plain grey on an **opaque** `bg-zinc-900`, the form card's own fill. Opaque on
         * purpose: the composite behind the glyphs is then that one colour whatever the topo
         * backdrop does underneath, and `zinc-300` on `zinc-900` is ~12:1 — measured in the
         * browser by `browser/briefing-limits.spec.ts`, not assumed. A neutral rule replaces
         * the red one for the same reason the box is not red.
         *
         * The visible copy is hidden from assistive technology and an `sr-only` twin carries
         * it instead, because a busy wait's number ticks every second and a live region
         * re-announces every change; the twin states the wait once. Body size is fixed, never a
         * breakpoint `text-base` — that is this theme's colour token and paints the text
         * `#09090b` (see CLAUDE.md).
         */
        <div className="mb-8 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <p className="flex items-start gap-3 text-zinc-300" role="status">
            <span className="mt-1.5 h-4 w-0.5 shrink-0 rounded-full bg-zinc-500" aria-hidden="true" />
            <span aria-hidden="true">{noticeMessage(notice, retryInSeconds)}</span>
            <span className="sr-only">{noticeAnnouncement(notice)}</span>
          </p>
          {/* Outside the live region: the countdown beside it repaints every second, and the
              offer is not news each time. The red ring sits flush on this opaque zinc-900, 3.57:1. */}
          {offer && offerIn === 'notice' && (
            <SavedExampleOffer example={offer} ringClassName={focusRing} className="ml-3.5 mt-3" />
          )}
        </div>
      )}

      {live && briefing && (
        <>
          <BriefingCard race={race} briefing={briefing} truncated={truncated} loading={loading} />
          {interrupted && (
            <InterruptedNote
              hasProse
              onRetry={() => void retry()}
              loading={loading}
              waitSeconds={waiting ? retryInSeconds : null}
              className="mt-6"
            />
          )}
          {/* An interrupted run never finished, so it never earns the finished trace's laurel. */}
          <ToolTrace tools={toolTrace} complete={!loading && !interrupted} />
        </>
      )}

      {live && cutBeforeProse && (
        <InterruptedNote
          hasProse={false}
          onRetry={() => void retry()}
          loading={loading}
          waitSeconds={waiting ? retryInSeconds : null}
          className="mb-8"
        >
          {offer && offerIn === 'interrupted' && (
            <SavedExampleOffer example={offer} ringClassName={focusRing} className="ml-3.5" />
          )}
        </InterruptedNote>
      )}

      {live && !briefing && !loading && !error && !notice && !interrupted && (
        <div className="relative py-20 text-center">
          {/*
            The car emoji's replacement. Grey, plain-variant Monaco behind the copy at 20%, which
            is a **contrast constraint and not a taste one**: the outline strokes `zinc-500`, and
            composited at full strength over this page's backdrop it drags `ink` down to 4.37:1 and
            `zinc-300` to 3.27:1 — both failing. At 0.20 the worst backdrop any glyph here sits on
            measures 5.03:1 for `zinc-400` and 11.68:1 for `ink`. Brightening this because it reads
            faint is how the state breaks; it is meant to read faint.

            `draw="immediate"`, not `onView`: this is the first thing on the page and there is no
            scroll to trigger anything.

            **The size is what makes it legible, and it was measured rather than guessed.** At the
            256px this first shipped at, the outline was indistinguishable from the page's own
            `TopoBackground` — which is itself built from circuit outlines, tiled at 90–200px — so
            the empty state read as texture with a heading on it and no Monaco at all. At 26rem it
            is two to four times any topo tile, which is what makes the eye read one deliberate
            figure instead of more background; the stroke thickens with the box (6 user units in a
            500-unit viewBox is 3.1px at 256 and 5.0px at 416), so no `stroke-width` override is
            needed the way `race-selector.tsx`'s 48px outlines need one.
          */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.20]"
            aria-hidden="true"
          >
            <div className="aspect-square w-[26rem] max-w-[80%]">
              <CircuitGlow points={MONACO_POINTS} variant="plain" draw="immediate" />
            </div>
          </div>

          {/* The size and the colour cannot travel through one `cn()` — `twMerge` collapses
              `text-[clamp(…)] text-ink` down to `text-ink` alone — and `RedactedReveal` puts its
              `className` through `cn()`. So `text-ink` sits on the wrapper and is inherited. */}
          <div className="relative text-ink">
            <RedactedReveal
              variant="ink"
              as="h2"
              trigger="immediate"
              className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-black uppercase leading-[0.85] tracking-[-0.035em]"
            >
              <span>Select a race</span>
            </RedactedReveal>
          </div>

          {/* The original sentence, kept verbatim — it is the only instruction on the screen. Its
              `text-zinc-500` was 3.31:1 over this page's real backdrop, not the 4.11:1 the bare
              `zinc-950` figure suggests; `zinc-400` measures 5.03:1 even over the circuit. */}
          <p className="relative mt-5 text-lg text-zinc-400">
            Select a race or enter a Grand Prix to generate your briefing
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * `/briefing`'s chat, with the saved example to show read from `?example=`.
 *
 * A wrapper rather than a read inside `BriefingChat` so the chat's own suite needs no router, and
 * so the one place the URL is read is this line. `useSearchParams` follows Back, Forward, links
 * and the patched `replaceState` alike, which is why the example is never held in state.
 */
export function BriefingChatFromUrl() {
  return <BriefingChat exampleId={useSearchParams().get('example')} />;
}
