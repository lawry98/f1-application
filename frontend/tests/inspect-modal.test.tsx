import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { InspectModal } from '@/components/teams/inspect-modal';
import { TEAM_MAP } from '@/data/teams-data';
import { contrastRatio, DARK_BG, MIN_CONTRAST } from '@/lib/team-utils';
import { restingTextNeutrals } from './zinc';

const ferrari = TEAM_MAP['ferrari']!;

/**
 * The modal pulls the Three.js scene in through `next/dynamic` with `ssr: false`, which under
 * jsdom never resolves — it renders the loading fallback and nothing touches WebGL. That is what
 * makes this component testable at all, and it is why this file asserts only on the chrome
 * around the viewer.
 */
describe('InspectModal', () => {
  it('holds every resting neutral in the modal chrome above AA', () => {
    const { container } = render(<InspectModal team={ferrari} onClose={vi.fn()} />);
    const neutrals = restingTextNeutrals(container);
    expect(neutrals.length).toBeGreaterThan(0);
    for (const { hex, text } of neutrals) {
      expect(contrastRatio(hex, DARK_BG), `${hex} on "${text}"`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
