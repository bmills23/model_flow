import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import { compute, type SaturatedComputeResult } from './compute';
import { saturatedCsvTables, saturatedResultRows, saturatedSeriesRows } from './csv';
import { DEFAULT_FORM, toScenario } from './form';

function result(): SaturatedComputeResult {
  const r = toScenario(DEFAULT_FORM);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

describe('saturated CSV', () => {
  const res = result();
  it('writes one results row per method with the engine method id and kg/d rates', () => {
    const rows = saturatedResultRows(res);
    expect(rows.map((r) => r.method)).toEqual([
      'saturatedSource.two-region',
      'saturatedSource.exponential',
    ]);
    expect(rows[0]!.initialMass).toBe(res.runs.legacy!.initialMass);
    expect(rows[0]!.meanRate).toBe(res.runs.legacy!.rates.mean * 86400);
  });
  it('writes the curves per method and time', () => {
    const rows = saturatedSeriesRows(res);
    expect(rows).toHaveLength(2 * res.curves.timesYr.length);
    expect(rows[0]!.time).toBe(res.curves.timesYr[0]);
    expect(rows[1]!.remaining).toBe(res.curves.remaining.legacy![1]);
  });
  it('has unit headers and full line counts', () => {
    for (const t of saturatedCsvTables(res)) {
      const lines = exportCsv(t.rows, t.columns).trimEnd().split('\r\n');
      expect(lines[0]).toContain('(kg');
      expect(lines).toHaveLength(t.rows.length + 1);
    }
  });
});
