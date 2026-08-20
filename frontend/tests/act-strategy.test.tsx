import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActStrategy } from '@/components/tyres/acts/act-strategy';
import { STRATEGY_SCENARIOS } from '@/data/tyres-data';

// The repo's reduced-motion recipe. Default false, so the tests below run with the full transition;
// the reduced-motion block flips it. Real motion elements still render through the spread.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/*
 * The keyed panel transition is a visual property jsdom cannot see — it lays nothing out and runs
 * no animation frames. These tests guard the thing that *must* survive the animation regardless of
 * how it looks: the panel that ends up visible always matches the selected tab, the disclosure
 * resets, the citations stay reachable, and rapid clicking resolves to the latest choice rather
 * than queueing. They deliberately assert none of the intermediate transforms, durations or class
 * strings — those are the browser's to verify, and pinning them here would be brittle.
 *
 * `waitFor` is load-bearing: with an overlapping (`popLayout`) `AnimatePresence`, the outgoing
 * panel lingers for its exit before framer removes it, so "settled" means "one panel left".
 */

/** Scenario names carry commas and other regex metacharacters. */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function section() {
  return screen.getByRole('region', { name: /Strategy, situation by situation/i });
}

function scenarioButton(situation: string) {
  return screen.getByRole('button', { name: new RegExp(escapeRe(situation)) });
}

// The disclosure is now the APG Disclosure pattern — a real toggle button carrying aria-expanded,
// not a native <details> — so a click drives it directly (jsdom actually toggles this one, unlike
// the old element). Only ever call this when the panel has settled to one, or a lingering exit
// would make it match two buttons.
function leanToggle() {
  return within(section()).getByRole('button', { name: 'What teams lean towards, and why' });
}

/** Click a scenario and wait until its panel is the only one left. */
async function settleOn(situation: string) {
  fireEvent.click(scenarioButton(situation));
  await waitFor(() => {
    const headings = within(section()).getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(situation);
  });
}

describe('ActStrategy — content follows the selected scenario', () => {
  it('shows the matching heading, detail, recommendation and risk for every scenario', async () => {
    render(<ActStrategy />);

    for (const scenario of STRATEGY_SCENARIOS) {
      await settleOn(scenario.situation);
      const panel = section();

      expect(within(panel).getByText(scenario.detail)).toBeInTheDocument();
      // The recommendation sits under its label; the risk under its own. Assert the values are the
      // ones this scenario owns, not merely that the labels exist.
      expect(within(panel).getByText(scenario.advantage)).toBeInTheDocument();
      expect(within(panel).getByText(scenario.risk)).toBeInTheDocument();
      expect(within(panel).getByText('Recommendation')).toBeInTheDocument();
      expect(within(panel).getByText('Principal risk')).toBeInTheDocument();
    }
  });

  it('moves aria-pressed onto exactly the chosen scenario', async () => {
    render(<ActStrategy />);

    for (const target of [STRATEGY_SCENARIOS[3]!, STRATEGY_SCENARIOS[0]!, STRATEGY_SCENARIOS[5]!]) {
      await settleOn(target.situation);

      const pressed = STRATEGY_SCENARIOS.filter(
        (s) => scenarioButton(s.situation).getAttribute('aria-pressed') === 'true',
      );
      expect(pressed).toEqual([target]);
    }
  });

  it('lands on the right content after a large jump and a backward step', async () => {
    render(<ActStrategy />);

    // First → last is a jump across the whole list; last → second is a backward step. Direction is
    // internal, but the destination content is what a visitor actually reads.
    await settleOn(STRATEGY_SCENARIOS.at(-1)!.situation);
    expect(within(section()).getByText(STRATEGY_SCENARIOS.at(-1)!.advantage)).toBeInTheDocument();

    await settleOn(STRATEGY_SCENARIOS[1]!.situation);
    expect(within(section()).getByText(STRATEGY_SCENARIOS[1]!.advantage)).toBeInTheDocument();
    expect(
      within(section()).queryByText(STRATEGY_SCENARIOS.at(-1)!.advantage),
    ).not.toBeInTheDocument();
  });
});

describe('ActStrategy — interaction resilience', () => {
  it('resolves rapid selection to the most recent scenario, with no stale panel', async () => {
    render(<ActStrategy />);

    // Fire a burst without waiting between them — the newest selection must win, not the queue.
    for (const i of [2, 4, 1, 5, 3]) {
      fireEvent.click(scenarioButton(STRATEGY_SCENARIOS[i]!.situation));
    }
    const winner = STRATEGY_SCENARIOS[3]!;

    await waitFor(() => {
      expect(within(section()).getAllByRole('heading', { level: 3 })).toHaveLength(1);
    });
    expect(within(section()).getByRole('heading', { level: 3 })).toHaveTextContent(
      winner.situation,
    );
    expect(within(section()).getByText(winner.advantage)).toBeInTheDocument();
    expect(within(section()).getByText(winner.risk)).toBeInTheDocument();
  });

  it('announces the selected scenario in a polite status region', async () => {
    render(<ActStrategy />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Selected strategy scenario: ${STRATEGY_SCENARIOS[0]!.situation}.`);

    await settleOn(STRATEGY_SCENARIOS[2]!.situation);
    expect(status).toHaveTextContent(`Selected strategy scenario: ${STRATEGY_SCENARIOS[2]!.situation}.`);
  });
});

describe('ActStrategy — disclosure', () => {
  it('opens on click and resets to closed when the scenario changes', async () => {
    render(<ActStrategy />);

    // Open the current scenario's disclosure, then confirm the point under test: what the *next*
    // scenario inherits. The keyed remount must drop the open state, not carry it across.
    fireEvent.click(leanToggle());
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(within(section()).getByText(STRATEGY_SCENARIOS[0]!.leaning)).toBeInTheDocument();

    await settleOn(STRATEGY_SCENARIOS[4]!.situation);

    // The new panel is a fresh remount, so its disclosure starts closed — and it reopens
    // independently of the one left open under the previous scenario.
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(leanToggle());
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(within(section()).getByText(STRATEGY_SCENARIOS[4]!.leaning)).toBeInTheDocument();
  });

  it('keeps every citation for the selected scenario reachable', async () => {
    render(<ActStrategy />);

    for (const scenario of [STRATEGY_SCENARIOS[0]!, STRATEGY_SCENARIOS[3]!]) {
      await settleOn(scenario.situation);
      for (const source of scenario.sources) {
        const link = within(section()).getByText(`${source.publisher} — ${source.title}`);
        expect(link.closest('a')).toHaveAttribute('href', source.url);
      }
    }
  });
});

describe('ActStrategy — reduced motion', () => {
  // Under reduced motion the transition is a short crossfade with no displacement or stagger, but
  // the substance must be untouched: the same content switches, the disclosure still resets, and the
  // selection is still announced. This asserts that behaviour, not the (absent) transforms.
  it('still switches content, resets the disclosure and announces the change', async () => {
    reduceMotion = true;
    render(<ActStrategy />);

    fireEvent.click(leanToggle());
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'true');

    await settleOn(STRATEGY_SCENARIOS[4]!.situation);

    expect(within(section()).getByText(STRATEGY_SCENARIOS[4]!.advantage)).toBeInTheDocument();
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(
      `Selected strategy scenario: ${STRATEGY_SCENARIOS[4]!.situation}.`,
    );
  });
});
