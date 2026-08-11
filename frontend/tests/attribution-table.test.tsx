import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AttributionTable } from '@/components/credits/attribution-table';
import { readDriverCredits, readLicenceTerms, readLogoCredits } from '@/lib/credits';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

function assets(dir: string, ext: string): string[] {
  return readdirSync(join(process.cwd(), 'public', dir))
    .filter((f) => f.endsWith(ext))
    .sort();
}

/**
 * The `src` a thumbnail actually renders with, normalised.
 *
 * `next/image` serves SVG as-is (its default loader refuses to proxy one without
 * `dangerouslyAllowSVG`) but routes a PNG through `/_next/image?url=…`, so the two variants
 * produce different attribute shapes and a raw string compare passes for one and fails for the
 * other.
 */
function thumbnailSrcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('img'))
    .map((img) => {
      const src = img.getAttribute('src') ?? '';
      const proxied = /\/_next\/image\?url=([^&]+)/.exec(src);
      return proxied ? decodeURIComponent(proxied[1]!) : src;
    })
    .sort();
}

function renderDrivers() {
  return render(
    <AttributionTable
      rows={readDriverCredits()}
      basePath="/drivers"
      variant="photo"
      subjectLabel="Driver"
      authorLabel="Author"
      caption="Driver photograph credits."
      licenceTerms={readLicenceTerms()}
    />,
  );
}

function renderLogos() {
  return render(
    <AttributionTable
      rows={readLogoCredits()}
      basePath="/logos"
      variant="logo"
      subjectLabel="Team"
      authorLabel="Attributed to"
      caption="Team logo credits."
    />,
  );
}

describe('AttributionTable', () => {
  it('renders a thumbnail for every committed headshot', () => {
    const { container } = renderDrivers();
    expect(thumbnailSrcs(container)).toEqual(assets('drivers', '.png').map((f) => `/drivers/${f}`));
  });

  it('renders a thumbnail for every committed logo', () => {
    const { container } = renderLogos();
    expect(thumbnailSrcs(container)).toEqual(assets('logos', '.svg').map((f) => `/logos/${f}`));
  });

  // The subject cell beside the thumbnail is the row's accessible name; a duplicate alt would be
  // announced twice.
  it('leaves the thumbnails out of the accessibility tree', () => {
    const { container } = renderDrivers();
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('alt')).toBe('');
    }
  });

  it('shows each row its author verbatim, derivative-work credits included', () => {
    renderDrivers();
    expect(
      screen.getByText('Original: Steffen Prößdorf; Derivative work: Mb2437'),
    ).toBeInTheDocument();
  });

  it('links a source to Commons under the full file title as its accessible name', () => {
    renderDrivers();
    const link = screen.getByRole('link', { name: /^Alonso-68 \(24710447098\)\.jpg$/ });
    expect(link).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Alonso-68_(24710447098).jpg',
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('links a licence to its terms when they are known', () => {
    renderDrivers();
    const links = screen.getAllByRole('link', { name: 'CC BY-SA 4.0' });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('renders a licence with no known terms as plain text', () => {
    renderDrivers();
    expect(screen.getByText('CC0')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'CC0' })).toBeNull();
  });

  it('leaves every public-domain logo licence unlinked', () => {
    renderLogos();
    expect(screen.getAllByText('Public domain')).toHaveLength(10);
    expect(screen.queryByRole('link', { name: 'Public domain' })).toBeNull();
  });

  it('is a real table: a caption and column-scoped headers', () => {
    const { container } = renderDrivers();
    expect(container.querySelector('caption')?.textContent).toBe('Driver photograph credits.');
    const headers = Array.from(container.querySelectorAll('th'));
    expect(headers).toHaveLength(5);
    for (const th of headers) expect(th).toHaveAttribute('scope', 'col');
    expect(headers.map((th) => th.textContent)).toEqual([
      'Asset',
      'Driver',
      'Author',
      'Licence',
      'Source',
    ]);
  });

  it('renames the subject and author columns for logos', () => {
    const { container } = renderLogos();
    expect(Array.from(container.querySelectorAll('th')).map((th) => th.textContent)).toEqual([
      'Asset',
      'Team',
      'Attributed to',
      'Licence',
      'Source',
    ]);
  });

  // Same bar the rest of the branch is held to: every resting neutral clears AA on zinc-950.
  it('keeps every text run above the AA contrast bar', () => {
    const { container } = renderDrivers();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} behind "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  // f1-red is 4.12:1 on zinc-950 — it passes only the large-text bar, and nothing in a table is
  // large text.
  it('puts no f1-red anywhere in the table', () => {
    const { container } = renderDrivers();
    expect(container.querySelectorAll('[class*="text-f1-red"]')).toHaveLength(0);
  });
});
