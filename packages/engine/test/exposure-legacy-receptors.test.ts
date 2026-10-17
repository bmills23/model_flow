import { describe, expect, it } from 'vitest';
import { legacyPathway, legacyInhalationValues } from '../src/processes/exposure/legacy.js';
import {
  LEGACY_PRESETS,
  evaluateLegacyReceptor,
  evaluateLegacyRun,
  legacyReceptor,
  type LegacyReceptorRun,
} from '../src/processes/exposure/receptorsLegacy.js';
import {
  doseFromMgPerKgDay,
  iurFromPerUgM3,
  mgPerKgToKgPerKg,
  mgPerLToKgPerM3,
  mgPerM3ToKgPerM3,
  rfcFromMgPerM3,
  rfdFromMgPerKgDay,
  sfFromPerMgKgDay,
  sfToPerMgKgDay,
} from '../src/processes/exposure/units.js';

const adult = legacyReceptor({ ...LEGACY_PRESETS.residentAdultOnly });
const benzene = {
  sfo: sfFromPerMgKgDay(0.055),
  rfdo: rfdFromMgPerKgDay(0.004),
  iur: iurFromPerUgM3(7.8e-6),
  rfc: rfcFromMgPerM3(0.03),
  aaf: 0.1,
  kp: 4e-9,
};
const water = mgPerLToKgPerM3(0.01);

describe('legacy presets (epa1991sdef, rags1989 exhibits)', () => {
  it('carry the 1991 default factors', () => {
    const a = LEGACY_PRESETS.residentAdult;
    expect([
      a.bwKg,
      a.efDaysPerYr,
      a.edYr,
      a.waterIngestionLPerDay,
      a.soilIngestionMgPerDay,
    ]).toEqual([70, 350, 24, 2, 100]);
    expect(LEGACY_PRESETS.residentAdultOnly.edYr).toBe(30);
    const c = LEGACY_PRESETS.residentChild;
    expect([c.bwKg, c.edYr, c.soilIngestionMgPerDay]).toEqual([15, 6, 200]);
    const w = LEGACY_PRESETS.worker;
    expect([w.efDaysPerYr, w.edYr, w.waterIngestionLPerDay, w.soilIngestionMgPerDay]).toEqual([
      250, 25, 1, 50,
    ]);
    // 20 m3 per workday over an 8 h day
    expect(w.inhalationM3PerHour).toBeCloseTo(2.5, 12);
  });

  it('leave pathway-specific entries blank, so those pathways need entries', () => {
    const r = legacyReceptor(LEGACY_PRESETS.residentAdult);
    const cell = legacyPathway('waterDermal', { cancer: water, noncancer: water }, r, benzene);
    expect(cell.computable).toBe(false);
    expect(cell.missing).toEqual(['etByPathway.waterDermal']);
    expect(cell.risk).toBeNull();
    const soil = legacyPathway('soilDermal', { cancer: 1e-6, noncancer: 1e-6 }, r, benzene);
    expect(soil.missing).toEqual(['soilSkinArea', 'soilAdherence']);
  });
});

describe('inhalation conversions', () => {
  it('SFi = IUR x 70 / 20 x 1000 and RfDi = RfC x 20 / 70 in RISC units', () => {
    const v = legacyInhalationValues(benzene);
    expect(sfToPerMgKgDay(v.sfi!)).toBeCloseTo(7.8e-6 * 3.5 * 1000, 12);
    expect(v.rfdi! / doseFromMgPerKgDay(1)).toBeCloseTo((0.03 * 20) / 70, 12);
    expect(legacyInhalationValues({ sfo: 1 })).toEqual({});
  });

  it('keeps the 20 m3/d and 70 kg conversion for a receptor that breathes and weighs otherwise', () => {
    const child = legacyReceptor({
      bwKg: 15,
      edYr: 6,
      efDaysPerYr: 350,
      inhalationM3PerHour: 10 / 24,
      etHoursPerDay: { indoorInhalation: 24 },
    });
    const air = mgPerM3ToKgPerM3(0.001);
    const cell = legacyPathway('indoorInhalation', { cancer: air, noncancer: air }, child, benzene);
    // dose uses the child's 10 m3/d and 15 kg, the toxicity value the standard adult's
    const dose = ((0.001 * 10) / 15) * (350 / 365);
    expect(cell.cadd! / doseFromMgPerKgDay(dose)).toBeCloseTo(1, 12);
    expect(cell.hq! / (dose / ((0.03 * 20) / 70))).toBeCloseTo(1, 12);
  });
});

describe('route extrapolation', () => {
  const air = mgPerM3ToKgPerM3(0.01);
  const oralOnly = { sfo: sfFromPerMgKgDay(0.1), rfdo: rfdFromMgPerKgDay(0.5) };
  const r = legacyReceptor({
    ...LEGACY_PRESETS.residentAdultOnly,
  });

  it('is off by default: no inhalation value gives null', () => {
    const c = legacyPathway('indoorInhalation', { cancer: air, noncancer: air }, r, oralOnly);
    expect(c.computable).toBe(true);
    expect(c.risk).toBeNull();
    expect(c.hq).toBeNull();
    expect(c.extrapolated).toBe(false);
  });

  it('when on, takes the oral dose-based values for inhalation and flags it', () => {
    const c = legacyPathway('indoorInhalation', { cancer: air, noncancer: air }, r, oralOnly, {
      routeExtrapolation: true,
    });
    expect(c.risk! / (oralOnly.sfo * c.ladd!)).toBeCloseTo(1, 12);
    expect(c.hq! / (c.cadd! / oralOnly.rfdo)).toBeCloseTo(1, 12);
    expect(c.extrapolated).toBe(true);
  });

  it('does not flag a chemical whose route values exist', () => {
    const c = legacyPathway('indoorInhalation', { cancer: air, noncancer: air }, r, benzene, {
      routeExtrapolation: true,
    });
    expect(c.extrapolated).toBe(false);
  });
});

describe('BIO and other soil terms', () => {
  it('scales soil ingestion by BIO, default 1', () => {
    const c = mgPerKgToKgPerKg(10);
    const a = legacyPathway('soilIngestion', { cancer: c, noncancer: c }, adult, benzene);
    const b = legacyPathway('soilIngestion', { cancer: c, noncancer: c }, adult, {
      ...benzene,
      bio: 0.6,
    });
    expect(b.risk! / a.risk!).toBeCloseTo(0.6, 12);
  });
});

describe('legacy identities', () => {
  const swimmer = legacyReceptor({
    ...LEGACY_PRESETS.residentAdultOnly,
    efDaysPerYrByPathway: { swimIngestion: 7, swimDermal: 7 },
    etHoursPerDay: { swimIngestion: 2.6, swimDermal: 2.6, waterDermal: 0.2, indoorInhalation: 24 },
  });

  it('uses the pathway frequency override for swimming', () => {
    const e = { cancer: water, noncancer: water };
    const swim = legacyPathway('swimIngestion', e, swimmer, benzene);
    // 50 mL/h x 2.6 h/d x 7 d/yr, per kg, over 365 d
    const dose = (0.01 * 50e-3 * 2.6 * 7) / 70 / 365;
    expect(swim.cadd! / doseFromMgPerKgDay(dose)).toBeCloseTo(1, 12);
  });

  it('is linear in the EPC: doubling doubles risk and HQ, and coefficients reproduce them', () => {
    for (const p of ['waterIngestion', 'waterDermal', 'indoorInhalation', 'swimDermal'] as const) {
      const one = legacyPathway(p, { cancer: water, noncancer: water }, swimmer, benzene);
      const two = legacyPathway(p, { cancer: 2 * water, noncancer: 2 * water }, swimmer, benzene);
      expect(two.risk! / one.risk!).toBeCloseTo(2, 12);
      expect(two.hq! / one.hq!).toBeCloseTo(2, 12);
      expect(one.riskPerEpc! * water).toBeCloseTo(one.risk!, 18);
      expect(one.hqPerEpc! * water).toBeCloseTo(one.hq!, 12);
    }
  });

  it('uses the cancer EPC for risk and the noncancer EPC for the hazard quotient', () => {
    const c = legacyPathway(
      'waterIngestion',
      { cancer: water, noncancer: 3 * water },
      swimmer,
      benzene,
    );
    const ref = legacyPathway(
      'waterIngestion',
      { cancer: water, noncancer: water },
      swimmer,
      benzene,
    );
    expect(c.risk).toBeCloseTo(ref.risk!, 18);
    expect(c.hq! / ref.hq!).toBeCloseTo(3, 12);
  });
});

function run(label: string, over: Partial<LegacyReceptorRun> = {}): LegacyReceptorRun {
  return {
    label,
    receptor: adult,
    pathways: ['waterIngestion', 'indoorInhalation'],
    chemicals: [
      {
        id: 'benzene',
        chemical: benzene,
        epcs: { waterIngestion: water, indoorInhalation: mgPerM3ToKgPerM3(0.001) },
      },
    ],
    ...over,
  };
}

describe('receptor totals and the two-receptor run', () => {
  it('sums risks and hazard quotients over pathways and chemicals within a receptor', () => {
    const r = evaluateLegacyReceptor(
      run('A', {
        chemicals: [
          {
            id: 'benzene',
            chemical: benzene,
            epcs: { waterIngestion: water, indoorInhalation: mgPerM3ToKgPerM3(0.001) },
          },
          {
            id: 'toluene',
            chemical: { rfdo: rfdFromMgPerKgDay(0.08) },
            epcs: { waterIngestion: water },
          },
        ],
      }),
    );
    // L1 values for benzene
    expect(r.byChemical['benzene']!.risk).toBeCloseTo(6.4579256e-6 + 3.2054795e-6, 12);
    expect(r.totals.risk).toBeCloseTo(r.byChemical['benzene']!.risk, 18);
    expect(r.totals.hi).toBeCloseTo(r.byChemical['benzene']!.hi + r.byChemical['toluene']!.hi, 15);
    // toluene has no inhalation EPC here, and no cancer value: not quantified for cancer
    expect(r.cells.find((c) => c.chemical === 'toluene')!.cell.risk).toBeNull();
    expect(r.warnings.some((w) => w.code === 'exposure.not-quantified')).toBe(true);
  });

  it('additive option equals the sum of the two cancer risks and leaves each HI unchanged', () => {
    const a = run('A');
    const b = run('B', {
      receptor: legacyReceptor(LEGACY_PRESETS.residentChild),
      pathways: ['waterIngestion'],
    });
    const b2 = {
      ...b,
      receptor: legacyReceptor({ ...LEGACY_PRESETS.residentChild, waterIngestionLPerDay: 1 }),
    };
    const alone = [evaluateLegacyReceptor(a), evaluateLegacyReceptor(b2)];
    const both = evaluateLegacyRun([a, b2], { additive: true });
    expect(both.additiveCancerRisk).toBeCloseTo(alone[0]!.totals.risk + alone[1]!.totals.risk, 18);
    expect(both.receptors[0]!.totals.hi).toBe(alone[0]!.totals.hi);
    expect(both.receptors[1]!.totals.hi).toBe(alone[1]!.totals.hi);
    expect(evaluateLegacyRun([a, b2]).additiveCancerRisk).toBeNull();
  });

  it('rejects more than two receptors and a lone additive receptor', () => {
    const a = run('A');
    expect(() => evaluateLegacyRun([a, a, a])).toThrow(RangeError);
    expect(() => evaluateLegacyRun([])).toThrow(RangeError);
    expect(() => evaluateLegacyRun([a], { additive: true })).toThrow(RangeError);
  });

  it('rejects a pathway on with no EPC for any chemical, and a negative EPC', () => {
    expect(() => evaluateLegacyReceptor(run('A', { pathways: ['soilIngestion'] }))).toThrow(
      RangeError,
    );
    expect(() =>
      evaluateLegacyReceptor(
        run('A', {
          chemicals: [{ id: 'x', chemical: benzene, epcs: { waterIngestion: -1 } }],
          pathways: ['waterIngestion'],
        }),
      ),
    ).toThrow(RangeError);
  });

  it('warns for a missing exposure factor, swimming included, instead of computing a zero', () => {
    const r = evaluateLegacyReceptor(
      run('A', {
        receptor: legacyReceptor(LEGACY_PRESETS.residentAdultOnly),
        pathways: ['swimIngestion'],
        chemicals: [{ id: 'benzene', chemical: benzene, epcs: { swimIngestion: water } }],
      }),
    );
    expect(r.cells[0]!.cell.computable).toBe(false);
    expect(r.totals).toEqual({ risk: 0, hi: 0 });
    expect(r.warnings.map((w) => w.code)).toContain('exposure.site-specific-required');
  });

  it('warns on a high risk, an unsegregated HI above 1, Csat and the soil ceiling', () => {
    const big = mgPerKgToKgPerKg(2e5);
    const r = evaluateLegacyReceptor(
      run('A', {
        pathways: ['soilIngestion', 'waterIngestion'],
        chemicals: [
          {
            id: 'bap',
            chemical: { sfo: sfFromPerMgKgDay(7.3), rfdo: rfdFromMgPerKgDay(3e-4), csat: 1e-3 },
            epcs: { soilIngestion: big, waterIngestion: mgPerLToKgPerM3(100) },
          },
        ],
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('risk.linear-above-0.01');
    expect(codes).toContain('risk.hi-above-1-unsegregated');
    expect(codes).toContain('exposure.csat-exceeded');
    expect(codes).toContain('exposure.soil-ceiling');
  });
});

describe('receptor validation', () => {
  const base = { ...LEGACY_PRESETS.residentAdultOnly };
  it('rejects out-of-range factors', () => {
    expect(() => legacyReceptor({ ...base, bwKg: 0 })).toThrow(RangeError);
    expect(() => legacyReceptor({ ...base, efDaysPerYr: 366 })).toThrow(RangeError);
    expect(() => legacyReceptor({ ...base, edYr: 71 })).toThrow(RangeError);
    expect(() => legacyReceptor({ ...base, etHoursPerDay: { indoorInhalation: 25 } })).toThrow(
      RangeError,
    );
    expect(() => legacyReceptor({ ...base, soilIngestionMgPerDay: -1 })).toThrow(RangeError);
    expect(() => legacyReceptor({ ...base, bwKg: Number.NaN })).toThrow(RangeError);
  });
});

describe('chemical validation', () => {
  it('rejects fractions outside [0, 1] and nonpositive reference values', () => {
    const e = { cancer: water, noncancer: water };
    expect(() => legacyPathway('waterIngestion', e, adult, { ...benzene, aaf: 1.1 })).toThrow(
      RangeError,
    );
    expect(() => legacyPathway('waterIngestion', e, adult, { ...benzene, bio: -0.1 })).toThrow(
      RangeError,
    );
    expect(() => legacyPathway('waterIngestion', e, adult, { ...benzene, rfdo: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      legacyPathway('waterIngestion', e, adult, { ...benzene, sfo: Number.NaN }),
    ).toThrow(RangeError);
  });
});
