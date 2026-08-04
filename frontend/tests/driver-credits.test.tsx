import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';

import { TeamsComparisonGrid } from '@/components/teams/teams-comparison-grid';
import { TEAMS } from '@/data/teams-data';

// Resolved from the cwd, not `import.meta.url`: under the jsdom environment `import.meta.url`
// is not a file: URL, so fileURLToPath throws at import time. Vitest runs from `frontend/`.
const DRIVERS_DIR = join(process.cwd(), 'public', 'drivers');
const CREDITS_PATH = join(DRIVERS_DIR, 'CREDITS.md');

function pngFiles(): string[] {
  return readdirSync(DRIVERS_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort();
}

/**
 * Twenty of the 22 committed headshots are CC BY or CC BY-SA, and the PNGs are downscaled,
 * transcoded derivatives of the Commons originals, so share-alike attaches as well. Attribution
 * is now user-facing, which turns silent drift between the directory and CREDITS.md into a
 * licence problem rather than a documentation one: a headshot added without a credit row is an
 * undischarged obligation on a public page.
 */
describe('driver photograph credits', () => {
  it('credits every committed headshot', () => {
    const credits = readFileSync(CREDITS_PATH, 'utf8');
    const files = pngFiles();
    expect(files.length).toBeGreaterThan(0);

    const uncredited = files.filter((f) => !credits.includes(`\`${f}\``));
    expect(uncredited).toEqual([]);
  });

  it('credits no file that is not committed', () => {
    const credits = readFileSync(CREDITS_PATH, 'utf8');
    const files = new Set(pngFiles());

    const cited = [...credits.matchAll(/`([a-z0-9-]+\.png)`/g)].map((m) => m[1]!);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((f) => !files.has(f))).toEqual([]);
  });

  it('gives every credited file an author and a licence', () => {
    const credits = readFileSync(CREDITS_PATH, 'utf8');
    const rows = credits
      .split('\n')
      .filter((line) => /^\|\s*`[a-z0-9-]+\.png`/.test(line))
      .map((line) => line.split('|').map((c) => c.trim()));

    expect(rows).toHaveLength(pngFiles().length);
    for (const cells of rows) {
      // | file | driver | source | author | licence |
      const [, file, , source, author, licence] = cells;
      expect(source, `${file} source`).toMatch(/commons\.wikimedia\.org/);
      expect(author, `${file} author`).not.toBe('');
      expect(licence, `${file} licence`).not.toBe('');
    }
  });

  it('covers a headshot for every driver the page renders', () => {
    const files = new Set(pngFiles());
    for (const team of TEAMS) {
      for (const driver of team.drivers) {
        expect(files.has(`${driver.id}.png`), `${driver.name} headshot`).toBe(true);
      }
    }
  });

  // The obligation is discharged only if a user can actually reach the notice. A file sitting
  // at a URL nobody links to is not attribution "in any reasonable manner based on the medium".
  it('links the credits from the page, visibly and by keyboard', () => {
    render(
      <TeamsComparisonGrid
        teams={TEAMS}
        activeTeamId="ferrari"
        reducedMotion={false}
        onScrollToTeam={vi.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: /attribution and licence/i });
    expect(link).toHaveAttribute('href', '/drivers/CREDITS.md');
    // A real anchor with an href is in the tab order; nothing hides it from the a11y tree.
    expect(link.tagName).toBe('A');
    expect(link).not.toHaveAttribute('aria-hidden');
    expect(link.closest('[aria-hidden="true"]')).toBeNull();
    expect(link.className).not.toMatch(/\bsr-only\b|\bhidden\b/);
  });

  it('names the licences it is discharging in the visible text', () => {
    render(
      <TeamsComparisonGrid
        teams={TEAMS}
        activeTeamId="ferrari"
        reducedMotion={false}
        onScrollToTeam={vi.fn()}
      />,
    );
    expect(screen.getByText(/CC BY \/ CC BY-SA/)).toBeInTheDocument();
  });
});
