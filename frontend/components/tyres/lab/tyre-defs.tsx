import { CX, CY, R, THERMAL, clamp01, type ThermalState } from './tyre-geometry';

/**
 * A namespaced id maker. Every `<defs>` entry in the lab goes through one of these.
 *
 * SVG ids are **document-global**, so two tyres on screen at once — which happens on every
 * compound transition, and on the directions page happens three times over — make both resolve
 * `url(#rubber)` to whichever the browser parsed first. The visible symptom is the outgoing tyre
 * repainting itself in the incoming tyre's colour mid-flight, i.e. exactly the frame the eye is
 * on. `tyre-visual.tsx` already learned this; the lab inherits the rule.
 */
export type IdFor = (name: string) => string;

export function makeIdFor(uid: string): IdFor {
  const safe = uid.replace(/:/g, '');
  return (name: string) => `${name}-${safe}`;
}

export interface TyreDefsProps {
  idFor: IdFor;
  color: string;
  thermal?: ThermalState | null;
  /** 0 dry, 1 standing water. Drives the moisture sheen and droplet opacity. */
  wet?: number;
  /**
   * Scales the heat map's opacity without changing its colour ramp.
   *
   * The thermal direction wants the full-strength map — it is the subject. A photographic
   * direction wants a hint of it, because at full strength the optimal-window yellow paints the
   * whole tread band gold and a black tyre stops reading as rubber. Same data, two exposures.
   */
  heatScale?: number;
}

/**
 * Every gradient, mask and filter the tyre body and its overlays draw with.
 *
 * Kept in one component rather than inlined so a direction can mount the defs once and then
 * stamp the body several times — the blueprint direction draws four separated rings that all
 * share this rubber gradient, and re-declaring it per ring would quadruple the parse cost for an
 * identical result.
 */
export function TyreDefs({
  idFor,
  color,
  thermal = null,
  wet = 0,
  heatScale = 1,
}: TyreDefsProps) {
  const base = thermal ? THERMAL[thermal] : null;
  const heat = base ? { ...base, intensity: base.intensity * clamp01(heatScale) } : null;
  const wetness = clamp01(wet);

  return (
    <defs>
      {/* Body rubber. Light comes from upper-left in every direction, so the highlight sits at
          36%/26% and the falloff runs to the page's own near-black rather than to a grey — a
          rubber edge that stops at #222 reads as a cut-out sticker against `base`. */}
      <radialGradient id={idFor('rubber')} cx="36%" cy="26%" r="82%">
        <stop offset="0%" stopColor="#46464e" />
        <stop offset="36%" stopColor="#25252a" />
        <stop offset="72%" stopColor="#151518" />
        <stop offset="100%" stopColor="#09090b" />
      </radialGradient>

      <radialGradient id={idFor('rim')} cx="34%" cy="26%" r="82%">
        <stop offset="0%" stopColor="#63636c" />
        <stop offset="50%" stopColor="#303036" />
        <stop offset="100%" stopColor="#141417" />
      </radialGradient>

      <linearGradient id={idFor('sheen')} x1="0.1" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
        <stop offset="34%" stopColor="#ffffff" stopOpacity="0.04" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>

      <linearGradient id={idFor('groove')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000000" stopOpacity="0.92" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
      </linearGradient>

      {/* The key light grazing the shoulder, tinted with the compound so the highlight belongs to
          this tyre instead of reading as a generic gloss. */}
      <linearGradient id={idFor('spec')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
        <stop offset="45%" stopColor="#ffffff" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>

      {/* A hard rim-light along the lower-right edge — the counter-light that separates the tyre
          from the background in the spotlight direction. Without it the carcass gradient runs to
          the same value as the page and the silhouette dissolves. */}
      <linearGradient id={idFor('rimlight')} x1="1" y1="1" x2="0.2" y2="0.1">
        <stop offset="0%" stopColor={color} stopOpacity="0.9" />
        <stop offset="28%" stopColor={color} stopOpacity="0.25" />
        <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>

      {/* Tread band only. Grooves, heat and scuffing are all clipped to the annulus so none of
          them ever paint across the sidewall face. */}
      <mask id={idFor('tread')}>
        <circle cx={CX} cy={CY} r={R.carcass} fill="#fff" />
        <circle cx={CX} cy={CY} r={R.treadInner} fill="#000" />
      </mask>

      {/* The contact patch: the part of the tread actually touching the road. Used to darken and
          deform the bottom of the tyre, and as the mask for the heat bloom that a real contact
          patch generates. */}
      <radialGradient id={idFor('contact')} cx="50%" cy="97%" r="34%">
        <stop offset="0%" stopColor="#000000" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>

      {heat && (
        <>
          {/* Surface temperature. Hottest at the shoulder that is doing the work, cooling towards
              the centre — which is why this is a ring-biased gradient rather than a hot core. */}
          <radialGradient id={idFor('heat')} cx="50%" cy="50%" r="50%">
            <stop offset="62%" stopColor={heat.edge} stopOpacity="0" />
            <stop offset="78%" stopColor={heat.mid} stopOpacity={heat.intensity * 0.8} />
            <stop offset="92%" stopColor={heat.core} stopOpacity={heat.intensity} />
            <stop offset="100%" stopColor={heat.mid} stopOpacity={heat.intensity * 0.55} />
          </radialGradient>

          {/* Heat haze. Bounded to the tyre's own box on purpose — an unbounded turbulence filter
              over a full-viewport rect is the single most expensive thing this page could do. */}
          <filter
            id={idFor('haze')}
            x="-8%"
            y="-8%"
            width="116%"
            height="116%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.014 0.05"
              numOctaves={2}
              seed={7}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={heat.intensity * 9}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </>
      )}

      {wetness > 0 && (
        <>
          {/* A wet tyre is not a dark tyre, it is a *specular* tyre: the water film turns diffuse
              rubber into a mirror, so this is a tight bright streak rather than a wash. */}
          <linearGradient id={idFor('wetfilm')} x1="0.15" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#cfe9ff" stopOpacity={0.34 * wetness} />
            <stop offset="18%" stopColor="#8ec5f0" stopOpacity={0.12 * wetness} />
            <stop offset="45%" stopColor="#ffffff" stopOpacity={0.05 * wetness} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <radialGradient id={idFor('droplet')}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.85 * wetness} />
            <stop offset="60%" stopColor="#bfe0ff" stopOpacity={0.35 * wetness} />
            <stop offset="100%" stopColor="#bfe0ff" stopOpacity="0" />
          </radialGradient>
        </>
      )}

      {/* Rubber grain. One tile, reused — a noise *filter* over the whole tread would rasterise a
          400x400 area every frame the tyre rotates, where a pattern is drawn once and then just
          transformed by the GPU. */}
      <pattern
        id={idFor('grain')}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(24)"
      >
        <rect width="7" height="7" fill="none" />
        <circle cx="1.4" cy="1.9" r="0.62" fill="#000" fillOpacity="0.4" />
        <circle cx="4.9" cy="4.2" r="0.5" fill="#000" fillOpacity="0.3" />
        <circle cx="5.8" cy="1.1" r="0.34" fill="#fff" fillOpacity="0.05" />
        <circle cx="2.3" cy="5.6" r="0.4" fill="#fff" fillOpacity="0.04" />
      </pattern>

      {/* Marbles: the balls of shed rubber that collect off the racing line. Only ever drawn at
          high wear, which is the only time they exist. */}
      <pattern
        id={idFor('marbles')}
        width="26"
        height="26"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-12)"
      >
        <circle cx="5" cy="7" r="1.8" fill="#0c0c0e" fillOpacity="0.75" />
        <circle cx="18" cy="15" r="1.3" fill="#0c0c0e" fillOpacity="0.6" />
        <circle cx="11" cy="21" r="2.2" fill="#131316" fillOpacity="0.7" />
        <circle cx="22" cy="3" r="1" fill="#0c0c0e" fillOpacity="0.5" />
      </pattern>
    </defs>
  );
}
