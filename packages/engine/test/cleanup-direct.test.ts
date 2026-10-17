import { describe, expect, it } from 'vitest';
import {
  backCalculateLegacy,
  backCalculateModern,
  type DirectChemical,
} from '../src/processes/cleanup/direct.js';
import {
  resolveConcentrationTarget,
  resolveRiskTargets,
} from '../src/processes/cleanup/targets.js';
import { legacyPathway } from '../src/processes/exposure/legacy.js';
import { modernPathway } from '../src/processes/exposure/modern.js';
import {
  modernChemical,
  modernResident,
  modernWorker,
  type ModernChemicalBoundary,
} from '../src/processes/exposure/receptorsModern.js';
import {
  LEGACY_PRESETS,
  legacyReceptor as legacyRec,
} from '../src/processes/exposure/receptorsLegacy.js';
import { mgPerLToKgPerM3, type PathwayId } from '../src/processes/exposure/units.js';
import rsl from './fixtures/exposure/rsl-2024-11.json' with { type: 'json' };
import cleanup from './fixtures/cleanup/rsl-2024-11-cleanup.json' with { type: 'json' };
import { legacyBenzene } from './scenarioHelpers.js';

const boundaries = rsl.chemicals as unknown as Record<string, ModernChemicalBoundary>;
const chem = (key: string) => modernChemical(boundaries[key]!);
const resident = modernResident();
const TAP: PathwayId[] = ['waterIngestion', 'waterDermal'];

/** Half a unit in the second significant figure of a published value. */
function withinHalfUnit(value: number, published: number): boolean {
  const unit = 10 ** (Math.floor(Math.log10(published)) - 1);
  return Math.abs(value - published) <= 0.5 * unit * (1 + 1e-9);
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

function tapWater(
  chemicals: DirectChemical<ReturnType<typeof chem>>[],
  extra: Record<string, unknown> = {},
) {
  return backCalculateModern({
    receptors: [{ label: 'resident', receptor: resident, pathways: TAP }],
    chemicals,
    ...extra,
  });
}

describe('hand case H1: benzene in tap water, modern resident', () => {
  const r = tapWater([{ id: 'benzene', chemical: chem('benzene') }]);
  const lv = r.media[0]!.levels[0]!;
  it('cancer level, child noncancer level, and the cancer endpoint limits', () => {
    expect(r.media[0]!.medium).toBe('groundwater');
    expect(rel(lv.cancerLevel!, mgPerLToKgPerM3(1.2381251e-3))).toBeLessThan(1e-7);
    expect(rel(lv.noncancerLevel!, mgPerLToKgPerM3(7.0833327e-2))).toBeLessThan(1e-7);
    expect(lv.noncancerGroup).toBe('child');
    expect(lv.limiting).toBe('cancer');
    expect(lv.level).toBe(lv.cancerLevel);
  });
  it('reports each pathway alone beside the summed level', () => {
    const rec = lv.byReceptor[0]!;
    expect(rec.byPathway.map((p) => p.pathway)).toEqual(TAP);
    const a = TAP.map((p) => modernPathway(p, resident, chem('benzene'), 1).riskPerEpc!);
    rec.byPathway.forEach((p, i) => expect(rel(p.cancerLevel!, 1e-6 / a[i]!)).toBeLessThan(1e-12));
    // summed coefficients: the combined level is below either pathway alone
    for (const p of rec.byPathway) expect(lv.level!).toBeLessThan(p.cancerLevel!);
  });
  it('forward run at the cleanup level reproduces the target', () => {
    const c = lv.level!;
    const risk = TAP.reduce((s, p) => s + modernPathway(p, resident, chem('benzene'), c).risk!, 0);
    expect(rel(risk, 1e-6)).toBeLessThan(1e-12);
  });
});

describe('fixture 4: RSL resident tap water combined levels', () => {
  for (const c of cleanup.tapWaterCombined.cases) {
    it(c.chemical, () => {
      const lv = tapWater([{ id: c.chemical, chemical: chem(c.chemical) }]).media[0]!.levels[0]!;
      const ugL = (x: number) => (x * 1e6) / 1; // kg/m^3 to ug/L
      if (c.cancer === null) expect(lv.cancerLevel).toBeNull();
      else {
        expect(withinHalfUnit(ugL(lv.cancerLevel!), c.cancer), `${ugL(lv.cancerLevel!)}`).toBe(
          true,
        );
      }
      const nc = ugL(lv.noncancerLevel!);
      expect(withinHalfUnit(nc, c.noncancer), `${nc} vs ${c.noncancer}`).toBe(true);
    });
  }
});

describe('hand case H2: cumulative proportional scaling', () => {
  const c0 = { benzene: mgPerLToKgPerM3(0.01), arsenic: mgPerLToKgPerM3(0.002) };
  const chemicals: DirectChemical<ReturnType<typeof chem>>[] = [
    { id: 'benzene', chemical: chem('benzene'), entered: { groundwater: c0.benzene } },
    { id: 'arsenic', chemical: chem('arsenic'), entered: { groundwater: c0.arsenic } },
  ];
  const r = tapWater(chemicals, { allocation: 'cumulative' });
  const m = r.media[0]!;

  // independent coefficient arithmetic
  const coef = (k: 'benzene' | 'arsenic') => {
    const cells = TAP.map((p) => modernPathway(p, resident, chem(k), 1));
    return {
      a: cells.reduce((s, x) => s + (x.riskPerEpc ?? 0), 0),
      b: ['child', 'adult'].map((g) =>
        cells.reduce((s, x) => s + (x.hqByGroup.find((h) => h.group === g)?.hqPerEpc ?? 0), 0),
      ),
    };
  };
  const cb = coef('benzene');
  const ca = coef('arsenic');
  const risk0 = cb.a * c0.benzene + ca.a * c0.arsenic;
  const hiChild = cb.b[0]! * c0.benzene + ca.b[0]! * c0.arsenic;
  const hiAdult = cb.b[1]! * c0.benzene + ca.b[1]! * c0.arsenic;
  const s = Math.min(1e-6 / risk0, 1 / Math.max(hiChild, hiAdult));

  it('scale factor is the lower of the cancer and noncancer scales (1e-9)', () => {
    expect(rel(m.scale!, s)).toBeLessThan(1e-9);
    expect(m.scaleLimiting).toBe(
      1e-6 / risk0 < 1 / Math.max(hiChild, hiAdult) ? 'cancer' : 'noncancer',
    );
  });
  it('keeps the entered ratio exactly and meets the target (identity d)', () => {
    const [b, a] = m.levels;
    expect(rel(b!.level! / a!.level!, 5)).toBeLessThan(1e-12);
    const risk = cb.a * b!.level! + ca.a * a!.level!;
    const hi = Math.max(
      cb.b[0]! * b!.level! + ca.b[0]! * a!.level!,
      cb.b[1]! * b!.level! + ca.b[1]! * a!.level!,
    );
    const g = Math.max(risk / 1e-6, hi / 1);
    expect(rel(g, 1)).toBeLessThan(1e-9);
  });
  it('warns that the hazard index is not segregated by organ', () => {
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.hi-unsegregated');
  });
  it('is independent of the magnitude of the entered concentrations', () => {
    const r2 = tapWater(
      chemicals.map((c) => ({ ...c, entered: { groundwater: c.entered!.groundwater! * 1000 } })),
      { allocation: 'cumulative' },
    );
    expect(rel(r2.media[0]!.levels[0]!.level!, m.levels[0]!.level!)).toBeLessThan(1e-9);
  });
});

describe('identity (g): individual and cumulative agree for one chemical', () => {
  it('modern and legacy', () => {
    const one: DirectChemical<ReturnType<typeof chem>> = {
      id: 'benzene',
      chemical: chem('benzene'),
      entered: { groundwater: 3e-5 },
    };
    const ind = tapWater([one]).media[0]!.levels[0]!.level!;
    const cum = tapWater([one], { allocation: 'cumulative' }).media[0]!.levels[0]!.level!;
    expect(rel(cum, ind)).toBeLessThan(1e-12);
  });
});

describe('equal allocation', () => {
  it('divides each target by the number of chemicals carrying a value', () => {
    const chemicals = [
      { id: 'benzene', chemical: chem('benzene') },
      { id: 'arsenic', chemical: chem('arsenic') },
      { id: 'zinc', chemical: chem('zinc') },
    ];
    const ind = tapWater(chemicals).media[0]!;
    const eq = tapWater(chemicals, { allocation: 'equal' }).media[0]!;
    // cancer: benzene and arsenic (2); noncancer: all three (3)
    const b = ind.levels[0]!;
    const e = eq.levels[0]!;
    expect(rel(e.cancerLevel!, b.cancerLevel! / 2)).toBeLessThan(1e-12);
    expect(rel(e.noncancerLevel!, b.noncancerLevel! / 3)).toBeLessThan(1e-12);
    const z = eq.levels[2]!;
    expect(z.cancerLevel).toBeNull();
    expect(rel(z.noncancerLevel!, ind.levels[2]!.noncancerLevel! / 3)).toBeLessThan(1e-12);
  });
});

describe('media, receptors and the legacy method', () => {
  it('gives each medium its own level from its own pathways', () => {
    const r = backCalculateModern({
      receptors: [
        {
          label: 'resident',
          receptor: resident,
          pathways: ['soilIngestion', 'soilDermal', 'waterIngestion'],
        },
      ],
      chemicals: [{ id: 'arsenic', chemical: chem('arsenic') }],
    });
    expect(r.media.map((m) => m.medium).sort()).toEqual(['groundwater', 'soil']);
    const soil = r.media.find((m) => m.medium === 'soil')!.levels[0]!;
    const sum = (['soilIngestion', 'soilDermal'] as const).reduce(
      (s, p) => s + modernPathway(p, resident, chem('arsenic'), 1).riskPerEpc!,
      0,
    );
    expect(rel(soil.cancerLevel!, 1e-6 / sum)).toBeLessThan(1e-12);
  });

  it('two non-additive receptors: each has a level and the lower is reported', () => {
    const r = backCalculateModern({
      receptors: [
        { label: 'resident', receptor: resident, pathways: ['soilIngestion'] },
        { label: 'worker', receptor: modernWorker(), pathways: ['soilIngestion'] },
      ],
      chemicals: [{ id: 'arsenic', chemical: chem('arsenic') }],
    });
    const lv = r.media[0]!.levels[0]!;
    expect(lv.byReceptor).toHaveLength(2);
    const lows = lv.byReceptor.map((x) => x.level!);
    expect(lv.level).toBe(Math.min(...lows));
    expect(lv.limitingReceptor).toBe(lows[0]! <= lows[1]! ? 'resident' : 'worker');
  });

  const legacyChem = { ...legacyBenzene };

  it('legacy: summed coefficients and the single group "total"', () => {
    const a = legacyRec({
      ...LEGACY_PRESETS.residentAdultOnly,
      etHoursPerDay: { waterDermal: 0.2 },
    });
    const r = backCalculateLegacy({
      receptors: [{ label: 'adult', receptor: a, pathways: TAP }],
      chemicals: [{ id: 'benzene', chemical: legacyChem }],
    });
    const lv = r.media[0]!.levels[0]!;
    const cells = TAP.map((p) => legacyPathway(p, { cancer: 1, noncancer: 1 }, a, legacyChem));
    const A = cells.reduce((s, x) => s + (x.riskPerEpc ?? 0), 0);
    const B = cells.reduce((s, x) => s + (x.hqPerEpc ?? 0), 0);
    expect(rel(lv.cancerLevel!, 1e-6 / A)).toBeLessThan(1e-12);
    expect(rel(lv.noncancerLevel!, 1 / B)).toBeLessThan(1e-12);
    expect(lv.noncancerGroup).toBe('total');
  });

  it('legacy additive option: cancer coefficients add, noncancer stays per receptor', () => {
    const a = legacyRec({ ...LEGACY_PRESETS.residentAdult, etHoursPerDay: { waterDermal: 0.2 } });
    const c = legacyRec({
      ...LEGACY_PRESETS.residentChild,
      waterIngestionLPerDay: 1,
      etHoursPerDay: { waterDermal: 0.2 },
    });
    const input = {
      receptors: [
        { label: 'adult', receptor: a, pathways: TAP },
        { label: 'child', receptor: c, pathways: TAP },
      ],
      chemicals: [{ id: 'benzene', chemical: legacyChem }],
    };
    const sep = backCalculateLegacy(input).media[0]!.levels[0]!;
    const add = backCalculateLegacy({ ...input, additive: true }).media[0]!.levels[0]!;
    const ra = sep.byReceptor.map((x) => 1e-6 / x.cancerLevel!);
    // 1 / cancer level is the summed coefficient
    expect(rel(1e-6 / add.cancerLevel!, ra[0]! + ra[1]!)).toBeLessThan(1e-12);
    expect(add.noncancerLevel).toBe(sep.noncancerLevel);
    expect(add.cancerLevel!).toBeLessThan(sep.cancerLevel!);
  });
});

describe('warnings and refusals', () => {
  it('not quantified: no toxicity value for any linked pathway gives a null level', () => {
    const noTox = { ...boundaries.zinc!, rfdo: undefined } as ModernChemicalBoundary;
    const r = tapWater([{ id: 'x', chemical: modernChemical(noTox) }]);
    const lv = r.media[0]!.levels[0]!;
    expect(lv.level).toBeNull();
    expect(lv.limiting).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.not-quantified');
  });

  it('a cancer target above 0.01 is accepted and warned', () => {
    const r = tapWater([{ id: 'benzene', chemical: chem('benzene') }], {
      targets: { risk: 0.05 },
    });
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.target-above-0.01');
    expect(r.media[0]!.levels[0]!.level).not.toBeNull();
  });

  it('a soil level above Csat is warned', () => {
    const r = backCalculateModern({
      receptors: [{ label: 'resident', receptor: resident, pathways: ['soilIngestion'] }],
      chemicals: [{ id: 'acetone', chemical: chem('acetone') }],
      targets: { hq: 1e9 },
    });
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.csat-exceeded');
  });

  it('a groundwater level above the solubility is warned', () => {
    const r = tapWater([{ id: 'benzene', chemical: chem('benzene'), solubility: 1e-12 }]);
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.above-solubility');
  });

  it('refuses concentration targets in cumulative and equal modes', () => {
    for (const allocation of ['cumulative', 'equal'] as const) {
      expect(() =>
        tapWater(
          [
            {
              id: 'benzene',
              chemical: chem('benzene'),
              entered: { groundwater: 1e-5 },
              concentrationTarget: { kind: 'user', value: 5e-6 },
            },
          ],
          { allocation },
        ),
      ).toThrow(RangeError);
    }
  });

  it('refuses a bad target, a duplicate chemical and a concentration target without groundwater', () => {
    const b = { id: 'benzene', chemical: chem('benzene') };
    expect(() => tapWater([b], { targets: { risk: 0 } })).toThrow(RangeError);
    expect(() => tapWater([b], { targets: { hq: Number.NaN } })).toThrow(RangeError);
    expect(() => tapWater([b, b])).toThrow(RangeError);
    expect(() =>
      backCalculateModern({
        receptors: [{ label: 'r', receptor: resident, pathways: ['soilIngestion'] }],
        chemicals: [{ ...b, concentrationTarget: { kind: 'user', value: 1e-6 } }],
      }),
    ).toThrow(RangeError);
  });

  it('cumulative needs an entered concentration for a quantified chemical', () => {
    expect(() =>
      tapWater([{ id: 'benzene', chemical: chem('benzene') }], { allocation: 'cumulative' }),
    ).toThrow(RangeError);
  });
});

describe('concentration targets (groundwater, individual mode)', () => {
  it('a user target replaces the risk targets and names the concentration endpoint', () => {
    const lv = tapWater([
      {
        id: 'benzene',
        chemical: chem('benzene'),
        concentrationTarget: { kind: 'user', value: 5e-6 },
      },
    ]).media[0]!.levels[0]!;
    expect(lv.level).toBe(5e-6);
    expect(lv.limiting).toBe('concentration');
    expect(lv.cancerLevel).not.toBeNull(); // risk levels still reported beside it
  });
  it('an MCL target uses the database value and warns on a group value', () => {
    const r = tapWater([
      {
        id: 'benzene',
        chemical: chem('benzene'),
        concentrationTarget: { kind: 'mcl' },
        mcl: { value: 5e-6, group: true },
      },
    ]);
    expect(r.media[0]!.levels[0]!.level).toBe(5e-6);
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.mcl-group-value');
  });
  it('a missing MCL leaves the risk targets in force and warns', () => {
    const r = tapWater([
      { id: 'benzene', chemical: chem('benzene'), concentrationTarget: { kind: 'mcl' } },
    ]);
    const lv = r.media[0]!.levels[0]!;
    expect(lv.limiting).toBe('cancer');
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.mcl-missing');
  });
});

describe('targets module', () => {
  it('defaults to 1e-6 and 1 and validates', () => {
    expect(resolveRiskTargets().risk).toBe(1e-6);
    expect(resolveRiskTargets().hq).toBe(1);
    expect(resolveRiskTargets({ risk: 1e-4, hq: 0.5 })).toMatchObject({ risk: 1e-4, hq: 0.5 });
    expect(() => resolveRiskTargets({ hq: -1 })).toThrow(RangeError);
    expect(() => resolveRiskTargets({ risk: Infinity })).toThrow(RangeError);
  });
  it('resolves a concentration target', () => {
    expect(() => resolveConcentrationTarget('x', { kind: 'user', value: 0 })).toThrow(RangeError);
    expect(resolveConcentrationTarget('x', { kind: 'user', value: 2e-6 }).value).toBe(2e-6);
    expect(resolveConcentrationTarget('x', { kind: 'mcl' }, { value: 3e-6 }).value).toBe(3e-6);
    expect(resolveConcentrationTarget('x', { kind: 'mcl' }).value).toBeNull();
  });
});
