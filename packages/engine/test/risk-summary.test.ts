import { describe, expect, it } from 'vitest';
import {
  additiveCancerRisk,
  assertAdditiveAllowed,
  constantEpc,
  modernChemical,
  modernResident,
  runModernScenario,
  summarizeRun,
} from '../src/index.js';
import { benzeneBoundary, bapBoundary } from './scenarioHelpers.js';

describe('risk additivity rules', () => {
  it('only cancer risks add across receptors', () => {
    expect(additiveCancerRisk([1e-6, 2e-6])).toBeCloseTo(3e-6, 20);
    expect(additiveCancerRisk([])).toBe(0);
  });
  it('an age-segmented receptor refuses the additive option', () => {
    expect(() => assertAdditiveAllowed([false, true])).toThrow(/child twice/);
    expect(() => assertAdditiveAllowed([false, false])).not.toThrow();
  });
});

describe('risk summary', () => {
  const chems = [
    {
      id: 'benzene',
      chemical: modernChemical(benzeneBoundary),
      epcs: {
        waterIngestion: constantEpc('waterIngestion', 0.01),
        indoorInhalation: constantEpc('indoorInhalation', 0.001),
      },
    },
    {
      id: 'bap',
      chemical: modernChemical(bapBoundary),
      epcs: { soilIngestion: constantEpc('soilIngestion', 1) },
    },
  ];
  const r = runModernScenario({
    receptors: [
      {
        label: 'A',
        receptor: modernResident(),
        pathways: ['waterIngestion', 'indoorInhalation', 'soilIngestion'],
        chemicals: chems,
      },
    ],
  });
  const s = r.summary.receptors[0]!;

  it('reports totals equal to the receptor result and shares that sum to one', () => {
    expect(s.cancerRisk).toBe(r.receptors[0]!.totals.risk);
    expect(s.hi).toBe(r.receptors[0]!.totals.hi);
    for (const list of [s.byPathway, s.byChemical]) {
      expect(list.reduce((a, c) => a + c.risk, 0)).toBeCloseTo(s.cancerRisk, 18);
      expect(list.reduce((a, c) => a + (c.riskShare ?? 0), 0)).toBeCloseTo(1, 12);
      expect(list.reduce((a, c) => a + (c.hiShare ?? 0), 0)).toBeCloseTo(1, 12);
      expect([...list].sort((a, b) => b.risk - a.risk)).toEqual(list);
    }
    expect(s.byChemical.map((c) => c.id).sort()).toEqual(['benzene', 'bap'].sort());
  });

  it('no additive total without the option', () => {
    expect(r.summary.additiveCancerRisk).toBeNull();
    expect(summarizeRun([s], true).additiveCancerRisk).toBe(s.cancerRisk);
  });
});
