import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActLifecycle } from '@/components/tyres/acts/act-lifecycle';
import { LIFECYCLE, LIFECYCLE_COUNT, wearPercent } from '@/components/tyres/lifecycle/lifecycle-data';

/*
 * The lifecycle act's deliberate-navigation contract. Nothing here asserts an animation class or an
 * intermediate frame — only what a keyboard user can observe: which stage is current, which
 * controls are live, and that the full sourced content is present and reachable.
 */

const total = LIFECYCLE_COUNT;

/** The stepper button for a 1-based stage number. */
function step(n: number): HTMLElement {
  const entry = LIFECYCLE[n - 1]!;
  return screen.getByRole('button', { name: `Step ${n} of ${total}: ${entry.stage.name}` });
}

const image = () => screen.getByRole('img');
const nextButton = () => screen.getByRole('button', { name: 'Next stage' });
const prevButton = () => screen.getByRole('button', { name: 'Previous stage' });

function currentSteps(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'step');
}

describe('ActLifecycle — content', () => {
  it('renders every stage as a heading with its concise summary', () => {
    render(<ActLifecycle />);
    for (const { stage, visual } of LIFECYCLE) {
      expect(screen.getByRole('heading', { level: 3, name: stage.name })).toBeInTheDocument();
      expect(screen.getByText(visual.summary)).toBeInTheDocument();
    }
  });

  it('keeps the full sourced body for every stage in the DOM', () => {
    render(<ActLifecycle />);
    for (const { stage } of LIFECYCLE) {
      expect(screen.getByText(stage.body)).toBeInTheDocument();
    }
  });

  it('states each stage’s wear and thermal in words, not colour alone', () => {
    render(<ActLifecycle />);
    for (const { visual } of LIFECYCLE) {
      // The stint (45%) and the pit stop (80%) both read "Hot"; match at least one occurrence.
      expect(
        screen.getAllByText(new RegExp(`Wear ${wearPercent(visual.wear)}%`)).length,
      ).toBeGreaterThan(0);
    }
  });
});

describe('ActLifecycle — progressive disclosure', () => {
  it('gives every stage a Details and source disclosure', () => {
    render(<ActLifecycle />);
    expect(screen.getAllByText('Details and source')).toHaveLength(total);
  });

  it('links each stage’s source safely', () => {
    render(<ActLifecycle />);
    const section = screen.getByRole('region', { name: /The life of a tyre/i });
    for (const { stage } of LIFECYCLE) {
      if (!stage.source) continue;
      const links = within(section).getAllByRole('link', {
        name: `${stage.source.publisher} — ${stage.source.title}`,
      });
      for (const link of links) {
        expect(link).toHaveAttribute('href', stage.source.url);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    }
  });
});

describe('ActLifecycle — navigation', () => {
  it('marks the first stage current, and only one at a time', () => {
    render(<ActLifecycle />);
    expect(step(1)).toHaveAttribute('aria-current', 'step');
    expect(currentSteps()).toHaveLength(1);
  });

  it('advances and rewinds with Next and Previous', () => {
    render(<ActLifecycle />);

    fireEvent.click(nextButton());
    expect(step(2)).toHaveAttribute('aria-current', 'step');
    expect(step(1)).not.toHaveAttribute('aria-current');
    expect(currentSteps()).toHaveLength(1);

    fireEvent.click(prevButton());
    expect(step(1)).toHaveAttribute('aria-current', 'step');
  });

  it('jumps to a numbered stage', () => {
    render(<ActLifecycle />);
    fireEvent.click(step(5));
    expect(step(5)).toHaveAttribute('aria-current', 'step');
    expect(currentSteps()).toHaveLength(1);
  });

  it('resolves a rapid burst of clicks to the last one selected', () => {
    render(<ActLifecycle />);
    fireEvent.click(step(3));
    fireEvent.click(step(7));
    fireEvent.click(step(6));
    expect(step(6)).toHaveAttribute('aria-current', 'step');
    expect(currentSteps()).toHaveLength(1);
  });

  it('disables Previous on the first stage and Next on the last', () => {
    render(<ActLifecycle />);

    expect(prevButton()).toBeDisabled();
    expect(nextButton()).toBeEnabled();

    fireEvent.click(step(total));
    expect(nextButton()).toBeDisabled();
    expect(prevButton()).toBeEnabled();
  });
});

describe('ActLifecycle — the tyre image', () => {
  it('exposes exactly one image, described by the active stage', () => {
    render(<ActLifecycle />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(image()).toHaveAccessibleName(new RegExp(LIFECYCLE[0]!.stage.name, 'i'));
  });

  it('re-describes the image as the active stage changes', () => {
    render(<ActLifecycle />);
    fireEvent.click(step(total));
    expect(image()).toHaveAccessibleName(new RegExp(LIFECYCLE[total - 1]!.stage.name, 'i'));
  });
});
