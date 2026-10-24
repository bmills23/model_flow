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

/** A legacy run whose toluene has no cancer value and whose bathing dermal pathway has no input. */
const cell = (
  chemical: string,
  pathway: string,
  c: { computable?: boolean; risk?: number | null; hq?: number | null },
) => ({
  chemical,
  pathway,
  cell: { computable: c.computable ?? true, risk: c.risk ?? null, hq: c.hq ?? null },
});
const gappy = {
  legacy: {
    ok: true,
    result: {
      receptors: [
        {
          cells: [
            cell('c1', 'soilIngestion', { risk: 2e-6, hq: 0.3 }),
            cell('c1', 'waterDermal', { computable: false }),
            cell('tol', 'soilIngestion', { hq: 0.2 }),
            cell('tol', 'waterDermal', { computable: false }),
          ],
        },
      ],
      summary: {
        receptors: [
          {
            label: 'Resident',
            cancerRisk: 2e-6,
            hi: 0.5,
            hiByGroup: { total: 0.5 },
            headlineGroup: 'total',
            byPathway: [
              { id: 'soilIngestion', risk: 2e-6, riskShare: 1, hi: 0.5, hiShare: 1 },
              { id: 'waterDermal', risk: 0, riskShare: null, hi: 0, hiShare: null },
            ],
            byChemical: [
              { id: 'c1', risk: 2e-6, riskShare: 1, hi: 0.3, hiShare: 0.6 },
              { id: 'tol', risk: 0, riskShare: null, hi: 0.2, hiShare: 0.4 },
            ],
            notQuantified: [],
          },
        ],
      },
    },
  },
  modern: { ok: false, error: 'refused' },
} as unknown as RiskOutcome;

describe('risk CSV, values that are not quantified', () => {
  it('leaves a pathway or chemical with no value empty and gives the reason in the note, never 0', () => {
    const rows = riskContributionRows(gappy, { c1: 'Benzene', tol: 'Toluene' });
    const dermal = rows.find((r) => r.item === 'Bathing dermal contact')!;
    expect(dermal.cancerRisk).toBeNull();
    expect(dermal.hazardIndex).toBeNull();
    expect(dermal.note).toContain('an exposure input or chemical property is missing');
    const toluene = rows.find((r) => r.item === 'Toluene')!;
    expect(toluene.cancerRisk).toBeNull();
    expect(toluene.hazardIndex).toBe(0.2);
    expect(toluene.note).toMatch(/^cancer risk: .*no cancer toxicity value/);
    const benzene = rows.find((r) => r.item === 'Benzene')!;
    expect(benzene.cancerRisk).toBe(2e-6);
    expect(benzene.note).toBe('');
  });

  it('declares its value columns and reason column so the report prints "not quantified"', () => {
    const [results, contributions] = riskCsvTables(gappy, {});
    for (const t of [results!, contributions!]) {
      expect(t.missing).toEqual({ keys: ['cancerRisk', 'hazardIndex'], because: 'note' });
      expect(t.columns.map((c) => c.key)).toContain('note');
    }
  });

  it('leaves a receptor total empty when no cell quantified it', () => {
    const none = {
      legacy: {
        ok: true,
        result: {
          receptors: [{ cells: [cell('tol', 'soilIngestion', { hq: 0.2 })] }],
          summary: {
            receptors: [
              {
                label: 'Resident',
                cancerRisk: 0,
                hi: 0.2,
                hiByGroup: { total: 0.2 },
                headlineGroup: 'total',
                byPathway: [],
                byChemical: [],
                notQuantified: [],
              },
            ],
          },
        },
      },
      modern: { ok: false, error: 'x' },
    } as unknown as RiskOutcome;
    const [row] = riskResultRows(none);
    expect(row!.cancerRisk).toBeNull();
    expect(row!.hazardIndex).toBe(0.2);
    expect(String(row!.note)).toMatch(/cancer risk: no cancer toxicity value/);
  });
});

describe('risk CSV', () => {
  it('writes one row per method and receptor at full precision; a method that did not run has none', () => {
    expect(riskResultRows(outcome)).toEqual([
      {
        method: 'exposure.rags-a-1989',
        receptor: 'Resident =1',
        cancerRisk: 1.234567890123e-6,
        hazardIndex: 0.5,
        hazardGroup: 'adult',
        note: '',
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
      'method,receptor,incremental lifetime cancer risk (-),hazard index (-),hazard index group,not quantified because',
    );
    const r = riskResultRows({
      ...outcome,
      legacy: { ok: true, result: { summary: { receptors: [summary('=cmd', 1)] } } },
    } as unknown as RiskOutcome);
    expect(exportCsv(r, t!.columns)).toContain("'=cmd");
  });
});
