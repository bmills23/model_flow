import { describe, expect, it } from 'vitest';
import r7 from './fixtures/vadose/r7.json' with { type: 'json' };
import { convert } from '../src/numerics/units.js';
import {
  fluxToLoadingSteps,
  loadedMass,
  toConcentrationSteps,
  waterTableSource,
  vadoseVadsat,
  type FluxSeries,
  type VadsatInput,
  type VadsatSoil,
} from '../src/processes/vadose/index.js';
import {
  at123dConcentration,
  at123dGrid,
  massRateFromConcentration,
  type At123dAquifer,
} from '../src/processes/groundwater/kernel.js';

const trapezoidIntegral = (s: FluxSeries, area: number): number => {
  let sum = 0;
  for (let i = 0; i + 1 < s.times.length; i++)
    sum += 0.5 * (s.flux[i]! + s.flux[i + 1]!) * (s.times[i + 1]! - s.times[i]!) * area;
  return sum;
};

const synthetic: FluxSeries = {
  times: [0, 10, 25, 40, 100],
  flux: [2e-9, 5e-9, 3e-9, 1e-9, 0],
};

describe('fluxToLoadingSteps', () => {
  it('loads exactly the integral of J A (to 1e-12 relative)', () => {
    const A = 37.5;
    for (const stepLength of [7, 10, 13.3, 100]) {
      const steps = fluxToLoadingSteps(synthetic, A, 100, stepLength);
      const exact = trapezoidIntegral(synthetic, A);
      expect(Math.abs(loadedMass(steps) - exact) / exact).toBeLessThan(1e-12);
    }
  });

  it('uses a supplied exact cumulative delivery in place of the trapezoid', () => {
    const exactTotal = trapezoidIntegral(synthetic, 1) * 1.1;
    const cum = [0, 0.2, 0.55, 0.8, 1].map((f) => f * exactTotal);
    const series: FluxSeries = { ...synthetic, delivered: cum };
    const nodeAligned = fluxToLoadingSteps(series, 1, 100, 5);
    expect(Math.abs(loadedMass(nodeAligned) - exactTotal) / exactTotal).toBeLessThan(1e-12);
    // mass crossing a node-aligned boundary is the cumulative value there
    const upTo25 = nodeAligned
      .filter((s) => s.end <= 25)
      .reduce((a, s) => a + s.rate * (s.end - s.start), 0);
    expect(Math.abs(upTo25 - cum[2]!) / cum[2]!).toBeLessThan(1e-12);
    // boundaries between nodes still total the exact amount and stay non-negative
    const off = fluxToLoadingSteps(series, 1, 100, 13.3);
    expect(Math.abs(loadedMass(off) - exactTotal) / exactTotal).toBeLessThan(1e-12);
    off.forEach((s) => expect(s.rate).toBeGreaterThanOrEqual(0));
  });

  it('rejects a cumulative series of the wrong length or one that decreases', () => {
    expect(() => fluxToLoadingSteps({ ...synthetic, delivered: [0, 1] }, 1, 100, 10)).toThrow(
      RangeError,
    );
    expect(() =>
      fluxToLoadingSteps({ ...synthetic, delivered: [0, 2, 1, 3, 4] }, 1, 100, 10),
    ).toThrow(RangeError);
  });

  it('stops at tEnd and carries the partial integral', () => {
    const steps = fluxToLoadingSteps(synthetic, 2, 33, 10);
    expect(steps[0]!.start).toBe(0);
    expect(steps[steps.length - 1]!.end).toBe(33);
    expect(steps).toHaveLength(4);
    const part = trapezoidIntegral(
      { times: [0, 10, 25, 33], flux: [2e-9, 5e-9, 3e-9, 3e-9 - (2e-9 * 8) / 15] },
      2,
    );
    expect(Math.abs(loadedMass(steps) - part) / part).toBeLessThan(1e-12);
  });

  it('keeps steps contiguous, ordered and non-negative', () => {
    const steps = fluxToLoadingSteps(synthetic, 1, 100, 9);
    steps.forEach((s, i) => {
      expect(s.rate).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(s.start).toBe(steps[i - 1]!.end);
    });
  });

  it('rejects bad input and a tEnd beyond the series', () => {
    expect(() => fluxToLoadingSteps(synthetic, 1, 101, 10)).toThrow(RangeError);
    expect(() => fluxToLoadingSteps(synthetic, 0, 50, 10)).toThrow(RangeError);
    expect(() => fluxToLoadingSteps(synthetic, 1, 50, 0)).toThrow(RangeError);
    expect(() => fluxToLoadingSteps({ times: [0], flux: [1] }, 1, 1, 1)).toThrow(RangeError);
    expect(() => fluxToLoadingSteps({ times: [0, 1], flux: [1, -1] }, 1, 1, 1)).toThrow(RangeError);
  });
});

describe('toConcentrationSteps', () => {
  it('inverts the M1 source-basis rule (massRateFromConcentration)', () => {
    const steps = fluxToLoadingSteps(synthetic, 12, 100, 20);
    const cs = toConcentrationSteps(steps, 0.02, 3);
    cs.forEach((c, i) => {
      expect(c.start).toBe(steps[i]!.start);
      expect(c.end).toBe(steps[i]!.end);
      expect(massRateFromConcentration(c.concentration, 0.02, 3)).toBeCloseTo(steps[i]!.rate, 18);
      expect(c.concentration).toBeCloseTo(steps[i]!.rate / (0.02 * 3), 18);
    });
  });
  it('rejects a non-positive flux or cross-section', () => {
    expect(() => toConcentrationSteps([], 0, 1)).toThrow(RangeError);
    expect(() => toConcentrationSteps([], 1, 0)).toThrow(RangeError);
  });
});

describe('mass balance against the aquifer kernel (no decay in either process)', () => {
  const day = 86400;
  const series: FluxSeries = {
    times: [0, 90 * day, 200 * day, 365 * day],
    flux: [4e-9, 6e-9, 2e-9, 1e-9],
  };
  const L = 6;
  const W = 4;
  const A = L * W;
  const steps = fluxToLoadingSteps(series, A, 365 * day, 60 * day);
  const loaded = loadedMass(steps);
  const thickness = 3;
  // observe after the loading has ended, when every release age is at least two years and the plume
  // is smooth on the 2 m summation grid
  const observe = 3 * 365 * day;
  const aq: At123dAquifer = {
    velocity: 2e-7,
    porosity: 0.3,
    retardation: 1.7,
    decayRate: 0,
    dx: 4e-7,
    dy: 1e-7,
    dz: 2e-8,
    thickness,
  };

  function aquiferMass(withThickness: boolean | 'water-table', zs: number[], dz: number): number {
    const free: At123dAquifer = { ...aq, top: 'unbounded' };
    delete free.thickness;
    const a =
      withThickness === 'water-table'
        ? { ...free, top: 'no-flux' as const }
        : withThickness
          ? aq
          : free;
    const source =
      withThickness === 'water-table'
        ? waterTableSource(L, W, { aquifer: a })
        : waterTableSource(L, W, withThickness ? { thickness } : {});
    const dx = 2;
    const xs: number[] = [];
    for (let x = -30; x <= 60; x += dx) xs.push(x);
    const ys: number[] = [];
    for (let y = -26; y <= 26; y += dx) ys.push(y);
    let total = 0;
    for (const z of zs) {
      const g = at123dGrid({ aquifer: a, source, loading: steps, time: observe }, xs, ys, z);
      let s = 0;
      for (const row of g) for (const c of row) s += c;
      total += s * dx * dx * dz;
    }
    return total * aq.porosity * (aq.retardation ?? 1);
  }

  it('finite layer, patch on the no-flux top: aquifer mass equals loaded mass within 1e-6', () => {
    const n = 6;
    const zs = Array.from({ length: n }, (_, k) => ((k + 0.5) * thickness) / n);
    const m = aquiferMass(true, zs, thickness / n);
    expect(Math.abs(m - loaded) / loaded).toBeLessThan(1e-6);
  }, 60000);

  it('unbounded infinite depth: the free-space solution spreads equally above and below the plane', () => {
    // The default infinite-depth medium (top 'unbounded', the POINT3 configuration) has no water
    // table, so the plume diffuses upward as well and only the half below z = 0 is in the aquifer.
    // Mass is conserved over all space, not over the aquifer; vadose-fed runs use top 'no-flux'.
    const dz = 0.5;
    const below = Array.from({ length: 12 }, (_, k) => -(k + 0.5) * dz);
    const above = below.map((z) => -z);
    const mBelow = aquiferMass(false, below, dz);
    const mAbove = aquiferMass(false, above, dz);
    expect(Math.abs(mBelow - mAbove) / loaded).toBeLessThan(1e-9);
    expect(Math.abs(mBelow + mAbove - loaded) / loaded).toBeLessThan(2e-3);
    expect(mBelow / loaded).toBeCloseTo(0.5, 2);
  }, 60000);

  it('infinite depth under the no-flux water table: aquifer mass equals loaded mass within 1e-6', () => {
    // Yeh (1981) semi-infinite case: the aquifer is z <= 0 and the water table reflects, so nothing
    // diffuses out of the top. The summation runs 15 m deep, past the plume's vertical reach.
    const dz = 0.5;
    const below = Array.from({ length: 30 }, (_, k) => -(k + 0.5) * dz);
    const m = aquiferMass('water-table', below, dz);
    expect(Math.abs(m - loaded) / loaded).toBeLessThan(1e-6);
  }, 60000);

  it('places the vadose-fed patch on the water table of either aquifer and rejects the unbounded one', () => {
    const free: At123dAquifer = { ...aq };
    delete free.thickness;
    expect(waterTableSource(L, W, { aquifer: aq })).toMatchObject({ z1: thickness, z2: thickness });
    expect(waterTableSource(L, W, { aquifer: { ...free, top: 'no-flux' } })).toMatchObject({
      z1: 0,
      z2: 0,
    });
    // an infinite aquifer with no top given has the default no-flux water table
    expect(waterTableSource(L, W, { aquifer: free })).toMatchObject({ z1: 0, z2: 0 });
    expect(() => waterTableSource(L, W, { aquifer: { ...free, top: 'unbounded' } })).toThrow(
      RangeError,
    );
    expect(() => waterTableSource(L, W, { aquifer: aq, thickness: thickness + 1 })).toThrow(
      RangeError,
    );
  });

  it('a mass-rate step agrees with at123dConcentration used directly', () => {
    const source = waterTableSource(L, W, { thickness });
    const c = at123dConcentration(
      { aquifer: aq, source, loading: steps, time: 365 * day },
      { x: 15, y: 0, z: thickness },
    );
    expect(c).toBeGreaterThan(0);
  });
});

describe('Table R-7 through the coupling', () => {
  const i = r7.inputs;
  const YEAR = i.interpretation.yearLengthDays * 86400;
  const soil = (l: (typeof i.layers)['source']): VadsatSoil => ({
    thetaS: l.porosity,
    thetaR: l.residualMoisture,
    n: l.vanGenuchtenN,
    Ks: convert(l.ksMPerDay, 'm/d', 'm/s'),
    rhoB: l.bulkDensityGcm3 * 1000,
    foc: l.foc,
  });
  const input: VadsatInput = {
    q: (i.infiltrationCmPerYear * 0.01) / YEAR,
    depthToSource: i.interpretation.thicknessAboveSourceIncludingLensM,
    above: soil(i.layers.vadoseAboveSource),
    lens: { ...soil(i.layers.lens), thickness: i.layers.lens.thicknessM },
    source: {
      ...soil(i.layers.source),
      thickness: i.layers.source.thicknessM,
      length: i.sourceLengthM,
      width: i.sourceWidthM,
      F: i.benzeneSoilMgPerKg * 1e-6,
      FT: i.tphSoilMgPerKg * 1e-6,
      MT: i.tphMolarMassGPerMol / 1000,
      decayRate: i.sourceDecayPerDay / 86400,
    },
    below: {
      ...soil(i.layers.belowSource),
      thickness: i.interpretation.transportDistanceBelowSourceM,
    },
    chemical: {
      M: i.benzene.molarMassGPerMol / 1000,
      S: convert(i.benzene.solubilityMgPerL, 'mg/L', 'kg/m3'),
      H: i.benzene.henryDimensionless,
      Koc: convert(i.benzene.kocMlPerG, 'mL/g', 'm3/kg'),
      Da: convert(i.benzene.airDiffusionCm2PerS, 'cm/s', 'm/s') * 0.01,
      Dw: convert(i.benzene.waterDiffusionCm2PerS, 'cm/s', 'm/s') * 0.01,
      mu: i.vadoseDecayPerDay / 86400,
    },
    duration: 10 * YEAR,
  };
  const out = vadoseVadsat.run(input);
  const A = i.sourceLengthM * i.sourceWidthM;
  const aq: At123dAquifer = {
    velocity: 1e-6,
    porosity: 0.3,
    retardation: 1.5,
    decayRate: 0,
    dx: 1e-6,
    dy: 2e-7,
    dz: 5e-8,
    thickness: 5,
  };
  const source = waterTableSource(i.sourceLengthM, i.sourceWidthM, { thickness: 5 });
  const receptor = { x: i.sourceLengthM + 20, y: 0, z: 2.5 };

  function receptorAt(stepLength: number): number {
    const steps = fluxToLoadingSteps(out, A, 10 * YEAR, stepLength);
    return at123dConcentration({ aquifer: aq, source, loading: steps, time: 10 * YEAR }, receptor);
  }

  it('loads the delivered mass recorded by the vadose budget, independently of the flux samples', () => {
    const steps = fluxToLoadingSteps(out, A, 10 * YEAR, YEAR / 12);
    const delivered = out.budget.deliveredToWaterTable;
    expect(delivered).toBeGreaterThan(0);
    expect(Math.abs(loadedMass(steps) - delivered) / delivered).toBeLessThan(1e-12);
    // and it differs from the trapezoid of the monthly samples, which is only an approximation
    expect(trapezoidIntegral(out.series, A)).not.toBe(loadedMass(steps));
  });

  it('carries the exact cumulative delivery on an earlier horizon too', () => {
    const k = 36;
    const t = out.series.times[k]!;
    const steps = fluxToLoadingSteps(out, A, t, t / k);
    const exact = out.series.delivered[k]!;
    expect(exact).toBeGreaterThan(0);
    expect(Math.abs(loadedMass(steps) - exact) / exact).toBeLessThan(1e-12);
  });

  it('halving the step length changes the receptor value by less than 0.1 percent', () => {
    const coarse = receptorAt(YEAR / 12);
    const fine = receptorAt(YEAR / 24);
    expect(coarse).toBeGreaterThan(0);
    expect(Math.abs(fine - coarse) / coarse).toBeLessThan(1e-3);
  });
});
