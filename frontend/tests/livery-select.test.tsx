/**
 * `/showcase`'s team picker.
 *
 * This replaces an eleven-button swatch grid, and the reason it gets a test file when the grid
 * never had one is that the grid was untestable: it lived inside `f1-car-showcase.tsx`, which
 * imports three.js and a GLTF loader, so `showcase-page.test.tsx` mocks the entire module away
 * and asserts nothing about the picker at all. A native `<select>` in its own module is plain
 * DOM, and everything below is real behaviour rather than a stub agreeing with itself.
 *
 * A native control is also the whole design argument: eleven single-select options with no rich
 * content is the case `<select>` exists for, and it brings keyboard operation, typeahead and the
 * platform picker on a phone without the `@radix-ui/react-select` dependency a custom listbox
 * would have cost. The repo carries exactly one Radix package and dropped `@react-three/drei`
 * over bundle size.
 */

import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TEAMS } from '@/data/teams-data';
import { LiverySelect } from '@/components/showcase/livery-select';

const ferrari = TEAMS.find((team) => team.id === 'ferrari')!;
const mclaren = TEAMS.find((team) => team.id === 'mclaren')!;

function renderSelect(overrides: Partial<Parameters<typeof LiverySelect>[0]> = {}) {
  const onSelect = vi.fn();
  const view = render(<LiverySelect selected={ferrari} onSelect={onSelect} {...overrides} />);
  return { ...view, onSelect };
}

describe('LiverySelect', () => {
  it('offers every team on the grid', () => {
    const { getByRole } = renderSelect();

    const options = getByRole('combobox').querySelectorAll('option');

    expect(options).toHaveLength(TEAMS.length);
    expect(Array.from(options, (option) => option.textContent)).toEqual(
      TEAMS.map((team) => team.shortName),
    );
  });

  it('gives the control an accessible name', () => {
    /*
     * Without this the control announces as an unlabelled combobox. The name comes from the
     * section's own `h2` via `aria-labelledby` rather than a second visible `<label>`, which
     * would put the same words on screen twice.
     */
    const { getByRole } = renderSelect();

    expect(getByRole('combobox', { name: /select team livery/i })).toBeInTheDocument();
  });

  it('keeps the section heading at h2', () => {
    /*
     * Not cosmetic, and not new: this shipped as an `h3`, which skipped a level under the route's
     * only `h1` and was a real axe `heading-order` violation. Swapping the grid for a dropdown is
     * exactly the kind of edit that quietly reintroduces it.
     */
    const { getByRole } = renderSelect();

    expect(getByRole('heading', { level: 2, name: /select team livery/i })).toBeInTheDocument();
  });

  it('shows the selected team as the current value', () => {
    const { getByRole } = renderSelect({ selected: mclaren });

    expect(getByRole('combobox')).toHaveValue(mclaren.id);
  });

  it('reports the team behind the option the user picks', () => {
    /*
     * The one that matters: a `<select>` hands back a string id, and the scene needs the `Team`.
     * Passing the raw `event.target.value` through would typecheck and render a car with no
     * livery change at all.
     */
    const { getByRole, onSelect } = renderSelect();

    fireEvent.change(getByRole('combobox'), { target: { value: mclaren.id } });

    expect(onSelect).toHaveBeenCalledWith(mclaren);
  });

  it('ignores a value that matches no team', () => {
    const { getByRole, onSelect } = renderSelect();

    fireEvent.change(getByRole('combobox'), { target: { value: 'not-a-team' } });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the selected team’s true livery colour beside the control', () => {
    /*
     * Decorative, so it keeps the brand hex rather than going through `readableOnDark` — that
     * helper is for colour *carrying text*, and lifting a swatch would misreport the livery the
     * car is about to wear. The swatch is hidden from assistive tech: the option text already
     * names the team.
     */
    const { container } = renderSelect({ selected: mclaren });

    const swatch = container.querySelector('[data-livery-swatch]');

    expect(swatch).toHaveStyle({ backgroundColor: mclaren.color });
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the dropdown arrow as decoration so it cannot take a tab stop', () => {
    const { container } = renderSelect();

    expect(container.querySelector('[data-livery-chevron]')).toHaveAttribute('aria-hidden', 'true');
  });
});
