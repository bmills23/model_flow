import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import { RUN_CSV_COLUMNS, runCsvTable } from './runCsv';
import type { GuidedOutputs } from './state';

const YR = 365.25 * 24 * 3600;
const well = (id: string, values: number[]) => ({
  inputsHash: 'h',
  value: {
    method: 'modern',
    label: 'w',
    times: values.map((_, i) => i * YR),
    values,
    chemicalId: id,
  },
});

const outputs = (): GuidedOutputs => ({
  well: { a: well('a', [0, 1e-3, 2e-3]) as never, b: well('b', [5e-4, 6e-4]) as never },
  vaporRisk: {
    a: {
      inputsHash: 'h',
      value: {
        chemicalId: 'a',
        label: 'x',
        indoor: { kind: 'constant', value: 2e-6, origin: 'vapor.je-epa' },
      },
    } as never,
  },
});

describe('runCsvTable', () => {
  it('holds a row for every chemical and every time step of the well curve', () => {
    const t = runCsvTable(outputs(), [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ]);
    const wellRows = t.rows.filter((r) => r['result'] === 'Groundwater at the well');
    expect(wellRows.map((r) => [r['chemical'], r['timeYr'], r['concentration']])).toEqual([
      ['Alpha', 0, 0],
      ['Alpha', 1, 1],
      ['Alpha', 2, 2],
      ['Beta', 0, 0.5],
      ['Beta', 1, 0.6],
    ]);
    expect(wellRows.every((r) => r['unit'] === 'mg/L')).toBe(true);
  });

  it('adds indoor air in mg/m3 and writes a file with the units named', () => {
    const t = runCsvTable(outputs(), [{ id: 'a', name: 'Alpha' }]);
    const air = t.rows.filter((r) => r['result'] === 'Indoor air');
    expect(air).toHaveLength(1);
    expect(air[0]!['concentration']).toBeCloseTo(2, 9);
    expect(air[0]!['unit']).toBe('mg/m3');
    const text = exportCsv(t.rows, t.columns);
    expect(text.split('\r\n')[0]).toBe(
      'Chemical,Chemical id,Result,Time (yr),Concentration,Concentration unit',
    );
    expect(RUN_CSV_COLUMNS).toHaveLength(6);
  });

  it('skips chemicals with no output', () => {
    expect(runCsvTable({}, [{ id: 'a', name: 'Alpha' }]).rows).toEqual([]);
  });
});
