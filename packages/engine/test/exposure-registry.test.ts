import { describe, expect, it } from 'vitest';
import { registry, references, constantEpc, modernResident, modernChemical } from '../src/index.js';
import { benzeneBoundary } from './scenarioHelpers.js';

describe('M4 methods in the registry', () => {
  it('registers a legacy and a modern exposure method with used citations', () => {
    const legacy = registry.get('exposure.rags-a-1989');
    const modern = registry.get('exposure.rags-e-f-2014');
    expect(legacy.kind).toBe('legacy');
    expect(modern.kind).toBe('modern');
    expect(registry.list('exposure').length).toBe(2);
    for (const m of [legacy, modern]) {
      expect(m.process).toBe('exposure');
      expect(m.risc5Choice === undefined).toBe(m.kind === 'modern');
      for (const key of m.citations) {
        expect(references.find((r) => r.key === key)?.status, key).toBe('used');
      }
    }
    expect(legacy.citations).toEqual(['rags1989', 'epa1991sdef', 'epa1992dea']);
    expect(modern.citations).toContain('epa2005adaf');
  });

  it('runs through the registry and validates to the same warnings', () => {
    const input = {
      receptors: [
        {
          label: 'A',
          receptor: modernResident(),
          pathways: ['waterIngestion'] as const,
          chemicals: [
            {
              id: 'b',
              chemical: modernChemical(benzeneBoundary),
              epcs: { waterIngestion: constantEpc('waterIngestion', 500) },
            },
          ],
        },
      ],
    };
    const m = registry.get('exposure.rags-e-f-2014');
    const out = m.run(input) as { warnings: { code: string }[] };
    expect(out.warnings.map((w) => w.code)).toContain('risk.linear-above-0.01');
    expect(m.validate!(input).map((w) => w.code)).toEqual(out.warnings.map((w) => w.code));
  });
});
