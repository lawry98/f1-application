/**
 * Tests for BriefingCard.
 *
 * Only the truncation marker is covered. The markdown component overrides above it are
 * styling, and pinning them would be testing Tailwind class strings — but *whether* a
 * truncated briefing tells the reader so, and where it says it, is a contract: ADR-0002
 * rejected an alarm-styled error in favour of a calm line beneath the prose.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BriefingCard } from '@/components/briefing/briefing-card';

const MARKER = /stopped early/i;

describe('BriefingCard', () => {
  it('renders the briefing prose as markdown', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing={'## Overview\n\nTight and twisty.'} />);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Tight and twisty.')).toBeInTheDocument();
  });

  it('says nothing about truncation for a complete briefing', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing="Complete." truncated={false} />);

    expect(screen.queryByText(MARKER)).not.toBeInTheDocument();
  });

  it('omits the marker when truncated is not passed at all', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing="Complete." />);

    expect(screen.queryByText(MARKER)).not.toBeInTheDocument();
  });

  it('marks a truncated briefing as unfinished', () => {
    render(<BriefingCard race="Monaco Grand Prix" briefing="Half a br" truncated />);

    expect(screen.getByText(MARKER)).toBeInTheDocument();
  });

  it('puts the marker after the prose, not above it', () => {
    // Placement is the decision, not decoration: an alarm above readable prose reads as
    // "everything broke". See ADR-0002's rejection of an accompanying error event.
    render(<BriefingCard race="Monaco Grand Prix" briefing="Readable prose." truncated />);

    const prose = screen.getByText('Readable prose.');
    const marker = screen.getByText(MARKER);

    expect(prose.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still renders the whole partial briefing alongside the marker', () => {
    // The prose is the deliverable; the marker is a caveat on it, not a replacement.
    render(
      <BriefingCard race="Monaco Grand Prix" briefing={'## Overview\n\nHalf a br'} truncated />,
    );

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Half a br')).toBeInTheDocument();
    expect(screen.getByText(MARKER)).toBeInTheDocument();
  });
});
