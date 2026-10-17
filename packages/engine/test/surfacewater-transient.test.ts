import { describe, expect, it } from 'vitest';
import { legacyBox } from '../src/processes/surfaceWater/legacy.js';
import { transientBox } from '../src/processes/surfaceWater/transient.js';
import {
  fullyMixedConcentration,
  plugFlowDownstream,
  seriesInterpolator,
} from '../src/processes/surfaceWater/downstream.js';
import { modernSediment, modernWarnings } from '../src/processes/surfaceWater/modern.js';
import {
  DAY_S,
  kgPerKgToMgPerKg,
  lPerKgToM3PerKg,
  mgPerLToKgPerM3,
} from '../src/processes/surfaceWater/units.js';

const d = (x: number): number => x / DAY_S;
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
/** mg/d to kg/s */
const mgd = (x: number): number => (x * 1e-6) / DAY_S;
const toMgL = (x: number): number => x * 1e3;

// R-8 lake: Q_mix 268 m3/d, V 10,000 m3, k 0.005 /d, W 1.25e6 mg/d
const lake = {
  mixFlow: d(268),
  mixVolume: 10000,
  decay: d(0.005),
};

describe('H1: transient box, step loading on the R-8 lake', () => {
  const r = transientBox({
    ...lake,
    times: [0, 10 * DAY_S, 30 * DAY_S, 100 * DAY_S],
    loadings: [mgd(1.25e6), mgd(1.25e6), mgd(1.25e6), mgd(1.25e6)],
    initialConcentration: 0,
  });
  it('residence time 31.4465409 d', () => {
    expect(rel(r.residenceTime / DAY_S, 31.4465409)).toBeLessThan(1e-9);
  });
  it('C at 10, 30 and 100 d', () => {
    expect(rel(toMgL(r.concentrations[1]!), 1.07074376)).toBeLessThan(1e-8);
    expect(rel(toMgL(r.concentrations[2]!), 2.41667787)).toBeLessThan(1e-8);
    expect(rel(toMgL(r.concentrations[3]!), 3.76735198)).toBeLessThan(1e-8);
  });
  it('tends to the R-8 lake value', () => {
    expect(rel(toMgL(r.evaluate(1e4 * DAY_S)), 3.930818)).toBeLessThan(1e-6);
  });
});

describe('box identities (5a, 5b, 5d)', () => {
  const times = [0, 5, 20, 60, 130].map((x) => x * DAY_S);
  const loadings = [1, 4, 2, 6, 3].map((x) => mgd(x * 2e5));
  const background = mgd(3e4);
  const r = transientBox({ ...lake, times, loadings, backgroundLoading: background });

  it('starts at the steady state of the first loading by default', () => {
    expect(
      rel(
        r.concentrations[0]!,
        (loadings[0]! + background) / (lake.mixFlow + lake.decay * lake.mixVolume),
      ),
    ).toBeLessThan(1e-12);
  });

  it('5a: constant loading stays at the legacy box, and tends to it from zero', () => {
    const W = mgd(1.25e6);
    const legacy = legacyBox({
      upstreamFlow: lake.mixFlow - d(250),
      background: 0,
      mixingFraction: 1,
      groundwaterFlow: d(250),
      groundwaterConcentration: W / d(250),
      decay: lake.decay,
      bodyVolume: lake.mixVolume,
    });
    const steady = transientBox({ ...lake, times: [0, DAY_S], loadings: [W, W] });
    expect(rel(steady.concentrations[1]!, legacy.concentration)).toBeLessThan(1e-12);
    const rise = transientBox({
      ...lake,
      times: [0, DAY_S],
      loadings: [W, W],
      initialConcentration: 0,
    });
    expect(rel(rise.evaluate(500 * 365 * DAY_S), legacy.concentration)).toBeLessThan(1e-9);
  });

  it('5b: loading in = change in storage + outflow and decay, over every interval', () => {
    const lambdaV = lake.mixFlow + lake.decay * lake.mixVolume;
    for (let k = 0; k < times.length - 1; k++) {
      const t0 = times[k]!;
      const t1 = times[k + 1]!;
      const loadIn = ((loadings[k]! + loadings[k + 1]!) / 2 + background) * (t1 - t0);
      const stored = lake.mixVolume * (r.concentrations[k + 1]! - r.concentrations[k]!);
      const out = lambdaV * (r.integral(t1) - r.integral(t0));
      expect(rel(loadIn, stored + out)).toBeLessThan(1e-9);
    }
    // and inside an interval, through evaluate
    const t = 33 * DAY_S;
    const t0 = times[2]!;
    const slope = (loadings[3]! - loadings[2]!) / (times[3]! - times[2]!);
    const loadIn = (loadings[2]! + (slope * (t - t0)) / 2 + background) * (t - t0);
    const stored = lake.mixVolume * (r.evaluate(t) - r.concentrations[2]!);
    const out = lambdaV * (r.integral(t) - r.integral(t0));
    expect(rel(loadIn, stored + out)).toBeLessThan(1e-9);
  });

  it('5d: doubling the loading doubles the concentration (zero background)', () => {
    const a = transientBox({ ...lake, times, loadings });
    const b = transientBox({ ...lake, times, loadings: loadings.map((w) => 2 * w) });
    for (let k = 0; k < times.length; k++) {
      expect(rel(b.concentrations[k]!, 2 * a.concentrations[k]!)).toBeLessThan(1e-12);
    }
  });

  it('holds the last loading after the last sample and the initial value before the first', () => {
    expect(r.evaluate(-5)).toBe(r.concentrations[0]);
    const late = r.evaluate(1e6 * DAY_S);
    expect(
      rel(late, (loadings[4]! + background) / (lake.mixFlow + lake.decay * lake.mixVolume)),
    ).toBeLessThan(1e-9);
  });

  it('rejects bad input', () => {
    const ok = { ...lake, times: [0, 1], loadings: [1e-9, 1e-9] };
    expect(() => transientBox({ ...ok, mixVolume: 0 })).toThrow(RangeError);
    expect(() => transientBox({ ...ok, mixFlow: 0, decay: 0 })).toThrow(RangeError);
    expect(() => transientBox({ ...ok, times: [1, 1] })).toThrow(RangeError);
    expect(() => transientBox({ ...ok, loadings: [1e-9] })).toThrow(RangeError);
    expect(() => transientBox({ ...ok, loadings: [-1, 1] })).toThrow(RangeError);
    expect(() => transientBox({ ...ok, decay: -1 })).toThrow(RangeError);
  });
});

describe('H2: plug flow downstream on the R-8 river with k = 0.1 /d', () => {
  const river = {
    upstreamFlow: d(180),
    background: 0,
    mixingFraction: 1,
    groundwaterFlow: d(250),
    crossSection: 5,
    decay: d(0.1),
    distance: 1000,
  };
  const box = legacyBox({
    upstreamFlow: river.upstreamFlow,
    background: 0,
    mixingFraction: 1,
    groundwaterFlow: river.groundwaterFlow,
    groundwaterConcentration: mgPerLToKgPerM3(5),
    decay: river.decay,
    bodyVolume: 500,
  });
  const run = plugFlowDownstream({
    ...river,
    times: [0, 100 * DAY_S],
    boxConcentration: () => box.concentration,
  });
  it('velocity 86 m/d, travel time 11.627907 d, box 2.60416667, downstream 0.814095196 mg/L', () => {
    expect(rel(run.velocity * DAY_S, 86)).toBeLessThan(1e-12);
    expect(rel(run.travelTime / DAY_S, 11.627907)).toBeLessThan(1e-7);
    expect(rel(toMgL(box.concentration), 2.60416667)).toBeLessThan(1e-8);
    expect(rel(toMgL(run.concentrations[1]!), 0.814095196)).toBeLessThan(1e-8);
    expect(rel(toMgL(run.concentrations[0]!), 0.814095196)).toBeLessThan(1e-8);
  });
  it('5c: with f = 1 the fully mixed concentration equals the box', () => {
    expect(rel(run.fullyMixed[0]!, box.concentration)).toBeLessThan(1e-12);
  });
  it('a partial mixing fraction blends in the unmixed upstream water', () => {
    const c = fullyMixedConcentration(
      { upstreamFlow: 10, background: 2, mixingFraction: 0.5, groundwaterFlow: 5 },
      6,
    );
    // (10 * 6 + 0.5 * 10 * 2) / 15
    expect(rel(c, 70 / 15)).toBeLessThan(1e-14);
  });
  it('delays a changing series by the travel time and decays it', () => {
    const times = [0, 50, 100, 150].map((x) => x * DAY_S);
    const series = [0, 1, 1, 1].map((x) => x * 1e-3);
    const f = seriesInterpolator(times, series);
    const out = plugFlowDownstream({ ...river, decay: 0, times, boxConcentration: f });
    // no decay: C_down(t) = C_full(t - tau); at t = 50 d the box value of t = 50 - 11.63 d
    const tau = out.travelTime;
    expect(
      rel(out.concentrations[1]!, fullyMixedConcentration(river, f(50 * DAY_S - tau))),
    ).toBeLessThan(1e-12);
    expect(out.concentrations[0]).toBe(0);
  });
  it('5d: linear in the box concentration', () => {
    const a = plugFlowDownstream({ ...river, times: [0], boxConcentration: () => 1 });
    const b = plugFlowDownstream({ ...river, times: [0], boxConcentration: () => 2 });
    expect(rel(b.concentrations[0]!, 2 * a.concentrations[0]!)).toBeLessThan(1e-14);
  });
  it('rejects bad input', () => {
    const ok = { ...river, times: [0], boxConcentration: () => 1 };
    expect(() => plugFlowDownstream({ ...ok, crossSection: 0 })).toThrow(RangeError);
    expect(() => plugFlowDownstream({ ...ok, mixingFraction: 1.5 })).toThrow(RangeError);
    expect(() => plugFlowDownstream({ ...ok, distance: -1 })).toThrow(RangeError);
    expect(() => plugFlowDownstream({ ...ok, upstreamFlow: 0, groundwaterFlow: 0 })).toThrow(
      RangeError,
    );
    expect(() => seriesInterpolator([0, 1], [1])).toThrow(RangeError);
  });
});

describe('H4: modern sediment', () => {
  const base = {
    fractionOrganicCarbon: 0.02,
    koc: lPerKgToM3PerKg(59),
    dischargeConcentration: mgPerLToKgPerM3(0.05),
    centrelineConcentration: mgPerLToKgPerM3(0.5),
    surfaceConcentration: mgPerLToKgPerM3(0.005),
  };
  it('0.059 mg/kg and 2.95 mg/kg organic carbon from the discharging groundwater (default)', () => {
    const r = modernSediment(base);
    expect(r.poreWater).toBe('discharge');
    expect(rel(kgPerKgToMgPerKg(r.concentration!), 0.059)).toBeLessThan(1e-12);
    expect(rel(kgPerKgToMgPerKg(r.organicCarbonNormalized!), 2.95)).toBeLessThan(1e-12);
  });
  it('selects the centreline or the surface water as the pore water', () => {
    expect(
      rel(
        kgPerKgToMgPerKg(modernSediment({ ...base, poreWater: 'centreline' }).concentration!),
        0.59,
      ),
    ).toBeLessThan(1e-12);
    expect(
      rel(
        kgPerKgToMgPerKg(modernSediment({ ...base, poreWater: 'surface' }).concentration!),
        0.0059,
      ),
    ).toBeLessThan(1e-12);
  });
  it('5d: linear in the pore water concentration', () => {
    const a = modernSediment(base).concentration!;
    const b = modernSediment({
      ...base,
      dischargeConcentration: 2 * base.dischargeConcentration,
    }).concentration!;
    expect(rel(b, 2 * a)).toBeLessThan(1e-14);
  });
  it('uses the database Kd without a Koc, and is not quantified with neither', () => {
    const kd = modernSediment({
      fractionOrganicCarbon: 0.02,
      kd: lPerKgToM3PerKg(100),
      dischargeConcentration: mgPerLToKgPerM3(1),
    });
    expect(rel(kgPerKgToMgPerKg(kd.concentration!), 100)).toBeLessThan(1e-12);
    expect(kd.organicCarbonNormalized).toBeUndefined();
    const none = modernSediment({ fractionOrganicCarbon: 0.02, dischargeConcentration: 1 });
    expect(none.quantified).toBe(false);
    expect(none.warnings[0]?.code).toBe('surfaceWater.sediment-not-quantified');
  });
  it('rejects a selected source that was not provided', () => {
    expect(() =>
      modernSediment({ fractionOrganicCarbon: 0.02, koc: 1, poreWater: 'surface' }),
    ).toThrow(RangeError);
  });
});

describe('shared warnings', () => {
  it('reports low dilution and solubility', () => {
    const w = modernWarnings({
      groundwaterFlow: 5,
      mixingFraction: 0.5,
      upstreamFlow: 4,
      peakGroundwaterConcentration: 2,
      peakSurfaceConcentration: 0.1,
      solubility: 1,
    });
    expect(w.map((x) => x.code)).toEqual([
      'surfaceWater.low-dilution',
      'surfaceWater.above-solubility',
    ]);
  });
});
