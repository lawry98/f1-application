import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActStrategy } from '@/components/tyres/acts/act-strategy';
import { STRATEGY_SCENARIOS } from '@/data/tyres-data';

const first = STRATEGY_SCENARIOS[0]!;
const second = STRATEGY_SCENARIOS[1]!;

/** Situation names carry commas and other regex metacharacters. */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The single disclosure toggle for whichever scenario is showing. */
function leanToggle(): HTMLElement {
  return screen.getByRole('button', { name: 'What teams lean towards, and why' });
}

function scenarioTab(situation: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(escapeRe(situation)) });
}

describe('ActStrategy — disclosure across scenarios', () => {
  it('starts on the first scenario with the disclosure closed', () => {
    render(<ActStrategy />);
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(first.situation);
  });

  it('opens the disclosure for the current scenario', () => {
    render(<ActStrategy />);
    fireEvent.click(leanToggle());
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(first.leaning)).toBeInTheDocument();
  });

  it('resets to closed and drops the old explanation when the scenario changes', () => {
    render(<ActStrategy />);

    // Open the first scenario's disclosure.
    fireEvent.click(leanToggle());
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(first.leaning)).toBeInTheDocument();

    // Switch scenarios while it is open.
    fireEvent.click(scenarioTab(second.situation));

    // The new scenario starts closed…
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'false');
    // …showing the new scenario's explanation, with the outgoing one gone from the tree entirely
    // (no stale content left mounted under the new panel).
    expect(screen.getByText(second.leaning)).toBeInTheDocument();
    expect(screen.queryByText(first.leaning)).not.toBeInTheDocument();
  });

  it('binds the visible content to the selected scenario', () => {
    render(<ActStrategy />);
    fireEvent.click(scenarioTab(second.situation));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(second.situation);
    // The disclosure's sources are labelled for the selected scenario.
    fireEvent.click(leanToggle());
    expect(
      screen.getByRole('heading', { name: `Sources for ${second.situation}` }),
    ).toBeInTheDocument();
  });

  it('re-opens independently after a scenario change', () => {
    render(<ActStrategy />);

    // Open first, switch, then open the new one — the newest action wins each time.
    fireEvent.click(leanToggle());
    fireEvent.click(scenarioTab(second.situation));
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(leanToggle());
    expect(leanToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(second.leaning)).toBeInTheDocument();
  });
});
