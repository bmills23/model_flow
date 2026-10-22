import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import { compute, type VadoseComputeResult } from './compute';
import { vadoseCsvTables, vadoseResultRows, vadoseSeriesRows } from './csv';
import { R7_FORM as DEFAULT_FORM, toScenario } from './form';

function result(): VadoseComputeResult {
  const r = toScenario(DEFAULT_FORM);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

describe('vadose CSV', () => {
  const res = result();
  it('writes one results row per method that ran, with full-precision mg/L', () => {
    const rows = vadoseResultRows(res);
    expect(rows.map((r) => r.method)).toEqual(['vadose.vadsat', 'vadose.layered']);
    expect(rows[0]!.poreWater0).toBe(res.runs.legacy!.series.sourcePoreWater[0]! * 1e3);
    expect(rows[0]!.massInitial).toBe(res.runs.legacy!.budget.initial);
  });
  it('writes one series row per method and time in years', () => {
    const rows = vadoseSeriesRows(res);
    const n = res.runs.legacy!.series.times.length + res.runs.modern!.series.times.length;
    expect(rows).toHaveLength(n);
    expect(rows[0]!.time).toBe(0);
  });
  it('puts units in the header and gives every row the same cell count', () => {
    for (const t of vadoseCsvTables(res)) {
      const lines = exportCsv(t.rows, t.columns).trimEnd().split('\r\n');
      expect(lines[0]).toContain('(mg/L)');
      expect(lines).toHaveLength(t.rows.length + 1);
    }
  });
  it('omits a method that did not run', () => {
    const only = { ...res, runs: { modern: res.runs.modern! } };
    expect(vadoseResultRows(only)).toHaveLength(1);
  });
});
