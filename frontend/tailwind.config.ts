import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  /**
   * `./lib/**` is in here for one reason and it is not tidiness: `lib/focus.ts` is the only place
   * `focus-visible:ring-f1-red` and `focus-visible:ring-ink` are written, and Tailwind generates a
   * utility only if it reads that string somewhere in `content`. Without this entry those two rules
   * are never emitted, so every control built from `focusRing` / `focusRingOffsetBase` /
   * `focusRingOnRedFill` keeps `ring-2` and falls back to Tailwind's **default blue**
   * `--tw-ring-color` — measured at `rgb(59 130 246 / 0.5)` on a live focused control.
   *
   * That failure is invisible to everything except a browser: the class really is on the element,
   * jsdom computes no CSS so the tests asserting the class pass, and a screenshot cannot see a ring
   * that only paints on `:focus-visible`. Same family as the `duration-[600ms]` class that produced
   * no rule and silently ran at 150ms. Any new module outside `components/`/`app/` that authors a
   * class string needs adding here too.
   */
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        f1: {
          // The single saturated colour in the palette. Rationed to scribbles, redacted
          // bars, highlighted rows, primary buttons, tick marks, and glow strokes —
          // everything else is ink and greys.
          red: '#E10600',
          dark: '#18181b',
        },
        /**
         * Retained alias of `f1-red`, kept only so existing `brand-*` classes keep resolving.
         *
         * **`f1-red` is the canonical class and new code uses it**, which is the opposite of what
         * this comment used to say. The reason is greppability, not taste: this branch audits the
         * red by running `grep f1-red` over the tree, and a second token for the identical hex
         * means every such audit silently misses whatever is written the other way. The last
         * `bg-brand` in the codebase was moved to `bg-f1-red` for exactly that, so the grep is
         * currently complete — adding a `brand-*` use would quietly break it again.
         *
         * Not deleted, because removing the token turns any stale usage into a class that resolves
         * to nothing and renders transparent rather than failing the build.
         */
        brand: '#E10600',
        /**
         * Warm off-white for display headlines. Pure white against #09090B reads as a
         * screenshot of a screen; ink reads as printed matter, which is the whole point.
         */
        ink: '#F4F4ED',
        base: '#09090B',
        /** Red-tinted dark, for sections that alternate against `base`. */
        'base-warm': '#140B0B',
        /** Defined so the palette has a second voice available. Deliberately unused. */
        volt: '#D2FF00',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
        /** Heavy grotesk for ALL-CAPS display headlines. Variable wght + wdth. */
        display: ['var(--font-archivo)', ...defaultTheme.fontFamily.sans],
        /** Italic serif for the one or two accent words inside a display headline. */
        'serif-display': ['var(--font-instrument-serif)', ...defaultTheme.fontFamily.serif],
      },
      transitionTimingFunction: {
        /** Expo-out. The house easing for every reveal. */
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        /**
         * The landing page's section-tone crossfade, which the spec names as "a 600 ms
         * `background-color` transition on a wrapper".
         *
         * **A real token because the arbitrary form does not work in this project.** The first
         * version of this shipped as `duration-[600ms]` and rendered at **150 ms**: the class was
         * on the element, but no rule containing `600ms` existed in any of the 780 generated
         * rules, so the element fell through to the 150 ms that `transition-[background-color]`
         * sets for itself. Tailwind here emits the standard steps (`duration-150` … `duration-700`)
         * and does **not** emit arbitrary durations, so the utility was silently inert. Surviving a
         * clean `.next` wipe and a full rebuild is what ruled out a stale JIT cache.
         *
         * The failure is invisible from jsdom, which computes no CSS, and invisible from a
         * screenshot, which cannot see a duration — it took reading `transitionDuration` off the
         * live element. Adding the step here makes the number greppable and generated.
         */
        600: '600ms',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        // A short gradient segment crossing the panel's top edge. The segment is a quarter
        // of the track's width, so 400% of its own width carries it fully off the far end.
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        // The marquee track holds its content twice, so it is 200% of the visible width and
        // translating by half of itself lands the copy exactly where the original started —
        // the loop point is therefore invisible. Translating by 100% instead would drag the
        // whole track off screen and leave a gap for half the cycle.
        'marquee-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-right': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        sweep: 'sweep 1.6s linear infinite',
        // Linear, because any easing on an infinite loop reads as a stutter at the seam.
        'marquee-left': 'marquee-left 40s linear infinite',
        'marquee-right': 'marquee-right 40s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
