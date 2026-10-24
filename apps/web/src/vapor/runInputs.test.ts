import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM } from './form';
import { DEFAULT_OUTDOOR } from './outdoor';
import { vaporRunInputs } from './runInputs';

const value = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value;
const base = {
  form: DEFAULT_FORM,
  outdoor: DEFAULT_OUTDOOR,
  method: 'legacy' as const,
  fedBy: null,
  withOutdoor: false,
};

describe('vaporRunInputs', () => {
  it('names the entered source, its medium and unit, the soil column and the building', () => {
    const rows = vaporRunInputs(base);
    expect(value(rows, 'Indoor air method')).toBe('Legacy Johnson and Ettinger');
    expect(value(rows, 'Source medium')).toBe('Soil');
    expect(value(rows, 'Source concentration in soil')).toBe('1000 mg/kg');
    expect(value(rows, 'Depth of the foundation floor below grade')).toBe('2 m');
    expect(value(rows, 'Soil layer 1, Soil above the floor')).toMatch(/^2 m thick, /);
    expect(value(rows, 'Foundation')).toBe('Basement with a slab');
    expect(value(rows, 'Floor area')).toBe('150 m2');
    expect(value(rows, 'Air exchange rate')).toBe('0.5 1/h');
    expect(rows.some((r) => r.label.startsWith('Outdoor'))).toBe(false);
  });

  it('follows the medium of the source', () => {
    const gw = vaporRunInputs({
      ...base,
      form: { ...DEFAULT_FORM, source: 'groundwater', cgw: '3' },
    });
    expect(value(gw, 'Source medium')).toBe('Groundwater');
    expect(value(gw, 'Source concentration in groundwater')).toBe('3 mg/L');
    const gas = vaporRunInputs({
      ...base,
      form: { ...DEFAULT_FORM, source: 'soilGas', soilGas: '8' },
    });
    expect(value(gas, 'Source concentration in soil gas')).toBe('8 mg/m3');
  });

  it('names a source taken from another screen as fed, with no typed concentration', () => {
    const rows = vaporRunInputs({ ...base, fedBy: 'Water table under the building, modern' });
    expect(value(rows, 'Source')).toBe(
      "fed by another screen's result (Water table under the building, modern)",
    );
    expect(value(rows, 'Source medium')).toBeUndefined();
    expect(rows.some((r) => r.label.startsWith('Source concentration'))).toBe(false);
  });

  it('adds the outdoor box only when outdoor air was sent', () => {
    const rows = vaporRunInputs({ ...base, withOutdoor: true });
    expect(value(rows, 'Outdoor wind speed')).toBe('2.25 m/s');
    expect(value(rows, 'Outdoor mixing height')).toBe('2 m');
  });

  it('uses no internal key as a label or a value', () => {
    const rows = vaporRunInputs({ ...base, withOutdoor: true, method: 'devaull' });
    for (const r of rows)
      expect(`${r.label} ${r.value}`).not.toMatch(/basementSlab|soilGas\b|devaull|custom/);
  });
});
