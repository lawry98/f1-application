import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketCard } from '@/components/candy/ticket-card';

describe('TicketCard', () => {
  // Shared minimum #1: content exists in the DOM immediately, with no animation gating it.
  // TicketCard has no scroll reveal and no reduced-motion branch of its own — only a CSS hover
  // transition, which never hides content — so this is the only "content renders" test it needs.
  it('renders its children immediately', () => {
    render(<TicketCard>Race weekend briefing</TicketCard>);

    expect(screen.getByText('Race weekend briefing')).toBeInTheDocument();
  });

  describe('kicker slot', () => {
    it('renders the kicker row when provided', () => {
      render(
        <TicketCard kicker="RACE BRIEFING · RND.08">
          <div>content</div>
        </TicketCard>,
      );

      expect(screen.getByText('RACE BRIEFING · RND.08')).toBeInTheDocument();
    });

    it('renders no empty kicker strip when the slot is absent', () => {
      // The real bug this guards: a wrapper `<div className="border-b ...">` rendered
      // unconditionally (with `undefined` inside) still paints a hairline with nothing above
      // it. Asserting text absence would not catch that — the strip element itself must be gone.
      const { container } = render(
        <TicketCard>
          <div>content</div>
        </TicketCard>,
      );

      expect(container.querySelector('.border-b')).not.toBeInTheDocument();
    });
  });

  describe('footer slot', () => {
    it('renders the footer strip when provided', () => {
      render(
        <TicketCard footer="4 tool traces">
          <div>content</div>
        </TicketCard>,
      );

      expect(screen.getByText('4 tool traces')).toBeInTheDocument();
    });

    it('renders no empty footer strip when the slot is absent', () => {
      const { container } = render(
        <TicketCard>
          <div>content</div>
        </TicketCard>,
      );

      expect(container.querySelector('.border-t')).not.toBeInTheDocument();
    });
  });

  describe('notch', () => {
    it('carries the notch-card class by default', () => {
      const { container } = render(<TicketCard>content</TicketCard>);

      // The outer element is both the bordered box and the clipped one — per the component's
      // doc comment, clip-path cutting through the border is the accepted trade-off, so the
      // class belongs on the same node as `border`, not a wrapper.
      expect(container.firstChild).toHaveClass('notch-card');
      expect(container.firstChild).toHaveClass('border');
    });

    it('omits the notch class when notch is "none"', () => {
      const { container } = render(<TicketCard notch="none">content</TicketCard>);

      expect(container.firstChild).not.toHaveClass('notch-card');
    });
  });

  describe('divide', () => {
    it('defaults to no divider opinion', () => {
      const { container } = render(
        <TicketCard>
          <span>a</span>
          <span>b</span>
        </TicketCard>,
      );
      const contentRow = container.querySelector('.divide-x, .divide-y');

      expect(contentRow).toBeNull();
    });

    it('lays children out as a divided row for divide="x"', () => {
      const { container } = render(
        <TicketCard divide="x">
          <span>a</span>
          <span>b</span>
        </TicketCard>,
      );
      // `divide-x` only draws a rule between siblings that are actually side by side, so the
      // flex row has to travel with it — that pairing is what this asserts, not just the class.
      const contentRow = container.querySelector('.divide-x')!;

      expect(contentRow).toHaveClass('flex');
      expect(contentRow).toHaveClass('divide-white/10');
    });

    it('stacks children with a divide-y for divide="y"', () => {
      const { container } = render(
        <TicketCard divide="y">
          <span>a</span>
          <span>b</span>
        </TicketCard>,
      );
      const contentRow = container.querySelector('.divide-y')!;

      expect(contentRow).toHaveClass('divide-white/10');
      // 'y' needs no flex layout change: block children already stack, unlike 'x'.
      expect(contentRow).not.toHaveClass('flex');
    });
  });

  describe('topo texture', () => {
    it('is decorative and does not intercept pointer events', () => {
      const { container } = render(<TicketCard>content</TicketCard>);
      const svg = container.querySelector('svg')!;

      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveClass('pointer-events-none');
    });

    it('lets a click on the card content still reach its handler', () => {
      // The regression this pins: if the content wrapper were dropped or mis-ordered relative
      // to the texture, this is the assertion that would notice — a click fired directly on the
      // button still has to run the handler wired to it.
      const onClick = vi.fn();
      render(
        <TicketCard>
          <button onClick={onClick}>select</button>
        </TicketCard>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'select' }));

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('renders the texture at 4% opacity, quieter than its own 12% default', () => {
      const { container } = render(<TicketCard>content</TicketCard>);
      const svg = container.querySelector('svg')!;

      expect(svg).toHaveClass('opacity-[0.04]');
      expect(svg).not.toHaveClass('opacity-[0.12]');
    });
  });

  it('is a positioning context for the absolutely-positioned texture', () => {
    // TopoBackground is `absolute inset-0`, which resolves against the nearest positioned
    // ancestor — without `relative` here it would escape to whatever the card's parent is.
    const { container } = render(<TicketCard>content</TicketCard>);

    expect(container.firstChild).toHaveClass('relative');
  });

  it('merges a caller className onto the outer element', () => {
    const { container } = render(<TicketCard className="max-w-sm">content</TicketCard>);

    expect(container.firstChild).toHaveClass('max-w-sm');
  });
});
