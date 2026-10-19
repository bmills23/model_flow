// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, toInputs } from './form';
import { runVapor } from './compute';
import { layerBands, profileCurves } from './chartData';

const MGM3 = 1e-6;

function run() {
  const p = toInputs(DEFAULT_FORM);
  if (!p.ok) throw new Error('form');
  return { p, out: runVapor(p) };
}

describe('profileCurves', () => {
  it('carries the engine profile of each method in mg/m3 at the engine heights', () => {
    const { out } = run();
    if (!out.legacy.ok || !out.modern.ok) throw new Error('run');
    const curves = profileCurves(out);
    expect(curves.map((c) => c.method)).toEqual(['legacy', 'modern']);
    for (const c of curves) {
      const engine = (c.method === 'legacy' ? out.legacy : out.modern).result.profile;
      expect(c.heights).toEqual(engine.map((q) => q.height));
      expect(c.values).toEqual(engine.map((q) => q.concentration / MGM3));
    }
  });

  it('leaves out a method that did not run', () => {
    const { out } = run();
    const curves = profileCurves({ ...out, modern: { ok: false, error: 'x' } });
    expect(curves.map((c) => c.method)).toEqual(['legacy']);
  });
});

describe('layerBands', () => {
  it('lists the strata below the floor as heights above the source, trimmed at the floor', () => {
    const bands = layerBands(
      [{ thickness: 2 }, { thickness: 2.6 }, { thickness: 0.2 }],
      ['Soil above the floor', 'Vadose zone', 'Lens at the source'],
      2,
    );
    expect(bands.map((b) => b.name)).toEqual(['Lens at the source', 'Vadose zone']);
    expect(bands[0]!.bottom).toBeCloseTo(0, 12);
    expect(bands[0]!.top).toBeCloseTo(0.2, 12);
    expect(bands[1]!.bottom).toBeCloseTo(0.2, 12);
    expect(bands[1]!.top).toBeCloseTo(2.8, 12);
  });

  it('keeps part of a stratum the floor cuts through', () => {
    const bands = layerBands([{ thickness: 3 }, { thickness: 1 }], ['A', 'B'], 1);
    expect(bands.map((b) => [b.name, b.bottom, b.top])).toEqual([
      ['B', 0, 1],
      ['A', 1, 3],
    ]);
  });

  it('puts a capillary zone at the bottom of the column', () => {
    const bands = layerBands([{ thickness: 3 }], ['A'], 1, 0.5);
    expect(bands.map((b) => [b.name, b.bottom, b.top])).toEqual([
      ['Capillary zone', 0, 0.5],
      ['A', 0.5, 2],
    ]);
  });
});
