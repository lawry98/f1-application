import type { Metadata } from 'next';
import { Archivo, Instrument_Serif, Inter } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/candy/smooth-scroll';

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

export const metadata: Metadata = {
  title: {
    default: 'F1 Briefing Agent',
    template: '%s | F1 Briefing Agent',
  },
  description:
    'AI-powered F1 race weekend briefings. Get comprehensive analysis including track info, weather forecasts, driver form, and race predictions — powered by Claude AI.',
  keywords: ['F1', 'Formula 1', 'race briefing', 'AI', 'Grand Prix', 'race weekend'],
  openGraph: {
    type: 'website',
    title: 'F1 Briefing Agent',
    description: 'AI-powered F1 race weekend briefings powered by Claude AI.',
    siteName: 'F1 Briefing Agent',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'F1 Briefing Agent',
    description: 'AI-powered F1 race weekend briefings powered by Claude AI.',
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
