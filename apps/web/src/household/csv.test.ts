import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import { computeHousehold } from './compute';
import { householdCsvTables, householdResultRows, RESULT_COLUMNS } from './csv';
import { DEFAULT_FORM, type HouseholdForm } from './form';

// Test inputs only; none of these is a sourced default.
const FORM: HouseholdForm = {
  ...DEFAULT_FORM,
  waterConcentration: '0.5',
  soilConcentration: '40',
  henry: '0.2',
  molecularWeight: '100',
  volatileOverride: 'volatile',
  householdFactor: '0.5',
  showerDropletDiameter: '1',
  showerFallTime: '2',
  showerFlow: '8',
  showerMinutes: '10',
  stallVolume: '2',
  ventilation: '0.5',
  postShowerMinutes: '5',
  sprayDropletDiameter: '1.5',
  sprayFallTime: '3',
  sprinklerFlow: '20',
  windSpeed: '2',
  mixingHeight: '2',
  boxLength: '10',
  boxWidth: '4',
};

describe('household CSV', () => {
  it('has no rows when nothing computes', () => {
    expect(householdResultRows(computeHousehold(DEFAULT_FORM))).toEqual([]);
    expect(householdCsvTables(computeHousehold(DEFAULT_FORM))).toEqual([]);
  });

  it('writes one row per quantity of each method that ran, with the registered method id', () => {
    const out = computeHousehold(FORM);
    const rows = householdResultRows(out);
    const methods = [...new Set(rows.map((r) => r.method))];
    expect(methods).toEqual(
      expect.arrayContaining([
        'shower.fc-1986',
        'shower.little-1992',
        'shower.rsl-household',
        'irrigation.sprinkler-fc',
        'particulate.box-emission',
        'particulate.ssg-pef-1996',
        'particulate.ssg-pef-2002',
      ]),
    );
    const little = out.shower.little;
    if (!little.ok) throw new Error('little did not compute');
    const air = rows.find(
      (r) => r.method === 'shower.little-1992' && r.quantity === 'exposure-average air',
    );
    expect(air).toMatchObject({ unit: 'mg/m3', value: little.concentration * 1e6 });
    const end = rows.find((r) => r.quantity === 'air at the end of the shower');
    expect(end).toMatchObject({ method: 'shower.little-1992', unit: 'mg/m3' });
    const pef = rows.filter((r) => r.quantity === 'particulate emission factor');
    expect(pef.map((r) => r.method)).toEqual([
      'particulate.ssg-pef-1996',
      'particulate.ssg-pef-2002',
    ]);
    expect(pef.every((r) => r.unit === 'm3/kg')).toBe(true);
  });

  it('omits a method that needs inputs and keeps the others', () => {
    const out = computeHousehold({ ...FORM, windSpeed: '' });
    const rows = householdResultRows(out);
    expect(rows.some((r) => r.method === 'particulate.box-emission')).toBe(false);
    expect(rows.some((r) => r.method === 'shower.fc-1986')).toBe(true);
  });

  it('names the file stem and carries no edition (no dataset is read)', () => {
    const t = householdCsvTables(computeHousehold(FORM));
    expect(t.map((x) => x.name)).toEqual(['household-results']);
    expect(t[0]?.editions ?? []).toEqual([]);
    const text = exportCsv(t[0]!.rows, t[0]!.columns);
    expect(text.split('\r\n')[0]).toBe('method,quantity,value,unit');
    expect(RESULT_COLUMNS.map((c) => c.key)).toEqual(['method', 'quantity', 'value', 'unit']);
  });
});
