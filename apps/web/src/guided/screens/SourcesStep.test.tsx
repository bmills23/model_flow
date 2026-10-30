import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultGuided } from '../state';
import { SourcesStep } from './SourcesStep';
import { addChemical, forgetMemory, getGuided, getOverrides, setGuided } from '../../project/store';
import { setDecimalComma } from '../../ui/decimalComma';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  setDecimalComma(false);
  forgetMemory();
});

function wellSite(extra: Partial<ReturnType<typeof defaultGuided>['site']> = {}) {
  const g = defaultGuided();
  g.site = {
    ...g.site,
    sources: ['groundwater'],
    paths: { leaching: false, well: true, building: false, stream: false },
    ...extra,
  };
  setGuided(g);
}
const benzene = () => addChemical({ id: '71-43-2', name: 'Benzene' });
const toluene = () => addChemical({ id: '108-88-3', name: 'Toluene' });
const row = (name: RegExp) => screen.getByRole('group', { name });

describe('SourcesStep, 3b', () => {
  it('asks for chemicals first, then for a site model that works', () => {
    render(<SourcesStep />);
    expect(screen.getByText(/add at least one chemical/i)).toBeTruthy();
    cleanup();
    benzene();
    render(<SourcesStep />);
    expect(screen.getByText(/finish the site model/i)).toBeTruthy();
  });

  it('gives the concentration boxes a keyboard with letters, so ND and a less-than value can be typed', () => {
    benzene();
    wellSite();
    render(<SourcesStep />);
    const box = within(row(/^benzene$/i)).getByLabelText(/groundwater/i);
    expect(box.getAttribute('inputmode')).toBe('text');
  });

  it('shows one row per chemical with a box for each source medium step 2 needs', () => {
    benzene();
    toluene();
    wellSite({
      sources: ['groundwater', 'soilGas'],
      paths: { leaching: false, well: true, building: true, stream: false },
    });
    render(<SourcesStep />);
    expect(screen.getByRole('heading', { level: 1, name: /source values/i })).toBeTruthy();
    const b = row(/^benzene$/i);
    expect(within(b).getByLabelText(/groundwater/i)).toBeTruthy();
    expect(within(b).getByLabelText(/soil gas/i)).toBeTruthy();
    expect(within(row(/^toluene$/i)).getByLabelText(/groundwater/i)).toBeTruthy();
  });

  it('saves a typed value with its unit, accepts ND and names a value it cannot read', () => {
    benzene();
    wellSite();
    render(<SourcesStep />);
    const box = within(row(/^benzene$/i)).getByLabelText(/groundwater/i);
    fireEvent.change(box, { target: { value: '0.5' } });
    expect(getGuided().sources['71-43-2']!.values.groundwater).toEqual({
      value: '0.5',
      unit: 'mg/L',
    });
    fireEvent.change(box, { target: { value: 'nd' } });
    expect(screen.queryByText(/number above zero/i)).toBeNull();
    fireEvent.change(box, { target: { value: 'lots' } });
    expect(screen.getByText(/number above zero/i)).toBeTruthy();
  });

  it('keeps a value below a reporting limit as typed and takes it as entered', () => {
    benzene();
    wellSite();
    render(<SourcesStep />);
    const box = within(row(/^benzene$/i)).getByLabelText(/groundwater/i);
    fireEvent.change(box, { target: { value: '<0.5' } });
    expect(getGuided().sources['71-43-2']!.values.groundwater!.value).toBe('<0.5');
    expect(screen.queryByText(/number above zero/i)).toBeNull();
    fireEvent.change(box, { target: { value: '<' } });
    expect(screen.getByText(/number above zero/i)).toBeTruthy();
    expect(screen.getByText(/less-than value like <0\.5/i)).toBeTruthy();
  });

  it('honours the decimal comma setting and keeps a keyboard with letters', () => {
    benzene();
    wellSite();
    setDecimalComma(true);
    render(<SourcesStep />);
    const box = within(row(/^benzene$/i)).getByLabelText(/groundwater/i) as HTMLInputElement;
    expect(box.getAttribute('inputmode')).toBe('text');
    fireEvent.change(box, { target: { value: '0,5' } });
    expect(getGuided().sources['71-43-2']!.values.groundwater!.value).toBe('0.5');
    expect(box.value).toBe('0,5');
    fireEvent.change(box, { target: { value: '<0,5' } });
    expect(getGuided().sources['71-43-2']!.values.groundwater!.value).toBe('<0.5');
    // an entry that cannot be read either way is refused, once
    fireEvent.change(box, { target: { value: '1,2,3' } });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('changes the unit of a whole column and keeps a sample note for the row', () => {
    benzene();
    toluene();
    wellSite();
    render(<SourcesStep />);
    fireEvent.change(screen.getByLabelText(/unit for groundwater/i), { target: { value: 'ug/L' } });
    expect(getGuided().sources['71-43-2']!.values.groundwater!.unit).toBe('ug/L');
    expect(getGuided().sources['108-88-3']!.values.groundwater!.unit).toBe('ug/L');
    fireEvent.change(within(row(/^benzene$/i)).getByLabelText(/sample note/i), {
      target: { value: 'MW-3, May' },
    });
    expect(getGuided().sources['71-43-2']!.note).toBe('MW-3, May');
  });

  it('applies a table pasted from a spreadsheet and lists what it could not use', () => {
    benzene();
    toluene();
    wellSite();
    render(<SourcesStep />);
    fireEvent.change(screen.getByLabelText(/paste from a spreadsheet/i), {
      target: {
        value: 'Chemical\tGroundwater\nUnits\tug/L\nBenzene\t500\nToluene\tND\nXylene\t3',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /use the pasted table/i }));
    const s = getGuided().sources;
    expect(s['71-43-2']!.values.groundwater).toEqual({ value: '500', unit: 'ug/L' });
    expect(s['108-88-3']!.values.groundwater).toEqual({ value: 'ND', unit: 'ug/L' });
    expect(screen.getByRole('status').textContent).toMatch(/Xylene/);
  });

  it('asks for total petroleum hydrocarbons only when a soil medium is needed', () => {
    benzene();
    wellSite();
    render(<SourcesStep />);
    expect(screen.queryByLabelText(/total petroleum hydrocarbons/i)).toBeNull();
    cleanup();
    wellSite({
      sources: ['soilAbove'],
      paths: { leaching: true, well: false, building: false, stream: false },
    });
    render(<SourcesStep />);
    fireEvent.change(screen.getByLabelText(/total petroleum hydrocarbons/i), {
      target: { value: '1200' },
    });
    expect(getGuided().sources['71-43-2']!.tph).toBe('1200');
    expect(screen.queryByText(/until then the models that read it do not run/i)).toBeNull();
  });

  it('offers total petroleum hydrocarbons only where a modeled soil source uses it', () => {
    benzene();
    // a measured soil concentration is used as it is: no model reads the box
    const g = defaultGuided();
    g.site = { ...g.site, basis: 'measured', measured: ['soil'] };
    setGuided(g);
    render(<SourcesStep />);
    expect(screen.getByLabelText(/^soil \(/i)).toBeTruthy();
    expect(screen.queryByLabelText(/total petroleum hydrocarbons/i)).toBeNull();
    cleanup();
    // soil below the water table feeds the saturated soil source model, which reads it
    wellSite({
      sources: ['soilBelow'],
      paths: { leaching: false, well: true, building: false, stream: false },
    });
    render(<SourcesStep />);
    expect(screen.getByLabelText(/total petroleum hydrocarbons/i)).toBeTruthy();
  });

  it('says so when the total petroleum hydrocarbons value cannot be read', () => {
    benzene();
    wellSite({
      sources: ['soilAbove'],
      paths: { leaching: true, well: false, building: false, stream: false },
    });
    render(<SourcesStep />);
    fireEvent.change(screen.getByLabelText(/total petroleum hydrocarbons/i), {
      target: { value: '1,200' },
    });
    expect(screen.getByText(/until then the models that read it do not run/i)).toBeTruthy();
    // a less-than value is not taken here
    fireEvent.change(screen.getByLabelText(/total petroleum hydrocarbons/i), {
      target: { value: '<5' },
    });
    expect(screen.getByText(/until then the models that read it do not run/i)).toBeTruthy();
  });
});

describe('SourcesStep, 3c', () => {
  it('lists only the values the chosen models use and saves a project-only edit with its note', async () => {
    benzene();
    wellSite();
    render(<SourcesStep />);
    const h = screen.getByRole('heading', { level: 2, name: /chemical values/i });
    expect(h).toBeTruthy();
    fireEvent.click(
      await screen.findByText(/^benzene \(chemical values\)$/i, undefined, { timeout: 20000 }),
    );
    // the groundwater well chain reads Koc, Henry's constant and molar mass, not the diffusivities
    expect(screen.getByLabelText(/your value for koc/i)).toBeTruthy();
    expect(screen.queryByLabelText(/your value for diffusivity/i)).toBeNull();
    const shown = await screen.findAllByText(/database value:\s*[\d.]+/i, undefined, {
      timeout: 20000,
    });
    expect(shown.length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/your value for koc/i), { target: { value: '99' } });
    expect(screen.getByRole('status').textContent).toMatch(/source note is required/i);
    // the field the problem is about points at it
    const problem = screen.getByRole('status');
    expect(screen.getByLabelText(/your value for koc/i).getAttribute('aria-describedby')).toContain(
      problem.id,
    );
    expect(
      screen.getByLabelText(/source note for koc/i).getAttribute('aria-describedby'),
    ).toContain(problem.id);
    fireEvent.change(screen.getByLabelText(/source note for koc/i), {
      target: { value: 'site lab' },
    });
    expect(getOverrides().fate['71-43-2']!.koc).toEqual({ value: '99', note: 'site lab' });
    fireEvent.click(
      screen.getByRole('button', { name: /reset to database value: koc of benzene/i }),
    );
    expect(getOverrides().fate).toEqual({});
  }, 40000);

  it('lists nothing to edit when the values are measured and nothing is modeled', () => {
    benzene();
    const g = defaultGuided();
    g.site = { ...g.site, basis: 'measured', measured: ['groundwater'] };
    setGuided(g);
    render(<SourcesStep />);
    expect(screen.getByText(/no model uses chemical properties/i)).toBeTruthy();
  });
});
