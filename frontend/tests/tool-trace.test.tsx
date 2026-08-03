/**
 * Tests for toolLabel() and the tool trace that renders it.
 *
 * The subject is the name-to-prose mapping, not the trace's styling. The raw name staying
 * visible is a contract, not decoration: the trace is the debugging surface for a run.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolTrace } from '@/components/briefing/tool-trace';
import { toolLabel } from '@/lib/constants';

/** Reveal the collapsed trace body. */
function expand(): void {
  fireEvent.click(screen.getByRole('button'));
}

describe('toolLabel', () => {
  it('maps every backend tool to prose', () => {
    expect(toolLabel('get_track_info')).toBe('Track profile');
    expect(toolLabel('get_recent_race_results')).toBe('Recent race results');
    expect(toolLabel('get_driver_form')).toBe('Driver form');
    expect(toolLabel('get_recent_top_finishers')).toBe('Top finishers');
    expect(toolLabel('get_circuit_winners')).toBe('Circuit winners');
    expect(toolLabel('get_race_weather')).toBe('Weather forecast');
    expect(toolLabel('search_f1_news')).toBe('News search');
  });

  it('degrades an unmapped name to something readable rather than blank', () => {
    // A tool added to the backend before the map is updated must still render.
    expect(toolLabel('get_tyre_compounds')).toBe('get tyre compounds');
  });
});

describe('ToolTrace', () => {
  it('renders nothing at all when no tools ran', () => {
    const { container } = render(<ToolTrace tools={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('labels each tool with its display name', () => {
    render(<ToolTrace tools={[{ tool: 'get_race_weather', success: true }]} />);
    expand();

    expect(screen.getByText('Weather forecast')).toBeInTheDocument();
  });

  it('keeps the raw tool name visible alongside the label', () => {
    render(<ToolTrace tools={[{ tool: 'get_race_weather', success: true }]} />);
    expand();

    expect(screen.getByText('get_race_weather')).toBeInTheDocument();
  });

  it('distinguishes a failed tool from a successful one', () => {
    render(
      <ToolTrace
        tools={[
          { tool: 'get_track_info', success: true },
          { tool: 'search_f1_news', success: false },
        ]}
      />,
    );
    expand();

    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
  });
});
