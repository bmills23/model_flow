import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import { runVapor } from './compute';
import { vaporCsvTables, vaporResultRows, vaporSeriesRows } from './csv';
import { DEFAULT_FORM, toInputs } from './form';
import type { VaporEpcs } from './series';

const YR = 365.25 * 86400;

function outcome() {
  const p = toInputs(DEFAULT_FORM);
  if (!p.ok) throw new Error(p.errors.join('; '));
  return runVapor(p);
}

describe('vapor CSV', () => {
  const out = outcome();
  it('writes one results row per method that ran, in mg/m3', () => {
    const rows = vaporResultRows(out);
    expect(rows.map((r) => r.method)).toEqual(['vapor.je-1991', 'vapor.je-epa']);
    if (!out.legacy.ok) throw new Error('legacy failed');
    expect(rows[0]!.indoor).toBe(out.legacy.result.concentration / 1e-6);
    expect(rows[0]!.alpha).toBe(out.legacy.result.alpha);
  });
  it('writes the offered source series long, in years, and a constant as one row', () => {
    const epcs: VaporEpcs = {
      indoor: {
        legacy: {
          kind: 'series',
          series: { times: [0, YR], values: [2e-6, 1e-6] },
          origin: { kind: 'method', id: 'vapor.je-1991' },
        } as never,
        modern: { kind: 'constant', value: 3e-6, origin: { kind: 'method', id: 'x' } } as never,
      },
      outdoor: {},
      errors: {},
      warnings: [],
    };
    const rows = vaporSeriesRows(epcs);
    expect(rows).toEqual([
      { method: 'vapor.je-1991', medium: 'indoor air', time: 0, concentration: 2e-6 / 1e-6 },
      { method: 'vapor.je-1991', medium: 'indoor air', time: 1, concentration: 1e-6 / 1e-6 },
      { method: 'vapor.je-epa', medium: 'indoor air', time: null, concentration: 3e-6 / 1e-6 },
    ]);
  });
  it('offers the series table only with a source series', () => {
    expect(vaporCsvTables(out, null)).toHaveLength(1);
    const t = vaporCsvTables(out, { indoor: {}, outdoor: {}, errors: {}, warnings: [] });
    expect(t).toHaveLength(2);
    const lines = exportCsv(t[0]!.rows, t[0]!.columns).trimEnd().split('\r\n');
    expect(lines[0]).toContain('indoor air concentration (mg/m3)');
  });
});
