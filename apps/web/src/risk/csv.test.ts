import { describe, expect, it } from 'vitest';
import type { ReceptorRiskSummary } from '@model-flow/engine';
import { exportCsv } from '../export/csv';
import type { RiskOutcome } from './compute';
import { riskContributionRows, riskCsvTables, riskResultRows } from './csv';

const summary = (label: string, risk: number): ReceptorRiskSummary => ({
  label,
  cancerRisk: risk,
  hi: 0.5,
  hiByGroup: { adult: 0.5 },
  headlineGroup: 'adult',
  byPathway: [{ id: 'soilIngestion', risk, riskShare: 1, hi: 0.5, hiShare: 1 }],
  byChemical: [{ id: 'c1', risk, riskShare: 1, hi: 0.5, hiShare: 1 }],
  notQuantified: [],
});

const outcome = {
  legacy: {
    ok: true,
    result: { summary: { receptors: [summary('Resident =1', 1.234567890123e-6)] } },
  },
  modern: { ok: false, error: 'refused' },
} as unknown as RiskOutcome;

describe('risk CSV', () => {
  it('writes one row per method and receptor at full precision; a method that did not run has none', () => {
    expect(riskResultRows(outcome)).toEqual([
      {
        method: 'exposure.rags-a-1989',
        receptor: 'Resident =1',
        cancerRisk: 1.234567890123e-6,
        hazardIndex: 0.5,
        hazardGroup: 'adult',
      },
    ]);
  });
  it('writes the pathway and chemical splits with display names', () => {
    const rows = riskContributionRows(outcome, { c1: 'Benzene' });
    expect(rows.map((r) => [r.split, r.item])).toEqual([
      ['pathway', 'Soil ingestion'],
      ['chemical', 'Benzene'],
    ]);
  });
  it('defuses a receptor label that starts with a formula character', () => {
    const [t] = riskCsvTables({ ...outcome } as RiskOutcome, {});
    const lines = exportCsv(t!.rows, t!.columns).split('\r\n');
    expect(lines[0]).toBe(
      'method,receptor,incremental lifetime cancer risk (-),hazard index (-),hazard index group',
    );
    const r = riskResultRows({
      ...outcome,
      legacy: { ok: true, result: { summary: { receptors: [summary('=cmd', 1)] } } },
    } as unknown as RiskOutcome);
    expect(exportCsv(r, t!.columns)).toContain("'=cmd");
  });
});
