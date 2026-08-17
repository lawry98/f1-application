import type { TyreTread } from '@/data/tyres-data';

import type { IdFor } from './tyre-defs';
import {
  CX,
  CY,
  R,
  TREAD_PATTERN,
  clamp01,
  polar,
  wearGeometry,
  type ThermalState,
} from './tyre-geometry';

export interface TyreBodyProps {
  idFor: IdFor;
  color: string;
  tread: TyreTread;
  /** 0 = out of the blankets, 1 = end of a long stint. */
  wear?: number;
  thermal?: ThermalState | null;
  /** 0 dry, 1 standing water. */
  wet?: number;
  /** `outline` is the blueprint direction's flat schematic; `solid` is the rendered tyre. */
  render?: 'solid' | 'outline';
  /** Draw the ground contact darkening and its heat bloom. Off for a floating/exploded tyre. */
  contactPatch?: boolean;
}

/**
 * The tyre itself, as a `<g>` rather than an `<svg>`.
 *
 * Returning a group is what lets the three art directions own their own canvas: the spotlight
 * direction needs a floor and a light pool *behind* the tyre and typography *in front* of it,
 * which is impossible if the tyre brings its own root element. Callers mount `<TyreDefs>` once
 * and then place this wherever the composition wants it.
 *
 * Everything here is `aria-hidden` by omission — the group carries no role and no label. The
 * accessible name belongs on the caller's `<svg>`, because only the caller knows whether this
 * tyre is the subject of the graphic or one of four exploded parts of it.
 */
export function TyreBody({
  idFor,
  color,
  tread,
  wear = 0,
  thermal = null,
  wet = 0,
  render = 'solid',
  contactPatch = true,
}: TyreBodyProps) {
  const pattern = tread === 'slick' ? null : TREAD_PATTERN[tread];
  const w = clamp01(wear);
  const wetness = clamp01(wet);
  const geom = pattern ? wearGeometry(pattern, w) : null;

  if (render === 'outline') {
    return <TyreOutline color={color} pattern={pattern} />;
  }

  return (
    <g>
      {/* 1 — carcass */}
      <circle cx={CX} cy={CY} r={R.carcass} fill={`url(#${idFor('rubber')})`} />

      {/* 2 — rubber grain, clipped to the tread band. Below the grooves so the grooves cut
             through it rather than sitting on a flat surface. */}
      <circle
        cx={CX}
        cy={CY}
        r={R.carcass}
        fill={`url(#${idFor('grain')})`}
        mask={`url(#${idFor('tread')})`}
        opacity={0.55 + 0.3 * w}
      />

      {/* 3 — cut pattern */}
      {pattern && geom && (
        <g mask={`url(#${idFor('tread')})`}>
          {Array.from({ length: pattern.grooves }, (_, i) => (
            <g key={i} transform={`rotate(${(i / pattern.grooves) * 360} ${CX} ${CY})`}>
              <rect
                data-testid="tyre-groove"
                x={CX - geom.width / 2}
                y={14}
                width={geom.width}
                height={geom.length}
                rx={geom.width / 2}
                transform={`skewX(${pattern.skew})`}
                fill={`url(#${idFor('groove')})`}
              />
            </g>
          ))}
          {pattern.channels.map((r) => (
            <circle
              key={r}
              data-testid="tyre-channel"
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke={`url(#${idFor('groove')})`}
              strokeWidth={(r > 160 ? 7 : 5) * geom.channelScale}
            />
          ))}
        </g>
      )}

      {/* 4 — surface temperature, under the specular layers so a hot tyre still catches light */}
      {thermal && (
        <circle
          data-testid="tyre-heat"
          cx={CX}
          cy={CY}
          r={R.carcass}
          fill={`url(#${idFor('heat')})`}
          mask={`url(#${idFor('tread')})`}
          style={{ mixBlendMode: 'screen' }}
        />
      )}

      {/* 5 — wear: graining scuffs raked across the shoulder, then shed marbles at the extreme */}
      {w > 0.15 && (
        <g mask={`url(#${idFor('tread')})`} opacity={geom ? geom.scuff : w}>
          {Array.from({ length: 26 }, (_, i) => {
            const a = (i / 26) * 360 + (i % 3) * 4;
            const outer = polar(a, R.carcass - 3);
            const inner = polar(a + 5, R.treadInner + 8 + (i % 4) * 5);
            return (
              <line
                key={a}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke="#0a0a0c"
                strokeOpacity={0.5}
                strokeWidth={1 + (i % 3) * 0.6}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}
      {w > 0.66 && (
        <circle
          cx={CX}
          cy={CY}
          r={R.carcass}
          fill={`url(#${idFor('marbles')})`}
          mask={`url(#${idFor('tread')})`}
          opacity={(w - 0.66) * 2.4}
        />
      )}

      {/* 6 — water film and beading, above the tread so it reads as sitting on the surface */}
      {wetness > 0 && (
        <>
          <circle
            data-testid="tyre-wetfilm"
            cx={CX}
            cy={CY}
            r={R.carcass}
            fill={`url(#${idFor('wetfilm')})`}
          />
          <g>
            {DROPLETS.map(([a, rr, size]) => {
              const p = polar(a, rr);
              return (
                <circle
                  key={`${a}-${rr}`}
                  cx={p.x}
                  cy={p.y}
                  r={size * (0.6 + 0.4 * wetness)}
                  fill={`url(#${idFor('droplet')})`}
                />
              );
            })}
          </g>
        </>
      )}

      {/* 7 — shoulder key light and the outer keyline that stops the silhouette dissolving */}
      <circle
        cx={CX}
        cy={CY}
        r={194}
        fill="none"
        stroke={`url(#${idFor('spec')})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="300 920"
        strokeDashoffset="150"
      />
      <circle
        cx={CX}
        cy={CY}
        r={195}
        fill="none"
        stroke={`url(#${idFor('rimlight')})`}
        strokeWidth="2.5"
      />
      <circle
        cx={CX}
        cy={CY}
        r={195}
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="2"
      />

      {/* 8 — the compound band, bevelled into the rubber: trench, colour, shadow lip */}
      <circle
        cx={CX}
        cy={CY}
        r={R.band}
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="17"
      />
      <circle
        data-testid="tyre-sidewall"
        cx={CX}
        cy={CY}
        r={R.band}
        fill="none"
        stroke={color}
        strokeWidth="12"
      />
      <circle
        cx={CX}
        cy={CY}
        r={152}
        fill="none"
        stroke="#000"
        strokeOpacity="0.35"
        strokeWidth="2"
      />

      {/* 9 — sidewall face */}
      <circle cx={CX} cy={CY} r={R.sidewall} fill="#121215" />
      <circle
        cx={CX}
        cy={CY}
        r={R.sidewall}
        fill={`url(#${idFor('sheen')})`}
        opacity={geom ? geom.sheen : 1 - 0.65 * w}
      />
      <circle
        cx={CX}
        cy={CY}
        r={R.sidewallInner}
        fill="none"
        stroke="#000"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />

      {/* 10 — rim, spokes, and the light catching one side of them */}
      <circle cx={CX} cy={CY} r={R.rim} fill={`url(#${idFor('rim')})`} />
      <circle
        cx={CX}
        cy={CY}
        r={R.rim}
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <g fill="none" stroke="#0c0c0f" strokeWidth="10" strokeLinecap="round">
        {Array.from({ length: 10 }, (_, i) => (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={CX}
            y2={104}
            transform={`rotate(${i * 36} ${CX} ${CY})`}
          />
        ))}
      </g>
      <circle
        cx={CX}
        cy={CY}
        r={R.rim}
        fill="none"
        stroke={`url(#${idFor('spec')})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="170 500"
        strokeDashoffset="80"
      />

      {/* 11 — centre lock */}
      <circle cx={CX} cy={CY} r={R.hub} fill="#17171d" />
      <circle
        cx={CX}
        cy={CY}
        r={R.hub}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeOpacity="0.85"
      />
      <circle cx={CX} cy={CY} r={R.nut} fill="#0b0b0e" />

      {/* 12 — global gloss, then the contact patch on top of everything so the ground darkening
              also kills the gloss where the tyre is loaded */}
      <circle
        cx={CX}
        cy={CY}
        r={R.carcass}
        fill={`url(#${idFor('sheen')})`}
        opacity={geom ? geom.sheen : 1 - 0.65 * w}
      />
      {contactPatch && (
        <circle
          data-testid="tyre-contact"
          cx={CX}
          cy={CY}
          r={R.carcass}
          fill={`url(#${idFor('contact')})`}
        />
      )}
    </g>
  );
}

/**
 * The flat schematic used by the blueprint direction.
 *
 * Not a filter or an opacity pass over the solid tyre — a technical drawing is a different
 * drawing, not a faded photograph. Every ring is a stroke, the compound is the one filled thing
 * on it, and there is no light source at all.
 */
function TyreOutline({
  color,
  pattern,
}: {
  color: string;
  pattern: (typeof TREAD_PATTERN)[keyof typeof TREAD_PATTERN] | null;
}) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke">
      <circle cx={CX} cy={CY} r={R.carcass} />
      <circle cx={CX} cy={CY} r={R.treadInner} strokeDasharray="6 5" strokeOpacity="0.55" />
      <circle cx={CX} cy={CY} r={R.band} stroke={color} strokeWidth="7" strokeOpacity="0.95" />
      <circle cx={CX} cy={CY} r={R.sidewall} strokeOpacity="0.8" />
      <circle cx={CX} cy={CY} r={R.sidewallInner} strokeDasharray="3 6" strokeOpacity="0.4" />
      <circle cx={CX} cy={CY} r={R.rim} strokeOpacity="0.9" />
      <circle cx={CX} cy={CY} r={R.hub} strokeOpacity="0.9" />
      <circle cx={CX} cy={CY} r={R.nut} strokeOpacity="0.6" />
      <g strokeOpacity="0.55">
        {Array.from({ length: 10 }, (_, i) => (
          <line
            key={i}
            x1={CX}
            y1={CY - R.hub}
            x2={CX}
            y2={CY - R.rim}
            transform={`rotate(${i * 36} ${CX} ${CY})`}
          />
        ))}
      </g>
      {pattern && (
        <g strokeOpacity="0.7">
          {Array.from({ length: pattern.grooves }, (_, i) => (
            <g key={i} transform={`rotate(${(i / pattern.grooves) * 360} ${CX} ${CY})`}>
              <rect
                data-testid="tyre-groove"
                x={CX - pattern.width / 2}
                y={14}
                width={pattern.width}
                height={pattern.length}
                rx={pattern.width / 2}
                transform={`skewX(${pattern.skew})`}
              />
            </g>
          ))}
          {pattern.channels.map((r) => (
            <circle key={r} data-testid="tyre-channel" cx={CX} cy={CY} r={r} strokeOpacity="0.5" />
          ))}
        </g>
      )}
      {/* Centre marks — the thing that makes a circle read as an engineering drawing. */}
      <g strokeOpacity="0.5" strokeWidth="1">
        <line x1={CX - 22} y1={CY} x2={CX + 22} y2={CY} />
        <line x1={CX} y1={CY - 22} x2={CX} y2={CY + 22} />
      </g>
    </g>
  );
}

/**
 * Droplet placement, authored rather than random.
 *
 * `Math.random()` here would be a hydration mismatch: the server and the client would each pick
 * their own beading and React would replace the whole group on mount. Tuples are `[degrees,
 * radius, size]`.
 */
const DROPLETS: readonly (readonly [number, number, number])[] = [
  [18, 176, 3.1],
  [47, 160, 2.2],
  [72, 186, 2.6],
  [104, 168, 1.8],
  [133, 181, 3.4],
  [166, 156, 2.0],
  [198, 190, 2.4],
  [221, 164, 3.0],
  [252, 178, 1.9],
  [286, 158, 2.7],
  [311, 187, 2.1],
  [338, 170, 3.3],
];
