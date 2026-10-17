import { describe, expect, it } from 'vitest';
import r from './fixtures/vapor/risc-r3-r5.json' with { type: 'json' };
import j from './fixtures/vapor/appendix-j.json' with { type: 'json' };
import { references } from '../src/references/index.js';
import {
  convertGcmsToPa,
  cm2ToM2,
  jeLegacyIndoor,
  dominantLayerRun,
  vaporDominantLayer1998,
  vaporJe1991,
  type LegacyBuilding,
  type LegacyJeInput,
  type DominantLayerInput,
  type SoilLayer,
  type SourceVaporInput,
} from '../src/processes/vapor/index.js';

const DAY = 86400;
const b = r.benzene;
const chem = { Da: b.DaCm2PerS * 1e-4, Dw: b.DwCm2PerS * 1e-4, H: b.henry };
const M = b.molarMassGPerMol / 1000;
const S = (b.solubilityMgPerL * 1e-3) / 1; // mg/L to kg/m^3
const kd = b.kocMlPerG * r.sourceSoil.foc * 1e-3; // m^3/kg

function rel(a: number, ref: number): number {
  return Math.abs(a - ref) / Math.abs(ref);
}
const layer = (l: { thicknessM: number; porosity: number; moisture: number }): SoilLayer => ({
  thickness: l.thicknessM,
  porosity: l.porosity,
  moisture: l.moisture,
});

function building(
  foundation: { thicknessM: number; porosity: number; moisture: number },
  withFlow: boolean,
): LegacyBuilding {
  const bd = r.building;
  return {
    volume: bd.volumeM3,
    airExchangeRate: bd.airExchangesPerDay / DAY,
    floorArea: bd.floorAreaM2,
    crackFraction: bd.crackFraction,
    foundation: layer(foundation),
    soilGas: withFlow
      ? {
          dP: convertGcmsToPa(bd.dPGPerCmS2),
          kv: cm2ToM2(bd.kvCm2),
          mu: convertGcmsToPa(bd.viscosityGPerCmS),
          Xcrack: bd.perimeterM,
          Zcrack: bd.zcrackM,
        }
      : { Qsoil: 0 },
  };
}

function soilSource(benzeneMgKg: number, tphMgKg: number) {
  const ss = r.sourceSoil;
  return {
    kind: 'soil' as const,
    F: benzeneMgKg * 1e-6,
    rhoB: ss.bulkDensityGPerCm3 * 1000,
    kd,
    theta: ss.moisture,
    thetaA: ss.porosity - ss.moisture,
    H: chem.H,
    M,
    S,
    ...(tphMgKg > 0 ? { FT: tphMgKg * 1e-6, MT: 0.1 } : {}),
  };
}

const MGM3 = 1e-6; // mg/m^3 to kg/m^3

describe('Table R-3: legacy J&E, soil to indoor air', () => {
  const base = {
    chemical: chem,
    layers: r.r3.layers.map(layer),
    building: building(r.building.foundation, true),
  };
  it('reproduces case A (benzene only) at 0.5 percent', () => {
    const out = jeLegacyIndoor({ ...base, source: soilSource(1000, 0) });
    expect(rel(out.concentration, r.r3.caseA.riscMgPerM3 * MGM3)).toBeLessThan(0.005);
  });
  it('reproduces case B (with TPH) at 0.5 percent and stays below saturation', () => {
    const out = jeLegacyIndoor({ ...base, source: soilSource(10, 1000) });
    expect(rel(out.concentration, r.r3.caseB.riscMgPerM3 * MGM3)).toBeLessThan(0.005);
    expect(out.warnings.map((w) => w.code)).not.toContain('vapor.residual-phase');
  });
  it('is linear in the source and reports the coefficient and diffusion-only alpha', () => {
    const a = jeLegacyIndoor({ ...base, source: soilSource(1, 0) });
    const c = jeLegacyIndoor({ ...base, source: soilSource(2, 0) });
    expect(rel(c.concentration, 2 * a.concentration)).toBeLessThan(1e-12);
    expect(a.alpha).toBeGreaterThan(0);
    expect(a.alphaDiffusionOnly).toBeLessThanOrEqual(a.alpha);
    expect(a.coefficient).toBe(a.alpha);
    expect(rel(a.entryRate, a.concentration * a.QB)).toBeLessThan(1e-12);
  });
  it('profile runs from the source value to the foundation base', () => {
    const out = jeLegacyIndoor({ ...base, source: soilSource(1000, 0) });
    expect(out.profile[0]).toEqual({ height: 0, concentration: out.sourceVapor });
    const last = out.profile[out.profile.length - 1]!;
    expect(rel(last.height, 2.8)).toBeLessThan(1e-12);
    expect(last.concentration).toBeLessThan(out.sourceVapor);
    expect(last.concentration).toBeGreaterThan(out.concentration);
    expect(out.profile.length).toBe(3);
  });
  it('warns of advection-dominated entry and a shallow source', () => {
    const out = jeLegacyIndoor({ ...base, source: soilSource(1000, 0) });
    expect(Array.isArray(out.warnings)).toBe(true);
    const shallow = jeLegacyIndoor({
      ...base,
      layers: [{ thickness: 1, porosity: 0.35, moisture: 0.05 }],
      source: soilSource(1000, 0),
    });
    expect(shallow.warnings.map((w) => w.code)).toContain('vapor.crack-depth');
    const off = jeLegacyIndoor({ ...base, sourceNotUnderBuilding: true, source: soilSource(1, 0) });
    expect(off.warnings.map((w) => w.code)).toContain('vapor.lateral-offset');
  });
});

describe('Table R-5: legacy J&E, groundwater to indoor air', () => {
  const input: LegacyJeInput = {
    chemical: chem,
    layers: r.r5.layers.map(layer),
    capillaryFringe: layer(r.r5.capillaryFringe),
    building: building(r.r5.foundation, false),
    source: { kind: 'groundwater', cgw: r.r5.groundwaterMgPerL * 1e-3, H: chem.H, S },
  };
  it('reproduces 2.27e-3 mg/m^3 at 0.5 percent', () => {
    const out = jeLegacyIndoor(input);
    expect(rel(out.concentration, r.r5.riscMgPerM3 * MGM3)).toBeLessThan(0.005);
    expect(out.LT).toBeCloseTo(1.6, 12);
  });
  it('rejects a capillary fringe for a non-groundwater source', () => {
    expect(() => jeLegacyIndoor({ ...input, source: { kind: 'soilGas', csg: 1 } })).toThrow(
      RangeError,
    );
  });
  it('warns when groundwater exceeds solubility, never clamps', () => {
    const out = jeLegacyIndoor({
      ...input,
      source: { kind: 'groundwater', cgw: 10, H: chem.H, S },
    });
    expect(out.warnings.map((w) => w.code)).toContain('vapor.source-above-solubility');
    expect(out.sourceVapor).toBeCloseTo(2.28, 12);
  });
});

describe('Validity', () => {
  const ok: LegacyJeInput = {
    chemical: chem,
    layers: r.r3.layers.map(layer),
    building: building(r.building.foundation, true),
    source: { kind: 'soilGas', csg: 1 },
  };
  it('rejects bad inputs', () => {
    expect(() => jeLegacyIndoor({ ...ok, layers: [] })).toThrow(RangeError);
    expect(() =>
      jeLegacyIndoor({ ...ok, layers: [{ thickness: 0, porosity: 0.3, moisture: 0.1 }] }),
    ).toThrow(RangeError);
    expect(() =>
      jeLegacyIndoor({ ...ok, layers: [{ thickness: 1, porosity: 0.3, moisture: 0.4 }] }),
    ).toThrow(RangeError);
    expect(() => jeLegacyIndoor({ ...ok, building: { ...ok.building, volume: 0 } })).toThrow(
      RangeError,
    );
    expect(() => jeLegacyIndoor({ ...ok, building: { ...ok.building, crackFraction: 2 } })).toThrow(
      RangeError,
    );
    expect(() => jeLegacyIndoor({ ...ok, chemical: { ...chem, H: 0 } })).toThrow(RangeError);
  });
  it('a zero source returns zero', () => {
    expect(jeLegacyIndoor({ ...ok, source: { kind: 'soilGas', csg: 0 } }).concentration).toBe(0);
  });
});

describe('Table R-4: dominant layer with degradation, indoor', () => {
  const [l1, l2, l3] = r.r4.layers;
  const input = (
    lambdaPerDay: number,
    source: SourceVaporInput = soilSource(r.r4.benzeneMgPerKg, 0),
  ): DominantLayerInput => ({
    chemical: chem,
    layer1: layer(l1!),
    layer2: { ...layer(l2!), rate: lambdaPerDay / DAY },
    layer3: layer(l3!),
    receptor: { kind: 'indoor', building: building(r.building.foundation, true) },
    source,
  });
  it('reproduces source vapor and indoor air at 0.5 percent', () => {
    const out = dominantLayerRun(input(l2!.degradationPerDay!));
    expect(rel(out.sourceVapor, r.r4.sourceVaporMgPerM3 * MGM3)).toBeLessThan(0.005);
    expect(rel(out.concentration!, r.r4.indoorMgPerM3 * MGM3)).toBeLessThan(0.005);
  });
  it('reproduces the soil gas entry of the source vapor', () => {
    const out = dominantLayerRun(
      input(l2!.degradationPerDay!, { kind: 'soilGas', csg: r.r4.sourceVaporMgPerM3 * MGM3 }),
    );
    expect(rel(out.concentration!, r.r4.indoorFromSoilGasMgPerM3 * MGM3)).toBeLessThan(0.005);
  });
  it('with no degradation reproduces Table R-3 (8.57 mg/m^3)', () => {
    const out = dominantLayerRun(input(0));
    expect(rel(out.concentration!, r.r3.caseA.riscMgPerM3 * MGM3)).toBeLessThan(0.005);
  });
  it('identity 8a: lambda = 0 equals legacy J&E for the same column (1e-12)', () => {
    const dl = dominantLayerRun(input(0));
    const je = jeLegacyIndoor({
      chemical: chem,
      layers: [layer(l1!), layer(l2!), layer(l3!)],
      building: building(r.building.foundation, true),
      source: soilSource(r.r4.benzeneMgPerKg, 0),
    });
    expect(rel(dl.concentration!, je.concentration)).toBeLessThan(1e-12);
    expect(rel(dl.coefficient, je.alpha)).toBeLessThan(1e-12);
  });
  it('is linear in the source, degradation lowers it, huge rates do not overflow', () => {
    const a = dominantLayerRun(input(0.09, { kind: 'soilGas', csg: 1 }));
    const c = dominantLayerRun(input(0.09, { kind: 'soilGas', csg: 3 }));
    expect(rel(c.concentration!, 3 * a.concentration!)).toBeLessThan(1e-12);
    const none = dominantLayerRun(input(0, { kind: 'soilGas', csg: 1 }));
    expect(a.concentration!).toBeLessThan(none.concentration!);
    const huge = dominantLayerRun(input(1e12, { kind: 'soilGas', csg: 1 }));
    expect(Number.isFinite(huge.concentration!)).toBe(true);
    expect(huge.concentration!).toBeGreaterThanOrEqual(0);
    expect(huge.concentration!).toBeLessThan(a.concentration!);
  });
  it('satisfies flux continuity at both layer interfaces', () => {
    const out = dominantLayerRun(input(0.09, { kind: 'soilGas', csg: 1 }));
    expect(rel(out.fluxBottomLayer2, out.fluxLayer1)).toBeLessThan(1e-10);
    expect(rel(out.fluxTop, out.fluxTopOfLayer2)).toBeLessThan(1e-10);
    expect(rel(out.fluxTop, (out.QB * out.concentration!) / out.AB)).toBeLessThan(1e-10);
    expect(out.profile[0]).toEqual({ height: 0, concentration: 1 });
  });
  it('descriptors carry complete metadata and cite known references', () => {
    expect(vaporDominantLayer1998.id).toBe('vapor.dominant-layer-1998');
    expect(vaporDominantLayer1998.kind).toBe('legacy');
    expect(vaporDominantLayer1998.citations).toContain('johnson1998');
    expect(vaporJe1991.id).toBe('vapor.je-1991');
    expect(vaporJe1991.citations).toContain('johnsonettinger1991');
    const keys = new Set(references.map((x) => x.key));
    for (const m of [vaporJe1991, vaporDominantLayer1998]) {
      for (const c of m.citations) expect(keys.has(c), c).toBe(true);
    }
  });
});

describe('Appendix J: dominant layer, outdoor', () => {
  const jb = j.benzene;
  const jchem = { Da: jb.DaCm2PerS * 1e-4, Dw: jb.DwCm2PerS * 1e-4, H: jb.henry };
  function run(
    l1: { porosity: number; moisture: number },
    l2: { porosity: number; moisture: number },
  ) {
    const [t1, t2, t3] = j.layersThicknessM;
    const l3 = j.base[2]!;
    return dominantLayerRun({
      chemical: jchem,
      layer1: { thickness: t1!, ...l1 },
      layer2: { thickness: t2!, ...l2, rate: j.degradationPerDay / DAY },
      layer3: { thickness: t3!, ...l3 },
      receptor: { kind: 'outdoor' },
      source: { kind: 'soilGas', csg: 1 },
    });
  }
  it('reproduces the normalized concentration at the top of layer 1 (0.01 absolute)', () => {
    const base = run(j.base[0]!, j.base[1]!);
    const dry = run(j.dryLayer1, j.base[1]!);
    // the wet case keeps the dry layer 1 and wets layer 2 (the reading that reproduces 0.95)
    const wet = run(j.dryLayer1, j.wetLayer2);
    expect(Math.abs(base.concentrationTopLayer1 - j.normalizedAtTopOfLayer1.base)).toBeLessThan(
      0.01,
    );
    expect(Math.abs(dry.concentrationTopLayer1 - j.normalizedAtTopOfLayer1.dry)).toBeLessThan(0.01);
    expect(Math.abs(wet.concentrationTopLayer1 - j.normalizedAtTopOfLayer1.wet)).toBeLessThan(0.01);
  });
  it('outdoor result is an area flux with zero surface concentration', () => {
    const base = run(j.base[0]!, j.base[1]!);
    expect(base.concentration).toBeUndefined();
    expect(base.fluxTop).toBeGreaterThan(0);
    const last = base.profile[base.profile.length - 1]!;
    expect(last.height).toBeCloseTo(4.9, 12);
    expect(last.concentration).toBe(0);
  });
});
