import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from '../state';
import { ReceptorsStep } from './ReceptorsStep';
import { forgetMemory, getGuided, getOverrides, setGuided } from '../../project/store';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const start = (patch: (g: GuidedState) => void): void => {
  const g = defaultGuided();
  g.site.basis = 'measured';
  g.site.measured = ['soil'];
  patch(g);
  setGuided(g);
};

describe('ReceptorsStep, 4b', () => {
  it('shows one receptor with a profile and no pathway switches of its own', () => {
    start(() => undefined);
    render(<ReceptorsStep />);
    expect(screen.getByRole('heading', { level: 1, name: 'Receptors' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Receptor A' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Receptor B' })).toBeNull();
    expect(screen.queryByText(/^Pathways$/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /soil ingestion/i })).toBeNull();
  });

  it('adds a second receptor and the sum of cancer risks', () => {
    start(() => undefined);
    render(<ReceptorsStep />);
    fireEvent.click(screen.getByRole('checkbox', { name: /second receptor/i }));
    expect(getGuided().exposure.b?.preset).toBe('worker');
    expect(screen.getByRole('group', { name: 'Receptor B' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /add the two receptors/i }));
    expect(getGuided().exposure.additive).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /second receptor/i }));
    expect(getGuided().exposure.b).toBeNull();
    expect(getGuided().exposure.additive).toBe(false);
  });

  it('sets a child and an adult with their cancer risks added', () => {
    start(() => undefined);
    render(<ReceptorsStep />);
    fireEvent.click(screen.getByRole('button', { name: /child and an adult/i }));
    const e = getGuided().exposure;
    expect([e.a.preset, e.b?.preset, e.additive]).toEqual(['child', 'resident', true]);
  });

  it('marks an edited factor, shows the profile value and keeps the edit under guided.a', () => {
    start(() => undefined);
    render(<ReceptorsStep />);
    const a = screen.getByRole('group', { name: 'Receptor A' });
    const details = a.querySelector('details.override-panel') as HTMLDetailsElement;
    details.open = true;
    expect(within(a).getAllByText(/preset: 70 kg/i).length).toBeGreaterThan(0);
    fireEvent.change(within(a).getByLabelText(/^body weight \(kg\)/i), { target: { value: '60' } });
    const row = within(a)
      .getByLabelText(/^body weight \(kg\)/i)
      .closest('.override-row') as HTMLElement;
    fireEvent.change(within(row).getByLabelText(/source note for body weight/i), {
      target: { value: 'Site survey' },
    });
    expect(within(a).getByText('Edited')).toBeTruthy();
    expect(Object.keys(getOverrides().receptors)).toEqual(['guided.a']);
  });

  it('names the exposure input a ticked pathway needs and the profile leaves open', () => {
    start((g) => {
      g.run.basis = 'legacy';
    });
    render(<ReceptorsStep />);
    const list = screen.getByRole('region', { name: /exposure inputs still needed/i });
    expect(list.textContent).toMatch(/Receptor A: Soil skin area \(cm2\)/);
    expect(list.textContent).toMatch(/soil dermal contact/i);
    fireEvent.change(screen.getByLabelText(/^soil skin area \(cm2\)/i), {
      target: { value: '5700' },
    });
    expect(list.textContent).not.toMatch(/Soil skin area/);
  });

  it('says so when a typed factor is not a number', () => {
    start((g) => {
      g.exposure.a = { ...g.exposure.a, waterIngestion: 'lots' };
    });
    render(<ReceptorsStep />);
    expect(screen.getByRole('alert').textContent).toMatch(/drinking water/i);
  });
});
