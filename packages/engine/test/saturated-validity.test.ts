import { describe, expect, it } from 'vitest';
import { handInput, DAY, YEAR } from './saturatedHelpers.js';
import {
  runTwoRegion,
  runExponential,
  waterLevels,
  regionConcentrations,
  TPH_CONSTANT_THRESHOLD,
  type SaturatedSourceInput,
} from '../src/processes/saturatedSource/index.js';
import {
  sourceDepletionRate,
  unitGradientMoisture,
  equilibriumPoreWater,
  TPH_CONSTANT_THRESHOLD as VADOSE_THRESHOLD,
} from '../src/processes/vadose/index.js';

const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

describe('warnings', () => {
  it('reports the residual phase once per region, with x and x S', () => {
    const a = runTwoRegion(handInput('A'));
    const res = a.warnings.filter((w) => w.code === 'saturatedSource.residual-phase');
    expect(res).toHaveLength(2);
    expect(res[0]!.message).toContain('region 1');
    expect(res[1]!.message).toContain('region 2');
    expect(res[0]!.message).toMatch(/22\.44 mg\/L/);
    expect(codes(runTwoRegion(handInput('B')))).not.toContain('saturatedSource.residual-phase');
  });
  it('shares the TPH threshold with the vadose process and fires only above it', () => {
    expect(TPH_CONSTANT_THRESHOLD).toBe(VADOSE_THRESHOLD);
    const at = (ratio: number) => {
      const i = handInput('A');
      return { ...i, chemical: { ...i.chemical, FT: i.chemical.F / ratio, MT: 0.1 } };
    };
    // F / FT = 0.1 exactly is not above the threshold; mole fraction stays below 1
    expect(codes(runTwoRegion(at(0.1)))).not.toContain(
      'saturatedSource.tph-constant-approximation',
    );
    expect(codes(runTwoRegion(at(0.11)))).toContain('saturatedSource.tph-constant-approximation');
    expect(codes(runExponential(at(0.11)))).toContain('saturatedSource.tph-constant-approximation');
    expect(codes(runTwoRegion(handInput('B')))).not.toContain(
      'saturatedSource.tph-constant-approximation',
    );
  });
  it('flags the constant dissolved source on the legacy method only, and only without a separate phase', () => {
    expect(codes(runTwoRegion(handInput('B')))).toContain(
      'saturatedSource.constant-dissolved-source',
    );
    expect(codes(runTwoRegion(handInput('A')))).not.toContain(
      'saturatedSource.constant-dissolved-source',
    );
    expect(codes(runExponential(handInput('B')))).not.toContain(
      'saturatedSource.constant-dissolved-source',
    );
  });
  it('flags a capped fluctuation, a clamped infiltration and an absent release', () => {
    const i = handInput('A');
    expect(codes(runTwoRegion({ ...i, source: { ...i.source, fluctuation: 1.5 } }))).not.toContain(
      'saturatedSource.fluctuation-capped',
    );
    expect(codes(runTwoRegion({ ...i, source: { ...i.source, fluctuation: 1.6 } }))).toContain(
      'saturatedSource.fluctuation-capped',
    );
    expect(codes(runExponential({ ...i, source: { ...i.source, fluctuation: 1.6 } }))).toContain(
      'saturatedSource.fluctuation-capped',
    );
    const K = i.aquifer.conductivity;
    expect(codes(runTwoRegion({ ...i, infiltration: 2 * K }))).toContain(
      'saturatedSource.infiltration-clamped',
    );
    expect(codes(runTwoRegion(i))).not.toContain('saturatedSource.infiltration-clamped');
    const none = { ...i, aquifer: { ...i.aquifer, gradient: 0 }, infiltration: 0 };
    expect(codes(runTwoRegion(none))).toContain('saturatedSource.no-release');
    expect(codes(runExponential(none))).toContain('saturatedSource.no-release');
    expect(codes(runTwoRegion(i))).not.toContain('saturatedSource.no-release');
  });
});

describe('RangeErrors', () => {
  const base = handInput('A');
  const bad = (patch: Partial<SaturatedSourceInput>) => ({ ...base, ...patch });
  const both = (input: SaturatedSourceInput) => {
    expect(() => runTwoRegion(input)).toThrow(RangeError);
    expect(() => runExponential(input)).toThrow(RangeError);
  };
  it('rejects non-finite and out-of-range inputs on both methods', () => {
    both(bad({ infiltration: -1 }));
    both(bad({ infiltration: Number.NaN }));
    both(bad({ aquifer: { ...base.aquifer, conductivity: 0 } }));
    both(bad({ aquifer: { ...base.aquifer, gradient: -0.1 } }));
    both(bad({ tEnd: -1 }));
    both(bad({ tEnd: Number.NaN }));
    both(bad({ source: { ...base.source, minSaturatedThickness: 5 } }));
    both(bad({ source: { ...base.source, fluctuation: -1 } }));
    both(bad({ source: { ...base.source, fractionHigh: 2 } }));
    both(bad({ source: { ...base.source, width: 0 } }));
    both(bad({ soil: { ...base.soil, porosity: 0 } }));
    both(bad({ soil: { ...base.soil, n: 1 } }));
    both(bad({ chemical: { ...base.chemical, F: -1 } }));
    both(bad({ chemical: { ...base.chemical, S: 0 } }));
    both(bad({ chemical: { ...base.chemical, F: 0.02 } }));
    both(bad({ source: { ...base.source, schedule: 'weekly' as never } }));
  });
  it('rejects a zero region 1 water content when q > 0 (the M2 helper error)', () => {
    both(
      bad({
        soil: { ...base.soil, thetaR: 0 },
        infiltration: Number.MIN_VALUE,
        aquifer: { ...base.aquifer, conductivity: 1e300 },
      }),
    );
  });
  it('rejects source decay on the legacy method, and negative decay on the modern one', () => {
    expect(() => runTwoRegion(bad({ sourceDecayRate: 1e-9 }))).toThrow(RangeError);
    expect(() => runTwoRegion(bad({ sourceDecayRate: 0 }))).not.toThrow();
    expect(() => runExponential(bad({ sourceDecayRate: -1e-9 }))).toThrow(RangeError);
    expect(() => runExponential(bad({ sourceDecayRate: 1e-9 }))).not.toThrow();
  });
  it('refuses infiltration at or above K on the modern method', () => {
    const K = base.aquifer.conductivity;
    expect(() => runExponential(bad({ infiltration: K }))).toThrow(RangeError);
    expect(() => runExponential(bad({ infiltration: 3 * K }))).toThrow(RangeError);
    expect(() => runTwoRegion(bad({ infiltration: 3 * K }))).not.toThrow();
  });
});

describe('identity with the M2 vadose source', () => {
  it('a modern source wholly above the water table depletes at sourceDepletionRate (1e-12)', () => {
    const i = handInput('A');
    const dry: SaturatedSourceInput = {
      ...i,
      source: { ...i.source, minSaturatedThickness: 0, fluctuation: 0 },
    };
    const out = runExponential(dry);
    const lv = waterLevels(dry.source);
    expect(lv.hHi).toBe(0);
    const m = unitGradientMoisture(
      { thetaS: i.soil.porosity, thetaR: i.soil.thetaR, n: i.soil.n, Ks: i.aquifer.conductivity },
      i.infiltration,
      'brooksCorey1964',
    );
    const kd = i.chemical.koc * i.soil.foc;
    const ceq = equilibriumPoreWater({
      F: i.chemical.F,
      rhoB: i.soil.rhoB,
      kd,
      theta: m.theta,
      thetaA: i.soil.porosity - m.theta,
      H: i.chemical.H,
    });
    const cs0 = Math.min(
      ceq,
      i.chemical.S * (i.chemical.F / i.chemical.M / (i.chemical.FT! / i.chemical.MT!)),
    );
    const gamma = sourceDepletionRate({
      cs0,
      m0: i.soil.rhoB * i.source.thickness * i.chemical.F,
      q: i.infiltration,
      volatilization: 0,
      sourceDecay: 0,
    });
    expect(Math.abs(out.gamma! - gamma) / gamma).toBeLessThan(1e-12);
    expect(
      regionConcentrations({
        soil: i.soil,
        chemical: i.chemical,
        conductivity: i.aquifer.conductivity,
        infiltration: i.infiltration,
        unsaturatedExists: true,
        saturatedExists: false,
        onClamp: 'throw',
      }).unsaturated!.c,
    ).toBe(cs0);
    expect(YEAR + DAY).toBeGreaterThan(0);
  });
});
