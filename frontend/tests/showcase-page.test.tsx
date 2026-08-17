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

    const credits = getByRole('link', { name: /credits/i });

    expect(getByRole('main')).toContainElement(credits);
  });
});
