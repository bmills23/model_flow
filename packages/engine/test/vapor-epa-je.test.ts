import { describe, expect, it } from 'vitest';
import fx from './fixtures/vapor/epa2004-sl-adv.json' with { type: 'json' };
import { references } from '../src/references/index.js';
import {
  SOIL_TEXTURES,
  capillaryZone,
  convertGcmsToPa,
  effectiveSaturation,
  epaBuildingDefaults,
  jeEpaIndoor,
  relativeAirPermeability,
  soilTexture,
  stratumFromTexture,
  vaporJeEpa,
  type EpaJeInput,
  type SoilTextureCode,
  type Stratum,
} from '../src/processes/vapor/index.js';
import { registry } from '../src/index.js';

/** Half a unit in the third significant figure of a printed value, e.g. "2.68E-03" or "8,122". */
function halfUnit(printed: string): number {
  const v = Number(printed.replace(/,/g, ''));
  const e = Math.floor(Math.log10(Math.abs(v)) + 1e-12);
  return 0.5 * Math.pow(10, e - 2);
}
function printed(p: string): number {
  return Number(p.replace(/,/g, ''));
}
function expectPrinted(actual: number, p: string, scale = 1): void {
  expect(Math.abs(actual / scale - printed(p))).toBeLessThanOrEqual(halfUnit(p));
}

const CM = 1e-2;
const inp = fx.inputs;
const b = inp.benzene;
const strata: Stratum[] = inp.strata.map((s) => ({
  thickness: s.thicknessCm * CM,
  porosity: s.porosity,
  moisture: s.moisture,
  bulkDensity: s.bulkDensityGPerCm3 * 1000,
  foc: s.foc,
  ...pickVg(s.texture as SoilTextureCode),
  texture: s.texture as SoilTextureCode,
}));
function pickVg(code: SoilTextureCode) {
  const t = soilTexture(code);
  return {
    saturatedConductivity: t.saturatedConductivity,
    residualMoisture: t.residualMoisture,
    vgM: t.M,
  };
}
const benzene = {
  Da: b.DaCm2PerS * 1e-4,
  Dw: b.DwCm2PerS * 1e-4,
  henryAtm: b.henryAtmM3PerMol,
  koc: b.kocCm3PerG * 1e-3,
  M: b.molarMassGPerMol / 1000,
  S: b.solubilityMgPerL * 1e-3,
  thermo: { TB: b.boilingPointK, TC: b.criticalTemperatureK, dHvb: b.enthalpyCalPerMol },
};
const plain = {
  Da: benzene.Da,
  Dw: benzene.Dw,
  henryAtm: benzene.henryAtm,
  koc: benzene.koc,
  M: benzene.M,
  S: benzene.S,
};
const noKoc = { ...plain, koc: undefined as never };
const bd = inp.building;
const UG_PER_KG = 1e-9; // kg/kg
const exampleBuilding = {
  foundation: 'basementSlab' as const,
  floorLength: bd.lengthCm * CM,
  floorWidth: bd.widthCm * CM,
  depthBelowGrade: inp.floorDepthCm * CM,
  mixingHeight: bd.heightCm * CM,
  airExchangeRate: bd.airExchangePerHour / 3600,
  foundationThickness: bd.floorThicknessCm * CM,
  crackWidth: bd.crackWidthCm * CM,
  soilGas: { Qsoil: (bd.qsoilLPerMin * 1e-3) / 60 },
};
const TAU = inp.exposureYears * 365 * 86400;
const example: EpaJeInput = {
  chemical: benzene,
  temperature: inp.soilTemperatureC + 273.15,
  strata,
  floorDepth: inp.floorDepthCm * CM,
  building: exampleBuilding,
  source: {
    kind: 'soil',
    F: inp.initialSoilConcentrationUgPerKg * UG_PER_KG,
    bottomDepth: inp.bottomOfContaminationCm * CM,
  },
  finiteSource: { exposureDuration: TAU },
};
const p = fx.printed;

describe('EPA 2004 Appendix C SL-ADV benzene example', () => {
  const r = jeEpaIndoor(example);

  it('Henry constant at the soil temperature', () => {
    expectPrinted(r.dHvTS!, p.enthalpyAtSoilTemperatureCalPerMol);
    // H is not returned in atm m^3/mol; recover it from the dimensionless value at 10 deg C.
    expectPrinted(r.Hprime * 8.205736608e-5 * 283.15, p.henryAtmM3PerMol);
    expectPrinted(r.Hprime, p.henryDimensionless);
  });

  it('building geometry and ventilation', () => {
    expectPrinted(r.AB, p.enclosedSpaceAreaCm2, 1e-4);
    expectPrinted(r.eta, p.crackToTotalAreaRatio);
    expectPrinted(r.Acrack, p.crackAreaCm2, 1e-4);
    expectPrinted(r.QB, p.buildingVentilationCm3PerS, 1e-6);
    expectPrinted(r.Qsoil, p.qsoilCm3PerS, 1e-6);
    expectPrinted(TAU, p.exposureSeconds);
    expectPrinted(r.LT, p.sourceBuildingSeparationCm, CM);
  });

  it('soil vapor permeability terms (computed, although the example enters Q_soil)', () => {
    const k = r.permeability!;
    expectPrinted(k.Ste, p.effectiveSaturationA);
    expectPrinted(k.ki, p.intrinsicPermeabilityCm2, 1e-4);
    expectPrinted(k.krg, p.relativeAirPermeability);
    expectPrinted(k.kv, p.effectiveVaporPermeabilityCm2, 1e-4);
  });

  it('effective diffusion coefficients and the overall coefficient', () => {
    expectPrinted(r.layerDeff[0]!, p.effectiveDiffusionA, 1e-4); // stratum B, same soil as A
    expectPrinted(r.layerDeff[1]!, p.effectiveDiffusionC, 1e-4);
    expectPrinted(r.DT, p.effectiveDiffusionTotal, 1e-4);
    expectPrinted(r.Dcrack, p.effectiveDiffusionA, 1e-4);
  });

  it('source vapor concentration per unit soil concentration', () => {
    expectPrinted(r.sourceVapor, p.sourceVaporUgPerM3, 1e-9);
  });

  it('finite source terms and the mass-limited building concentration', () => {
    const f = r.finite!;
    expectPrinted(f.beta, p.beta);
    expectPrinted(f.psi, p.psiPerS);
    expectPrinted(f.depletionTime, p.depletionTimeS);
    expect(f.depleted).toBe(true);
    expectPrinted(r.concentration, p.massLimitBuildingUgPerM3, 1e-9);
  });

  it('the infinite-source alpha is finite and positive despite the huge Peclet exponent', () => {
    expect(r.xi).toBeGreaterThan(300);
    expect(Number.isFinite(r.alpha)).toBe(true);
    // As xi grows, alpha tends to A / (1 + A / B) (EPA Equation 12).
    const B = r.Qsoil / r.QB;
    expect(r.alpha / (r.A / (1 + r.A / B))).toBeCloseTo(1, 9);
  });

  it('an exposure interval shorter than the depletion time uses the time-averaged coefficient', () => {
    const short = jeEpaIndoor({ ...example, finiteSource: { exposureDuration: 1e6 } });
    const f = short.finite!;
    expect(f.depleted).toBe(false);
    const alpha = f.averageAlpha!;
    expect(short.concentration).toBeCloseTo(alpha * short.sourceVapor, 20);
    expect(alpha).toBeLessThan(short.alpha);
    expect(short.concentration).toBeGreaterThan(r.concentration);
  });
});

describe('soil texture presets and the capillary zone', () => {
  it('has the 12 SCS classes with the printed porosity and residual water', () => {
    expect(Object.keys(SOIL_TEXTURES)).toHaveLength(12);
    expect(soilTexture('L').porosity).toBe(0.399);
    expect(soilTexture('S').saturatedConductivity).toBeCloseTo(26.78 / 100 / 3600, 15);
    expect(soilTexture('C').bulkDensity).toBeCloseTo(1430, 9);
  });

  it('reproduces the printed capillary zone moisture and height for every class', () => {
    // epa2004je Table 10, air-entry water-filled porosity and Fetter height (cm).
    const table: Record<SoilTextureCode, [number, number]> = {
      C: [0.412, 81.5],
      CL: [0.375, 46.9],
      L: [0.332, 37.5],
      LS: [0.303, 18.8],
      SI: [0.382, 163.0],
      SIL: [0.349, 68.2],
      SIC: [0.424, 192.0],
      SICL: [0.399, 133.9],
      S: [0.253, 17.0],
      SC: [0.355, 30.0],
      SCL: [0.333, 25.9],
      SL: [0.32, 25.0],
    };
    for (const [code, [theta, h]] of Object.entries(table) as [SoilTextureCode, number[]][]) {
      const cz = capillaryZone(soilTexture(code));
      expect(Math.abs(cz.moisture - theta!), code).toBeLessThanOrEqual(0.0006);
      expect(Math.abs(cz.height * 100 - h!) / h!, code).toBeLessThanOrEqual(0.005);
    }
  });

  it('tags overridden preset values as user', () => {
    const s = stratumFromTexture('L', 1, 0.002, { moisture: 0.2 });
    expect(s.moisture).toBe(0.2);
    expect(s.provenance?.moisture).toBe('user');
    expect(s.provenance?.porosity).toBe('preset');
    expect(s.bulkDensity).toBeCloseTo(1590, 9);
  });

  it('relative air permeability limits', () => {
    expect(relativeAirPermeability(0, 0.3)).toBeCloseTo(1, 12);
    expect(relativeAirPermeability(1, 0.3)).toBeCloseTo(0, 12);
    expect(effectiveSaturation(0.148, 0.061, 0.399)).toBeCloseTo(0.2574, 4);
  });
});

describe('foundation types and Q_soil options', () => {
  const gwStrata = [stratumFromTexture('SL', 3, 0.002)];
  const base = (over: Partial<EpaJeInput> = {}): EpaJeInput => ({
    chemical: plain,
    temperature: 298.15,
    strata: gwStrata,
    floorDepth: 0.1,
    building: epaBuildingDefaults('slabOnGrade'),
    source: { kind: 'soilGas', csg: 1e-3 },
    ...over,
  });

  it('Version 6.0 residential defaults', () => {
    const d = epaBuildingDefaults('basementSlab');
    expect(d.depthBelowGrade).toBe(2);
    expect(d.mixingHeight).toBe(3.66);
    expect(d.foundationThickness).toBe(0.1);
    expect(d.crackFraction).toBe(0.001);
    expect(d.floorLength * d.floorWidth).toBeCloseTo(150, 9);
    expect(d.airExchangeRate * 3600).toBeCloseTo(0.45, 12);
    expect(epaBuildingDefaults('slabOnGrade').mixingHeight).toBe(2.44);
    expect(epaBuildingDefaults('crawlSlab').mixingHeight).toBe(1.3);
    expect(epaBuildingDefaults('crawlDirt').crackFraction).toBe(1);
  });

  it('slab types use the full alpha; dirt floors use A / (1 + A)', () => {
    const slab = jeEpaIndoor(
      base({ building: epaBuildingDefaults('basementSlab'), floorDepth: 2 }),
    );
    const dirt = jeEpaIndoor(
      base({ building: epaBuildingDefaults('basementDirt'), floorDepth: 2 }),
    );
    expect(dirt.alpha).toBeCloseTo(dirt.A / (1 + dirt.A), 14);
    expect(slab.alpha).toBeLessThan(slab.A / (1 + slab.A));
    expect(dirt.alpha).toBeGreaterThan(slab.alpha);
    expect(dirt.Qsoil).toBe(0);
    for (const f of ['basementSlab', 'crawlSlab', 'slabOnGrade'] as const) {
      const bb = epaBuildingDefaults(f);
      const rr = jeEpaIndoor(base({ building: bb, floorDepth: bb.depthBelowGrade }));
      expect(rr.concentration).toBeGreaterThan(0);
      expect(rr.concentration).toBeLessThan(rr.sourceVapor);
    }
  });

  it('default Q_soil is 0.003 Q_B at 0.45 per hour and scales as 0.45 / ER', () => {
    const d = epaBuildingDefaults('slabOnGrade');
    const r1 = jeEpaIndoor(base());
    expect(r1.Qsoil / r1.QB).toBeCloseTo(0.003, 12);
    const r2 = jeEpaIndoor(base({ building: { ...d, airExchangeRate: 0.9 / 3600 } }));
    expect(r2.Qsoil / r2.QB).toBeCloseTo(0.0015, 12);
    const r3 = jeEpaIndoor(base({ building: { ...d, soilGas: { ratio: 0.01 } } }));
    expect(r3.Qsoil / r3.QB).toBeCloseTo(0.01, 12);
    const r4 = jeEpaIndoor(base({ building: { ...d, soilGas: { Qsoil: 1e-4 } } }));
    expect(r4.Qsoil).toBe(1e-4);
  });

  it('Q_soil from the pressure difference uses the permeability of the soil at the floor', () => {
    const d = epaBuildingDefaults('slabOnGrade');
    const dP = convertGcmsToPa(40);
    const r = jeEpaIndoor(base({ building: { ...d, soilGas: { dP } } }));
    const k = r.permeability!;
    const seam = 2 * (d.floorLength + d.floorWidth);
    const rcrack = (d.crackFraction! * r.AB) / seam;
    const expected =
      (2 * Math.PI * dP * k.kv * seam) / (1.75e-5 * Math.log((2 * d.depthBelowGrade) / rcrack));
    expect(r.Qsoil).toBeCloseTo(expected, 20);
    expect(k.kv).toBeCloseTo(k.ki * k.krg, 25);
  });

  it('groundwater source: capillary zone carved from the bottom, hand-computed diffusion', () => {
    const d = epaBuildingDefaults('basementSlab');
    const strataGw = [stratumFromTexture('SL', 4, 0.002)];
    const r = jeEpaIndoor({
      chemical: plain,
      temperature: 298.15,
      strata: strataGw,
      floorDepth: 2,
      building: d,
      source: { kind: 'groundwater', cgw: 1e-3 },
    });
    const t = soilTexture('SL');
    const cz = capillaryZone(t);
    const H = 5.54e-3 / (8.205736608e-5 * 298.15);
    const D = (n: number, w: number) =>
      (benzene.Da * Math.pow(n - w, 3.33) + (benzene.Dw / H) * Math.pow(w, 3.33)) / (n * n);
    const hSoil = 4 - cz.height - 2;
    const expectedDT =
      (hSoil + cz.height) /
      (hSoil / D(t.porosity, t.moisture) + cz.height / D(cz.porosity, cz.moisture));
    expect(r.LT).toBeCloseTo(2, 12);
    expect(r.DT / expectedDT).toBeCloseTo(1, 12);
    expect(r.sourceVapor).toBeCloseTo(H * 1e-3, 15);
  });

  it('doubling the source doubles the output', () => {
    const a = jeEpaIndoor(base({ source: { kind: 'soilGas', csg: 1e-3 } }));
    const c = jeEpaIndoor(base({ source: { kind: 'soilGas', csg: 2e-3 } }));
    expect(c.concentration / a.concentration).toBeCloseTo(2, 12);
  });
});

describe('validation and warnings', () => {
  const ok: EpaJeInput = {
    chemical: plain,
    temperature: 283.15,
    strata: [stratumFromTexture('L', 3, 0.002)],
    floorDepth: 0.1,
    building: epaBuildingDefaults('slabOnGrade'),
    source: { kind: 'soil', F: 1e-6 },
  };

  it('warns when Henry stays at 25 deg C at another temperature', () => {
    const codes = jeEpaIndoor(ok).warnings.map((w) => w.code);
    expect(codes).toContain('vapor.henry-not-temperature-corrected');
    expect(jeEpaIndoor({ ...ok, temperature: 298.15 }).warnings.map((w) => w.code)).not.toContain(
      'vapor.henry-not-temperature-corrected',
    );
  });

  it('warns that a soil source is not recommended and flags a lateral offset', () => {
    const codes = jeEpaIndoor({ ...ok, sourceNotUnderBuilding: true }).warnings.map((w) => w.code);
    expect(codes).toContain('vapor.soil-source-not-recommended');
    expect(codes).toContain('vapor.lateral-offset');
  });

  it('reports an advection-dominated entry for the example', () => {
    expect(jeEpaIndoor(example).warnings.map((w) => w.code)).toContain('vapor.advection-dominated');
  });

  it('rejects a floor below the source, a capillary zone reaching the floor, and a bad finite source', () => {
    expect(() =>
      jeEpaIndoor({ ...ok, floorDepth: 3.5, building: { ...ok.building, depthBelowGrade: 3.5 } }),
    ).toThrow(RangeError);
    expect(() =>
      jeEpaIndoor({
        ...ok,
        source: { kind: 'groundwater', cgw: 1e-3 },
        strata: [stratumFromTexture('SI', 0.5, 0.002)],
      }),
    ).toThrow(/capillary zone/);
    expect(() => jeEpaIndoor({ ...ok, finiteSource: { exposureDuration: 1e9 } })).toThrow(
      RangeError,
    );
    expect(() => jeEpaIndoor({ ...ok, floorDepth: 0.2 })).toThrow(RangeError);
    expect(() =>
      jeEpaIndoor({
        ...ok,
        source: { kind: 'soil', F: 1e-6 },
        chemical: noKoc,
      }),
    ).toThrow(RangeError);
  });

  it('a zero source gives zero', () => {
    expect(jeEpaIndoor({ ...ok, source: { kind: 'soilGas', csg: 0 } }).concentration).toBe(0);
  });
});

describe('vapor.je-epa descriptor', () => {
  it('is modern, in the default registry, and cites only used references', () => {
    expect(vaporJeEpa.kind).toBe('modern');
    expect(registry.has('vapor.je-epa')).toBe(true);
    expect(registry.has('vapor.je-1991')).toBe(true);
    expect(registry.has('vapor.dominant-layer-1998')).toBe(true);
    const byKey = new Map(references.map((x) => [x.key, x]));
    for (const k of vaporJeEpa.citations) expect(byKey.get(k)?.status).toBe('used');
  });
});
