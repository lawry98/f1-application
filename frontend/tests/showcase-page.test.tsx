/**
 * `/showcase`'s page shell.
 *
 * The route is a spec non-goal for restyling — it "inherits tokens only, no content rewrites" —
 * so the only thing pinned here is the landmark structure axe reported missing:
 * `landmark-one-main` plus seven orphaned `region` nodes, which between them covered every visible
 * element on the page including the floating credits link.
 *
 * The 3D scene is stubbed. It is loaded through `next/dynamic` with `ssr: false` and pulls in
 * three.js, react-three-fiber and a GLTF loader; none of that is what this file is about, and
 * `components/3d/` is off limits for restyling in any case.
 */

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ShowcasePage from '@/app/showcase/page';

vi.mock('@/components/3d/f1-car-showcase', () => ({
  default: () => <div data-testid="car-showcase" />,
}));
// `LandingNav` reads the route to mark its current link; jsdom has no Next router.
vi.mock('next/navigation', () => ({ usePathname: () => '/showcase' }));

describe('the /showcase landmarks', () => {
  it('has exactly one main landmark', () => {
    const { getAllByRole } = render(<ShowcasePage />);

    expect(getAllByRole('main')).toHaveLength(1);
  });

  it('keeps the floating credits link inside it', () => {
    /*
     * The link is `position: fixed`, so it *looks* detached — but `region` is a DOM-ancestry rule,
     * not a visual one, and leaving it as a sibling of `<main>` is what made it one of the seven
     * orphaned nodes. Wrapping it costs nothing: a fixed element is positioned against the
     * viewport regardless of which non-transformed ancestor it hangs off.
     */
    const { getByRole } = render(<ShowcasePage />);

    // By its full text: the nav has a "Credits" link of its own now.
    const credits = getByRole('link', { name: '📝 Credits' });

    expect(getByRole('main')).toContainElement(credits);
  });
});

describe('the /showcase site nav', () => {
  it('renders it outside the one main landmark', () => {
    const { getAllByRole, getByRole } = render(<ShowcasePage />);

    const nav = getByRole('navigation', { name: 'Main navigation' });
    expect(getAllByRole('main')).toHaveLength(1);
    expect(getByRole('main')).not.toContainElement(nav);
    expect(getByRole('banner')).toContainElement(nav);
  });

  it('marks Showcase as the current page', () => {
    const { getByRole } = render(<ShowcasePage />);

    expect(getByRole('link', { current: 'page' })).toHaveAccessibleName('Showcase');
  });

  it('starts the page below the fixed 56 px bar', () => {
    const { getByRole } = render(<ShowcasePage />);

    expect(getByRole('main')).toHaveClass('pt-14');
  });
});
