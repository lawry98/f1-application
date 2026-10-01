import type { Metadata } from 'next';
import { Archivo, Instrument_Serif, Inter } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/candy/smooth-scroll';
import { AUTHOR_NAME, SITE_URL } from '@/lib/site';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

/**
 * Display face for ALL-CAPS headlines. `Archivo`, not `Archivo Black`: Archivo Black is a
 * static 400-only face, so it cannot reach the heavy-and-condensed setting the headlines
 * are drawn at. Archivo variable carries both a weight and a width axis, and `wdth` has to
 * be requested explicitly — next/font only ships the axes you name.
 */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
  axes: ['wdth'],
  variable: '--font-archivo',
});

/** Italic serif for the accent words inside a display headline, and for pull-quotes. */
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  style: 'italic',
  variable: '--font-instrument-serif',
});

/**
 * The icons and the share image are file conventions in this directory (`icon.svg`,
 * `apple-icon.png`, `favicon.ico`, `opengraph-image.tsx`, `twitter-image.tsx`), not entries here.
 * `metadataBase` is what turns their URLs absolute — a crawler cannot fetch a relative og:image.
 */
export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: 'F1 Briefing Agent',
    template: '%s | F1 Briefing Agent',
  },
  description:
    'AI-powered F1 race weekend briefings. Get comprehensive analysis including track info, weather forecasts, driver form, and race predictions — powered by Gemini.',
  keywords: ['F1', 'Formula 1', 'race briefing', 'AI', 'Grand Prix', 'race weekend'],
  authors: [{ name: AUTHOR_NAME }],
  creator: AUTHOR_NAME,
  openGraph: {
    type: 'website',
    title: 'F1 Briefing Agent',
    description: 'AI-powered F1 race weekend briefings powered by Gemini.',
    siteName: 'F1 Briefing Agent',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'F1 Briefing Agent',
    description: 'AI-powered F1 race weekend briefings powered by Gemini.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${archivo.variable} ${instrumentSerif.variable}`}
    >
      <body className="font-sans antialiased">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
