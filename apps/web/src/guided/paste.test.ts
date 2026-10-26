import { describe, expect, it } from 'vitest';
import { parsePaste } from './paste';

const chems = [
  { id: '71-43-2', name: 'Benzene', cas: '71-43-2' },
  { id: '108-88-3', name: 'Toluene', cas: '108-88-3' },
];
const cols = ['groundwater', 'soilAbove'] as const;

describe('parsePaste', () => {
  it('reads tab separated rows with a header row, matching media by their names', () => {
    const r = parsePaste(
      'Chemical\tSoil above the water table\tGroundwater\nBenzene\t12\t0.5\nToluene\tND\t3',
      [...cols],
      chems,
    );
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { chemicalId: '71-43-2', values: { soilAbove: '12', groundwater: '0.5' } },
      { chemicalId: '108-88-3', values: { soilAbove: 'ND', groundwater: '3' } },
    ]);
  });

  it('reads commas, and with no header takes the columns in the order of the grid', () => {
    const r = parsePaste('71-43-2,0.5,12\n108-88-3,3,ND', [...cols], chems);
    expect(r.rows[0]).toEqual({
      chemicalId: '71-43-2',
      values: { groundwater: '0.5', soilAbove: '12' },
    });
    expect(r.rows[1]!.values.soilAbove).toBe('ND');
  });

  it('reads a units row and units in a header', () => {
    const r = parsePaste(
      'Chemical\tGroundwater\tSoil above the water table\nUnits\tug/L\tmg/kg\nBenzene\t500\t12',
      [...cols],
      chems,
    );
    expect(r.units).toEqual({ groundwater: 'ug/L', soilAbove: 'mg/kg' });
    expect(r.rows).toHaveLength(1);
    const h = parsePaste('Chemical\tGroundwater (µg/L)\nBenzene\t500', ['groundwater'], chems);
    expect(h.units).toEqual({ groundwater: 'ug/L' });
  });

  it('writes every not-detected spelling as ND, and a less-than value too', () => {
    const r = parsePaste('Benzene\tN.D.\t<0.5\nToluene\tnot detected\t', [...cols], chems);
    expect(r.rows[0]!.values).toEqual({ groundwater: 'ND', soilAbove: 'ND' });
    expect(r.rows[1]!.values).toEqual({ groundwater: 'ND' });
  });

  it('keeps a sample note column', () => {
    const r = parsePaste(
      'Chemical\tGroundwater\tSample\nBenzene\t1\tMW-3, May',
      ['groundwater'],
      chems,
    );
    expect(r.rows[0]).toEqual({
      chemicalId: '71-43-2',
      values: { groundwater: '1' },
      note: 'MW-3, May',
    });
  });

  it('names rows and cells it could not use instead of guessing', () => {
    const r = parsePaste('Xylene\t1\nBenzene\tabc\nBenzene\t0', ['groundwater'], chems);
    expect(r.rows).toEqual([]);
    expect(r.problems.join(' ')).toMatch(/Xylene/);
    expect(r.problems.join(' ')).toMatch(/abc/);
    expect(r.problems.length).toBe(3);
  });

  it('ignores blank lines and does not use the long dash', () => {
    const r = parsePaste('\nBenzene\t1\n\n', ['groundwater'], chems);
    expect(r.rows).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain(String.fromCharCode(0x2014));
  });
});
