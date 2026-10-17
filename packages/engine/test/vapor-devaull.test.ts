import { describe, expect, it } from 'vitest';
import { references } from '../src/references/index.js';
import {
  DEVAULL_BASELINE_RESPIRATION,
  baselineRespirationRate,
  crackTransferCoefficient,
  devaullRun,
  dominantLayerRun,
  jeAlpha,
  layerDeff,
  vaporDevaull2007,
  type DevaullInput,
  type DevaullOxygen,
} from '../src/processes/vapor/index.js';
import { registry } from '../src/index.js';

function rel(a: number, ref: number): number {
  return Math.abs(a - ref) / Math.abs(ref);
}

const chem = { Da: 8.8e-6, Dw: 9.8e-10, H: 0.228 };
const oxy = { Da: 1.8e-5, Dw: 2.1e-9, H: 32 };
const layer = { thickness: 3, porosity: 0.35, moisture: 0.1 };
const D = layerDeff(layer, chem);
const DO = layerDeff(layer, oxy);
const kw = 0.73 / 3600; // 1/s
const kappa = (kw * layer.moisture) / chem.H;
const cvs = 0.02; // kg/m^3
const O2atm = 0.28; // kg/m^3
const Y = 3.1;
const building = { mixingHeight: 2.44, airExchangeRate: 0.45 / 3600 };
const q = building.mixingHeight * building.airExchangeRate;

function base(over: Partial<DevaullInput> = {}): DevaullInput {
  return {
    chemical: chem,
    layer,
    degradationRate: kw,
    foundation: { h: 1e-4 },
    building,
    source: { kind: 'soilGas', csg: cvs },
    oxygen: { mode: 'entered', aerobicDepth: 1 },
    ...over,
  };
}

/** Independent closed form with plain cosh and sinh: Cb / Cs for a hyperbolic layer over a linear one. */
function cbOverCs(La: number, LT: number, G3: number): number {
  const k = Math.sqrt(kappa / D);
  const a = k * La;
  const u = D * k;
  const gb = D / (LT - La);
  return 1 / (Math.cosh(a) * (1 + G3 / gb) + Math.sinh(a) * (G3 / u + u / gb));
}

describe('foundation and building coupling', () => {
  it('crack transfer coefficient is D eta / L', () => {
    expect(
      crackTransferCoefficient({ crackFraction: 0.001, thickness: 0.1, Dcrack: 2e-6 }),
    ).toBeCloseTo(2e-8, 20);
  });
  it('baseline respiration is 1.69 mg O2 per g organic carbon per day times foc and bulk density', () => {
    expect(DEVAULL_BASELINE_RESPIRATION).toBeCloseTo(1.69e-3 / 86400, 20);
    expect(baselineRespirationRate({ foc: 0.01, bulkDensity: 1700 })).toBeCloseTo(
      (1.69e-3 / 86400) * 0.01 * 1700,
      20,
    );
  });
});

describe('identities (8b)', () => {
  const AB = 150;
  const eta = 0.001;
  const Lcrack = 0.1;
  const Dcrack = layerDeff({ thickness: Lcrack, porosity: 0.25, moisture: 0 }, chem);
  const QB = AB * q;
  const h = crackTransferCoefficient({ crackFraction: eta, thickness: Lcrack, Dcrack });

  for (const Qsoil of [0, 0.004]) {
    it(`La = 0 equals Johnson and Ettinger with the same foundation (Qsoil ${Qsoil})`, () => {
      const out = devaullRun(
        base({
          foundation: { h, ...(Qsoil > 0 ? { soilGasVelocity: Qsoil / AB } : {}) },
          oxygen: { mode: 'entered', aerobicDepth: 0 },
        }),
      );
      const je = jeAlpha({
        DT: D,
        AB,
        QB,
        LT: layer.thickness,
        Qsoil,
        Lcrack,
        Dcrack,
        Acrack: eta * AB,
      });
      expect(rel(out.coefficient, je.alpha)).toBeLessThan(1e-12);
      expect(rel(out.concentration, je.alpha * cvs)).toBeLessThan(1e-12);
    });
  }

  it('a zero degradation rate equals Johnson and Ettinger for any aerobic depth', () => {
    const je = devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: 0 } }));
    for (const La of [0.5, 2, 3]) {
      const out = devaullRun(
        base({ degradationRate: 0, oxygen: { mode: 'entered', aerobicDepth: La } }),
      );
      expect(rel(out.coefficient, je.coefficient)).toBeLessThan(1e-12);
    }
  });

  it('a dirt floor (h infinite) lets the indoor air meet the base of the foundation', () => {
    const out = devaullRun(
      base({ foundation: { h: Infinity }, oxygen: { mode: 'entered', aerobicDepth: 0 } }),
    );
    const A = (D * 1) / (q * layer.thickness);
    expect(rel(out.coefficient, A / (1 + A))).toBeLessThan(1e-12);
  });

  it('La entered equals the dominant-layer model with layer 3 absent (1e-10)', () => {
    // Outdoor dominant layer with layer 3 of thickness l3 has a top conductance D / l3; the DeVaull dirt
    // floor has conductance q, so q = D / l3 gives the same column.
    const l3 = 0.01;
    const La = 1.2;
    const b = layer;
    const dom = dominantLayerRun({
      chemical: chem,
      layer1: { thickness: b.thickness - La, porosity: b.porosity, moisture: b.moisture },
      layer2: { thickness: La, porosity: b.porosity, moisture: b.moisture, rate: kw },
      layer3: { thickness: l3, porosity: b.porosity, moisture: b.moisture },
      receptor: { kind: 'outdoor' },
      source: { kind: 'soilGas', csg: cvs },
    });
    const out = devaullRun(
      base({
        foundation: { h: Infinity },
        building: { mixingHeight: 1, airExchangeRate: D / l3 },
        oxygen: { mode: 'entered', aerobicDepth: La },
      }),
    );
    expect(rel(out.fluxTop, dom.fluxTop)).toBeLessThan(1e-10);
    expect(rel(out.Ca, dom.Ca)).toBeLessThan(1e-10);
    expect(rel(out.Cb, dom.Cb)).toBeLessThan(1e-10);
  });

  it('doubles with the source', () => {
    const one = devaullRun(base());
    const two = devaullRun(base({ source: { kind: 'soilGas', csg: 2 * cvs } }));
    expect(rel(two.concentration, 2 * one.concentration)).toBeLessThan(1e-12);
  });
});

describe('entered aerobic depth: hand case', () => {
  it('matches the closed form with cosh and sinh', () => {
    const G3Case = { h: Infinity };
    const out = devaullRun(
      base({ foundation: G3Case, oxygen: { mode: 'entered', aerobicDepth: 1 } }),
    );
    const expected = cbOverCs(1, layer.thickness, q);
    expect(rel(out.Cb / cvs, expected)).toBeLessThan(1e-9);
    expect(rel(out.concentration, expected * cvs)).toBeLessThan(1e-9);
    expect(out.aerobicDepth).toBe(1);
    expect(out.anaerobicDepth).toBe(2);
    expect(out.a).toBeCloseTo(Math.sqrt(kappa / D) * 1, 12);
  });

  it('aerobic degradation lowers the indoor concentration monotonically', () => {
    let prev = Infinity;
    for (const La of [0, 0.5, 1, 2, 3]) {
      const c = devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: La } })).concentration;
      expect(c).toBeLessThan(prev);
      prev = c;
    }
  });

  it('conserves mass: flux into the aerobic layer equals the exit flux plus degradation', () => {
    const out = devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: 1.5 } }));
    expect(rel(out.fluxBottomAerobic, out.fluxTop + out.degradationRate)).toBeLessThan(1e-12);
    expect(rel(out.fluxBottomAerobic, (D / out.anaerobicDepth) * (cvs - out.Ca))).toBeLessThan(
      1e-10,
    );
  });
});

describe('overflow-safe large a', () => {
  it('stays finite where cosh overflows', () => {
    const out = devaullRun(
      base({ degradationRate: 1, oxygen: { mode: 'entered', aerobicDepth: 3 } }),
    );
    expect(out.a).toBeGreaterThan(710);
    expect(Number.isFinite(out.concentration)).toBe(true);
    expect(out.concentration).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(out.Ca)).toBe(true);
    expect(out.profile.every((p) => Number.isFinite(p.concentration))).toBe(true);
  });
  it('follows the exponential asymptote below the underflow point', () => {
    const rate = ((600 / 3) ** 2 * D * chem.H) / layer.moisture;
    const out = devaullRun(
      base({
        degradationRate: rate,
        foundation: { h: Infinity },
        oxygen: { mode: 'entered', aerobicDepth: 3 },
      }),
    );
    expect(out.a).toBeCloseTo(600, 6);
    const kk = Math.sqrt((rate * layer.moisture) / chem.H / D);
    const u = D * kk;
    // Lb = 0 (K1 = 1, K2 = G3 / u): Cb / Cs -> 2 e^-a / (1 + G3 / u)
    expect(rel(out.Cb / cvs, (2 * Math.exp(-600)) / (1 + q / u))).toBeLessThan(1e-9);
  });
});

describe('oxygen option 2: fast-reaction depth', () => {
  const o2 = (
    over: Partial<Extract<DevaullOxygen, { mode: 'fastReaction' }>> = {},
  ): DevaullOxygen => ({
    mode: 'fastReaction',
    ...oxy,
    atmosphericConcentration: O2atm,
    massRatio: Y,
    totalHydrocarbonVapor: cvs,
    ...over,
  });

  it('without respiration the front sits at x = D_O O / (D_O O + Y D C) of the column', () => {
    const x = 0.25;
    const Oa = (Y * D * cvs * x) / ((1 - x) * DO);
    const out = devaullRun(base({ oxygen: o2({ atmosphericConcentration: Oa }) }));
    expect(rel(out.aerobicDepth, x * layer.thickness)).toBeLessThan(1e-9);
    expect(out.warnings.some((w) => w.code === 'vapor.oxygen-demand-incomplete')).toBe(false);
  });

  it('with respiration the root satisfies the oxygen balance (root inside the column)', () => {
    const R = 5e-9;
    const out = devaullRun(base({ oxygen: o2({ respiration: R }) }));
    const La = out.aerobicDepth;
    expect(La).toBeGreaterThan(0);
    expect(La).toBeLessThan(layer.thickness);
    const lhs = (DO * O2atm - (R * La * La) / 2) * (layer.thickness - La);
    const rhs = Y * D * cvs * La;
    expect(rel(lhs, rhs)).toBeLessThan(1e-8);
    const noResp = devaullRun(base({ oxygen: o2() })).aerobicDepth;
    expect(La).toBeLessThan(noResp);
  });

  it('respiration that exhausts the oxygen within the layer caps the aerobic depth', () => {
    const R = 1e-3;
    const out = devaullRun(base({ oxygen: o2({ respiration: R, totalHydrocarbonVapor: 0 }) }));
    expect(rel(out.aerobicDepth, Math.sqrt((2 * DO * O2atm) / R))).toBeLessThan(1e-9);
  });

  it('no hydrocarbon demand makes the layer wholly aerobic; no oxygen makes it wholly anaerobic', () => {
    const aer = devaullRun(base({ oxygen: o2({ totalHydrocarbonVapor: 0 }) }));
    expect(aer.aerobicDepth).toBe(layer.thickness);
    const ana = devaullRun(base({ oxygen: o2({ atmosphericConcentration: 0 }) }));
    expect(ana.aerobicDepth).toBe(0);
    const je = devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: 0 } }));
    expect(rel(ana.concentration, je.concentration)).toBeLessThan(1e-12);
  });

  it('warns when only the chemical of concern is entered as the oxygen demand', () => {
    const { totalHydrocarbonVapor: _t, ...rest } = o2() as Extract<
      DevaullOxygen,
      { mode: 'fastReaction' }
    >;
    void _t;
    const out = devaullRun(base({ oxygen: rest as DevaullOxygen }));
    expect(out.warnings.some((w) => w.code === 'vapor.oxygen-demand-incomplete')).toBe(true);
  });
});

describe('oxygen option 3: coupled solution', () => {
  const o3 = (over: Partial<Extract<DevaullOxygen, { mode: 'coupled' }>> = {}): DevaullOxygen => ({
    mode: 'coupled',
    ...oxy,
    atmosphericConcentration: O2atm,
    massRatio: Y,
    totalHydrocarbonVapor: 0.5,
    ...over,
  });

  /** Independent oxygen residual with plain cosh and sinh. */
  function residual(La: number, G3: number, total: number, R: number): number {
    const LT = layer.thickness;
    const k = Math.sqrt(kappa / D);
    const a = k * La;
    const gb = D / (LT - La);
    const cb = cbOverCs(La, LT, G3);
    const ca = (Math.cosh(a) + (G3 * Math.sinh(a)) / (D * k)) * cb;
    const degraded = D * k * (ca + cb) * Math.tanh(a / 2) * total;
    void gb;
    return (DO * O2atm) / La - R * La - Y * degraded;
  }

  it('finds La where the oxygen supply just meets the demand (root inside the column)', () => {
    const out = devaullRun(base({ foundation: { h: Infinity }, oxygen: o3() }));
    expect(out.aerobicDepth).toBeGreaterThan(0);
    expect(out.aerobicDepth).toBeLessThan(layer.thickness);
    expect(
      Math.abs(residual(out.aerobicDepth, q, 0.5, 0)) / ((DO * O2atm) / out.aerobicDepth),
    ).toBeLessThan(1e-8);
  });

  it('includes baseline respiration in the demand', () => {
    const R = 2e-8;
    const out = devaullRun(base({ foundation: { h: Infinity }, oxygen: o3({ respiration: R }) }));
    const without = devaullRun(base({ foundation: { h: Infinity }, oxygen: o3() }));
    expect(out.aerobicDepth).toBeLessThan(without.aerobicDepth);
    expect(
      Math.abs(residual(out.aerobicDepth, q, 0.5, R)) / ((DO * O2atm) / out.aerobicDepth),
    ).toBeLessThan(1e-8);
  });

  it('is wholly aerobic when the supply exceeds the demand over the whole column', () => {
    const out = devaullRun(
      base({ oxygen: o3({ atmosphericConcentration: 50, totalHydrocarbonVapor: 0.001 }) }),
    );
    expect(out.aerobicDepth).toBe(layer.thickness);
    expect(out.aerobicFraction).toBe(1);
  });

  it('is wholly anaerobic without oxygen and equals Johnson and Ettinger', () => {
    const out = devaullRun(base({ oxygen: o3({ atmosphericConcentration: 0 }) }));
    const je = devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: 0 } }));
    expect(out.aerobicDepth).toBe(0);
    expect(rel(out.concentration, je.concentration)).toBeLessThan(1e-12);
  });

  it('more oxygen deepens the aerobic zone and lowers the indoor concentration', () => {
    const a = devaullRun(base({ oxygen: o3({ atmosphericConcentration: 0.05 }) }));
    const b = devaullRun(base({ oxygen: o3({ atmosphericConcentration: 0.28 }) }));
    expect(b.aerobicDepth).toBeGreaterThan(a.aerobicDepth);
    expect(b.concentration).toBeLessThan(a.concentration);
  });
});

describe('inputs and registration', () => {
  it('warns when a chemical has no degradation rate and treats it as non-degrading', () => {
    const { degradationRate: _r, ...noRate } = base();
    void _r;
    const out = devaullRun(noRate);
    expect(out.warnings.some((w) => w.code === 'vapor.no-degradation-rate')).toBe(true);
    const je = devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: 0 } }));
    expect(rel(out.concentration, je.concentration)).toBeLessThan(1e-12);
  });

  it('rejects an aerobic depth outside the column and non-positive dimensions', () => {
    expect(() => devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: 3.5 } }))).toThrow(
      RangeError,
    );
    expect(() => devaullRun(base({ oxygen: { mode: 'entered', aerobicDepth: -1 } }))).toThrow(
      RangeError,
    );
    expect(() => devaullRun(base({ degradationRate: -1 }))).toThrow(RangeError);
    expect(() => devaullRun(base({ foundation: { h: 0 } }))).toThrow(RangeError);
    expect(() => devaullRun(base({ building: { mixingHeight: 0, airExchangeRate: 1 } }))).toThrow(
      RangeError,
    );
  });

  it('is modern, in the default registry, and cites only used references', () => {
    expect(vaporDevaull2007.id).toBe('vapor.devaull-2007');
    expect(vaporDevaull2007.kind).toBe('modern');
    expect(registry.has('vapor.devaull-2007')).toBe(true);
    const byKey = new Map(references.map((r) => [r.key, r]));
    for (const k of vaporDevaull2007.citations) expect(byKey.get(k)?.status).toBe('used');
  });
});
