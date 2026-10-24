// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ReceptorRiskSummary } from '@model-flow/engine';
import { barRows, fmtHi, fmtRisk, PATHWAY_LABELS } from './chartData';

const summary = (over: Partial<ReceptorRiskSummary> = {}): ReceptorRiskSummary => ({
  label: 'A',
  cancerRisk: 3e-6,
  hi: 0.5,
  hiByGroup: { total: 0.5 },
  headlineGroup: 'total',
  byPathway: [
    { id: 'waterIngestion', risk: 2e-6, riskShare: 2 / 3, hi: 0.3, hiShare: 0.6 },
    { id: 'soilIngestion', risk: 1e-6, riskShare: 1 / 3, hi: 0.2, hiShare: 0.4 },
  ],
  byChemical: [{ id: '71-43-2', risk: 3e-6, riskShare: 1, hi: 0.5, hiShare: 1 }],
  notQuantified: [],
  ...over,
});

describe('formatting', () => {
  it('writes risks in scientific form and hazard indices with three figures', () => {
    expect(fmtRisk(3.2e-6)).toBe('3.2e-6');
    expect(fmtRisk(0)).toBe('0');
    expect(fmtRisk(0.0123)).toBe('1.2e-2');
    expect(fmtHi(0.5)).toBe('0.5');
    expect(fmtHi(12.3456)).toBe('12.3');
    expect(fmtHi(0)).toBe('0');
  });

  it('labels every pathway', () => {
    expect(PATHWAY_LABELS.waterDermal).toMatch(/dermal/i);
    expect(Object.keys(PATHWAY_LABELS)).toHaveLength(10);
    expect(PATHWAY_LABELS.produce).toMatch(/produce/i);
  });
});

describe('barRows', () => {
  const rows = [
    { label: 'Resident, legacy', summary: summary() },
    { label: 'Resident, modern', summary: summary({ cancerRisk: 6e-6 }) },
  ];

  it('builds one stacked row per receptor and method with the pathway risks as segments', () => {
    const out = barRows('risk', 'pathway', rows, {});
    expect(out).toHaveLength(2);
    expect(out[0]!.total).toBeCloseTo(3e-6, 12);
    expect(out[0]!.segments.map((s) => [s.id, s.value])).toEqual([
      ['waterIngestion', 2e-6],
      ['soilIngestion', 1e-6],
    ]);
    expect(out[0]!.segments[0]!.label).toBe(PATHWAY_LABELS.waterIngestion);
  });

  it('uses the same colour slot for the same id in every row', () => {
    const out = barRows('risk', 'pathway', rows, {});
    expect(out[0]!.segments[0]!.slot).toBe(out[1]!.segments[0]!.slot);
    expect(out[0]!.segments[0]!.slot).not.toBe(out[0]!.segments[1]!.slot);
  });

  it('names chemicals from the lookup and falls back to the id', () => {
    const out = barRows('hi', 'chemical', rows, { '71-43-2': 'Benzene' });
    expect(out[0]!.segments[0]!.label).toBe('Benzene');
    expect(out[0]!.segments[0]!.value).toBe(0.5);
    const unnamed = barRows('hi', 'chemical', rows, {});
    expect(unnamed[0]!.segments[0]!.label).toBe('71-43-2');
  });

  it('drops zero segments and keeps an all-zero row with a zero total', () => {
    const zero = summary({
      byPathway: [{ id: 'waterIngestion', risk: 0, riskShare: null, hi: 0, hiShare: null }],
    });
    const out = barRows('risk', 'pathway', [{ label: 'x', summary: zero }], {});
    expect(out[0]!.segments).toEqual([]);
    expect(out[0]!.total).toBe(0);
  });
});

describe('barRows, values that are not quantified', () => {
  const quant = {
    total: { risk: null, hi: null },
    byPathway: new Map([
      ['waterIngestion', { risk: null, hi: null }],
      ['waterDermal', { risk: 'an input is missing', hi: 'an input is missing' }],
    ]),
    byChemical: new Map([['71-43-2', { risk: null, hi: null }]]),
  };
  const withDermal = summary({
    byPathway: [
      { id: 'waterIngestion', risk: 2e-6, riskShare: 1, hi: 0.3, hiShare: 1 },
      { id: 'waterDermal', risk: 0, riskShare: null, hi: 0, hiShare: null },
    ],
  });

  it('marks a pathway with no quantified cell, so the table can say so instead of 0', () => {
    const [row] = barRows('risk', 'pathway', [{ label: 'A', summary: withDermal, quant }], {});
    expect(row!.gaps).toEqual({ 'Bathing dermal contact': 'an input is missing' });
    expect(row!.totalGap).toBeNull();
  });

  it('marks a total that nothing quantified', () => {
    const nothing = {
      ...quant,
      total: { risk: 'no cancer toxicity value for this route', hi: null },
    };
    const [risk] = barRows(
      'risk',
      'chemical',
      [{ label: 'A', summary: summary(), quant: nothing }],
      {},
    );
    expect(risk!.totalGap).toBe('no cancer toxicity value for this route');
    const [hi] = barRows(
      'hi',
      'chemical',
      [{ label: 'A', summary: summary(), quant: nothing }],
      {},
    );
    expect(hi!.totalGap).toBeNull();
  });

  it('has no gaps for rows built without a quantification', () => {
    const [row] = barRows('risk', 'pathway', [{ label: 'A', summary: summary() }], {});
    expect(row!.gaps).toEqual({});
    expect(row!.totalGap).toBeNull();
  });
});
