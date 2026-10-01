/**
 * `/teardown`'s page shell. The scene is a client-only `next/dynamic` import with its own tests
 * (`teardown-scene.test.tsx`); what is pinned here is that the route carries the site nav.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TeardownPage from '@/app/teardown/page';

vi.mock('@/components/teardown/teardown-page-client', () => ({
  TeardownPageClient: () => (
    <main>
      <h1>scene</h1>
    </main>
  ),
}));
// `LandingNav` reads the route to mark its current link; jsdom has no Next router.
vi.mock('next/navigation', () => ({ usePathname: () => '/teardown' }));

describe('the /teardown site nav', () => {
  it('renders it outside the scene’s main landmark', () => {
    render(<TeardownPage />);

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).not.toContainElement(nav);
    expect(screen.getByRole('banner')).toContainElement(nav);
  });

  it('marks Car Anatomy as the current page', () => {
    render(<TeardownPage />);

    expect(screen.getByRole('link', { current: 'page' })).toHaveAccessibleName('Car Anatomy');
  });
});
