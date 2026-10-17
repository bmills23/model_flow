import { describe, expect, it } from 'vitest';
import { registry, references, type runLegacySurfaceWater } from '../src/index.js';
import { DAY_S, mgPerLToKgPerM3 } from '../src/processes/surfaceWater/units.js';

const d = (x: number): number => x / DAY_S;
const input = {
  body: { type: 'river', crossSection: 5 },
  upstreamFlow: d(10),
  background: 0,
  mixingFraction: 1,
  decay: 0,
  reach: { kind: 'entered', length: 100 },
  discharge: { kind: 'darcy', bedConductivity: d(10), thickness: 5, gradient: 0.05 },
  times: [0, 1e8],
  groundwaterConcentrations: [mgPerLToKgPerM3(5), mgPerLToKgPerM3(5)],
  sediment: { fractionOrganicCarbon: 0.01 },
} as const;

describe('M8 methods in the registry', () => {
  const methods = registry.list('surfaceWater');
  const byKey = new Map(references.map((r) => [r.key, r]));

  it('registers a legacy and a modern method with the planned ids', () => {
    expect(methods.map((m) => m.id).sort()).toEqual([
      'surfaceWater.mass-discharge',
      'surfaceWater.well-mixed',
    ]);
    expect(registry.get('surfaceWater.well-mixed').kind).toBe('legacy');
    expect(registry.get('surfaceWater.mass-discharge').kind).toBe('modern');
  });

  it('cites the planned references, all used, and records the RISC5 choice on the legacy method', () => {
    expect(registry.get('surfaceWater.well-mixed').citations).toEqual([
      'chapra1997',
      'domenico1987',
      'ditoro1991',
    ]);
    expect(registry.get('surfaceWater.mass-discharge').citations).toEqual([
      'chapra1997',
      'ditoro1991',
    ]);
    for (const m of methods) {
      for (const key of m.citations) expect(byKey.get(key)?.status, `${m.id} ${key}`).toBe('used');
      expect(m.assumptions.length).toBeGreaterThan(3);
      expect(m.risc5Choice === undefined).toBe(m.kind === 'modern');
    }
    expect(registry.get('surfaceWater.well-mixed').risc5Choice!.length).toBeGreaterThan(40);
  });

  it('does not mark the criteria-only references used', () => {
    expect(byKey.get('stephan1985')?.status).toBe('planned');
  });

  it('runs through the registry; validate surfaces the validity warnings of run', () => {
    const m = registry.get('surfaceWater.well-mixed');
    const out = m.run(input) as ReturnType<typeof runLegacySurfaceWater>;
    expect(out.warnings.map((w) => w.code)).toContain('surfaceWater.sediment-not-quantified');
    expect(out.warnings.map((w) => w.code)).toContain('surfaceWater.low-dilution');
    expect(m.validate!(input).map((w) => w.code)).toEqual(out.warnings.map((w) => w.code));
  });

  it('the modern method rejects bad input with a RangeError through the registry', () => {
    const m = registry.get('surfaceWater.mass-discharge');
    expect(() => m.run({ body: { type: 'lake' } })).toThrow(RangeError);
  });
});
