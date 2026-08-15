'use client';

import { useState } from 'react';
import Image from 'next/image';

import { TicketCard } from '@/components/candy/ticket-card';
import {
  duotoneFor,
  portraitDissolve,
  portraitScrim,
  PORTRAIT_SCRIM_TEXT_INSET,
} from '@/lib/team-utils';
import { type Driver, type Team } from '@/data/teams-data';

interface DriverPortraitProps {
  driver: Driver;
  team: Team;
  /** Eager-load. Set for the first team so the rail is never blank on arrival. */
  priority?: boolean;
  className?: string;
}

/**
 * A driver headshot washed in the team colour and dissolved into the page, mounted in a
 * ticket-stub card with the race number as a ghost mega numeral.
 *
 * The name plate and ghost number render either way, so a missing headshot degrades
 * to the text-only card the page shipped before rather than to a hole.
 *
 * The failure is tracked by driver id, not a bare boolean: a persistent instance (e.g.
 * the sticky rail whose `driver`/`team` props swap without remounting as the user
 * scrolls) must re-attempt the new driver's image rather than latching on whichever
 * driver failed first. Consumers need no `key` for this correctness — it holds across
 * prop changes on the same instance.
 *
 * **Why there is no `kicker` or `footer` on the card.** Both slots exist and moving the
 * three caption lines into a `footer` strip is the obvious-looking tidy-up. It is wrong:
 * the caption's AA guarantee comes from `portraitScrim()`, which is painted *inside* the
 * image box because the thing behind those glyphs is a photograph. A footer strip sits
 * below the image on the card surface instead, so the scrim would no longer be under the
 * text and the one measured guarantee in this file would quietly stop applying.
 */
export function DriverPortrait({ driver, team, priority, className }: DriverPortraitProps) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === driver.id;
  const duotone = duotoneFor(team);

  return (
    // The card is now the outermost element, so the caller's `className` — `aspect-[3/4] w-full`
    // — lands on it and sizes it. `TicketCard` merges `className` last, so a call site can still
    // override anything here.
    //
    // The 1px `outline` hairline this component used to draw on itself is gone: `TicketCard`
    // already paints `border border-white/10`, which is the same line at the same alpha, and two
    // of them stacked read as a thicker, slightly brighter edge rather than as a hairline.
    <TicketCard className={className}>
      {/*
        The image box, and the one piece of layout that is not obvious.

        A `fill` image needs a sized, positioned parent, and `TicketCard`'s inner content wrapper
        is a plain `relative` div with `height: auto`. Both of the usual answers therefore fail
        here, and fail *silently* — as a zero-height box, not as an error:

          - `absolute inset-0` resolves its top/bottom against that wrapper's padding box. The
            wrapper's only in-flow content would then be the absolutely positioned box itself, so
            its height is 0 and `inset-0` gives back a 0-tall strip.
          - `h-full` is `height: 100%` against the same auto-height parent, which CSS computes to
            `auto`, which is again the height of the (absolutely positioned, so out-of-flow)
            image — 0.

        So the box states its own height instead, which also makes the component self-sizing rather
        than dependent on a class it does not control. It is written as `aspect-[300/400]` — the
        headshots' own pixel dimensions, which `sips` reports as 300x400 (Leclerc's 290x400 is the
        one that crops) — and not as the literal `aspect-[3/4]` the caller passes, for two reasons.
        It says *why* the ratio is what it is, and `team-section.test.tsx` uses the literal
        call-site class as the marker that identifies a portrait in the tree: a second element
        carrying that exact string inside this component would silently double its count.

        The card's aspect and this one are 0.67px apart at any width (the card's applies to its
        border box, this one's to a content box 2px narrower); the residue is a sub-pixel strip of
        card surface below the caption, inside the card's own `overflow-hidden`.

        Rejected: reaching into `TicketCard`'s DOM from the card's className with arbitrary
        variants (`[&>div]:h-full` and friends) to make the `h-full` chain resolve. It works, and
        it breaks the moment that component's internal markup changes, with no test able to see it.

        `isolate` is kept from the previous version and is load-bearing for the wash below:
        `mix-blend-color` blends with everything in its stacking context, and without a context of
        its own here it would also tint the card's border and topo texture.

        No `overflow-hidden` on this box, deliberately — `TicketCard` already clips, and letting it
        be the only clipper is what allows the ghost numeral to bleed off an edge.
      */}
      <div className="relative isolate aspect-[300/400] w-full bg-gradient-to-b from-zinc-800/70 to-zinc-950">
        {!failed && (
          <>
            <Image
              src={driver.headshot}
              alt={driver.name}
              fill
              sizes="(max-width: 1024px) 50vw, 180px"
              priority={priority}
              onError={() => setFailedId(driver.id)}
              className="object-cover object-top"
            />
            {/* Team-colour wash. Sits above the image, below the plate. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 mix-blend-color"
              style={{ backgroundColor: duotone.color, opacity: duotone.opacity }}
            />
          </>
        )}

        {/*
          Dissolve into the page so the portrait has no hard bottom edge — and nothing more than
          that. It used to reach full `zinc-950` at the bottom, which was right while it was the only
          thing there; the caption scrim now covers that same edge at 0.9, and the two composited to
          opaque over the bottom third of every headshot. Its strength is bounded below the scrim's
          in `PORTRAIT_DISSOLVE_ALPHA` so the scrim stays the thing that backs the caption, which is
          what `portraitCaptionBackdrop` claims to describe.
        */}
        <div
          data-testid="portrait-dissolve"
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: portraitDissolve() }}
        />

        {/*
          The race number as a ghost mega numeral — the card's signature element, kept in both
          states.

          **"Behind the portrait" cannot be taken literally, and that is measured rather than
          assumed.** The headshots are opaque: `sips -g hasAlpha public/drivers/charles-leclerc.png`
          reports `hasAlpha: no` at 290x400 (Albon's is 300x400, same answer), and the image is
          `fill` + `object-cover`, so it covers the whole box. A numeral painted in a lower stacking
          layer than the image is not ghostly, it is *gone*. So it paints above the image and below
          the caption scrim — the DOM order here is the whole mechanism — at an opacity low enough
          to read as though it were underneath. Moving it below the `<Image>` "to match the spec"
          would delete it from the visible page while looking like a correction, which is why
          `driver-portrait.test.tsx` asserts the tree order of image → numeral → caption outright.

          Sized in `rem` rather than at `.text-mega`'s viewport clamp: this card is ~160px wide
          inside the section's 340–380px driver column, and `.text-mega` is `clamp(4rem, 14vw,
          12rem)` against the *viewport*, which at 1440 is 192px — wider than the card it would sit
          in. 7rem is two digits at roughly 0.85 of the card's width, so it bleeds off the right
          edge as intended rather than being clipped to unreadability.

          The failed branch keeps the higher opacity: with no photograph there is nothing else on
          the card, and the numeral has to carry it alone.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-3 -top-5 select-none font-display text-[7rem] font-black leading-none text-ink"
          style={{ opacity: failed ? 0.18 : 0.12 }}
        >
          {driver.number}
        </span>

        {/*
          The caption's own scrim, and the one thing here that is not a colour decision: these three
          lines sit on a photograph, so what is behind them cannot be known — and two of them, the
          white name and the neutral short code, never pass through the colour layer at all. Over a
          pale race suit the name measured 1.13:1 and the nationality 1.89:1.

          The dissolve gradient above is not this: it peaks at `PORTRAIT_DISSOLVE_ALPHA` (0.6) at the
          very bottom edge and is ~0.4 of that where the first line of text sits, because its job is
          to blend the portrait into the page rather than to back the text. `portraitScrim` is flat
          at full strength behind
          the text and fades out above it, and `PORTRAIT_SCRIM_TEXT_INSET` is what keeps the text out
          of that fade, where the guarantee stops holding.
        */}
        <div
          className="absolute bottom-0 left-0 right-0 px-3 pb-3"
          style={{ background: portraitScrim(), paddingTop: PORTRAIT_SCRIM_TEXT_INSET }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: duotone.keyline }}>
            {driver.nationality}
          </p>
          <p className="mt-0.5 text-sm font-bold leading-tight text-ink">{driver.name}</p>
          {/*
            `zinc-400`, and it stays `zinc-400` even though every other resting neutral inside a
            team section moved up a rung to `zinc-300` this phase. That floor exists because the
            section paints a team-colour gradient and a glow behind its copy; this run is under the
            scrim, which is opaque enough (0.9 over the worst case a photograph can be) that neither
            layer is what is behind it. It is judged by `portraitCaptionBackdrop()`, where it
            measures 6.1:1. Raising it here would be harmless but would also imply the scrim does
            not hold, which is the opposite of what this component is built on.
          */}
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">
            {driver.shortCode}
          </p>
        </div>

        {/* Screen-reader-visible number; the ghost numeral above is decorative. */}
        <span className="sr-only">Car number {driver.number}</span>
      </div>
    </TicketCard>
  );
}
