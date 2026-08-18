import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TyresPage from '@/app/tyres/page';
import {
  ALLOCATION_EXAMPLES,
  ALLOCATION_TRACKED_COMPOUND,
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

/** Scenario and event names carry commas and other regex metacharacters. */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The four acts, by their headings.
 *
 * Retyped rather than derived from the components, because the thing worth guarding is that the
 * page still *has* four acts in this order — a test that read the order out of the page it is
 * testing could not fail.
 */
const ACTS = [
  'The compound explorer',
  'How Hard, Medium and Soft are decided',
  'Strategy, situation by situation',
  'The life of a tyre',
  'Common questions',
] as const;

describe('/tyres — structure', () => {
  it('has exactly one h1', () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders each act heading once, in order', () => {
    renderPage();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim());

    for (const act of ACTS) expect(headings).toContain(act);
    const positions = ACTS.map((a) => headings.indexOf(a));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('marks Tyres as the current page exactly once', () => {
    renderPage();
    const current = screen.getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Tyres');
  });

  it('shows when the content was last checked', () => {
    renderPage();
    expect(screen.getAllByText(new RegExp(TYRES_CONTENT_AS_OF)).length).toBeGreaterThan(0);
  });
});

describe('/tyres — the compound selector', () => {
  it('offers every compound as a pressable control', () => {
    renderPage();

    for (const c of RACE_COMPOUNDS) {
      expect(screen.getByRole('button', { name: new RegExp(c.name, 'i') })).toBeInTheDocument();
    }
  });

  /*
   * `aria-pressed`, not a tablist. The rail sits beside a disclosure control per row, so arrow
   * keys have to stay with the browser — a tablist would capture them and strand the second
   * control in each row. What must hold either way is that exactly one row reads as on.
   */
  it('marks exactly one compound as selected', () => {
    renderPage();
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');

    // One per selector on the page: compounds, allocation race, strategy scenario.
    expect(pressed.length).toBeGreaterThanOrEqual(1);
    const compoundRows = screen
      .getAllByRole('button')
      .filter((b) => RACE_COMPOUNDS.some((c) => b.textContent?.includes(c.name)));
    expect(compoundRows.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('changes the selection when another compound is chosen', () => {
    renderPage();

    const hard = screen.getByRole('button', { name: /Hard/i });
    fireEvent.click(hard);

    expect(hard).toHaveAttribute('aria-pressed', 'true');
  });

  /*
   * Compound identity must not rest on colour alone. The letter is the non-colour channel, and
   * H/M/S/I/W come from the **id** — `name.charAt(0)` gives "Full Wet" an F.
   */
  it('gives every compound its shorthand letter', () => {
    const { container } = renderPage();
    const letters = RACE_COMPOUNDS.map((c) => c.id.charAt(0).toUpperCase());

    expect(letters).toEqual(['H', 'M', 'S', 'I', 'W']);
    for (const letter of letters) {
      expect(
        within(container).getAllByText(letter, { selector: 'span' }).length,
      ).toBeGreaterThan(0);
    }
  });

  it('renders one tyre, not one per compound', () => {
    const { container } = renderPage();
    // The stage swaps a single render in and out; five mounted tyres would be five downloads.
    expect(container.querySelectorAll('img[alt$="compound tyre"]')).toHaveLength(1);
  });
});

describe('/tyres — allocation', () => {
  it('renders the numbered range without a sixth compound', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /How Hard, Medium and Soft/i });

    expect(section.textContent).not.toMatch(/\bC6\b/);
  });

  it('offers each worked example', () => {
    renderPage();

    // Regex, not an exact string: the selected control appends an `sr-only` "(selected)", so its
    // accessible name is "<event>(selected)". An exact match silently passes for the four
    // unselected ones and fails only on whichever happens to be open.
    for (const example of ALLOCATION_EXAMPLES) {
      expect(
        screen.getByRole('button', { name: new RegExp(escapeRe(example.event)) }),
      ).toBeInTheDocument();
    }
  });

  /*
   * The page's whole thesis: the same numbered compound carries a different label at a different
   * race. If this ever renders one label for the tracked compound, the section is asserting the
   * fixed mapping it exists to deny.
   */
  it('shows the tracked compound carrying more than one label', () => {
    renderPage();
    const labels = new Set(
      ALLOCATION_EXAMPLES.flatMap((r) =>
        r.picks.filter((p) => p.compound === ALLOCATION_TRACKED_COMPOUND).map((p) => p.label),
      ),
    );

    expect(labels.size).toBeGreaterThan(1);
    const section = screen.getByRole('region', { name: /How Hard, Medium and Soft/i });
    for (const label of Array.from(labels)) {
      expect(section.textContent).toContain(`${ALLOCATION_TRACKED_COMPOUND} is the ${label}`);
    }
  });
});

describe('/tyres — strategy', () => {
  it('offers every scenario', () => {
    renderPage();

    for (const s of STRATEGY_SCENARIOS) {
      expect(
        screen.getByRole('button', { name: new RegExp(escapeRe(s.situation)) }),
      ).toBeInTheDocument();
    }
  });

  it('shows one recommendation and one risk for the open scenario', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /Strategy, situation by situation/i });

    expect(within(section).getByText('Recommendation')).toBeInTheDocument();
    expect(within(section).getByText('Principal risk')).toBeInTheDocument();
  });

  /*
   * The scenario must be identifiable without seeing the tint change. The condition chip is that
   * channel, so it has to be real text.
   */
  it('names the condition in words, not only as a colour', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /Strategy, situation by situation/i });

    expect(within(section).getByText(/Track temperature high/i)).toBeInTheDocument();
  });
});

describe('/tyres — lifecycle', () => {
  it('offers a step for every stage', () => {
    renderPage();

    for (const [i, stage] of Array.from(LIFECYCLE_STAGES.entries())) {
      expect(
        screen.getByRole('button', {
          name: `Step ${i + 1} of ${LIFECYCLE_STAGES.length}: ${stage.name}`,
        }),
      ).toBeInTheDocument();
    }
  });

  it('advances to the next stage', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /The life of a tyre/i });

    expect(within(section).getByText(LIFECYCLE_STAGES[0]!.body)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next stage' }));
    expect(within(section).getByText(LIFECYCLE_STAGES[1]!.body)).toBeInTheDocument();
  });

  it('describes the tyre graphic rather than leaving it unlabelled', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /The life of a tyre/i });

    expect(within(section).getByRole('img')).toHaveAccessibleName(
      new RegExp(LIFECYCLE_STAGES[0]!.name, 'i'),
    );
  });
});

describe('/tyres — the archive keeps what the acts hid', () => {
  /*
   * The acts cut the visible word count by two thirds. That is only legitimate if nothing sourced
   * was *deleted* — these pin that every question and every citation is still reachable.
   */
  it('renders every FAQ question', () => {
    renderPage();
    for (const entry of TYRE_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
  });

  it('renders every FAQ answer in the DOM without interaction', () => {
    renderPage();
    for (const entry of TYRE_FAQ) {
      expect(screen.getByText(entry.answer)).toBeInTheDocument();
    }
  });

  it('links every source, safely', () => {
    renderPage();

    for (const source of TYRE_SOURCES) {
      const links = screen.getAllByRole('link', {
        name: `${source.publisher} — ${source.title}`,
      });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute('href', source.url);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  it('publishes what the page deliberately does not claim', () => {
    renderPage();
    expect(screen.getByText(/What this page does not claim/i)).toBeInTheDocument();
  });
});

describe('/tyres — accessibility', () => {
  it('labels every act as a region', () => {
    renderPage();
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'));
    expect(regions.every(Boolean)).toBe(true);
  });

  it('gives every control an accessible name', () => {
    renderPage();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

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

  /*
   * The footer must not be a second copy of the header. One onward link is the design; six would
   * mean the duplication came back.
   */
  it('does not repeat the primary navigation in the footer', () => {
    renderPage();
    const footer = screen.getByRole('contentinfo');

    expect(within(footer).getAllByRole('link', { name: /Car Anatomy/i })).toHaveLength(1);
    expect(within(footer).queryByRole('link', { name: 'Teams' })).toBeNull();
    expect(within(footer).queryByRole('link', { name: 'Showcase' })).toBeNull();
  });
});
