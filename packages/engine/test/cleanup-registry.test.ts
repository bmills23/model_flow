import { describe, expect, it } from 'vitest';
import { registry, references } from '../src/index.js';
import { backCalculateModern } from '../src/processes/cleanup/direct.js';
import { ssgLeachingLevel } from '../src/processes/cleanup/ssg.js';
import { modernChemical, modernResident } from '../src/processes/exposure/receptorsModern.js';
import type { PathwayId } from '../src/processes/exposure/units.js';
import { benzeneBoundary } from './scenarioHelpers.js';

const YEAR = 365.25 * 86400;

describe('M5 cleanup methods in the registry', () => {
  const ids = ['cleanup.rags-b-1991', 'cleanup.rags-e-f-2014', 'cleanup.ssg-leaching'];

  it('registers three methods under process cleanup with legacy and modern kinds', () => {
    expect(registry.list('cleanup').map((m) => m.id)).toEqual(ids);
    expect(registry.list('cleanup', 'legacy').map((m) => m.id)).toEqual([ids[0]]);
    expect(registry.list('cleanup', 'modern').map((m) => m.id)).toEqual([ids[1], ids[2]]);
  });

  it('cites only existing references marked used, and records the RISC5 choice for legacy', () => {
    for (const id of ids) {
      const m = registry.get(id);
      expect(m.citations.length).toBeGreaterThan(0);
      expect(m.assumptions.length).toBeGreaterThan(0);
      for (const key of m.citations) {
        expect(references.find((r) => r.key === key)?.status, `${id} ${key}`).toBe('used');
      }
    }
    expect(registry.get(ids[0]!).risc5Choice).toBeTruthy();
    expect(registry.get(ids[0]!).citations).toEqual([
      'ragsb1991',
      'rags1989',
      'epa1991sdef',
      'epa1992dea',
      'brent1973',
    ]);
    expect(registry.get(ids[2]!).citations).toEqual(['epa1996ssg', 'epa1996ssgug', 'epa2002ssg']);
  });

  it('run equals the module function on H1 (benzene tap water)', () => {
    const TAP: PathwayId[] = ['waterIngestion', 'waterDermal'];
    const input = {
      receptors: [{ label: 'resident', receptor: modernResident(), pathways: TAP }],
      chemicals: [{ id: 'benzene', chemical: modernChemical(benzeneBoundary) }],
    };
    const m = registry.get('cleanup.rags-e-f-2014');
    expect(m.run(input)).toEqual(backCalculateModern(input));
    expect(m.validate!(input)).toEqual(backCalculateModern(input).warnings);
  });

  it('run equals the module function on H3 (site-specific DAF)', () => {
    const site = { K: 10 / 86400, i: 0.005, I: 0.18 / YEAR, L: 45, da: 10 };
    const input = {
      kind: 'organic' as const,
      soil: { rhoB: 1500 },
      koc: 0.1458,
      H: 0.22690106295994,
      target: 0.005e-3,
      daf: { site },
    };
    const m = registry.get('cleanup.ssg-leaching');
    expect(m.run(input)).toEqual(ssgLeachingLevel(input));
    expect((m.run(input) as { level: number }).level * 1e6).toBeCloseTo(3.25430114e-2, 8);
  });
});
