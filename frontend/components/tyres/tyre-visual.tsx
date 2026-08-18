import { useId } from 'react';

import { cn } from '@/lib/utils';
import type { TyreTread } from '@/data/tyres-data';

interface TyreVisualProps {
  /**
   * The compound's colour, painted on the sidewall band.
   *
   * Decorative: this is a large filled ring, not text, so it keeps the **true** hex and is
   * never lifted for contrast. See `lib/tyre-utils.ts` for the text side of that rule.
   */
  color: string;
  tread: TyreTread;
  /** The accessible name for the whole graphic. */
  label: string;
  className?: string;
}

/** How many radial grooves each wet-weather pattern gets, and how they are cut. */
const PATTERN = {
  intermediate: { grooves: 20, width: 5.5, length: 36, skew: 11, channels: [166] },
  wet: { grooves: 16, width: 9, length: 50, skew: 16, channels: [172, 156] },
} as const;

/**
 * An F1 tyre, drawn rather than photographed.
 *
 * Original artwork, which is why the page ships no tyre image and owes no attribution. It is
 * also the only practical way to get six differently-coloured tyres that stay sharp from a
 * 96px chip to a 420px hero: one component, one `color` prop.
 *
 * **Gradient ids are scoped with `useId`.** Two of these are on screen at once during a
 * transition and SVG ids are document-global, so a fixed id would make both tyres resolve
 * every `url(#…)` to whichever the browser saw first — the outgoing tyre would repaint itself
 * in the incoming tyre's colour, mid-flight, which is exactly the frame the eye is on.
 */
export function TyreVisual({ color, tread, label, className }: TyreVisualProps) {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const pattern = tread === 'slick' ? null : PATTERN[tread];

  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label={label}
      className={cn('h-auto w-full', className)}
    >
      <defs>
        <radialGradient id={id('rubber')} cx="36%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#46464e" />
          <stop offset="36%" stopColor="#25252a" />
          <stop offset="72%" stopColor="#151518" />
          <stop offset="100%" stopColor="#09090b" />
        </radialGradient>
        <radialGradient id={id('rim')} cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#63636c" />
          <stop offset="50%" stopColor="#303036" />
          <stop offset="100%" stopColor="#141417" />
        </radialGradient>
        <linearGradient id={id('sheen')} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="34%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('groove')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </linearGradient>
        {/* The key light grazing the shoulder. Tinted with the compound colour so the
            highlight belongs to this tyre rather than reading as a generic gloss. */}
        <linearGradient id={id('spec')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Grooves are cut into the tread band only — never across the sidewall. */}
        <mask id={id('tread')}>
          <circle cx="200" cy="200" r="196" fill="#fff" />
          <circle cx="200" cy="200" r="148" fill="#000" />
        </mask>
      </defs>

      <circle cx="200" cy="200" r="196" fill={`url(#${id('rubber')})`} />

      {pattern && (
        <g mask={`url(#${id('tread')})`}>
          {Array.from({ length: pattern.grooves }, (_, i) => (
            <g key={i} transform={`rotate(${(i / pattern.grooves) * 360} 200 200)`}>
              <rect
                data-testid="tyre-groove"
                x={200 - pattern.width / 2}
                y={14}
                width={pattern.width}
                height={pattern.length}
                rx={pattern.width / 2}
                transform={`skewX(${pattern.skew})`}
                fill={`url(#${id('groove')})`}
              />
            </g>
          ))}
          {pattern.channels.map((r) => (
            <circle
              key={r}
              data-testid="tyre-channel"
              cx="200"
              cy="200"
              r={r}
              fill="none"
              stroke={`url(#${id('groove')})`}
              strokeWidth={r > 160 ? 7 : 5}
            />
          ))}
        </g>
      )}

      <circle
        cx="200"
        cy="200"
        r="194"
        fill="none"
        stroke={`url(#${id('spec')})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="300 920"
        strokeDashoffset="150"
      />
      <circle
        cx="200"
        cy="200"
        r="195"
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="2"
      />

      {/* The compound band, bevelled into the rubber: a dark trench, the colour, a shadow lip. */}
      <circle
        cx="200"
        cy="200"
        r="146"
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="17"
      />
      <circle
        data-testid="tyre-sidewall"
        cx="200"
        cy="200"
        r="146"
        fill="none"
        stroke={color}
        strokeWidth="12"
      />
      <circle
        cx="200"
        cy="200"
        r="152"
        fill="none"
        stroke="#000"
        strokeOpacity="0.35"
        strokeWidth="2"
      />

      <circle cx="200" cy="200" r="138" fill="#121215" />
      <circle cx="200" cy="200" r="138" fill={`url(#${id('sheen')})`} />
      <circle
        cx="200"
        cy="200"
        r="118"
        fill="none"
        stroke="#000"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />

      <circle cx="200" cy="200" r="106" fill={`url(#${id('rim')})`} />
      <circle
        cx="200"
        cy="200"
        r="106"
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <g fill="none" stroke="#0c0c0f" strokeWidth="10" strokeLinecap="round">
        {Array.from({ length: 10 }, (_, i) => (
          <line
            key={i}
            x1="200"
            y1="200"
            x2="200"
            y2="104"
            transform={`rotate(${i * 36} 200 200)`}
          />
        ))}
      </g>
      <circle
        cx="200"
        cy="200"
        r="106"
        fill="none"
        stroke={`url(#${id('spec')})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="170 500"
        strokeDashoffset="80"
      />
      <circle cx="200" cy="200" r="33" fill="#17171d" />
      <circle
        cx="200"
        cy="200"
        r="33"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeOpacity="0.85"
      />
      <circle cx="200" cy="200" r="9" fill="#0b0b0e" />

      <circle cx="200" cy="200" r="196" fill={`url(#${id('sheen')})`} />
    </svg>
  );
}
