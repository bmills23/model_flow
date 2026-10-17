import { describe, expect, it } from 'vitest';
import {
  groundwaterWaterTableSeries,
  quasiSteadyTime,
  quasiSteadyWarnings,
  saturatedRegion1Source,
  seriesValue,
  vaporSeriesEpc,
  vadoseVolatilizationFlux,
  vadoseSoilVaporSeries,
  outdoorAirEpc,
  registry,
  references,
} from '../src/index.js';

function rel(a: number, ref: number): number {
  return Math.abs(a - ref) / Math.abs(ref);
}

describe('M1 water-table series', () => {
  it('evaluates the run at the building position on the water table, one value per time', () => {
    const seen: { x: number; y: number; z: number }[] = [];
    const s = groundwaterWaterTableSeries(
      (t, p) => {
        seen.push(p);
        return { concentrations: [1e-6 * t, -1e-9] };
      },
      { x: 12, y: 3 },
      [0, 10, 20],
    );
    expect(seen.every((p) => p.x === 12 && p.y === 3 && p.z === 0)).toBe(true);
    expect(s.values.length).toBe(3);
    expect(s.values[2]).toBeCloseTo(1e-5 - 5e-10, 12);
    expect(s.values[0]).toBe(0);
  });

  it('uses the aquifer top as depth zero for a finite aquifer', () => {
    let z = -1;
    groundwaterWaterTableSeries(
      (_t, p) => {
        z = p.z;
        return { concentrations: [1] };
      },
      { x: 0, y: 0 },
      [0, 1],
      7,
    );
    expect(z).toBe(7);
  });
});

describe('M2 and M3 sources', () => {
  const out = {
    volatilizationVelocity: 2e-9,
    series: { times: [0, 100, 200], sourcePoreWater: [1e-3, 5e-4, 2e-4] },
  };
  it('gives C_vs = H C_s and flux = v C_s', () => {
    const v = vadoseSoilVaporSeries(out, 0.2);
    expect(rel(v.values[1]!, 1e-4)).toBeLessThan(1e-14);
    const f = vadoseVolatilizationFlux(out);
    expect(rel(f.values[0]!, 2e-12)).toBeLessThan(1e-14);
    expect(f.times).toEqual([0, 100, 200]);
  });

  it('takes region 1 pore water, and refuses when there is no region 1', () => {
    const reg = { c: 3e-4, residual: false };
    expect(saturatedRegion1Source({ regions: { unsaturated: reg } })).toEqual({
      poreWater: 3e-4,
      residual: false,
    });
    expect(() => saturatedRegion1Source({ regions: { unsaturated: null } })).toThrow(/region 1/);
  });
});

describe('quasi-steady application', () => {
  it('computes the establishment time L_T^2 / D_E', () => {
    expect(rel(quasiSteadyTime(2, 4e-6), 1e6)).toBeLessThan(1e-14);
    expect(() => quasiSteadyTime(0, 1)).toThrow(RangeError);
  });

  it('warns when the source changes by more than 10 percent within the time, not otherwise', () => {
    const fast = { times: [0, 1000], values: [1, 0.5] };
    expect(quasiSteadyWarnings(fast, 1000).map((w) => w.code)).toEqual(['vapor.quasi-steady']);
    const slow = { times: [0, 1e6], values: [1, 0.5] };
    expect(quasiSteadyWarnings(slow, 1000)).toEqual([]);
    const step = { times: [0, 4000, 4100, 9000], values: [1, 1, 0.5, 0.5] };
    expect(quasiSteadyWarnings(step, 1000).length).toBe(1);
    expect(quasiSteadyWarnings({ times: [0, 1], values: [0, 0] }, 10)).toEqual([]);
  });
});

describe('vaporSeriesEpc', () => {
  it('carries the method id as origin and clips round-off below zero', () => {
    const epc = vaporSeriesEpc(
      (t) => ({ concentration: t === 20 ? -1e-20 : 1e-9 * t }),
      [0, 10, 20],
      'vapor.je-1991',
    );
    expect(epc.kind).toBe('series');
    expect(epc.origin).toBe('vapor.je-1991');
    if (epc.kind === 'series') {
      expect(epc.series.values).toEqual([0, 1e-8, 0]);
      expect(seriesValue(epc.series, 5)).toBeCloseTo(5e-9, 20);
    }
  });

  it('needs two times', () => {
    expect(() => vaporSeriesEpc(() => ({ concentration: 0 }), [0], 'x')).toThrow(RangeError);
  });

  it('keeps outdoor contributions separate while summing', () => {
    const r = outdoorAirEpc({
      box: { length: 10, width: 5, height: 2, windSpeed: 2 },
      emissions: [{ origin: 'outdoorAir.box', kind: 'areaFlux', flux: () => 1e-9 }],
      direct: [{ origin: 'outdoorAir.ssg-vf-1996', concentration: () => 1e-12 }],
    });
    expect(r.contributions.map((c) => c.origin)).toEqual([
      'outdoorAir.box',
      'outdoorAir.ssg-vf-1996',
    ]);
    expect(rel(r.concentration(0), 2.5e-9 + 1e-12)).toBeLessThan(1e-12);
  });
});

describe('registration', () => {
  it('registers the outdoor air and Jury methods with used citations', () => {
    for (const id of ['outdoorAir.box', 'outdoorAir.ssg-vf-1996', 'vapor.jury-bam']) {
      const m = registry.get(id);
      for (const key of m.citations) {
        expect(references.find((r) => r.key === key)?.status, `${id} ${key}`).toBe('used');
      }
    }
    expect(registry.list('outdoorAir').length).toBe(2);
    expect(registry.list('vapor').map((m) => m.id)).toContain('vapor.jury-bam');
  });
});
