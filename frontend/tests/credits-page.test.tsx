import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import CreditsPage from '@/app/credits/page';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function count(dir: string, ext: string): number {
  return readdirSync(join(process.cwd(), 'public', dir)).filter((f) => f.endsWith(ext)).length;
}

/**
 * `CreditsPage` is a server component, but a **synchronous** one — it reads the credit files with
 * `readFileSync` rather than awaiting anything — so RTL can render it. An async server component
 * could not be rendered here at all, which is why the parser and the table are separate units.
 */
describe('/credits', () => {
  it('carries the fragment the /teams footer links to', () => {
    const { container } = render(<CreditsPage />);
    expect(container.querySelector('#driver-photographs')).not.toBeNull();
    expect(container.querySelector('#team-logos')).not.toBeNull();
  });

  it('shows a thumbnail for every committed photograph and logo', () => {
    const { container } = render(<CreditsPage />);
    expect(container.querySelectorAll('img')).toHaveLength(
      count('drivers', '.png') + count('logos', '.svg'),
    );
  });

  it('names what each marque mark is missing', () => {
    render(<CreditsPage />);
    expect(screen.getByText('the Ferrari wordmark')).toBeInTheDocument();
    expect(screen.getByText('the prancing-horse shield')).toBeInTheDocument();
  });

  it('summarises the two prose notes rather than rendering the markdown', () => {
    render(<CreditsPage />);
    expect(screen.getByText(/no freely licensed vector/i)).toBeInTheDocument();
    expect(screen.getByText(/repainted for a dark background/i)).toBeInTheDocument();
  });

  it('still links both raw source files', () => {
    const { container } = render(<CreditsPage />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/drivers/CREDITS.md');
    expect(hrefs).toContain('/logos/CREDITS.md');
  });

  it('credits the 3D model with its author and licence', () => {
    render(<CreditsPage />);
    expect(screen.getByRole('link', { name: 'Nimaxo' })).toBeInTheDocument();
    // getAllByRole, not getByRole: the photograph table links its own CC BY 4.0 rows to the same
    // terms URL, so this name is not unique on the page — and every one of them must agree.
    const licences = screen.getAllByRole('link', { name: 'CC BY 4.0' });
    expect(licences.length).toBeGreaterThan(0);
    for (const link of licences) {
      expect(link).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    }
  });

  /**
   * The circuit outlines are MIT, and MIT obliges the copyright notice to travel with any copy of
   * the work. `landing-hero.tsx` statically imports `data/circuits/mc-1929.json`, so a copy now
   * ships in the `/` client bundle to every visitor — which is what turned a repo-internal
   * `CREDITS.md` into an undischarged obligation and put this section on the page.
   *
   * Asserted rather than trusted because the failure is silent: nothing breaks, no test goes red,
   * and no user ever sees that the notice is missing. This is the same reason `lib/credits.ts`
   * throws on a malformed row instead of rendering an empty author.
   */
  it('discharges the MIT notice for the vendored circuit geometry', () => {
    render(<CreditsPage />);
    expect(
      screen.getByRole('link', { name: 'bacinger/f1-circuits' }),
    ).toHaveAttribute('href', 'https://github.com/bacinger/f1-circuits');
    // The copyright holder has to be named on the page, not only linked to.
    expect(screen.getByText(/Tomislav Bacinger/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIT licence' })).toBeInTheDocument();
  });

  // f1-red is 4.01:1 on zinc-950: it clears only the 3:1 large-text bar, so every use of it has
  // to be inside something set at text-2xl or larger. (4.12:1 when the brand red was #dc2626;
  // #E10600 is marginally darker. The bar it fails and the bar it clears are unchanged.)
  it('uses f1-red only on large headings', () => {
    const { container } = render(<CreditsPage />);
    const reds = Array.from(container.querySelectorAll('[class*="text-f1-red"]'));
    expect(reds.length).toBeGreaterThan(0);
    for (const el of reds) {
      expect(el.closest('.text-2xl, .text-4xl'), el.textContent ?? '').not.toBeNull();
    }
  });

  it('keeps every neutral text run above the AA contrast bar', () => {
    const { container } = render(<CreditsPage />);
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
