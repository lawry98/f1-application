import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: ['./components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
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
        /** Alias of f1-red, for new code where "brand" reads better than "f1-red". */
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
      },
      animation: {
        sweep: 'sweep 1.6s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
