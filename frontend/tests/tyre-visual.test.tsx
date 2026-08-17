import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TyreVisual } from '@/components/tyres/tyre-visual';

/*
 * The artwork is original SVG rather than a photograph, for three reasons that are worth
 * pinning: it carries no licence obligation, it recolours from the data instead of needing
 * one asset per compound, and it stays sharp at the sizes the explorer uses it at. These
 * tests protect the second of those — that colour and tread come from props, not literals.
 */

describe('TyreVisual', () => {
  it('exposes one accessible image with the label it was given', () => {
    render(<TyreVisual color="#e8382f" tread="slick" label="Soft compound" />);
    expect(screen.getByRole('img', { name: 'Soft compound' })).toBeInTheDocument();
  });

  it('paints the sidewall band in the colour it was given', () => {
    const { container } = render(<TyreVisual color="#e8382f" tread="slick" label="Soft" />);
    const band = container.querySelector('[data-testid="tyre-sidewall"]');
    expect(band).toHaveAttribute('stroke', '#e8382f');
  });

  it('takes a different colour without any change to the markup shape', () => {
    const { container: soft } = render(<TyreVisual color="#e8382f" tread="slick" label="a" />);
    const { container: wet } = render(<TyreVisual color="#2b8fe0" tread="slick" label="b" />);
    expect(soft.querySelector('[data-testid="tyre-sidewall"]')).toHaveAttribute(
      'stroke',
      '#e8382f',
    );
    expect(wet.querySelector('[data-testid="tyre-sidewall"]')).toHaveAttribute('stroke', '#2b8fe0');
  });

  // A slick has no tread pattern at all — that is the defining fact about it, and drawing
  // grooves on one would teach the reader something false.
  it('draws no grooves on a slick', () => {
    const { container } = render(<TyreVisual color="#e8382f" tread="slick" label="Soft" />);
    expect(container.querySelectorAll('[data-testid="tyre-groove"]')).toHaveLength(0);
  });

  it('draws grooves on an intermediate', () => {
    const { container } = render(<TyreVisual color="#3fbf4f" tread="intermediate" label="Int" />);
    expect(container.querySelectorAll('[data-testid="tyre-groove"]').length).toBeGreaterThan(0);
  });

  // The full wet displaces more water than the intermediate, and the artwork should say so
  // before the copy does.
  it('draws a deeper pattern on a full wet than on an intermediate', () => {
    const { container: inter } = render(
      <TyreVisual color="#3fbf4f" tread="intermediate" label="Int" />,
    );
    const { container: wet } = render(<TyreVisual color="#2b8fe0" tread="wet" label="Wet" />);
    const channels = (root: ParentNode) =>
      root.querySelectorAll('[data-testid="tyre-channel"]').length;
    expect(channels(wet)).toBeGreaterThan(channels(inter));
  });

  /*
   * Two of these can be on screen at once during a transition, and SVG gradient ids are
   * document-global: a duplicate id makes the browser resolve every `url(#…)` to whichever
   * element it saw first, so the exiting tyre would repaint itself in the entering tyre's
   * colour mid-flight. `useId` is what stops that.
   */
  it('scopes its gradient ids so two instances cannot collide', () => {
    const { container: a } = render(<TyreVisual color="#e8382f" tread="slick" label="a" />);
    const { container: b } = render(<TyreVisual color="#2b8fe0" tread="wet" label="b" />);
    const ids = (root: ParentNode) => Array.from(root.querySelectorAll('[id]')).map((el) => el.id);
    const idsA = ids(a);
    const idsB = ids(b);
    expect(idsA.length).toBeGreaterThan(0);
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
  });

  it('hides its decorative internals from assistive technology', () => {
    const { container } = render(<TyreVisual color="#e8382f" tread="slick" label="Soft" />);
    // The <svg> carries the only accessible name; nothing inside it should be announced.
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg?.querySelector('title')).toBeNull();
  });

  it('passes a className through for sizing', () => {
    const { container } = render(
      <TyreVisual color="#e8382f" tread="slick" label="Soft" className="w-40" />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('w-40');
  });
});
