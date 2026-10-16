import { describe, expect, it } from 'vitest';
import { handInput, relErr, DAY, YEAR } from './saturatedHelpers.js';
import {
  runTwoRegion,
  runExponential,
  releaseToLoadingSteps,
  saturatedSourceBox,
  type SaturatedSourceInput,
  type SaturatedSourceOutput,
} from '../src/processes/saturatedSource/index.js';
import {
  loadedMass,
  toConcentrationSteps,
  waterTableSource,
} from '../src/processes/vadose/index.js';
import {
  at123dConcentration,
  at123dGrid,
  massRateFromConcentration,
  type At123dAquifer,
} from '../src/processes/groundwater/kernel.js';

const seasonal = (i: SaturatedSourceInput): SaturatedSourceInput => ({
  ...i,
  source: { ...i.source, schedule: 'seasonal' },
});

describe('releaseToLoadingSteps', () => {
  const cases: [string, (tEnd: number) => SaturatedSourceOutput][] = [
    ['legacy annual mean', (t) => runTwoRegion(handInput('A', { tEnd: t }))],
    ['legacy seasonal', (t) => runTwoRegion(seasonal(handInput('A', { tEnd: t })))],
    ['modern annual mean', (t) => runExponential(handInput('A', { tEnd: t }))],
    ['modern seasonal', (t) => runExponential(seasonal(handInput('A', { tEnd: t })))],
    [
      'modern seasonal with decay',
      (t) => runExponential(seasonal(handInput('A', { tEnd: t, sourceDecayRate: 1e-9 }))),
    ],
  ];
  for (const [name, make] of cases) {
    for (const tEnd of [0.4 * YEAR, 3.7 * YEAR, 12 * YEAR]) {
      it(`${name}: loaded mass equals delivered(tEnd) to 1e-12 (tEnd ${(tEnd / YEAR).toFixed(1)} yr)`, () => {
        const out = make(tEnd);
        const steps = releaseToLoadingSteps(out, tEnd, 30 * DAY);
        expect(relErr(loadedMass(steps), out.schedule.delivered(tEnd))).toBeLessThan(1e-12);
        expect(steps[0]!.start).toBe(0);
        steps.forEach((s, i) => {
          expect(s.rate).toBeGreaterThanOrEqual(0);
          expect(s.end).toBeGreaterThan(s.start);
          if (i > 0) expect(s.start).toBe(steps[i - 1]!.end);
        });
        const last = steps[steps.length - 1]!.end;
        expect(last).toBe(Math.min(tEnd, out.exponent === 0 ? out.depletionTime : tEnd));
      });
    }
  }
  it('gives legacy annual mean a single step that ends at the depletion time', () => {
    const out = runTwoRegion(handInput('A'));
    const long = releaseToLoadingSteps(out, 20 * YEAR);
    expect(long).toHaveLength(1);
    expect(long[0]!.end).toBe(out.depletionTime);
    expect(long[0]!.rate).toBeCloseTo(out.rates.mean, 18);
    expect(releaseToLoadingSteps(out, 2 * YEAR)).toHaveLength(1);
  });
  it('includes the seasonal switch times and the depletion time as step boundaries', () => {
    const out = runTwoRegion(seasonal(handInput('A')));
    const steps = releaseToLoadingSteps(out, 20 * YEAR);
    const edges = new Set(steps.map((s) => s.end));
    expect(edges.has(0.25 * YEAR)).toBe(true);
    expect(edges.has(YEAR)).toBe(true);
    expect(edges.has(out.depletionTime)).toBe(true);
    expect(steps[steps.length - 1]!.end).toBe(out.depletionTime);
  });
  it('cuts modern steps no longer than stepLength and defaults to one month', () => {
    const out = runExponential(seasonal(handInput('A')));
    const steps = releaseToLoadingSteps(out, 3 * YEAR, 20 * DAY);
    steps.forEach((s) => expect(s.end - s.start).toBeLessThanOrEqual(20 * DAY * (1 + 1e-12)));
    expect(steps[steps.length - 1]!.end).toBe(3 * YEAR);
    const dflt = releaseToLoadingSteps(runExponential(handInput('A')), YEAR);
    dflt.forEach((s) => expect(s.end - s.start).toBeLessThanOrEqual((YEAR / 12) * (1 + 1e-12)));
    expect(dflt).toHaveLength(12);
  });
  it('rejects a non-positive horizon or step length', () => {
    const out = runExponential(handInput('A'));
    expect(() => releaseToLoadingSteps(out, 0)).toThrow(RangeError);
    expect(() => releaseToLoadingSteps(out, YEAR, 0)).toThrow(RangeError);
    expect(() => releaseToLoadingSteps(out, Number.NaN)).toThrow(RangeError);
  });
  it('returns no steps when nothing is released', () => {
    const out = runTwoRegion(
      handInput('A', { infiltration: 0, aquifer: { conductivity: 1e-5, gradient: 0 } }),
    );
    expect(releaseToLoadingSteps(out, YEAR)).toEqual([]);
  });
});

describe('saturatedSourceBox', () => {
  const i = handInput('A');
  const L = i.source.length;
  const W = i.source.width;
  const hHi = 1.5;
  const inf: At123dAquifer = { velocity: 1e-6, porosity: 0.3, dx: 1e-6, dy: 1e-7, dz: 1e-8 };
  it('places the box below the no-flux water table of an infinitely deep aquifer', () => {
    expect(saturatedSourceBox(i, inf)).toEqual({
      x1: -L,
      x2: 0,
      y1: -W / 2,
      y2: W / 2,
      z1: -hHi,
      z2: 0,
    });
    expect(saturatedSourceBox(i, { ...inf, top: 'no-flux' }).z1).toBe(-hHi);
  });
  it('places the box under the top of a finite layer', () => {
    const b = 4;
    expect(saturatedSourceBox(i, { ...inf, thickness: b })).toMatchObject({ z1: b - hHi, z2: b });
    expect(() => saturatedSourceBox(i, { ...inf, thickness: 1 })).toThrow(RangeError);
  });
  it('rejects the unbounded medium', () => {
    expect(() => saturatedSourceBox(i, { ...inf, top: 'unbounded' })).toThrow(RangeError);
  });
  it('collapses to the water-table patch when the source never submerges', () => {
    const dry = { ...i, source: { ...i.source, minSaturatedThickness: 0, fluctuation: 0 } };
    expect(saturatedSourceBox(dry, inf)).toEqual(
      waterTableSource(L, W, { xStart: -L, aquifer: inf }),
    );
    const fin = { ...inf, thickness: 3 };
    expect(saturatedSourceBox(dry, fin)).toEqual(
      waterTableSource(L, W, { xStart: -L, aquifer: fin }),
    );
    expect(() => saturatedSourceBox(dry, { ...inf, top: 'unbounded' })).toThrow(RangeError);
  });
});

describe('identity with the M1 constant dissolved-phase source', () => {
  // fully submerged, separate phase, no infiltration, no fluctuation
  const base = handInput('A');
  const input: SaturatedSourceInput = {
    ...base,
    infiltration: 0,
    source: { ...base.source, minSaturatedThickness: base.source.thickness, fluctuation: 0 },
  };
  const out = runTwoRegion(input);
  const U = input.aquifer.conductivity * input.aquifer.gradient;
  const W = input.source.width;
  const Hs = input.source.thickness;
  const xS = out.regions.saturated!.effS;
  const aq: At123dAquifer = {
    velocity: U / 0.3,
    porosity: 0.3,
    retardation: 1.7,
    decayRate: 0,
    dx: 1e-6,
    dy: 2e-7,
    dz: 3e-8,
  };
  it('releases massRateFromConcentration(xS, U, W Hs) until t_d', () => {
    expect(out.regions.saturated!.residual).toBe(true);
    const q = massRateFromConcentration(xS, U, W * Hs);
    expect(relErr(out.rates.mean, q)).toBeLessThan(1e-12);
    const steps = releaseToLoadingSteps(out, 5 * YEAR);
    expect(steps).toHaveLength(1);
    expect(relErr(steps[0]!.rate, q)).toBeLessThan(1e-12);
    expect(steps[0]!.end).toBe(out.depletionTime);
    const cs = toConcentrationSteps(steps, U, W * Hs);
    expect(relErr(cs[0]!.concentration, xS)).toBeLessThan(1e-12);
  });
  it('gives the same AT123D receptor values as the constant-source run before t_d (1e-12)', () => {
    const steps = releaseToLoadingSteps(out, 5 * YEAR);
    const box = saturatedSourceBox(input, aq);
    const q = massRateFromConcentration(xS, U, W * Hs);
    const t = 0.4 * out.depletionTime;
    for (const p of [
      { x: 15, y: 0, z: -1 },
      { x: 40, y: 3, z: -0.5 },
    ]) {
      const a = at123dConcentration({ aquifer: aq, source: box, loading: steps, time: t }, p);
      const b = at123dConcentration(
        { aquifer: aq, source: box, loading: [{ start: 0, end: Infinity, rate: q }], time: t },
        p,
      );
      expect(a).toBeGreaterThan(0);
      expect(relErr(a, b)).toBeLessThan(1e-12);
    }
  });
});

describe('mass conservation through the aquifer kernel', () => {
  const day = DAY;
  const base = handInput('A', { tEnd: YEAR });
  const out = runExponential(base);
  const steps = releaseToLoadingSteps(out, YEAR, 183 * day);
  const loaded = loadedMass(steps);
  const observe = 3 * YEAR;
  const thickness = 3;
  const aq: At123dAquifer = {
    velocity: 2e-7,
    porosity: 0.3,
    retardation: 1.7,
    decayRate: 0,
    dx: 4e-7,
    dy: 1e-7,
    dz: 2e-8,
  };

  function aquiferMass(a: At123dAquifer, zs: number[], dz: number): number {
    const source = saturatedSourceBox(base, a);
    const dx = 3;
    const xs: number[] = [];
    for (let x = -60; x <= 81; x += dx) xs.push(x);
    const ys: number[] = [];
    for (let y = -30; y <= 30; y += dx) ys.push(y);
    let total = 0;
    for (const z of zs) {
      const g = at123dGrid({ aquifer: a, source, loading: steps, time: observe }, xs, ys, z);
      let s = 0;
      for (const row of g) for (const c of row) s += c;
      total += s * dx * dx * dz;
    }
    return total * a.porosity * (a.retardation ?? 1);
  }

  it('finite layer: aquifer mass equals loaded mass within 1e-6', () => {
    const n = 6;
    const zs = Array.from({ length: n }, (_, k) => ((k + 0.5) * thickness) / n);
    const m = aquiferMass({ ...aq, thickness }, zs, thickness / n);
    expect(Math.abs(m - loaded) / loaded).toBeLessThan(1e-6);
  }, 120000);

  it('infinite depth under the no-flux water table: aquifer mass equals loaded mass within 1e-6', () => {
    const dz = 1;
    const zs = Array.from({ length: 15 }, (_, k) => -(k + 0.5) * dz);
    const m = aquiferMass(aq, zs, dz);
    expect(Math.abs(m - loaded) / loaded).toBeLessThan(1e-6);
  }, 120000);
});

describe('step length convergence', () => {
  it('halving the modern step length changes a receptor value by less than 0.1 percent', () => {
    const out = runExponential(handInput('A', { tEnd: 10 * YEAR }));
    const U = (5 / DAY) * 0.01;
    const v = U / 0.3;
    const aq: At123dAquifer = {
      velocity: v,
      porosity: 0.3,
      retardation: 1.669,
      decayRate: 0,
      dx: v,
      dy: 0.1 * v,
      dz: 0.01 * v,
    };
    const box = saturatedSourceBox(handInput('A'), aq);
    const at = (step: number) =>
      at123dConcentration(
        {
          aquifer: aq,
          source: box,
          loading: releaseToLoadingSteps(out, 10 * YEAR, step),
          time: 10 * YEAR,
        },
        { x: 25, y: 0, z: -0.75 },
      );
    const coarse = at(90 * DAY);
    const fine = at(45 * DAY);
    expect(fine).toBeGreaterThan(0);
    expect(Math.abs(coarse - fine) / fine).toBeLessThan(1e-3);
  }, 120000);
});
