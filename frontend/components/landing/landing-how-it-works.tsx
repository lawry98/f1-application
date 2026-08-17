// `'use client'` is forced by `useScroll` (and the `useRef` it needs a target for) below — the
// connector line's scaleY is driven from this section's own scroll progress, which no server
// component can compute. Every other landing section stays a server component; this one cannot.
// Note it is deliberately *not* `async`: RTL can only render a synchronous component.
'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

import { BlurFadeReduced } from '@/components/candy/blur-fade-reduced';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    number: '01',
    title: 'Enter your race',
    description:
      'Type any Grand Prix name — "Monaco", "Silverstone 2023", "Japanese GP" — or pick from the upcoming race calendar. The agent handles fuzzy matching and historical queries.',
  },
  {
    number: '02',
    title: 'Agent plans & executes',
    description:
      'A LangGraph agent resolves the race, determines which data sources are relevant, and executes tools in sequence: track profile, race results, driver standings, weather, and news.',
  },
  {
    number: '03',
    title: 'Gemini synthesizes',
    description:
      'Gemini 3.6 Flash reads all gathered data and synthesizes it into a structured, insightful briefing — not a data dump, but coherent analysis calibrated for the race weekend ahead.',
  },
  {
    number: '04',
    title: 'Your briefing, ready',
    description:
      'Receive track context, driver form, weather forecast, championship standings, and strategic outlook — all in one structured document. Streamed live as it generates.',
  },
] as const;

/**
 * ── The two numbers that must move together ──────────────────────────────────────────────────
 *
 * The numeral column is fixed at **3rem** and the numeral is centred in it, so the connector line
 * sits at **1.5rem** — exactly half of it. These are one measurement expressed twice; changing
 * either alone puts the line off the numerals' axis, which is the single most visible way this
 * section can look broken. They were 4.5rem / 2.25rem when the numeral was a bordered tile.
 *
 * 3rem is deliberately wider than the glyphs need (two Archivo digits at 2rem measure ~2.2rem),
 * because the extra ~0.4rem each side is what lets the numeral's `bg-base` backdrop mask the line
 * behind it rather than clipping tight against the digits — see the numeral's own comment.
 */
const NUMERAL_COLUMN = 'w-12'; // 3rem
const CONNECTOR_LEFT = 'left-[1.5rem]'; // 3rem / 2 — derived from NUMERAL_COLUMN, never set alone

/**
 * The numeral's backdrop, and the third number in this file that cannot be set on its own.
 *
 * The numeral is not a tile and wants no chrome; this opaque patch exists only to mask the
 * connector line where it would otherwise run through the gaps *between* the two digits. So it has
 * to be **exactly the colour of the section behind it**, and since Phase 7 that colour is not
 * `base` any more: `app/page.tsx` assigns this section the `base-warm` tone. Leaving this at
 * `bg-base` would paint a cold rectangle on a warm slab at every step — the single most visible
 * way this section can look broken, and one that no test asserting classes on the *section* would
 * catch. `tests/landing-page.test.tsx` pins the pair instead.
 *
 * The one moment the two disagree is while the wrapper is mid-transition, or before it has warmed
 * at all: the numeral is warm and the section is still `base`. That is 11 levels of red on
 * near-black across a 48 px patch, and the wrapper's `rootMargin` means it only ever happens while
 * the section is outside the middle 60% of the viewport — where these numerals are not on screen.
 */
const NUMERAL_MASK = 'bg-base-warm';

/**
 * ── Scroll tuning, kept together so it is easy to find and retune ─────────────────────────────
 *
 * `SCROLL_OFFSET` is the window over which the line draws, expressed as
 * `[<target point> <viewport point>, …]`:
 *
 *   - `'start 0.8'`  — progress 0 when the *top* of the step list is 80% of the way down the
 *     viewport, i.e. the moment step 01 has just cleared the fold. Starting at `'start end'`
 *     (the default) would have the line already part-drawn before anything is readable.
 *   - `'end 0.75'`   — progress 1 when the *bottom* of the list reaches 75% down the viewport,
 *     so the line finishes with step 04 fully on screen rather than at the moment it scrolls
 *     out of the top.
 *
 * `SCROLL_COMPLETE_AT` then maps that window's first 85% onto the full 0→1 scale: the line is
 * fully drawn slightly *before* the reader reaches the end of the list. A line still visibly
 * creeping while you read the last step reads as lag, not as motion.
 *
 * These are judged in a browser, not here — jsdom produces no scroll geometry at all.
 */
const SCROLL_OFFSET = ['start 0.8', 'end 0.75'] as const;
const SCROLL_COMPLETE_AT = 0.85;

export function LandingHowItWorks() {
  const stepsRef = useRef<HTMLDivElement>(null);
  // `useReducedMotionSafe`, not motion's own hook. This branch decides an *inline style* — the
  // connector's `scaleY` is either a literal 1 or a MotionValue reading 0 at rest — and this
  // component is server-rendered like every other client component in the app. Motion's
  // `useReducedMotion()` returns `null` on the server and the real preference on the client's
  // first render, so under the preference the two passes disagree on `transform` and React 18
  // reports a hydration mismatch on a `style` attribute exactly as it does on a text node. The
  // safe hook reports `false` until a layout effect has run, so the two passes agree and the flip
  // lands before paint. See `hooks/use-reduced-motion-safe.ts`.
  const prefersReducedMotion = useReducedMotionSafe();

  const { scrollYProgress } = useScroll({
    target: stepsRef,
    // `offset` is typed as a mutable array, so the `as const` tuple above needs spreading.
    offset: [...SCROLL_OFFSET],
  });
  // Hooks cannot be called conditionally, so the transform is always built; the reduced-motion
  // branch simply never reads it and hands `scaleY` the literal 1 instead. That is the "no scroll
  // binding, fully drawn" state — a line left at scaleY 0 is an *invisible* connector, which is
  // strictly worse than no animation at all.
  const drawnScaleY = useTransform(scrollYProgress, [0, SCROLL_COMPLETE_AT], [0, 1]);

  return (
    // No `bg-*`: `app/page.tsx` wraps every landing section in a `LandingSectionTheme` that owns
    // the surface colour, and a background here would paint over it. This section's tone is
    // `base-warm` — see `NUMERAL_MASK` above, which has to be the same colour.
    <section id="how-it-works" className="py-24" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto max-w-7xl px-4">
        {/* Section header */}
        <BlurFadeReduced inView delay={0} direction="up">
          <div className="mb-16 max-w-2xl">
            {/* The kicker used to be `text-sm … text-f1-red`, which is small red text: f1-red on
                `base` measures 4.01:1, clearing WCAG's 3:1 large-text bar but not the 4.5:1 small
                one. The shared replacement moves the colour into a decorative bar and leaves the
                label grey. */}
            <p className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              <span className="h-1.5 w-5 flex-shrink-0 bg-f1-red" aria-hidden="true" />
              How it works
            </p>
            {/* Mixed type: ALL-CAPS display, with `in seconds` as the one serif-italic accent run.
                Case is set in the markup (`uppercase` on the h2, `normal-case` on the span) so the
                serif stays sentence-case — that contrast is the point of the treatment. Red is
                allowed at this size: the h2 is 36px+, well over the 24px large-text threshold. */}
            <h2
              id="how-it-works-heading"
              className="font-display text-4xl uppercase leading-[0.95] tracking-tight text-ink lg:text-5xl"
            >
              From query to briefing{' '}
              <span className="font-serif-display text-[1.05em] normal-case italic text-f1-red">
                in seconds
              </span>
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Four steps. One pipeline. Powered by LangGraph and Claude AI.
            </p>
          </div>
        </BlurFadeReduced>

        {/* Steps */}
        <div ref={stepsRef} className="relative">
          {/*
           * The connector, drawn downward as the section scrolls through the window above.
           *
           * `transformOrigin: 'top'` is what makes a scaleY read as *drawing* rather than as
           * growing from the middle. Transform only, absolutely positioned, `aria-hidden` — it can
           * never move a pixel of content, so CLS stays 0 whatever the scroll position.
           *
           * The gradient stops at `zinc-800` rather than the old `to-transparent`: scaleY stretches
           * the gradient along with the box, so a transparent tail means the leading edge of the
           * draw — the exact part the eye is following — is always the invisible part.
           *
           * `data-testid` exists because there is nothing else stable to select this by: it holds
           * no text, and its classes are all presentational and expected to be retuned.
           */}
          <motion.div
            data-testid="how-it-works-connector"
            className={cn(
              'absolute top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-f1-red/60 via-zinc-700 to-zinc-800 lg:block',
              CONNECTOR_LEFT,
            )}
            style={{
              scaleY: prefersReducedMotion ? 1 : drawnScaleY,
              transformOrigin: 'top',
            }}
            aria-hidden="true"
          />

          <div className="space-y-10">
            {STEPS.map(({ number, title, description }, i) => (
              <BlurFadeReduced key={number} inView delay={0.1 * i} direction="up">
                <div className="flex gap-6 lg:gap-8">
                  {/* Step number */}
                  <div className="flex-shrink-0">
                    {/*
                     * A **bare** numeral, not the previous bordered/rounded tile. The editorial
                     * reading is the one the spec asks for — "timeline steps 01–04 in display at
                     * 2rem" describes type, not a component — and a tile at 2rem would be a small
                     * box holding small type, which is neither the old design nor the new one. The
                     * only chrome that survives is the `NUMERAL_MASK` backdrop, which exists purely
                     * to mask the connector line where it would otherwise run straight through the
                     * glyphs; `relative` is load-bearing with it, because the line is absolutely
                     * positioned and would paint over a statically positioned numeral.
                     *
                     * `text-f1-red` on step 01 is red text, but legal red text: 2rem is 32px,
                     * comfortably past the 24px large-text threshold where f1-red's 4.01:1 is
                     * sufficient. Do not "fix" this to match the no-small-red-text rule — the rule
                     * is about small text, and this is not.
                     */}
                    <div
                      className={cn(
                        'relative flex justify-center py-1 font-display text-[2rem] tabular-nums leading-none tracking-tight',
                        NUMERAL_MASK,
                        NUMERAL_COLUMN,
                        i === 0 ? 'text-f1-red' : 'text-zinc-600',
                      )}
                      aria-hidden="true"
                    >
                      {number}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="pb-2 pt-1">
                    <h3 className="mb-2 font-display text-xl uppercase tracking-tight text-ink">
                      {title}
                    </h3>
                    <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
                      {description}
                    </p>
                  </div>
                </div>
              </BlurFadeReduced>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
