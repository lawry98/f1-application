import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TEAMS } from '@/data/teams-data';
import { useTeamNavigation, teamSectionId } from '@/hooks/use-team-navigation';
import { TeamsNavRail } from '@/components/teams/teams-nav-rail';
import { TeamsChipStrip } from '@/components/teams/teams-chip-strip';

const TEAM_IDS = TEAMS.map((t) => t.id);

/** Minimal stand-in for the page: the section anchors the hook navigates between, and a readout. */
function NavHarness() {
  const { activeTeamId, inSections, selectTeam } = useTeamNavigation(TEAM_IDS, false);
  return (
    <div>
      <p data-testid="active">{activeTeamId}</p>
      <p data-testid="in-sections">{String(inSections)}</p>
      <button onClick={() => selectTeam('mclaren')}>go to mclaren</button>
      {TEAMS.map((team) => (
        <section key={team.id} id={teamSectionId(team.id)}>
          {team.shortName}
        </section>
      ))}
    </div>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/teams');
});

describe('useTeamNavigation', () => {
  it('falls back to the first team, and reports being in the sections once one is observed', () => {
    render(<NavHarness />);

    expect(screen.getByTestId('active')).toHaveTextContent(TEAMS[0]!.id);
    expect(screen.getByTestId('in-sections')).toHaveTextContent('true');
  });

  it('restores the team named by the URL hash', () => {
    window.history.replaceState(null, '', '/teams#team-ferrari');

    render(<NavHarness />);

    expect(screen.getByTestId('active')).toHaveTextContent('ferrari');
  });

  it('ignores a hash that is not a team', () => {
    window.history.replaceState(null, '', '/teams#grid-comparison');

    render(<NavHarness />);

    expect(screen.getByTestId('active')).toHaveTextContent(TEAMS[0]!.id);
  });

  it('pushes exactly one history entry when a team is chosen', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<NavHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'go to mclaren' }));

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith(null, '', '#team-mclaren');
    expect(screen.getByTestId('active')).toHaveTextContent('mclaren');
    pushState.mockRestore();
  });

  it('tracks scrolling with replaceState so the history stack does not grow', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<NavHarness />);

    expect(replaceState).toHaveBeenCalledWith(null, '', `#${teamSectionId(TEAMS[0]!.id)}`);
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
    replaceState.mockRestore();
  });
});

describe('TeamsNavRail', () => {
  it('renders every team as a real anchor to its section', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={() => {}} inSections />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(TEAMS.length);
    expect(links[1]).toHaveAttribute('href', '#team-ferrari');
  });

  it('marks only the active team with aria-current="location"', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={() => {}} inSections />);

    const current = screen.getAllByRole('link').filter((el) => el.getAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('aria-current', 'location');
    expect(current[0]).toHaveAccessibleName(/Ferrari/);
  });

  it('marks nothing current while the hero still owns the viewport', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={() => {}} inSections={false} />);

    expect(
      screen.getAllByRole('link').filter((el) => el.getAttribute('aria-current')),
    ).toHaveLength(0);
  });

  it('numbers each entry as "team N of 11" for screen readers', () => {
    render(<TeamsNavRail activeTeamId="ferrari" onSelectTeam={() => {}} inSections />);

    expect(screen.getAllByRole('link')[2]).toHaveAccessibleName(
      new RegExp(`^Team 3 of ${TEAMS.length}:\\s*McLaren$`),
    );
  });

  it('handles a plain click itself but leaves modified clicks to the browser', () => {
    const onSelectTeam = vi.fn();
    render(<TeamsNavRail activeTeamId="mercedes" onSelectTeam={onSelectTeam} inSections />);

    fireEvent.click(screen.getAllByRole('link')[1]!);
    expect(onSelectTeam).toHaveBeenCalledWith('ferrari');

    fireEvent.click(screen.getAllByRole('link')[2]!, { metaKey: true });
    expect(onSelectTeam).toHaveBeenCalledTimes(1);
  });
});

describe('TeamsChipStrip', () => {
  it('marks the active chip as the current location', () => {
    render(
      <TeamsChipStrip
        activeTeamId="williams"
        onSelectTeam={() => {}}
        inSections
        reducedMotion={false}
      />,
    );

    const current = screen.getAllByRole('link').filter((el) => el.getAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/Williams/);
  });

  it('scrolls the active chip to the centre of the strip', () => {
    const { scrollTo, rerender } = renderStrip(false);

    rerender('alpine');

    // Alpine is the eighth chip: 700 - (300 - 100) / 2.
    expect(scrollTo).toHaveBeenCalledWith({ left: 600, behavior: 'smooth' });
  });

  it('clamps to the end of the strip rather than overscrolling', () => {
    const { scrollTo, rerender } = renderStrip(false);

    rerender('aston-martin');

    expect(scrollTo).toHaveBeenCalledWith({
      left: SCROLL_WIDTH - CLIENT_WIDTH,
      behavior: 'smooth',
    });
  });

  it('jumps instead of animating under reduced motion', () => {
    const { scrollTo, rerender } = renderStrip(true);

    rerender('alpine');

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});

const CLIENT_WIDTH = 300;
const SCROLL_WIDTH = 1200;
const CHIP_WIDTH = 100;

/**
 * jsdom reports zero for every box, so the geometry the centring maths reads has to be supplied:
 * a 300px window onto a 1200px strip of 100px chips laid end to end.
 */
function renderStrip(reducedMotion: boolean) {
  const view = render(
    <TeamsChipStrip
      activeTeamId={TEAMS[0]!.id}
      onSelectTeam={() => {}}
      inSections
      reducedMotion={reducedMotion}
    />,
  );

  const scrollTo = vi.fn();
  Object.defineProperties(screen.getByRole('list'), {
    clientWidth: { value: CLIENT_WIDTH, configurable: true },
    scrollWidth: { value: SCROLL_WIDTH, configurable: true },
    scrollLeft: { value: 0, writable: true, configurable: true },
    scrollTo: { value: scrollTo, configurable: true },
  });
  screen.getAllByRole('link').forEach((chip, i) => {
    Object.defineProperties(chip, {
      offsetLeft: { value: i * CHIP_WIDTH, configurable: true },
      offsetWidth: { value: CHIP_WIDTH, configurable: true },
    });
  });

  return {
    scrollTo,
    rerender: (activeTeamId: string) =>
      view.rerender(
        <TeamsChipStrip
          activeTeamId={activeTeamId}
          onSelectTeam={() => {}}
          inSections
          reducedMotion={reducedMotion}
        />,
      ),
  };
}
