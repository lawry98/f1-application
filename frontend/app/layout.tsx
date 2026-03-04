import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

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
    <html lang="en" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
