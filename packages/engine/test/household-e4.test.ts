import { describe, expect, it } from 'vitest';
import r9 from './fixtures/exposure/r9.json' with { type: 'json' };
import { registry, references } from '../src/index.js';
import {
  groundwaterBreakthrough,
  constantEpc,
  legacyPathway,
  legacyReceptor,
  LEGACY_PRESETS,
  type EpcSpec,
} from '../src/processes/exposure/index.js';
import { outdoorAirEpc } from '../src/processes/outdoorAir/index.js';
import {
  showerLegacyStall,
  showerLittle,
  showerHouseholdAir,
} from '../src/processes/shower/index.js';
import {
  sprinklerAir,
  irrigationEpcs,
  type SprinklerInput,
} from '../src/processes/irrigation/index.js';
import {
  particulateBoxEmission,
  particulatePefDirect,
  pef1996Default,
  PARTICULATE_DEFAULTS,
  windErosionFlux,
} from '../src/processes/particulate/index.js';
import { backCalculateLegacy } from '../src/processes/cleanup/direct.js';
import {
  waterConcentrationAt,
  waterDrivenEpc,
  irrigationEpcSpecs,
  sprinklerOutdoorEmission,
  sourceLevelsOverCoefficient,
} from '../src/processes/household/index.js';

const Y = 365.25 * 86400;
const refs = { gasCmPerH: 3000, liquidCmPerH: 20 };
const shower = {
  henry: 0.2,
  molecularWeight: 78,
  dropletDiameter: 1e-3,
  fallTime: 1,
  waterFlow: 1e-4,
  showerTime: 600,
  stallVolume: 2,
  filmReferences: refs,
};
const sp: SprinklerInput = {
  henry: 0.2,
  molecularWeight: 78,
  dropletDiameter: 2e-3,
  fallTime: 2,
  sprinklerFlow: 2e-4,
  filmReferences: refs,
};
const box = { height: 2, windSpeed: 2, width: 3 };

const well: EpcSpec = groundwaterBreakthrough(
  (t) => ({ concentrations: [1e-3 * Math.min(1, t / (10 * Y)), 1e-3 * Math.min(1, t / (10 * Y))] }),
  [0, 5 * Y, 10 * Y, 20 * Y],
  'groundwater.domenico',
);

describe('water-driven EPC adapters', () => {
  it('interpolates a series and returns a constant unchanged', () => {
    expect(waterConcentrationAt(constantEpc('waterIngestion', 2), 123)).toBeCloseTo(2e-3, 15);
    expect(waterConcentrationAt(well, 2.5 * Y)).toBeCloseTo(0.25e-3, 12);
  });

  it('tags a shower series with the method id and equals coefficient times the water series', () => {
    const f = (cw: number) => showerLittle({ ...shower, gasFlow: 0.01, waterConcentration: cw });
    const epc = waterDrivenEpc(well, f, 'shower.little-1992');
    expect(epc.origin).toBe('shower.little-1992');
    expect(epc.kind).toBe('series');
    if (epc.kind !== 'series' || well.kind !== 'series') throw new Error('series expected');
    const k = f(1).coefficient;
    well.series.values.forEach((v, i) => expect(epc.series.values[i]).toBeCloseTo(k * v, 18));
    expect(epc.series.times).toEqual(well.series.times);
  });

  it('a constant water concentration gives a constant EPC', () => {
    const f = (cw: number) => showerLegacyStall({ ...shower, waterConcentration: cw });
    const epc = waterDrivenEpc(constantEpc('waterIngestion', 0.5), f, 'shower.fc-1986');
    expect(epc).toEqual({
      kind: 'constant',
      value: f(0.5e-3).concentration,
      origin: 'shower.fc-1986',
    });
  });

  it('irrigation EPCs carry the irrigation origins and the sprayed air equals the box value', () => {
    const p = { sprinkler: sp, box, applicationRate: 1e-7, chemical: 'benzene' };
    const e = irrigationEpcSpecs(well, p);
    expect(e.ingestion.origin).toBe('irrigation.pathways');
    expect(e.dermal.origin).toBe('irrigation.pathways');
    expect(e.sprayAir.origin).toBe('irrigation.sprinkler-fc');
    if (e.sprayAir.kind !== 'series' || well.kind !== 'series') throw new Error('series expected');
    const cw = well.series.values[2]!;
    expect(e.sprayAir.series.values[2]).toBeCloseTo(irrigationEpcs(cw, p).sprayAir, 18);
  });

  it('the sprinkler emission follows the water series through outdoorAirEpc', () => {
    const em = sprinklerOutdoorEmission(well, sp);
    const out = outdoorAirEpc({
      box: { length: 10, width: 3, height: 2, windSpeed: 2 },
      emissions: [em],
      direct: [],
    });
    const t = 7 * Y;
    const cw = waterConcentrationAt(well, t);
    expect(out.contributions[0]!.origin).toBe('irrigation.sprinkler-fc');
    expect(out.concentration(t)).toBeCloseTo(sprinklerAir(cw, sp, box).concentration, 18);
  });

  it('legacy and modern particulate contributions enter outdoorAirEpc with their origins and warn when mixed', () => {
    const cs = 1e-4;
    const flux = windErosionFlux(PARTICULATE_DEFAULTS);
    const legacy = particulateBoxEmission('particulate.box-emission', flux, cs);
    const modern = particulatePefDirect('particulate.ssg-pef-1996', cs, pef1996Default());
    const both = outdoorAirEpc({
      box: { length: 10, width: 3, height: 2, windSpeed: 2 },
      emissions: [legacy],
      direct: [modern],
    });
    expect(both.contributions.map((c) => c.origin)).toEqual([
      'particulate.box-emission',
      'particulate.ssg-pef-1996',
    ]);
    expect(both.warnings.map((w) => w.code)).toContain('outdoorAir.mixed-dispersion');
  });
});

describe('M5 cleanup levels over the coefficient', () => {
  const receptor = legacyReceptor({
    ...LEGACY_PRESETS.residentAdult,
    etHoursPerDay: { showerInhalation: 0.2 },
  });
  const chem = { iur: 7.8e-6 / 1e-9 / 1000, rfc: 3e-5 };
  const direct = backCalculateLegacy({
    receptors: [{ label: 'resident', receptor, pathways: ['showerInhalation'] }],
    chemicals: [{ id: 'benzene', chemical: chem }],
  });

  it('the water level equals the air level over the stall coefficient, and the forward run returns the target', () => {
    const airLevel = direct.media[0]!.levels[0]!.level!;
    const k = showerLegacyStall({ ...shower, waterConcentration: 1 }).coefficient;
    const [lv] = sourceLevelsOverCoefficient(direct, 'bathroomAir', { benzene: k });
    expect(lv!.level).toBeCloseTo(airLevel / k, 12);
    const back = showerLegacyStall({ ...shower, waterConcentration: lv!.level! });
    expect(back.concentration).toBeCloseTo(airLevel, 12);
    const cell = legacyPathway(
      'showerInhalation',
      { cancer: back.concentration, noncancer: back.concentration },
      receptor,
      chem,
    );
    expect(cell.risk).toBeCloseTo(1e-6, 12);
  });

  it('equals target over (pathway coefficient times model coefficient) for Little and the household term', () => {
    const cell = legacyPathway('showerInhalation', { cancer: 1, noncancer: 1 }, receptor, chem);
    const kL = showerLittle({ ...shower, gasFlow: 0.01, waterConcentration: 1 }).coefficient;
    const [l] = sourceLevelsOverCoefficient(direct, 'bathroomAir', { benzene: kL });
    const cancer = 1e-6 / (cell.riskPerEpc! * kL);
    const nonc = 1 / (cell.hqPerEpc! * kL);
    expect(l!.level).toBeCloseTo(Math.min(cancer, nonc), 12);
    const hh = showerHouseholdAir({
      waterConcentration: 1,
      transferFactorLPerM3: 0.5,
      volatile: true,
    });
    const [h] = sourceLevelsOverCoefficient(direct, 'bathroomAir', { benzene: hh.coefficient });
    expect(h!.level).toBeCloseTo(
      Math.min(1e-6 / (cell.riskPerEpc! * hh.coefficient), 1 / (cell.hqPerEpc! * hh.coefficient)),
      12,
    );
  });

  it('a zero coefficient (not volatile) gives no level, with a warning', () => {
    const [z] = sourceLevelsOverCoefficient(direct, 'bathroomAir', { benzene: 0 });
    expect(z!.level).toBeNull();
    expect(z!.warnings.map((w) => w.code)).toContain('cleanup.zero-coefficient');
  });

  it('rejects a medium the direct result does not contain', () => {
    expect(() => sourceLevelsOverCoefficient(direct, 'outdoorAir', { benzene: 1 })).toThrow(
      RangeError,
    );
  });
});

describe('M7 methods in the registry', () => {
  const ids = {
    shower: ['shower.fc-1986', 'shower.little-1992', 'shower.rsl-household'],
    irrigation: ['irrigation.sprinkler-fc', 'irrigation.pathways'],
    particulate: [
      'particulate.box-emission',
      'particulate.ssg-pef-1996',
      'particulate.ssg-pef-2002',
    ],
  };

  it('registers eight methods with legacy and modern kinds per process', () => {
    for (const [process, list] of Object.entries(ids)) {
      expect(registry.list(process as 'shower').map((m) => m.id)).toEqual(list);
      expect(registry.list(process as 'shower', 'legacy').length).toBeGreaterThan(0);
      expect(registry.list(process as 'shower', 'modern').length).toBeGreaterThan(0);
    }
  });

  it('cites only references that exist and are used, and the flips are exactly the cited ones', () => {
    const used = new Map(references.map((r) => [r.key, r.status]));
    for (const id of Object.values(ids).flat()) {
      const m = registry.get(id);
      expect(m.citations.length, id).toBeGreaterThan(0);
      expect(m.assumptions.length, id).toBeGreaterThan(0);
      for (const key of m.citations) expect(used.get(key), `${id} ${key}`).toBe('used');
    }
    expect(registry.get('shower.little-1992').citations).toContain('little1992');
    expect(registry.get('particulate.ssg-pef-2002').citations).toContain('epa2002ssg');
    expect(registry.get('shower.fc-1986').risc5Choice).toBeTruthy();
    expect(registry.get('particulate.box-emission').risc5Choice).toBeTruthy();
    expect(used.get('foster1986')).toBe('planned');
  });

  it('run equals the module functions', () => {
    const little = registry.get('shower.little-1992').run({
      ...shower,
      gasFlow: 0.01,
      waterConcentration: 1e-3,
    });
    expect(little).toEqual(showerLittle({ ...shower, gasFlow: 0.01, waterConcentration: 1e-3 }));
    const legacy = registry.get('shower.fc-1986').run({ ...shower, waterConcentration: 1e-3 });
    expect(legacy).toEqual(showerLegacyStall({ ...shower, waterConcentration: 1e-3 }));
    const spr = registry.get('irrigation.sprinkler-fc').run({
      waterConcentration: 1e-3,
      sprinkler: sp,
      box,
    });
    expect(spr).toEqual(sprinklerAir(1e-3, sp, box));
    const pef = registry.get('particulate.ssg-pef-1996').run({ soilConcentration: 1e-4 }) as {
      pef: number;
      concentration: number;
    };
    expect(pef.pef).toBeCloseTo(pef1996Default(), 3);
    expect(pef.concentration).toBeCloseTo(1e-4 / pef1996Default(), 20);
    const p2 = registry.get('particulate.ssg-pef-2002').run({
      soilConcentration: 1e-4,
      station: 'Minneapolis, MN',
      areaAcres: 0.5,
    }) as { pef: number };
    expect(p2.pef / 1.36e9).toBeGreaterThan(0.995);
    expect(p2.pef / 1.36e9).toBeLessThan(1.005);
  });

  it('warns for a volatile chemical on a particulate pathway and for the film defaults', () => {
    const m = registry.get('particulate.ssg-pef-1996');
    const w = m.validate!({ soilConcentration: 1e-4, volatile: true });
    expect(w.map((x) => x.code)).toContain('particulate.volatile-chemical');
    const s = registry.get('shower.fc-1986');
    const noRefs = { ...shower, filmReferences: undefined };
    expect(s.validate!({ ...noRefs, waterConcentration: 1e-3 }).map((x) => x.code)).toContain(
      'shower.film-reference-unverified',
    );
  });
});

describe('Table R-9 shower inhalation rows', () => {
  it('are a named exception recorded in the fixture and no longer an open deferral', () => {
    expect(r9.namedExceptions.map((e) => e.row)).toEqual(['Inhalation in Shower']);
    expect(r9.namedExceptions[0]!.reason.length).toBeGreaterThan(20);
    expect(r9.deferred).toEqual(['Ingestion of Root Vegetables (M9)']);
  });
});
