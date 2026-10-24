import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, LAKE_FORM, toRequest } from './inputs';
import { surfaceWaterRunInputs } from './runInputs';

const value = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value;
function rowsOf(form = DEFAULT_FORM, link: Parameters<typeof toRequest>[1] = null) {
  const r = toRequest(form, link);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return surfaceWaterRunInputs(r.request);
}

describe('surfaceWaterRunInputs', () => {
  it('reads the river run back in the units it was typed in', () => {
    const rows = rowsOf();
    expect(value(rows, 'Water body')).toBe('River');
    expect(value(rows, 'River cross-section')).toBe('5 m2');
    expect(value(rows, 'Upstream flow')).toBe('180 m3/d');
    expect(value(rows, 'Background concentration upstream')).toBe('0 mg/L');
    expect(value(rows, 'Mixing fraction')).toBe('1');
    expect(value(rows, 'Bed conductivity')).toBe('10 m/d');
    expect(value(rows, 'Bed gradient')).toBe('0.05');
    expect(value(rows, 'Discharge thickness')).toBe('5 m');
    expect(value(rows, 'Reach length')).toBe('100 m');
    expect(value(rows, 'Groundwater concentration')).toBe('5 mg/L');
    expect(value(rows, 'Run length')).toBe('10 yr');
    expect(value(rows, 'Organic carbon partition coefficient')).toBe('59 L/kg');
  });

  it('describes the lake run with its own body, mixing fraction and decay', () => {
    const rows = rowsOf(LAKE_FORM);
    expect(value(rows, 'Water body')).toBe('Lake');
    expect(value(rows, 'Lake volume')).toBe('100000 m3');
    expect(value(rows, 'Mixing fraction')).toBe('0.1');
    expect(value(rows, 'Decay rate')).toBe('0.005 1/d');
  });

  it('names the groundwater source as fed when a transport run is linked', () => {
    const link = { scenario: {} as never, label: 'Groundwater transport run, 15 years' };
    const rows = rowsOf({ ...DEFAULT_FORM, linked: true, bankX: '20' }, link);
    expect(value(rows, 'Groundwater source')).toBe(
      'fed by the transport run sent to this screen (Groundwater transport run, 15 years)',
    );
    expect(value(rows, 'Groundwater concentration')).toBeUndefined();
    expect(value(rows, 'Distance from the source face to the bank')).toBe('20 m');
  });
});
