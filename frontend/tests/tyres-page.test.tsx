import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import TyresPage from '@/app/tyres/page';
import {
  ALLOCATION_EXAMPLES,
  ALLOCATION_TRACKED_COMPOUND,
  DRY_RANGE,
  LIFECYCLE_STAGES,
  RACE_COMPOUNDS,
  STRATEGY_SCENARIOS,
  TYRES_CONTENT_AS_OF,
  TYRE_FAQ,
  TYRE_SOURCES,
} from '@/data/tyres-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

vi.mock('next/navigation', () => ({ usePathname: () => '/tyres' }));

function renderPage() {
  return render(<TyresPage />);
}

describe('/tyres — route', () => {
  it('renders', () => {
    renderPage();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('has one page heading', () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('marks itself as the current page in the nav', () => {
    renderPage();
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Tyres');
  });
});

describe('/tyres — the six sections', () => {
  const SECTIONS: [string, RegExp][] = [
    ['hero', /^tyres$/i],
    ['explorer', /compound explorer/i],
    ['allocation', /hard, medium and soft/i],
    ['strategy', /strategy/i],
    ['lifecycle', /life of a tyre/i],
    ['faq', /common questions/i],
  ];

  it.each(SECTIONS)('has a heading for the %s section', (_name, re) => {
    renderPage();
    expect(screen.getAllByRole('heading', { name: re }).length).toBeGreaterThan(0);
  });

  // The brief is explicit that the explorer must not be delayed by the introduction.
  it('puts the explorer ahead of every explainer in document order', () => {
    renderPage();
    const explorer = screen.getByRole('heading', { name: /compound explorer/i });
    for (const [, re] of SECTIONS.slice(2)) {
      const later = screen.getAllByRole('heading', { name: re })[0]!;
      expect(
        explorer.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});

describe('/tyres — content freshness', () => {
  it('states the date its facts are current to, visibly', () => {
    renderPage();
    expect(screen.getAllByText(new RegExp(TYRES_CONTENT_AS_OF, 'i')).length).toBeGreaterThan(0);
  });

  /*
   * One pass over the links, then set membership — not a `getAllByRole` per source. Twenty-five
   * role queries over a page this size means twenty-five accessibility-tree computations, which
   * took this test past the 5s default timeout on a loaded machine. Same assertion, one scan.
   */
  it('lists every source with a working-looking link', () => {
    const { container } = renderPage();
    const linked = new Map(
      Array.from(container.querySelectorAll('a[href]')).map((a) => [
        a.getAttribute('href')!,
        a.textContent ?? '',
      ]),
    );
    for (const source of TYRE_SOURCES) {
      expect(linked.has(source.url), `no link to ${source.title}`).toBe(true);
      expect(linked.get(source.url), source.url).toContain(source.title);
    }
  });

  /*
   * The check above only proves the footer's citation list is complete — it is satisfied by
   * `TYRE_SOURCES.map(...)` alone and would pass with every per-claim citation missing. This one
   * requires the claims themselves to be cited, in the sections that make them.
   */
  it('cites its claims inside the sections that make them, not only in the footer', () => {
    const { container } = renderPage();
    for (const id of ['explorer', 'allocation', 'strategy', 'lifecycle', 'faq']) {
      const section = container.querySelector(`#${id}`)!;
      const cited = Array.from(section.querySelectorAll('a[href^="https://"]'));
      expect(cited.length, `${id} cites nothing`).toBeGreaterThan(0);
    }
  });

  it('opens external sources safely', () => {
    renderPage();
    const external = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('http'));
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });
});

describe('/tyres — the numbered range is not the race label', () => {
  it('shows the whole 2026 numbered range', () => {
    renderPage();
    for (const compound of DRY_RANGE) {
      expect(screen.getAllByText(compound.name).length).toBeGreaterThan(0);
    }
  });

  /*
   * 2026 dropped the C6 that existed in 2025, so a *range* still showing six is describing
   * last season. Scoped to the allocation section deliberately: the FAQ does mention the C6,
   * to explain that it was removed, and that sentence is the point rather than a violation.
   */
  it('does not show a sixth compound in the range', () => {
    const { container } = renderPage();
    expect(DRY_RANGE).toHaveLength(5);
    const allocation = container.querySelector('#allocation');
    expect(allocation).not.toBeNull();
    expect(allocation!.textContent).not.toMatch(/\bC6\b/);
  });

  /*
   * The single most important claim on the page, and the one a reader is most likely to
   * arrive with backwards. The allocation section follows one compound across three real
   * Grands Prix in one season and shows it carrying a different label at each.
   */
  /*
   * Asserted against the rendered section, not against the data. The first version called
   * `renderPage()`, threw the result away and checked only `ALLOCATION_EXAMPLES` — proving a data
   * invariant that `tyres-data.test.ts` already owns, while claiming to prove the page shows it.
   */
  it('shows the tracked compound carrying all three labels', () => {
    const { container } = renderPage();
    const section = container.querySelector('#allocation')!;
    // `article li`, not any `li`: the numbered-range strip in step one also renders a C3 card,
    // and counting that made the assertion off by one in a way that looked like a real failure.
    const rows = Array.from(section.querySelectorAll('article li')).filter((li) =>
      li.textContent?.includes(ALLOCATION_TRACKED_COMPOUND),
    );
    expect(rows).toHaveLength(ALLOCATION_EXAMPLES.length);
    const rendered = rows.map((li) =>
      ['Hard', 'Medium', 'Soft'].find((l) => li.textContent?.includes(l))!,
    );
    expect(new Set(rendered)).toEqual(new Set(['Hard', 'Medium', 'Soft']));
  });

  it('renders every worked allocation example, not just one', () => {
    renderPage();
    expect(ALLOCATION_EXAMPLES.length).toBeGreaterThan(1);
    for (const example of ALLOCATION_EXAMPLES) {
      expect(screen.getAllByText(new RegExp(example.event, 'i')).length).toBeGreaterThan(0);
    }
  });

  it('captions the examples so they cannot be read as a fixed mapping', () => {
    const { container } = renderPage();
    expect(container.textContent).toMatch(/changes from race to race|not a fixed|never fixed/i);
  });
});

describe('/tyres — strategy', () => {
  it('renders every scenario', () => {
    renderPage();
    for (const scenario of STRATEGY_SCENARIOS) {
      expect(screen.getAllByText(scenario.situation).length).toBeGreaterThan(0);
    }
  });

  // Educational, not prescriptive: every scenario has to show its cost as well as its upside.
  it('gives every scenario both an advantage and a risk', () => {
    renderPage();
    for (const scenario of STRATEGY_SCENARIOS) {
      expect(screen.getAllByText(scenario.advantage).length).toBeGreaterThan(0);
      expect(screen.getAllByText(scenario.risk).length).toBeGreaterThan(0);
    }
  });
});

describe('/tyres — lifecycle', () => {
  /*
   * Scoped to the section. Several stage names — "The stint", "The pit stop" — are ordinary
   * English that legitimately appears in the explorer and the strategy cards as well, so a
   * whole-page `indexOf` measures the wrong occurrence and fails on correct markup.
   */
  it('renders every stage in order', () => {
    const { container } = renderPage();
    const section = container.querySelector('#lifecycle');
    expect(section).not.toBeNull();
    const headings = Array.from(section!.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings).toEqual(LIFECYCLE_STAGES.map((s) => s.name));
  });

  it('makes no unsupported sustainability claim', () => {
    const { container } = renderPage();
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('100% recycled');
    expect(text).not.toContain('iscc plus');
    expect(text).not.toMatch(/fully recycled|completely recycled/);
  });
});

describe('/tyres — FAQ and related experiences', () => {
  it('renders every question', () => {
    renderPage();
    for (const entry of TYRE_FAQ) {
      expect(screen.getAllByText(entry.question).length).toBeGreaterThan(0);
    }
  });

  /*
   * The answers are in the DOM whether or not a `<details>` is open, so the content is
   * available to find-in-page and to a screen reader, and nothing here depends on hover.
   */
  it('keeps every answer in the document without interaction', () => {
    renderPage();
    for (const entry of TYRE_FAQ) {
      expect(screen.getAllByText(entry.answer).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['/teardown', /car anatomy/i],
    ['/briefing', /briefing/i],
    ['/teams', /teams|constructor/i],
    ['/showcase', /showcase/i],
  ])('links onward to %s', (href, name) => {
    renderPage();
    const links = screen
      .getAllByRole('link', { name })
      .filter((a) => a.getAttribute('href') === href);
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('/tyres — accessibility', () => {
  it('holds every resting neutral above AA on the page background', () => {
    const { container } = renderPage();
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });

  it('gives every section a heading it is labelled by', () => {
    const { container } = renderPage();
    const sections = Array.from(container.querySelectorAll('section[aria-labelledby]'));
    expect(sections.length).toBeGreaterThanOrEqual(5);
    for (const section of sections) {
      const id = section.getAttribute('aria-labelledby')!;
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it('names every control', () => {
    renderPage();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('keeps the explorer reachable from the hero', () => {
    const { container } = renderPage();
    const jump = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#explorer');
    expect(jump, 'a jump link to #explorer').toBeDefined();
    expect(container.querySelector('#explorer')).not.toBeNull();
  });
});

describe('/tyres — the explorer is on the page', () => {
  it('mounts with the first compound selected', () => {
    renderPage();
    const selected = screen.getAllByRole('tab', { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAccessibleName(new RegExp(RACE_COMPOUNDS[0]!.name, 'i'));
  });

  it('shows one panel', () => {
    renderPage();
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { level: 3 })).toBeVisible();
  });
});
