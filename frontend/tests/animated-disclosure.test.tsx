import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimatedDisclosure } from '@/components/tyres/acts/animated-disclosure';

// The repo's reduced-motion recipe (see blur-fade-reduced.test.tsx): partial-mock the module and
// flip a module-global, because `useReducedMotion` caches its answer and cannot be driven through
// the `matchMedia` stub. Real elements still render through the spread.
let reduceMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => reduceMotion };
});

beforeEach(() => {
  reduceMotion = false;
});

/** The region the toggle controls, resolved through `aria-controls` the way AT would. */
function regionOf(button: HTMLElement): HTMLElement {
  const id = button.getAttribute('aria-controls');
  expect(id).toBeTruthy();
  const region = document.getElementById(id as string);
  expect(region).not.toBeNull();
  return region as HTMLElement;
}

function renderOne(props: Partial<Parameters<typeof AnimatedDisclosure>[0]> = {}) {
  return render(
    <AnimatedDisclosure summary="Technical notes" {...props}>
      <div>
        <p>Warm-up detail sits here.</p>
        <a href="https://example.com/cite">Pirelli — a citation</a>
      </div>
    </AnimatedDisclosure>,
  );
}

describe('AnimatedDisclosure — behaviour', () => {
  it('is a real button that starts closed', () => {
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });

    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    // aria-expanded is the state assistive tech reads; it must start closed.
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('points aria-controls at the region it discloses', () => {
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });
    const region = regionOf(button);

    // The content lives inside the controlled region, not somewhere else on the page.
    expect(within(region).getByText('Warm-up detail sits here.')).toBeInTheDocument();
  });

  it('opens on click and closes on a second click', () => {
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('activates from the keyboard (native button semantics)', () => {
    // Without @testing-library/user-event, the guarantee we can pin is that the control is a
    // native <button>, which the browser activates on both Enter and Space for free — and that a
    // click (the event those keys synthesise) toggles it.
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });
    expect(button.tagName).toBe('BUTTON');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('makes the collapsed content non-focusable and restores it when open', () => {
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });
    const region = regionOf(button);

    // Closed: the region is inert, so nothing inside it is a tab stop or announced.
    expect(region.inert).toBe(true);

    fireEvent.click(button);
    expect(region.inert).toBe(false);
    // The citation is reachable once open.
    expect(within(region).getByRole('link', { name: /a citation/i })).toHaveAttribute(
      'href',
      'https://example.com/cite',
    );
  });

  it('keeps its content in the DOM while collapsed (search and crawlers)', () => {
    renderOne();
    // Closed by default, yet the answer and citation are present — the archive relies on this.
    expect(screen.getByText('Warm-up detail sits here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /a citation/i })).toBeInTheDocument();
  });

  it('resolves rapid toggling to the newest action', () => {
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });

    // open, close, open, close, open -> ends open.
    for (let i = 0; i < 5; i++) fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // one more -> closed.
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('can start open when asked', () => {
    renderOne({ defaultOpen: true });
    const button = screen.getByRole('button', { name: /Technical notes/i });

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(regionOf(button).inert).toBe(false);
  });
});

describe('AnimatedDisclosure — independence and reset', () => {
  it('keeps two disclosures on independent state', () => {
    render(
      <>
        <AnimatedDisclosure summary="First">
          <p>First body</p>
        </AnimatedDisclosure>
        <AnimatedDisclosure summary="Second">
          <p>Second body</p>
        </AnimatedDisclosure>
      </>,
    );

    const first = screen.getByRole('button', { name: 'First' });
    const second = screen.getByRole('button', { name: 'Second' });

    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    // Opening one must not open the other.
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('snaps shut when its resetKey changes', () => {
    const { rerender } = render(
      <AnimatedDisclosure summary="Lean" resetKey="scenario-a">
        <p>Body A</p>
      </AnimatedDisclosure>,
    );
    const button = screen.getByRole('button', { name: 'Lean' });

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // A parent swapping the content (new resetKey) must return it to closed.
    rerender(
      <AnimatedDisclosure summary="Lean" resetKey="scenario-b">
        <p>Body B</p>
      </AnimatedDisclosure>,
    );
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not reset on the first render for a stable resetKey', () => {
    renderOne({ resetKey: 'stable', defaultOpen: true });
    const button = screen.getByRole('button', { name: /Technical notes/i });
    // The mount-time reset guard must not slam a default-open disclosure shut.
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('AnimatedDisclosure — surface and reduced motion', () => {
  it('takes its focus-ring offset from the surface', () => {
    const { rerender } = renderOne({ surface: 'base' });
    expect(screen.getByRole('button', { name: /Technical notes/i })).toHaveClass(
      'focus-visible:ring-offset-base',
    );

    rerender(
      <AnimatedDisclosure summary="Technical notes" surface="base-warm">
        <p>x</p>
      </AnimatedDisclosure>,
    );
    expect(screen.getByRole('button', { name: /Technical notes/i })).toHaveClass(
      'focus-visible:ring-offset-base-warm',
    );
  });

  it('drops the height transition under reduced motion but still toggles', () => {
    reduceMotion = true;
    renderOne();
    const button = screen.getByRole('button', { name: /Technical notes/i });
    const region = regionOf(button);

    // No height travel: the grid row carries no transition at all under reduced motion.
    expect(region.style.transition).toBe('');

    // State still changes — reduced motion removes the animation, not the disclosure.
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('animates the height transition when motion is allowed', () => {
    reduceMotion = false;
    renderOne();
    const region = regionOf(screen.getByRole('button', { name: /Technical notes/i }));
    // The row animates on the branch's shared ease.
    expect(region.style.transition).toContain('grid-template-rows');
    expect(region.style.transition).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
  });
});
